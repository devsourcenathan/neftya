import { describe, it, expect } from 'vitest';
import {
  GRACE_PERIOD_MS,
  entitlementOf,
  nextPeriodEnd,
  type PlanLimits,
  type SubscriptionState,
} from './entitlement.js';

/**
 * Qui a droit à quoi, et jusqu'à quand.
 *
 * Deux façons de payer arrivent dans le produit, et une seule décide de l'accès. Ce qui
 * est tenu ici n'est pas une conversion de champs : c'est qu'**on ne coupe pas un client
 * qui a payé** et qu'**on ne sert pas un abonnement fini**. Les deux se paient en argent
 * réel, dans un sens ou dans l'autre.
 */

const PLANS = new Map<string, PlanLimits>([
  ['free', { code: 'free', projectsMax: 3, aiMonthMax: 5, membersMax: 1 }],
  ['pro', { code: 'pro', projectsMax: null, aiMonthMax: 200, membersMax: 1 }],
]);

const NOW = new Date('2026-06-15T12:00:00.000Z');

const subscription = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  planCode: 'pro',
  status: 'active',
  period: 'monthly',
  currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  ...over,
});

describe('sans abonnement', () => {
  it('sert le gratuit sans annoncer une expiration', () => {
    // Une organisation créée avant la facturation n'a « rien perdu » : lui afficher
    // « votre abonnement a expiré » l'enverrait chercher un paiement qui n'existe pas.
    const result = entitlementOf(undefined, PLANS, 'free', NOW);

    expect(result.planCode).toBe('free');
    expect(result.quotas.projectsMax).toBe(3);
    expect(result.lapsed).toBe(false);
  });
});

describe('un abonnement en cours', () => {
  it('sert l’offre payée', () => {
    const result = entitlementOf(subscription(), PLANS, 'free', NOW);

    expect(result.planCode).toBe('pro');
    expect(result.quotas.projectsMax).toBeNull();
    expect(result.quotas.aiMonthMax).toBe(200);
  });

  it('garde l’accès d’un client résilié jusqu’au bout de sa période', () => {
    /*
     * `canceled` ne veut pas dire « coupé » : il veut dire « ne sera pas renouvelé ».
     * Couper au clic prendrait au client les jours qu'il a déjà payés — et c'est le genre
     * de chose qui se finit en litige bancaire.
     */
    const result = entitlementOf(
      subscription({ status: 'canceled' }),
      PLANS,
      'free',
      NOW,
    );

    expect(result.planCode).toBe('pro');
    expect(result.lapsed).toBe(false);
  });

  it('garde l’accès d’un prélèvement en échec tant que la période court', () => {
    // Une carte expirée se règle en deux minutes. Couper au premier échec la punirait
    // aussi durement qu'un refus de payer.
    const result = entitlementOf(
      subscription({ status: 'past_due' }),
      PLANS,
      'free',
      NOW,
    );

    expect(result.planCode).toBe('pro');
  });
});

describe('l’échéance', () => {
  const end = new Date('2026-06-01T00:00:00.000Z');

  it('laisse passer le délai de grâce', () => {
    // Un webhook qui arrive avec quelques heures de retard ne doit pas couper un client
    // qui vient de payer.
    const justInside = new Date(end.getTime() + GRACE_PERIOD_MS - 1000);
    const result = entitlementOf(
      subscription({ currentPeriodEnd: end }),
      PLANS,
      'free',
      justInside,
    );

    expect(result.planCode).toBe('pro');
    expect(result.lapsed).toBe(false);
  });

  it('retombe au gratuit une fois le délai passé, et le dit', () => {
    const justOutside = new Date(end.getTime() + GRACE_PERIOD_MS + 1000);
    const result = entitlementOf(
      subscription({ currentPeriodEnd: end }),
      PLANS,
      'free',
      justOutside,
    );

    expect(result.planCode).toBe('free');
    expect(result.quotas.projectsMax).toBe(3);
    // Sans ce drapeau, quelqu'un verrait ses projets plafonnés à trois sans comprendre.
    expect(result.lapsed).toBe(true);
  });

  it('ne s’applique pas au gratuit, qui ne finit pas', () => {
    const result = entitlementOf(
      { planCode: 'free', status: 'active', period: 'free', currentPeriodEnd: null },
      PLANS,
      'free',
      new Date('2099-01-01T00:00:00.000Z'),
    );

    expect(result.planCode).toBe('free');
    expect(result.lapsed).toBe(false);
  });
});

describe('une offre inconnue', () => {
  it('arrête tout plutôt que de retomber au gratuit en silence', () => {
    // Ce serait une migration oubliée. Servie en silence, elle plafonnerait des clients
    // payants et personne ne ferait le lien.
    expect(() =>
      entitlementOf(subscription({ planCode: 'disparue' }), PLANS, 'free', NOW),
    ).toThrow(/disparue/u);
  });
});

describe('la période suivante', () => {
  it('prolonge depuis l’échéance quand elle est à venir', () => {
    // Renouveler trois jours avant ne doit pas faire perdre ces trois jours.
    const end = new Date('2026-07-01T00:00:00.000Z');

    expect(nextPeriodEnd(end, 'monthly', NOW).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('repart de maintenant quand l’échéance est passée', () => {
    // Sinon le client paierait pour du temps déjà écoulé.
    const end = new Date('2026-01-01T00:00:00.000Z');

    expect(nextPeriodEnd(end, 'monthly', NOW).toISOString()).toBe(
      '2026-07-15T12:00:00.000Z',
    );
  });

  it('compte en mois et en années, pas en jours', () => {
    // Trente jours feraient dériver l'échéance d'un mois sur l'autre : au bout d'un an,
    // le client aurait payé treize fois pour douze mois.
    expect(
      nextPeriodEnd(
        null,
        'monthly',
        new Date('2026-01-15T08:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-02-15T08:00:00.000Z');

    expect(
      nextPeriodEnd(null, 'yearly', new Date('2026-03-10T08:00:00.000Z')).toISOString(),
    ).toBe('2027-03-10T08:00:00.000Z');
  });

  it('ne déborde pas sur le mois suivant depuis un 31', () => {
    /*
     * JavaScript fait déborder les jours en trop : le 31 janvier plus un mois donne le
     * 3 mars. Un abonnement pris un 31 gagnerait deux jours tous les deux mois — et le
     * produit les offrirait sans que personne ne s'en aperçoive.
     */
    expect(
      nextPeriodEnd(
        null,
        'monthly',
        new Date('2026-01-31T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-02-28T10:00:00.000Z');

    // 2028 est bissextile : le même calcul doit tomber sur le 29.
    expect(
      nextPeriodEnd(
        null,
        'monthly',
        new Date('2028-01-31T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2028-02-29T10:00:00.000Z');
  });

  it('tient le 29 février sur une année non bissextile', () => {
    expect(
      nextPeriodEnd(null, 'yearly', new Date('2028-02-29T10:00:00.000Z')).toISOString(),
    ).toBe('2029-02-28T10:00:00.000Z');
  });
});
