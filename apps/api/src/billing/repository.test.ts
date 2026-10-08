import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import { FREE_TIER } from '../auth/repository.js';
import { BillingRepository, FREE_PLAN_CODE } from './repository.js';
import { entitlementOf } from './entitlement.js';

/**
 * Le catalogue et les abonnements, sur une vraie base.
 *
 * Ce qui se joue ici n'est pas le SQL : c'est que **les plafonds du gratuit ne soient
 * écrits qu'une fois**. Ils existent dans le code (`FREE_TIER`) et dans le catalogue (la
 * ligne `free`), et deux chiffres pour la même offre finissent toujours par diverger — à
 * ce moment-là, un client est plafonné autrement que ce que la page lui a promis.
 */

let harness: Harness;
let billing: BillingRepository;
let organizationId: string;

beforeAll(async () => {
  harness = await createHarness('test_billing');
  billing = new BillingRepository(harness.db);

  /*
   * Une vraie organisation, créée par le chemin normal.
   *
   * Insérer la ligne à la main sauterait `createOrganization`, c'est-à-dire précisément
   * l'endroit où l'abonnement gratuit est posé — le test passerait en ne testant rien.
   */
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email: 'facturation@atelier.test',
      password: 'mot-de-passe-suffisamment-long',
      firstName: 'Essai',
      lastName: 'Facturation',
      organizationName: 'Atelier Facturation',
    },
  });

  expect(response.statusCode).toBe(201);
  organizationId = (response.json().data as { organizationId: string }).organizationId;
});

afterAll(async () => {
  await harness.close();
});

describe('le catalogue', () => {
  it('porte les trois offres, dans l’ordre', async () => {
    const offers = await billing.offers();

    expect(offers.map((offer) => offer.code)).toEqual(['free', 'pro', 'professional']);
  });

  it('dit les mêmes plafonds que le code pour le gratuit', async () => {
    /*
     * La ligne `free` du catalogue et `FREE_TIER` décrivent la même offre. Tant qu'elles
     * sont deux, ce test est ce qui les tient ensemble : sans lui, une hausse décidée dans
     * l'un passerait inaperçue dans l'autre, et la page annoncerait un plafond que le
     * produit n'applique pas.
     */
    const free = (await billing.offers()).find(
      (offer) => offer.code === FREE_PLAN_CODE,
    );

    expect(free?.projectsMax).toBe(FREE_TIER.projects_max);
    expect(free?.aiMonthMax).toBe(FREE_TIER.ai_month_max);
    expect(free?.membersMax).toBe(FREE_TIER.members_max);
  });

  it('ne vend pas une offre dans une devise sans prix', async () => {
    /*
     * Le franc CFA n'a pas encore de prix décidé. Rendre `null` plutôt que convertir 29 €
     * au taux du jour : un montant que personne n'a arrêté, qui bouge tout seul, et qu'il
     * faudrait expliquer au client.
     */
    expect(await billing.priceOf('pro', 'EUR', 'monthly')).toBe(2900);
    expect(await billing.priceOf('pro', 'XAF', 'monthly')).toBeNull();
    // L'annuel n'est pas davantage décidé que le franc CFA.
    expect(await billing.priceOf('pro', 'EUR', 'yearly')).toBeNull();
  });

  it('ne met aucun prix sur le gratuit', async () => {
    const free = (await billing.offers()).find(
      (offer) => offer.code === FREE_PLAN_CODE,
    );

    expect(free?.prices).toEqual([]);
  });
});

describe('l’abonnement d’une organisation', () => {
  it('naît au gratuit avec l’organisation', async () => {
    // Sans cette ligne, « pas d'abonnement » et « plan gratuit » seraient deux états, et le
    // premier se lirait tôt ou tard comme « aucune limite ».
    const subscription = await billing.subscriptionOf(organizationId);

    expect(subscription?.planCode).toBe(FREE_PLAN_CODE);
    expect(subscription?.period).toBe('free');
    expect(subscription?.currentPeriodEnd).toBeNull();
  });

  it('se remplace sans jamais se dédoubler', async () => {
    const end = new Date('2026-12-01T00:00:00.000Z');

    await billing.save(organizationId, {
      planCode: 'pro',
      status: 'active',
      period: 'monthly',
      currentPeriodEnd: end,
      provider: 'stripe',
      providerRef: 'sub_test',
    });

    await billing.save(organizationId, {
      planCode: 'professional',
      status: 'active',
      period: 'yearly',
      currentPeriodEnd: end,
      provider: 'notchpay',
      providerRef: 'trx_test',
    });

    const rows = await harness.db
      .selectFrom('subscriptions')
      .select('plan_code')
      .where('organization_id', '=', organizationId)
      .execute();

    // La clé primaire le garantit, et c'est voulu : deux webhooks concurrents ne peuvent
    // pas créer deux abonnements, quelle que soit la prudence du code applicatif.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan_code).toBe('professional');
  });

  it('refuse un abonnement payant sans échéance', async () => {
    /*
     * La contrainte est en base, pas dans le code. Un abonnement payant sans date de fin
     * n'expirerait jamais : le client garderait son accès indéfiniment, et personne ne
     * s'en apercevrait avant un audit des recettes.
     */
    await expect(
      harness.db
        .insertInto('subscriptions')
        .values({
          organization_id: organizationId,
          plan_code: 'pro',
          status: 'active',
          period: 'monthly',
          current_period_end: null,
          provider: 'stripe',
        })
        .onConflict((conflict) =>
          conflict.column('organization_id').doUpdateSet({
            plan_code: 'pro',
            period: 'monthly',
            current_period_end: null,
            provider: 'stripe',
          }),
        )
        .execute(),
    ).rejects.toThrow(/subscriptions_paid_has_end/u);
  });
});

describe('le catalogue et les droits, ensemble', () => {
  it('sert les plafonds de l’offre payée', async () => {
    const plans = await billing.planLimits();

    const result = entitlementOf(
      {
        planCode: 'professional',
        status: 'active',
        period: 'yearly',
        currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
      },
      plans,
      FREE_PLAN_CODE,
      new Date('2026-06-15T00:00:00.000Z'),
    );

    expect(result.planCode).toBe('professional');
    // « Plusieurs utilisateurs » de la page d'accueil : illimité, donc `null`.
    expect(result.quotas.membersMax).toBeNull();
  });
});
