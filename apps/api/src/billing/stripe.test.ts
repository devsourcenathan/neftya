import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import { StripeProvider } from './stripe.js';
import type { CheckoutRequest } from './provider.js';

/**
 * L'adaptateur Stripe.
 *
 * Aucun réseau : ce qui se joue ici est la traduction, dans les deux sens. Ce qu'on envoie
 * — un montant qui doit être celui de l'environnement, au centime — et ce qu'on comprend
 * d'un webhook, dont dépend l'ouverture d'un accès payé.
 *
 * La signature, elle, est signée pour de vrai : le secret est connu du test, et
 * `constructEvent` fait le même travail qu'en production. Un faux qui rendrait toujours
 * « valide » laisserait passer le défaut qu'on cherche précisément à empêcher.
 */

const SECRET = 'whsec_essai_de_signature_pour_le_test';

const config = { secretKey: 'sk_test_x', webhookSecret: SECRET };

const request: CheckoutRequest = {
  organizationId: '01924f00-0000-7000-8000-00000000000a',
  planCode: 'pro',
  period: 'monthly',
  currency: 'EUR',
  amountMinor: 2900,
  label: 'Neftya Pro',
  customerEmail: 'menuisier@atelier.test',
  successUrl: 'https://neftya.test/facturation?issue=succes',
  cancelUrl: 'https://neftya.test/facturation',
  idempotencyKey: 'org-pro-monthly-1',
};

/** Un client Stripe qui ne parle à personne et retient ce qu'on lui a demandé. */
function fakeStripe(session: Partial<Stripe.Checkout.Session> = {}) {
  const calls: { params: Stripe.Checkout.SessionCreateParams; options: unknown }[] = [];

  const client = {
    checkout: {
      sessions: {
        create: (params: Stripe.Checkout.SessionCreateParams, options: unknown) => {
          calls.push({ params, options });
          return Promise.resolve({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.com/c/pay/cs_test_123',
            ...session,
          });
        },
      },
    },
  } as unknown as Stripe;

  return { client, calls };
}

describe('ouvrir un paiement', () => {
  it('envoie le montant de l’environnement, en unité mineure', async () => {
    /*
     * Le prix ne doit subir aucune transformation en route. Le convertir, l'arrondir ou le
     * recalculer ici donnerait un débit différent de ce que la page a annoncé — et c'est
     * le montant de Stripe qui est prélevé, pas celui qu'on affiche.
     */
    const { client, calls } = fakeStripe();
    await new StripeProvider(config, client).startCheckout(request);

    const price = calls[0]?.params.line_items?.[0]?.price_data;

    expect(price?.unit_amount).toBe(2900);
    expect(price?.currency).toBe('eur');
  });

  it('demande un abonnement récurrent, à la bonne cadence', async () => {
    const { client, calls } = fakeStripe();
    const provider = new StripeProvider(config, client);

    await provider.startCheckout(request);
    expect(calls[0]?.params.mode).toBe('subscription');
    expect(calls[0]?.params.line_items?.[0]?.price_data?.recurring?.interval).toBe(
      'month',
    );

    await provider.startCheckout({ ...request, period: 'yearly' });
    expect(calls[1]?.params.line_items?.[0]?.price_data?.recurring?.interval).toBe(
      'year',
    );
  });

  it('attache l’organisation à l’abonnement, pas seulement à la session', async () => {
    /*
     * La session disparaît après le premier paiement. Les renouvellements, eux, arrivent
     * pendant des années : sans l'organisation sur l'abonnement, un `invoice.paid` reçu
     * dans six mois ne dirait pas à qui l'attribuer.
     */
    const { client, calls } = fakeStripe();
    await new StripeProvider(config, client).startCheckout(request);

    expect(calls[0]?.params.client_reference_id).toBe(request.organizationId);
    expect(calls[0]?.params.subscription_data?.metadata?.['organization_id']).toBe(
      request.organizationId,
    );
  });

  it('passe la clé d’idempotence à Stripe', async () => {
    // La nôtre empêche deux lignes au registre ; celle-ci empêche deux sessions chez lui.
    const { client, calls } = fakeStripe();
    await new StripeProvider(config, client).startCheckout(request);

    expect(calls[0]?.options).toMatchObject({ idempotencyKey: 'org-pro-monthly-1' });
  });

  it('refuse une session sans adresse plutôt que d’y envoyer le client', async () => {
    const { client } = fakeStripe({ url: null });

    await expect(
      new StripeProvider(config, client).startCheckout(request),
    ).rejects.toThrow(/sans adresse/u);
  });
});

/** Signe un corps comme Stripe le fait, pour que `constructEvent` l'accepte. */
function signed(payload: unknown): {
  body: Buffer;
  headers: Record<string, string | undefined>;
} {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body.toString('utf8'),
    secret: SECRET,
  });

  return { body, headers: { 'stripe-signature': header } };
}

/*
 * Un vrai client, et aucun réseau.
 *
 * `constructEvent` est du calcul pur : il ne contacte pas Stripe. Lui donner un faux
 * client aurait testé le faux — et c'est la vérification de signature qu'on veut éprouver,
 * puisque c'est elle qui empêche d'ouvrir un abonnement sans payer.
 */
const provider = new StripeProvider(config);

describe('lire un webhook', () => {
  it('refuse une signature qui ne vaut pas', () => {
    // Un webhook non authentifié est une tentative d'ouvrir un abonnement sans payer.
    const { body } = signed({ id: 'evt_1', type: 'checkout.session.completed' });

    expect(() => provider.readEvent(body, { 'stripe-signature': 'v1=faux' })).toThrow();
  });

  it('refuse un webhook sans signature du tout', () => {
    const { body } = signed({ id: 'evt_1', type: 'checkout.session.completed' });

    expect(() => provider.readEvent(body, {})).toThrow(/signature/u);
  });

  it('refuse un corps modifié après signature', () => {
    /*
     * C'est l'attaque que la signature existe pour arrêter : intercepter un événement
     * authentique et en changer le montant ou l'organisation.
     */
    const { body, headers } = signed({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1' } },
    });

    const altered = Buffer.from(body.toString('utf8').replace('cs_1', 'cs_2'), 'utf8');

    expect(() => provider.readEvent(altered, headers)).toThrow();
  });

  it('ouvre l’accès sur une session réglée', () => {
    const { body, headers } = signed({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', subscription: 'sub_1', customer: 'cus_1' } },
    });

    const event = provider.readEvent(body, headers);

    expect(event).toMatchObject({
      kind: 'payment_settled',
      eventId: 'evt_2',
      providerRef: 'cs_1',
      subscriptionRef: 'sub_1',
      customerRef: 'cus_1',
    });
  });

  it('prend l’échéance sur l’article, et la plus lointaine', () => {
    /*
     * Stripe a déplacé `current_period_end` de l'abonnement vers ses articles. La lire à
     * l'ancien emplacement rendrait `undefined` — donc aucune échéance, donc un accès qui
     * n'expire jamais. Et sur plusieurs articles, servir jusqu'à la plus proche couperait
     * un client qui a payé.
     */
    const { body, headers } = signed({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [
              { current_period_end: 1_780_000_000 },
              { current_period_end: 1_790_000_000 },
            ],
          },
        },
      },
    });

    const event = provider.readEvent(body, headers);

    expect(event).toMatchObject({ kind: 'subscription_changed', status: 'active' });
    expect(
      event.kind === 'subscription_changed'
        ? event.currentPeriodEnd?.toISOString()
        : null,
    ).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it('ramène les huit états de Stripe aux trois qui décident', () => {
    const states: [string, string][] = [
      ['active', 'active'],
      ['trialing', 'active'],
      ['past_due', 'past_due'],
      ['unpaid', 'past_due'],
      ['incomplete', 'canceled'],
      ['paused', 'canceled'],
    ];

    for (const [stripeStatus, expected] of states) {
      const { body, headers } = signed({
        id: `evt_${stripeStatus}`,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            status: stripeStatus,
            cancel_at_period_end: false,
            items: { data: [] },
          },
        },
      });

      expect(provider.readEvent(body, headers)).toMatchObject({ status: expected });
    }
  });

  it('traite une suppression comme une résiliation, quel que soit l’état porté', () => {
    // Stripe envoie `deleted` avec un statut qui peut rester `active` quelques instants.
    const { body, headers } = signed({
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: false,
          items: { data: [] },
        },
      },
    });

    expect(provider.readEvent(body, headers)).toMatchObject({ status: 'canceled' });
  });

  it('ignore ce qui ne change aucun droit, sans s’en cacher', () => {
    // `ignored` plutôt qu'une exception : Stripe émet des dizaines d'événements, et
    // répondre en erreur le ferait réessayer indéfiniment.
    const { body, headers } = signed({
      id: 'evt_5',
      type: 'customer.created',
      data: { object: { id: 'cus_1' } },
    });

    expect(provider.readEvent(body, headers)).toMatchObject({
      kind: 'ignored',
      type: 'customer.created',
    });
  });
});
