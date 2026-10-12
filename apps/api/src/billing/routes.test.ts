import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { createHmac } from 'node:crypto';
import { createHarness, type Harness } from '../test-support/harness.js';
import { StripeProvider } from './stripe.js';
import { NotchPayProvider } from './notchpay.js';
import { BillingService } from './service.js';
import { BillingRepository } from './repository.js';
import { loadPrices } from './prices.js';
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

/** Fait échouer le prochain appel au fournisseur, comme une panne chez lui. */
let failNextCheckout = false;

/*
 * Un compteur qui ne repart jamais de zéro.
 *
 * `started` est vidé entre les tests, et s'en servir pour numéroter les sessions les
 * faisait se répéter d'un test à l'autre : la base refuse alors la seconde, puisque la
 * référence d'un fournisseur y est unique. La contrainte avait raison — c'est le test qui
 * fabriquait deux encaissements sous le même identifiant.
 */
let sessions = 0;

/** Ce que la sonde Stripe rendra, quand le test en a besoin. */
let verifyResult: ((ref: string) => Promise<unknown>) | null = null;

/** Un Stripe qui ne parle à personne, mais dont la vérification de signature est réelle. */
class FakeStripeProvider extends StripeProvider {
  override verify(providerRef: string) {
    return (verifyResult?.(providerRef) ?? Promise.resolve(null)) as ReturnType<
      StripeProvider['verify']
    >;
  }

  override startCheckout(request: CheckoutRequest): Promise<CheckoutStarted> {
    if (failNextCheckout) {
      failNextCheckout = false;

      return Promise.reject(new Error('panne simulée du fournisseur'));
    }

    started.push(request);
    sessions += 1;

    return Promise.resolve({
      redirectUrl: `https://checkout.stripe.test/${request.idempotencyKey}`,
      providerRef: `cs_${String(sessions)}`,
    });
  }
}

const NOTCH_HASH = 'hash_de_test_pour_les_routes_notchpay';

/**
 * Les corps reçus par le faux NotchPay.
 *
 * Le corps envoyé, pas la demande interne : c'est `reference` qu'il porte, et c'est cette
 * valeur-là que son webhook nous rendra.
 */
const notchpayRequests: { reference?: string }[] = [];

/** Un NotchPay dont le réseau est remplacé, mais dont la signature est réelle. */
const notchpay = new NotchPayProvider(
  {
    publicKey: 'pk_test_x',
    webhookHash: NOTCH_HASH,
    baseUrl: 'https://api.notchpay.test',
  },
  ((_url: string, init: RequestInit) => {
    notchpayRequests.push(JSON.parse(init.body as string) as { reference?: string });

    return Promise.resolve({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          // La forme réelle : `transaction` est un objet, pas une chaîne.
          transaction: { reference: 'trx.test_mobile' },
          authorization_url: 'https://pay.notchpay.test/pay_mobile',
        }),
    });
  }) as unknown as typeof fetch,
);

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
  verifyResult = null;
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
     * Un second clic revient à la **même** page de paiement.
     *
     * Compter les lignes ne suffit pas : la ligne peut être réutilisée et le fournisseur
     * rappelé tout de même. NotchPay répondrait alors `409 Reference already existing`,
     * et le client verrait une erreur au lieu de sa page.
     */
    const { accessToken, organizationId } = await signUp('doubleclic@atelier.test');

    const payload = { plan: 'pro', period: 'monthly', currency: 'EUR' };
    const headers = { authorization: `Bearer ${accessToken}` };
    const before = started.length;

    const first = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });
    const second = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });

    expect(started.length - before).toBe(1);
    expect(second.json().data.redirect_url).toBe(first.json().data.redirect_url);

    const rows = await harness.db
      .selectFrom('payments')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    expect(rows).toHaveLength(1);
  });
});

describe('la référence envoyée au fournisseur', () => {
  it('est neuve à chaque renouvellement', async () => {
    /*
     * **Le défaut que seule la vraie API a montré.**
     *
     * La clé d'idempotence décrivait l'offre — organisation, plan, période, devise — donc
     * elle était éternelle. NotchPay refuse une référence déjà employée
     * (`409 Reference already existing`) : le premier paiement passait, et **tous les
     * renouvellements échouaient**. C'est-à-dire tout le modèle prépayé après le mois un.
     *
     * Aucun test ne pouvait le voir : nos faux acceptaient n'importe quelle référence.
     */
    const { accessToken } = await signUp('renouvellement@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };
    const payload = { plan: 'pro', period: 'monthly', currency: 'EUR' };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });
    const first = started.at(-1)?.idempotencyKey;

    // Le paiement aboutit : la période est ouverte.
    await webhook({
      id: 'evt_renouv_1',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${String(sessions)}`, subscription: 'sub_renouv' } },
    });

    // Un mois plus tard, le client reprend la même offre.
    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });
    const second = started.at(-1)?.idempotencyKey;

    expect(first).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('est neuve après un appel au fournisseur qui a échoué', async () => {
    /*
     * Une tentative sans page de paiement est abandonnée : le fournisseur a peut-être
     * déjà enregistré sa référence. La réemployer rendrait la même erreur indéfiniment,
     * et le client ne pourrait plus jamais payer cette offre.
     */
    const { accessToken, organizationId } = await signUp('reprise@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };
    const payload = { plan: 'pro', period: 'monthly', currency: 'EUR' };

    failNextCheckout = true;
    const refused = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });

    expect(refused.statusCode).toBe(503);

    const retry = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload,
    });

    expect(retry.statusCode).toBe(200);

    const rows = await harness.db
      .selectFrom('payments')
      .select(['id', 'provider_ref'])
      .where('organization_id', '=', organizationId)
      .execute();

    // Deux lignes, deux références : la morte reste au registre pour la réconciliation.
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.provider_ref !== null)).toHaveLength(1);
  });
});

describe('la sonde au retour du client', () => {
  it('ouvre l’accès quand le webhook n’est jamais arrivé', async () => {
    /*
     * **Le cas qui s'est produit le jour de la mise en service.**
     *
     * Le point de terminaison n'était pas déclaré chez le fournisseur : l'argent est
     * parti, aucun webhook n'est venu, et le client est resté devant « nous attendons la
     * confirmation ». Attendre un message qu'on ne contrôle pas est une dépendance ; aller
     * demander n'en est pas une.
     */
    const { accessToken } = await signUp('sonde@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    const session = `cs_${String(sessions)}`;

    // Aucun webhook. Le fournisseur, lui, sait que c'est payé.
    verifyResult = (ref) =>
      Promise.resolve({
        kind: 'payment_settled',
        eventId: `verify:stripe:${ref}`,
        type: 'checkout.session.complete',
        providerRef: ref,
        subscriptionRef: 'sub_sonde',
      });

    const probe = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/verify',
      headers,
      payload: {},
    });

    expect(probe.json().data.changed).toBe(1);
    expect(session).toBe(`cs_${String(sessions)}`);

    const state = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers,
    });

    expect(state.json().data.subscription.plan).toBe('pro');
  });

  it('ne règle pas deux fois ce que le webhook a déjà réglé', async () => {
    /*
     * La sonde et le webhook arrivent par deux portes, avec deux identifiants d'événement.
     * La déduplication par message ne les distingue pas : c'est la garde sur le **paiement**
     * qui empêche de prolonger la période deux fois — sinon un client gagnerait un mois à
     * chaque retour sur la page.
     */
    const { accessToken } = await signUp('sonde-double@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    const session = `cs_${String(sessions)}`;

    await webhook({
      id: 'evt_sonde_1',
      type: 'checkout.session.completed',
      data: { object: { id: session, subscription: 'sub_sonde_2' } },
    });

    const before = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers,
    });

    verifyResult = (ref) =>
      Promise.resolve({
        kind: 'payment_settled',
        eventId: `verify:stripe:${ref}`,
        type: 'checkout.session.complete',
        providerRef: ref,
        subscriptionRef: 'sub_sonde_2',
      });

    const probe = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/verify',
      headers,
      payload: {},
    });

    expect(probe.json().data.changed).toBe(0);

    const after = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers,
    });

    expect(after.json().data.subscription.current_period_end).toBe(
      before.json().data.subscription.current_period_end,
    );
  });

  it('ne tombe pas quand le fournisseur ne répond pas', async () => {
    // Une panne chez eux ne doit pas transformer un retour de paiement en page d'erreur.
    const { accessToken } = await signUp('sonde-panne@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    verifyResult = () => Promise.reject(new Error('panne simulée'));

    const probe = await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/verify',
      headers,
      payload: {},
    });

    expect(probe.statusCode).toBe(200);
    expect(probe.json().data.changed).toBe(0);
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

  it('ne prolonge pas deux fois sur deux événements différents', async () => {
    /*
     * La déduplication par identifiant d'événement ne protège que du **même** message
     * rejoué. Deux messages distincts annonçant le même encaissement — ce que les deux
     * fournisseurs admettent — passeraient au travers, et le client gagnerait un mois.
     *
     * La garde porte donc sur le paiement, pas sur le message : c'est lui, l'unité
     * d'argent encaissé.
     */
    const { accessToken } = await signUp('doubleevent@atelier.test');
    const headers = { authorization: `Bearer ${accessToken}` };

    await harness.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers,
      payload: { plan: 'pro', period: 'monthly', currency: 'EUR' },
    });

    const object = { id: `cs_${String(sessions)}`, subscription: 'sub_double_evt' };

    await webhook({
      id: 'evt_double_a',
      type: 'checkout.session.completed',
      data: { object },
    });

    const after = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers,
    });
    const end = after.json().data.subscription.current_period_end as string;

    // Le même encaissement, annoncé une seconde fois sous un autre identifiant.
    const second = await webhook({
      id: 'evt_double_b',
      type: 'checkout.session.completed',
      data: { object },
    });

    expect(second.json().data.applied).toBe(false);

    const later = await harness.app.inject({
      method: 'GET',
      url: '/v1/billing',
      headers,
    });

    expect(later.json().data.subscription.current_period_end).toBe(end);
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

/**
 * Le mobile money, de bout en bout.
 *
 * NotchPay n'a pas d'abonnement : c'est nous qui posons l'échéance à l'encaissement, et
 * c'est le balayage qui coupe quand elle passe. Rien ne notifie un non-renouvellement —
 * un non-événement ne se notifie pas — donc ce chemin est le seul qui referme l'accès.
 */
describe('NotchPay, en prépayé', () => {
  it('ouvre l’accès au webhook, puis le referme à l’échéance', async () => {
    const mobile = await createHarness('test_billing_mobile', {
      paymentProviders: [notchpay],
      appUrl: 'https://neftya.test',
      env: { NEFTYA_PRICE_PRO_XAF_MONTHLY: '19000' },
    });

    try {
      const signUpResponse = await mobile.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'mobile@atelier.test',
          password: PASSWORD,
          firstName: 'Essai',
          lastName: 'Mobile',
          organizationName: 'Atelier Mobile',
        },
      });

      const { accessToken } = signUpResponse.json().data as { accessToken: string };
      const headers = { authorization: `Bearer ${accessToken}` };

      const checkout = await mobile.app.inject({
        method: 'POST',
        url: '/v1/billing/checkout',
        headers,
        payload: { plan: 'pro', period: 'monthly', currency: 'XAF' },
      });

      expect(checkout.statusCode).toBe(200);
      expect(checkout.json().data.redirect_url).toContain('pay.notchpay.test');

      /*
       * Le webhook se relie par **notre** référence, pas par celle de NotchPay.
       *
       * Son identifiant à lui — `pay_...` — n'a jamais été écrit chez nous : la réponse
       * d'initialisation rend `transaction`, qui est autre chose. Se fier à lui ferait
       * échouer la correspondance, et le client resterait payé sans service.
       */
      /*
       * La forme **réelle** d'un webhook NotchPay : `reference` est la leur,
       * `merchant_reference` est la nôtre. Leur documentation dit l'inverse, et le test
       * écrit d'après elle passait pendant que la production aurait refusé chaque
       * webhook — donc laissé chaque client payé sans accès.
       */
      const body = JSON.stringify({
        id: 'evt_mobile_1',
        type: 'payment.complete',
        data: {
          reference: 'trx.test_jamais_vu',
          merchant_reference: notchpayRequests[0]?.reference,
          trxref: notchpayRequests[0]?.reference,
          status: 'complete',
          amount: 190000,
          currency: 'XAF',
        },
      });

      const webhookResponse = await mobile.app.inject({
        method: 'POST',
        url: '/v1/billing/webhooks/notchpay',
        headers: {
          'content-type': 'application/json',
          'x-notch-signature': createHmac('sha256', NOTCH_HASH)
            .update(Buffer.from(body, 'utf8'))
            .digest('hex'),
        },
        payload: body,
      });

      expect(webhookResponse.json().data.applied).toBe(true);

      const state = await mobile.app.inject({
        method: 'GET',
        url: '/v1/billing',
        headers,
      });

      expect(state.json().data.subscription).toMatchObject({
        plan: 'pro',
        period: 'monthly',
      });

      /*
       * L'échéance est reculée dans le passé, et le balayage passe.
       *
       * C'est la situation réelle d'un client qui ne renouvelle pas : aucun webhook
       * n'arrive jamais, et sans ce passage il garderait son accès indéfiniment.
       */
      await mobile.db
        .updateTable('subscriptions')
        .set({ current_period_end: new Date('2020-01-01T00:00:00.000Z') })
        .where('period', '<>', 'free')
        .execute();

      const service = new BillingService(
        mobile.db,
        new BillingRepository(mobile.db, loadPrices({}, ['pro'])),
      );

      expect(await service.expire()).toBeGreaterThan(0);

      const after = await mobile.app.inject({
        method: 'GET',
        url: '/v1/billing',
        headers,
      });

      expect(after.json().data.subscription.plan).toBe('free');
      expect(after.json().data.quotas.projects_max).toBe(3);

      /*
       * **Et le plafond mord vraiment.**
       *
       * `/v1/billing` calcule ses chiffres depuis l'abonnement ; les projets lisent
       * `organization_quotas`. Retirer l'écriture de cette table ne faisait tomber aucune
       * assertion ci-dessus : la page annonçait « trois projets » pendant que le produit
       * en laissait créer autant qu'on voulait. Un abonnement expiré aurait continué de
       * servir l'offre payante — c'est l'erreur qui coûte de l'argent, et elle est muette.
       */
      const model = {
        dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
        compartments: [{ shelves: 1, drawers: 0 }],
        material: 'mdf',
        hasBack: true,
      };

      const createProject = (name: string) =>
        mobile.app.inject({
          method: 'POST',
          url: '/v1/projects',
          headers,
          payload: { name, model },
        });

      for (const name of ['un', 'deux', 'trois']) {
        expect((await createProject(name)).statusCode).toBe(201);
      }

      expect((await createProject('quatre')).statusCode).toBe(409);
    } finally {
      await mobile.close();
    }
  });
});
