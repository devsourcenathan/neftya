import type { Kysely } from 'kysely';
import type {
  BillingPeriod,
  Database,
  PaymentProviderKey,
  SubscriptionPeriod,
} from '../db/schema.js';
import type { PlanLimits, SubscriptionState } from './entitlement.js';
import type { PriceEntry } from './prices.js';

/**
 * Le catalogue et les abonnements, lus et écrits.
 *
 * Aucune règle d'accès ici : elles sont dans `entitlement.ts`, qui est pur et se teste
 * sans base. Ce module fait les allers-retours, et rien d'autre.
 */

/** L'offre servie à qui n'a jamais payé. Son code est en base comme les autres. */
export const FREE_PLAN_CODE = 'free';

/**
 * L'abonnement tel qu'il est en base, et non tel que la décision d'accès le voit.
 *
 * `entitlementOf` n'a besoin que de quatre champs et reste volontairement ignorant des
 * encaisseurs : lui apprendre ce qu'est NotchPay ferait d'un module pur un module qui
 * connaît des fournisseurs. Ces deux champs-ci ne servent qu'à **dire la vérité au
 * client** — « renouvellement automatique » quand une carte est en place, « à renouveler
 * avant » quand rien ne se renouvellera tout seul.
 */
export interface SubscriptionRow extends SubscriptionState {
  provider: PaymentProviderKey | null;
  cancelAtPeriodEnd: boolean;
}

/** Une tentative de paiement, telle qu'on la montre au client. */
export interface PaymentRecord {
  id: string;
  provider: PaymentProviderKey;
  /** La référence du fournisseur, celle que le client voit sur son téléphone. */
  providerRef: string | null;
  planCode: string;
  period: BillingPeriod;
  currency: string;
  amountMinor: number;
  status: 'pending' | 'settled' | 'failed' | 'canceled' | 'expired';
  createdAt: Date;
  settledAt: Date | null;
}

export interface PlanOffer extends PlanLimits {
  rank: number;
  /** Un prix par devise et par période. Une combinaison absente ne se vend pas. */
  prices: { currency: string; period: BillingPeriod; amountMinor: number }[];
}

export class BillingRepository {
  /**
   * Les prix arrivent par le constructeur, lus de l'environnement au démarrage.
   *
   * Passés plutôt que relus à chaque appel : ils ne changent pas en cours de vie du
   * processus, et les relire aurait fait croire qu'ils le peuvent.
   */
  constructor(
    private readonly db: Kysely<Database>,
    private readonly prices: readonly PriceEntry[] = [],
  ) {}

  /**
   * Le catalogue complet, prix compris.
   *
   * Les plafonds viennent de la base, les prix de l'environnement. Les assembler ici
   * plutôt que dans chaque appelant : une offre se présente toujours avec ses prix, et
   * deux lectures séparées auraient fini par en oublier une.
   */
  async offers(): Promise<PlanOffer[]> {
    const plans = await this.db
      .selectFrom('plans')
      .select(['code', 'projects_max', 'ai_month_max', 'members_max', 'rank'])
      .orderBy('rank')
      .execute();

    return plans.map((plan) => ({
      code: plan.code,
      projectsMax: plan.projects_max,
      aiMonthMax: plan.ai_month_max,
      membersMax: plan.members_max,
      rank: plan.rank,
      prices: this.prices
        .filter((price) => price.planCode === plan.code)
        .map((price) => ({
          currency: price.currency,
          period: price.period,
          amountMinor: price.amountMinor,
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
  priceOf(planCode: string, currency: string, period: BillingPeriod): number | null {
    const match = this.prices.find(
      (price) =>
        price.planCode === planCode &&
        price.currency === currency &&
        price.period === period,
    );

    return match?.amountMinor ?? null;
  }

  /**
   * L'identifiant du client chez Stripe, s'il en a un.
   *
   * Lu ici plutôt que dans le dépôt d'authentification : c'est une donnée de facturation
   * posée par un webhook, et la seule raison de la lire est d'ouvrir un portail de
   * paiement.
   */
  async stripeCustomerOf(organizationId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('organizations')
      .select('stripe_customer_id')
      .where('id', '=', organizationId)
      .executeTakeFirst();

    return row?.stripe_customer_id ?? null;
  }

  async subscriptionOf(organizationId: string): Promise<SubscriptionRow | undefined> {
    const row = await this.db
      .selectFrom('subscriptions')
      .select([
        'plan_code',
        'status',
        'period',
        'current_period_end',
        'provider',
        'cancel_at_period_end',
      ])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      planCode: row.plan_code,
      status: row.status,
      period: row.period,
      currentPeriodEnd: row.current_period_end,
      provider: row.provider,
      cancelAtPeriodEnd: row.cancel_at_period_end,
    };
  }

  /**
   * Les dernières tentatives de paiement d'une organisation.
   *
   * **Ce qui rend une échéance vérifiable.** Sans cette liste, un client qui voit
   * « jusqu'au 12/12 » après avoir cru acheter un mois n'a aucun moyen de comprendre : la
   * réponse — deux encaissements, un mois chacun — existait en base et aucune page ne la
   * montrait. Il fallait demander à quelqu'un qui sait lire du SQL.
   *
   * Bornée : personne ne remonte au-delà de quelques lignes, et une organisation qui paie
   * depuis trois ans n'a pas à télécharger trente-six lignes pour lire la dernière.
   */
  async paymentsOf(organizationId: string, limit = 10): Promise<PaymentRecord[]> {
    const rows = await this.db
      .selectFrom('payments')
      .select([
        'id',
        'provider',
        'provider_ref',
        'plan_code',
        'period',
        'currency',
        'amount_minor',
        'status',
        'created_at',
        'settled_at',
      ])
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerRef: row.provider_ref,
      planCode: row.plan_code,
      period: row.period,
      currency: row.currency,
      amountMinor: row.amount_minor,
      status: row.status,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    }));
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
