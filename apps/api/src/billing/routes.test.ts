import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { createHarness, type Harness } from '../test-support/harness.js';
import { StripeProvider } from './stripe.js';
import type { CheckoutRequest, CheckoutStarted } from './provider.js';

/**
 * Le parcours complet : on paie, et l'accès s'ouvre.
 *
 * Aucun réseau — le client Stripe est remplacé, la signature est vraie. Ce qui se joue
 * ici est la seule chose qui compte en facturation : **personne ne doit rester payé sans
 * service, ni servi sans payer.** Les deux se vérifient sur les plafonds réels, ceux que
 * le reste du produit lit, pas sur une ligne d'abonnement qu'on aurait écrite pour soi.
 */

const WEBHOOK_SECRET = 'whsec_essai_de_signature_pour_les_routes';
const PASSWORD = 'mot-de-passe-suffisamment-long';

let harness: Harness;
let started: CheckoutRequest[] = [];

/*
 * Un compteur qui ne repart jamais de zéro.
 *
 * `started` est vidé entre les tests, et s'en servir pour numéroter les sessions les
 * faisait se répéter d'un test à l'autre : la base refuse alors la seconde, puisque la
 * référence d'un fournisseur y est unique. La contrainte avait raison — c'est le test qui
 * fabriquait deux encaissements sous le même identifiant.
 */
let sessions = 0;

/** Un Stripe qui ne parle à personne, mais dont la vérification de signature est réelle. */
class FakeStripeProvider extends StripeProvider {
  override startCheckout(request: CheckoutRequest): Promise<CheckoutStarted> {
    started.push(request);
    sessions += 1;

    return Promise.resolve({
      redirectUrl: `https://checkout.stripe.test/${request.idempotencyKey}`,
      providerRef: `cs_${String(sessions)}`,
    });
  }
}

const provider = new FakeStripeProvider({
  secretKey: 'sk_test_x',
  webhookSecret: WEBHOOK_SECRET,
});

beforeAll(async () => {
  harness = await createHarness('test_billing_routes', {
    paymentProviders: [provider],
    appUrl: 'https://neftya.test',
    /*
     * Un prix en francs CFA, et aucun encaisseur qui les prenne.
     *
     * C'est exactement l'état du produit le jour où le tarif XAF sera décidé et NotchPay
     * pas encore branché : la page ne doit pas le proposer, sous peine de mener le client
     * jusqu'au bouton puis à un refus.
     */
    env: {
      NEFTYA_PRICE_PRO_EUR_MONTHLY: '2900',
      NEFTYA_PRICE_PRO_XAF_MONTHLY: '19000',
    },
  });
});

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  started = [];
});

async function signUp(email: string) {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      firstName: 'Essai',
      lastName: 'Facturation',
      organizationName: 'Atelier Facturation',
    },
  });

  expect(response.statusCode).toBe(201);

  return response.json().data as { accessToken: string; organizationId: string };
}

/** Un webhook signé comme Stripe le signe. */
function webhook(payload: unknown) {
  const body = JSON.stringify(payload);

  return harness.app.inject({
    method: 'POST',
    url: '/v1/billing/webhooks/stripe',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: WEBHOOK_SECRET,
      }),
    },
    payload: body,
  });
}

describe('l’état de la facturation', () => {
  it('part du gratuit, avec ses plafonds', async () => {
    const { accessToken } = await signUp('etat@atelier.test');

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.subscription).toMatchObject({
      plan: 'free',
      period: 'free',
      lapsed: false,
    });
    expect(response.json().data.quotas.projects_max).toBe(3);
  });

  it('ne propose que les prix qu’un encaisseur sait prendre', async () => {
    /*
     * Le franc CFA n'a pas de prix et Stripe ne le prendrait pas : l'afficher mènerait le
     * client jusqu'au bouton, puis à un refus.
     */
    const { accessToken } = await signUp('devises@atelier.test');

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const plans = response.json().data.plans as {
      code: string;
      prices: { currency: string; period: string }[];
    }[];

    const pro = plans.find((plan) => plan.code === 'pro');

    // Le prix XAF existe dans l'environnement, mais Stripe ne l'encaisse pas.
    expect(pro?.prices).toEqual([
      { currency: 'EUR', period: 'monthly', amount_minor: 2900 },
    ]);
  });
});

describe('ouvrir un paiement', () => {
  it('rend une adresse et n’accorde rien', async () => {
    /*
     * **Rien n'est accordé à l'aller.** Accorder ici donnerait un abonnement à qui
     * abandonne la page de paiement — et il n'y aurait aucun encaissement pour le
     * rattraper.
     */
    const { accessToken } = await signUp('ouverture@atelier.test');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.redirect_url).toContain('checkout.stripe.test');
    expect(started[0]?.amountMinor).toBe(2900);

    const state = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(state.json().data.subscription.plan).toBe('free');
  });

  it('refuse une combinaison sans prix, et le dit', async () => {
    // Pas une erreur de l'appelant : une offre qu'on ne vend pas encore comme ça.
    const { accessToken } = await signUp('sansprix@atelier.test');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { plan: 'pro', period: 'yearly', currency: 'EUR' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/pas encore proposée/u);
  });

  it('ne rouvre pas une session sur un second clic', async () => {
    /*
     * La clé d'idempotence décrit ce qui est demandé, pas quand : deux clics produisent
     * la même clé, donc la même ligne au registre. Sans cela, un double clic ouvrirait
     * deux abonnements à la même organisation.
     */
    const { accessToken, organizationId } = await signUp('doubleclic@atelier.test');

    const payload = { plan: 'pro', period: 'monthly', currency: 'EUR' };
    const headers = { authorization: `Bearer ${accessToken}` };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });
    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });

    const rows = await harness.db
      .selectFrom('payments')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    expect(rows).toHaveLength(1);
  });
});

describe('le webhook', () => {
  it('refuse une signature qui ne vaut pas, sans réessai possible', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'v1=faux' },
      payload: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' }),
    });

    // 400 et non 500 : un 5xx ferait réessayer Stripe indéfiniment pour une requête qui
    // ne sera jamais valide.
    expect(response.statusCode).toBe(400);
  });

  it('ouvre l’accès, et le dit aux plafonds que le produit lit', async () => {
    const { accessToken } = await signUp('paiement@atelier.test');

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    const session = `cs_${String(sessions)}`;

    const response = await webhook({
      id: 'evt_paiement_1',
      type: 'checkout.session.completed',
      data: { object: { id: session, subscription: 'sub_1', customer: 'cus_1' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.applied).toBe(true);

    const state = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(state.json().data.subscription).toMatchObject({
      plan: 'pro',
      status: 'active',
    });
    // « Projets illimités » : c'est ce que la page promet, et c'est ce que le produit lit.
    expect(state.json().data.quotas.projects_max).toBeNull();
  });

  it('lève vraiment le plafond, là où il est appliqué', async () => {
    /*
     * **Le test précédent ne prouvait rien de plus que l'affichage.**
     *
     * `/v1/billing` calcule ses plafonds depuis l'abonnement ; les projets, eux, lisent
     * `organization_quotas`. Retirer l'écriture dans cette table ne faisait tomber aucun
     * test : la page annonçait « projets illimités » pendant que la création du quatrième
     * projet se faisait refuser. C'est exactement le genre d'écart qu'un client découvre
     * après avoir payé.
     *
     * On crée donc un projet de plus que ne le permet le gratuit.
     */
    const { accessToken } = await signUp('plafond@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };

    const model = {
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
      compartments: [{ shelves: 1, drawers: 0 }],
      material: 'mdf',
      hasBack: true,
    };

    const createProject = (name: string) =>
      harness.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers,
        payload: { name, model },
      });

    for (const name of ['un', 'deux', 'trois']) {
      expect((await createProject(name)).statusCode).toBe(201);
    }

    // Le gratuit plafonne à trois : le quatrième est refusé.
    expect((await createProject('quatre')).statusCode).toBe(409);

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    await webhook({
      id: 'evt_plafond_1',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${String(sessions)}`, subscription: 'sub_plafond' } },
    });

    /*
     * Le jeton porte encore les anciens plafonds, et c'est voulu : la table fait foi, les
     * revendications ne sont qu'un repli. Si ce `201` échouait, c'est que le produit lit
     * le jeton — et un client paierait quinze minutes pour rien.
     */
    expect((await createProject('quatre')).statusCode).toBe(201);
  });

  it('ne prolonge pas deux fois le même événement', async () => {
    /*
     * Stripe rejoue, et prévient qu'il le fait. Sans déduplication, chaque réessai
     * offrirait un mois : le client gagnerait du temps gratuit à chaque hoquet réseau, et
     * personne ne le verrait avant l'audit.
     */
    const { accessToken } = await signUp('rejeu@atelier.test');

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    const event = {
      id: 'evt_rejeu_1',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${String(sessions)}`, subscription: 'sub_rejeu' } },
    };

    const first = await webhook(event);
    const second = await webhook(event);

    expect(first.json().data.applied).toBe(true);
    expect(second.json().data.applied).toBe(false);

    const state = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const end = state.json().data.subscription.current_period_end as string;
    const months = (new Date(end).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);

    // Un mois, pas deux : le rejeu n'a rien prolongé.
    expect(months).toBeLessThan(1.3);
  });

  it('coupe l’accès quand la période se termine', async () => {
    const { accessToken } = await signUp('expiration@atelier.test');

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    await webhook({
      id: 'evt_expire_1',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${String(sessions)}`, subscription: 'sub_expire' } },
    });

    // Stripe annonce la fin, avec une échéance déjà passée.
    const response = await webhook({
      id: 'evt_expire_2',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_expire',
          status: 'canceled',
          cancel_at_period_end: false,
          items: { data: [{ current_period_end: 1_000_000_000 }] },
        },
      },
    });

    expect(response.json().data.applied).toBe(true);

    const state = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // L'échéance est passée : l'offre servie retombe au gratuit, et on le dit.
    expect(state.json().data.subscription.plan).toBe('free');
    expect(state.json().data.subscription.lapsed).toBe(true);
  });

  it('ignore ce qui ne change aucun droit, en répondant 200', async () => {
    // Tout ce qui n'est pas 2xx fait réessayer Stripe. Un événement sans effet signalé en
    // erreur reviendrait en boucle.
    const response = await webhook({
      id: 'evt_bruit_1',
      type: 'customer.created',
      data: { object: { id: 'cus_bruit' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.applied).toBe(false);
  });
});
