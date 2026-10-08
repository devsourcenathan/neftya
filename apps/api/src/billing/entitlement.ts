import type { Quotas } from '../auth/repository.js';
import type { BillingPeriod, SubscriptionPeriod } from '../db/schema.js';

/**
 * Ce à quoi une organisation a droit, à un instant donné.
 *
 * **Une fonction pure, et c'est tout l'intérêt.** Deux façons de payer arrivent dans le
 * produit — Stripe qui renouvelle seul, le mobile money qui se prépaie — et la tentation
 * était d'écrire deux chemins pour décider de l'accès. Ils auraient divergé : l'un aurait
 * coupé un client qui avait payé, l'autre aurait laissé ouvert un abonnement fini.
 *
 * Ici les deux arrivent au même endroit, avec les mêmes trois champs : une offre, une date
 * de fin, un état. Comment cette date a été posée ne regarde pas cette fonction, et c'est
 * précisément ce qui la rend sûre.
 *
 * **L'horloge est un paramètre.** Le moteur n'en a pas, et ce module non plus : une
 * décision d'accès qui dépend de `Date.now()` ne se teste qu'en attendant.
 *
 * @see docs/SEKUU.md §5
 */

export interface PlanLimits {
  code: string;
  projectsMax: number | null;
  aiMonthMax: number | null;
  membersMax: number | null;
}

export interface SubscriptionState {
  planCode: string;
  status: 'active' | 'past_due' | 'canceled';
  period: SubscriptionPeriod;
  currentPeriodEnd: Date | null;
}

export interface Entitlement {
  /** L'offre réellement servie, qui n'est pas toujours celle qui est payée. */
  planCode: string;
  quotas: Quotas;
  /**
   * Vrai quand l'organisation est retombée au gratuit faute de paiement en cours.
   *
   * Rendu plutôt que déduit par l'appelant : l'interface doit pouvoir dire « votre
   * abonnement a expiré » au lieu de laisser quelqu'un chercher pourquoi ses projets sont
   * soudain plafonnés à trois.
   */
  lapsed: boolean;
}

/**
 * Le délai de grâce après l'échéance.
 *
 * Un paiement récurrent peut échouer pour une carte expirée, et un encaissement mobile
 * money peut arriver quelques minutes après la fin de période. Couper à la seconde près
 * ferait perdre l'accès à des clients qui paient, le temps qu'un webhook arrive.
 *
 * Trois jours : assez pour qu'une relance de carte aboutisse, assez court pour qu'un
 * abonnement abandonné ne traîne pas un mois.
 */
export const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export function entitlementOf(
  subscription: SubscriptionState | undefined,
  plans: ReadonlyMap<string, PlanLimits>,
  freePlanCode: string,
  now: Date,
): Entitlement {
  const free = limitsOf(plans, freePlanCode);

  // Pas d'abonnement du tout : le gratuit, sans annoncer une expiration qui n'a pas eu
  // lieu. C'est le cas d'une organisation créée avant la facturation.
  if (!subscription)
    return { planCode: free.code, quotas: quotasOf(free), lapsed: false };

  const paid = limitsOf(plans, subscription.planCode);

  /*
   * Un abonnement résilié garde son accès jusqu'au bout de la période payée.
   *
   * `canceled` ne veut pas dire « coupé » : il veut dire « ne sera pas renouvelé ». C'est
   * `current_period_end` qui coupe, et lui seul — sinon un clic sur « résilier » prendrait
   * au client les jours qu'il a déjà payés.
   */
  const expired =
    subscription.currentPeriodEnd !== null &&
    now.getTime() > subscription.currentPeriodEnd.getTime() + GRACE_PERIOD_MS;

  if (expired) return { planCode: free.code, quotas: quotasOf(free), lapsed: true };

  /*
   * `past_due` conserve l'accès tant que la période n'est pas finie.
   *
   * Couper dès le premier échec de prélèvement punirait une carte expirée aussi durement
   * qu'un refus de payer, alors que le premier se règle en deux minutes. L'échéance s'en
   * charge si personne ne règle rien.
   */
  return { planCode: paid.code, quotas: quotasOf(paid), lapsed: false };
}

/**
 * La fin de la période suivante, à partir d'un point de départ.
 *
 * Prolonger depuis la fin en cours et non depuis maintenant : un client qui renouvelle
 * trois jours avant l'échéance ne doit pas perdre ces trois jours. Si l'échéance est
 * passée, on repart de maintenant — sinon il paierait pour du temps écoulé.
 *
 * Le calcul passe par les champs UTC : ajouter 30 jours ferait dériver l'échéance d'un
 * mois sur l'autre, et ajouter « un mois » le 31 janvier doit tomber sur le 28 ou le 29
 * février plutôt que de déborder sur mars.
 */
export function nextPeriodEnd(
  from: Date | null,
  period: BillingPeriod,
  now: Date,
): Date {
  const start = from !== null && from.getTime() > now.getTime() ? from : now;

  return addMonths(start, period === 'yearly' ? 12 : 1);
}

/**
 * `start` plus `count` mois, sans déborder sur le mois suivant.
 *
 * **Un seul chemin pour le mensuel et l'annuel.** Le mensuel avait son garde-fou et
 * l'annuel non : un abonnement annuel pris le 29 février tombait le 1er mars, et son
 * anniversaire dérivait d'un jour par an. Deux calculs pour la même opération, et un seul
 * corrigé — c'est exactement ce que le test a trouvé.
 *
 * JavaScript fait déborder les jours en trop : le 31 janvier plus un mois donne le 3 mars.
 * On vise donc le premier du mois d'arrivée, puis on repose le jour, plafonné au dernier
 * jour réel de ce mois.
 */
function addMonths(start: Date, count: number): Date {
  const day = start.getUTCDate();
  const end = new Date(start.getTime());

  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + count);

  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();

  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

function limitsOf(plans: ReadonlyMap<string, PlanLimits>, code: string): PlanLimits {
  const plan = plans.get(code);

  /*
   * Une offre inconnue est une erreur de déploiement, pas un cas d'usage.
   *
   * Retomber silencieusement sur le gratuit cacherait une migration oubliée derrière des
   * clients soudain plafonnés, et personne ne ferait le lien.
   */
  if (!plan) throw new Error(`Offre inconnue au catalogue : « ${code} »`);

  return plan;
}

function quotasOf(plan: PlanLimits): Quotas {
  return {
    projectsMax: plan.projectsMax,
    aiMonthMax: plan.aiMonthMax,
    membersMax: plan.membersMax,
  };
}
