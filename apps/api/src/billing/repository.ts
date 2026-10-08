import type { Kysely } from 'kysely';
import type {
  BillingPeriod,
  Database,
  PaymentProviderKey,
  SubscriptionPeriod,
} from '../db/schema.js';
import type { PlanLimits, SubscriptionState } from './entitlement.js';

/**
 * Le catalogue et les abonnements, lus et écrits.
 *
 * Aucune règle d'accès ici : elles sont dans `entitlement.ts`, qui est pur et se teste
 * sans base. Ce module fait les allers-retours, et rien d'autre.
 */

/** L'offre servie à qui n'a jamais payé. Son code est en base comme les autres. */
export const FREE_PLAN_CODE = 'free';

export interface PlanOffer extends PlanLimits {
  rank: number;
  /** Un prix par devise et par période. Une combinaison absente ne se vend pas. */
  prices: { currency: string; period: BillingPeriod; amountMinor: number }[];
}

export class BillingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Le catalogue complet, prix compris.
   *
   * Deux requêtes et une jointure en mémoire plutôt qu'une jointure SQL : le catalogue
   * tient en trois offres, et une jointure aurait rendu une ligne par prix, qu'il aurait
   * fallu regrouper de toute façon.
   */
  async offers(): Promise<PlanOffer[]> {
    const [plans, prices] = await Promise.all([
      this.db
        .selectFrom('plans')
        .select(['code', 'projects_max', 'ai_month_max', 'members_max', 'rank'])
        .orderBy('rank')
        .execute(),
      this.db
        .selectFrom('plan_prices')
        .select(['plan_code', 'currency', 'period', 'amount_minor'])
        .execute(),
    ]);

    return plans.map((plan) => ({
      code: plan.code,
      projectsMax: plan.projects_max,
      aiMonthMax: plan.ai_month_max,
      membersMax: plan.members_max,
      rank: plan.rank,
      prices: prices
        .filter((price) => price.plan_code === plan.code)
        .map((price) => ({
          currency: price.currency,
          period: price.period,
          amountMinor: price.amount_minor,
        })),
    }));
  }

  /** Les plafonds par code, sous la forme qu'attend `entitlementOf`. */
  async planLimits(): Promise<Map<string, PlanLimits>> {
    const offers = await this.offers();
    return new Map(offers.map((offer) => [offer.code, offer]));
  }

  /**
   * Le prix d'une offre, ou `null`.
   *
   * **`null` est une réponse, pas une panne.** Une offre sans prix dans la devise demandée
   * ne s'y vend pas : c'est ce qui remplace une conversion au taux du jour, qui donnerait
   * un montant que personne n'a décidé.
   */
  async priceOf(
    planCode: string,
    currency: string,
    period: BillingPeriod,
  ): Promise<number | null> {
    const row = await this.db
      .selectFrom('plan_prices')
      .select('amount_minor')
      .where('plan_code', '=', planCode)
      .where('currency', '=', currency)
      .where('period', '=', period)
      .executeTakeFirst();

    return row?.amount_minor ?? null;
  }

  async subscriptionOf(organizationId: string): Promise<SubscriptionState | undefined> {
    const row = await this.db
      .selectFrom('subscriptions')
      .select(['plan_code', 'status', 'period', 'current_period_end'])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      planCode: row.plan_code,
      status: row.status,
      period: row.period,
      currentPeriodEnd: row.current_period_end,
    };
  }

  /**
   * Poser l'abonnement d'une organisation.
   *
   * Un `upsert` sur la clé primaire : deux webhooks qui arrivent en même temps écrivent
   * l'un après l'autre au lieu d'échouer sur un doublon, et il ne peut pas en rester deux.
   */
  async save(
    organizationId: string,
    next: {
      planCode: string;
      status: 'active' | 'past_due' | 'canceled';
      period: SubscriptionPeriod;
      currentPeriodEnd: Date | null;
      provider: PaymentProviderKey | null;
      providerRef: string | null;
      cancelAtPeriodEnd?: boolean;
    },
  ): Promise<void> {
    const columns = {
      plan_code: next.planCode,
      status: next.status,
      period: next.period,
      current_period_end: next.currentPeriodEnd,
      provider: next.provider,
      provider_ref: next.providerRef,
      cancel_at_period_end: next.cancelAtPeriodEnd ?? false,
    };

    await this.db
      .insertInto('subscriptions')
      .values({ organization_id: organizationId, ...columns })
      .onConflict((conflict) =>
        conflict
          .column('organization_id')
          // `updated_at` n'est posée qu'à la mise à jour : à l'insertion, c'est le défaut
          // de la colonne qui s'en charge, et le type l'interdit justement ici.
          .doUpdateSet({ ...columns, updated_at: new Date() }),
      )
      .execute();
  }

  /**
   * L'abonnement gratuit d'une organisation qui vient de naître.
   *
   * Posé à la création plutôt que déduit à la lecture : sans lui, « pas de ligne » et
   * « plan gratuit » seraient deux états à distinguer partout où l'on décide d'un accès.
   */
  async startFree(organizationId: string): Promise<void> {
    await this.save(organizationId, {
      planCode: FREE_PLAN_CODE,
      status: 'active',
      period: 'free',
      currentPeriodEnd: null,
      provider: null,
      providerRef: null,
    });
  }
}
