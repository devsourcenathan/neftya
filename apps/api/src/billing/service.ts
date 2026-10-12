import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Database, PaymentProviderKey } from '../db/schema.js';
import type { Quotas } from '../auth/repository.js';
import { entitlementOf, nextPeriodEnd } from './entitlement.js';
import { BillingRepository, FREE_PLAN_CODE } from './repository.js';
import type { PaymentProvider, ProviderEvent } from './provider.js';

/**
 * Ce qui se passe quand l'argent arrive — et quand il n'arrive plus.
 *
 * Tout webhook passe par ici, quel que soit le fournisseur. Les adaptateurs ont déjà fait
 * le travail de traduction ; ce module ne connaît ni Stripe ni NotchPay, il connaît des
 * droits d'accès.
 *
 * **Deux écritures, et l'ordre compte.** L'abonnement dit *pourquoi* les plafonds valent
 * ce qu'ils valent ; `organization_quotas` est ce que le reste du produit lit. Les deux
 * sont posées dans la même transaction : entre elles, il existerait sinon un instant où un
 * client a payé et reste plafonné — ou l'inverse.
 */

export interface ApplyResult {
  /** Faux quand l'événement avait déjà été traité. Le fournisseur les rejoue. */
  applied: boolean;
  reason?: string;
}

export class BillingService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly billing: BillingRepository,
  ) {}

  /**
   * Ouvrir une ligne au registre, avant de parler au fournisseur.
   *
   * **La reprise ne vaut que pour une tentative encore en vol.** Une ligne en attente qui
   * porte déjà une référence du fournisseur veut dire qu'une page de paiement est ouverte
   * quelque part : deux clics sur « Payer » doivent y revenir, pas en ouvrir une seconde.
   *
   * Tout le reste ouvre une ligne neuve, et c'est ce qui rend le prépayé possible.
   * L'idempotence était d'abord une clé stable — organisation, offre, période, devise —
   * donc éternelle. NotchPay refuse une référence déjà utilisée (`409 Reference already
   * existing`) : **chaque renouvellement aurait échoué**, c'est-à-dire tous les paiements
   * mobile money après le premier. Le défaut ne s'est vu qu'en appelant leur API.
   *
   * Une tentative dont l'appel au fournisseur a échoué n'a pas de référence : elle est
   * abandonnée, et la suivante repart d'une ligne neuve plutôt que de réemployer une
   * référence que le fournisseur a peut-être déjà enregistrée.
   */
  async openPayment(input: {
    organizationId: string;
    provider: PaymentProviderKey;
    planCode: string;
    period: 'monthly' | 'yearly';
    currency: string;
    amountMinor: number;
  }): Promise<{ id: string; providerRef: string | null; fresh: boolean }> {
    const inFlight = await this.db
      .selectFrom('payments')
      .select(['id', 'provider_ref'])
      .where('organization_id', '=', input.organizationId)
      .where('provider', '=', input.provider)
      .where('plan_code', '=', input.planCode)
      .where('period', '=', input.period)
      .where('currency', '=', input.currency)
      .where('status', '=', 'pending')
      .where('provider_ref', 'is not', null)
      .executeTakeFirst();

    if (inFlight) {
      return { id: inFlight.id, providerRef: inFlight.provider_ref, fresh: false };
    }

    /*
     * L'identifiant de la ligne **est** la clé d'idempotence.
     *
     * Unique par nature, et c'est lui qu'on donne au fournisseur comme référence : un
     * webhook le rend, et il désigne une seule tentative. Une clé descriptive aurait
     * désigné toutes les tentatives de la même offre, passées et à venir.
     */
    const id = uuidv7();

    await this.db
      .insertInto('payments')
      .values({
        id,
        organization_id: input.organizationId,
        provider: input.provider,
        provider_ref: null,
        plan_code: input.planCode,
        period: input.period,
        currency: input.currency,
        amount_minor: input.amountMinor,
        status: 'pending',
        idempotency_key: id,
      })
      .execute();

    return { id, providerRef: null, fresh: true };
  }

  /**
   * La référence et la page du fournisseur, une fois la session ouverte chez lui.
   *
   * Les deux ensemble : la référence sert à retrouver la ligne au webhook, la page à
   * renvoyer un client qui reclique au lieu d'ouvrir une seconde session.
   */
  async attachProviderSession(
    paymentId: string,
    providerRef: string,
    redirectUrl: string,
  ): Promise<void> {
    await this.db
      .updateTable('payments')
      .set({ provider_ref: providerRef, redirect_url: redirectUrl })
      .where('id', '=', paymentId)
      .execute();
  }

  /** La page de paiement d'une tentative encore en vol, s'il y en a une. */
  async redirectOf(paymentId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('payments')
      .select('redirect_url')
      .where('id', '=', paymentId)
      .executeTakeFirst();

    return row?.redirect_url ?? null;
  }

  /**
   * Appliquer un événement authentifié.
   *
   * **La déduplication passe par l'insertion, pas par une lecture.** Un `SELECT` suivi
   * d'un `INSERT` laisse passer deux livraisons simultanées — et le fournisseur, lui,
   * réessaie en parallèle. C'est l'échec de la clé primaire qui tranche.
   */
  async apply(
    provider: PaymentProvider,
    event: ProviderEvent,
    now: Date = new Date(),
  ): Promise<ApplyResult> {
    if (event.kind === 'ignored') return { applied: false, reason: 'sans effet' };

    const first = await this.db
      .insertInto('provider_events')
      .values({ provider: provider.key, event_id: event.eventId, type: event.type })
      .onConflict((conflict) => conflict.columns(['provider', 'event_id']).doNothing())
      .executeTakeFirst();

    if ((first.numInsertedOrUpdatedRows ?? 0n) === 0n) {
      return { applied: false, reason: 'déjà traité' };
    }

    switch (event.kind) {
      case 'payment_settled':
        return this.settle(provider, event, now);
      case 'payment_failed':
        return this.fail(provider, event);
      case 'subscription_changed':
        return this.changeSubscription(provider, event);
    }
  }

  private async settle(
    provider: PaymentProvider,
    event: Extract<ProviderEvent, { kind: 'payment_settled' }>,
    now: Date,
  ): Promise<ApplyResult> {
    const payment = await this.paymentOf(
      provider.key,
      event.providerRef,
      event.merchantRef,
    );

    /*
     * Un encaissement sans ligne au registre est un incident, pas un cas d'usage.
     *
     * Il voudrait dire qu'on a été payé pour une session qu'on n'a pas ouverte. Ouvrir un
     * accès là-dessus reviendrait à faire confiance à un identifiant venu du dehors ;
     * refuser laisse une trace que la réconciliation retrouvera.
     */
    if (!payment)
      return { applied: false, reason: 'aucun paiement pour cette référence' };

    /*
     * L'échéance est calculée ici, et elle est provisoire chez Stripe.
     *
     * Aucun encaissement n'en porte une. Celle-ci ouvre l'accès tout de suite — sans quoi
     * le client resterait devant un écran « merci » sans service — puis le
     * `customer.subscription.updated` qui suit pose celle de Stripe, qui fait autorité :
     * c'est la sienne qui décide du prochain prélèvement.
     *
     * On prolonge depuis l'échéance en cours, pas depuis maintenant : renouveler trois
     * jours avant ne doit pas faire perdre ces trois jours.
     */
    const current = await this.billing.subscriptionOf(payment.organization_id);
    const periodEnd = nextPeriodEnd(
      current?.currentPeriodEnd ?? null,
      payment.period,
      now,
    );

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('payments')
        .set({ status: 'settled', settled_at: now })
        .where('id', '=', payment.id)
        .execute();

      await new BillingRepository(trx).save(payment.organization_id, {
        planCode: payment.plan_code,
        status: 'active',
        period: payment.period,
        currentPeriodEnd: periodEnd,
        provider: provider.key,
        providerRef: event.subscriptionRef ?? event.providerRef,
      });

      if (event.customerRef !== undefined) {
        await trx
          .updateTable('organizations')
          .set({ stripe_customer_id: event.customerRef })
          .where('id', '=', payment.organization_id)
          .execute();
      }

      await this.writeQuotas(trx, payment.organization_id, payment.plan_code);
    });

    return { applied: true };
  }

  private async fail(
    provider: PaymentProvider,
    event: Extract<ProviderEvent, { kind: 'payment_failed' }>,
  ): Promise<ApplyResult> {
    const payment = await this.paymentOf(provider.key, event.providerRef);

    if (!payment)
      return { applied: false, reason: 'aucun paiement pour cette référence' };

    /*
     * Un échec ne touche pas l'abonnement.
     *
     * Le client peut échouer à renouveler alors qu'il lui reste trois semaines payées :
     * couper ici lui prendrait ce qu'il a déjà réglé. C'est `current_period_end` qui coupe.
     */
    await this.db
      .updateTable('payments')
      .set({ status: 'failed' })
      .where('id', '=', payment.id)
      .execute();

    return { applied: true };
  }

  private async changeSubscription(
    provider: PaymentProvider,
    event: Extract<ProviderEvent, { kind: 'subscription_changed' }>,
  ): Promise<ApplyResult> {
    const row = await this.db
      .selectFrom('subscriptions')
      .select(['organization_id', 'plan_code', 'period'])
      .where('provider', '=', provider.key)
      .where('provider_ref', '=', event.subscriptionRef)
      .executeTakeFirst();

    if (!row)
      return { applied: false, reason: 'aucun abonnement pour cette référence' };

    /*
     * Un abonnement résilié sans échéance connue s'arrête maintenant.
     *
     * Stripe l'envoie quand le client n'a jamais rien payé — un abonnement incomplet. Le
     * laisser sans date le rendrait éternel, et la contrainte de base le refuserait de
     * toute façon.
     */
    const periodEnd = event.currentPeriodEnd ?? new Date();

    await this.db.transaction().execute(async (trx) => {
      await new BillingRepository(trx).save(row.organization_id, {
        planCode: row.plan_code,
        status: event.status,
        period: row.period === 'free' ? 'monthly' : row.period,
        currentPeriodEnd: periodEnd,
        provider: provider.key,
        providerRef: event.subscriptionRef,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      });
    });

    return { applied: true };
  }

  /**
   * Replacer au gratuit les abonnements dont la période est finie.
   *
   * **Un webhook peut ne jamais arriver.** Stripe envoie une résiliation, NotchPay n'envoie
   * rien du tout quand un client ne repaie pas : sans ce passage, un abonnement prépayé
   * expiré servirait indéfiniment. C'est le filet, et il se déclenche sur l'heure plutôt
   * que sur un message.
   */
  async expire(now: Date = new Date()): Promise<number> {
    const plans = await this.billing.planLimits();

    const expired = await this.db
      .selectFrom('subscriptions')
      .select([
        'organization_id',
        'plan_code',
        'status',
        'period',
        'current_period_end',
      ])
      .where('period', '<>', 'free')
      .execute();

    let count = 0;

    for (const row of expired) {
      const entitlement = entitlementOf(
        {
          planCode: row.plan_code,
          status: row.status,
          period: row.period,
          currentPeriodEnd: row.current_period_end,
        },
        plans,
        FREE_PLAN_CODE,
        now,
      );

      if (!entitlement.lapsed) continue;

      await this.db.transaction().execute(async (trx) => {
        await new BillingRepository(trx).startFree(row.organization_id);
        await this.writeQuotas(trx, row.organization_id, FREE_PLAN_CODE);
      });

      count += 1;
    }

    return count;
  }

  /**
   * Retrouver la ligne que l'événement concerne.
   *
   * **Par notre référence d'abord.** NotchPay rend dans `data.reference` ce qu'on lui a
   * donné, et son webhook peut arriver avant que notre requête d'initialisation ne soit
   * revenue — donc avant qu'on ait pu écrire son identifiant à lui. Chercher par le nôtre
   * ne dépend d'aucun ordre d'arrivée ; Stripe, qui n'en rend pas, tombe sur le second
   * chemin.
   */
  private async paymentOf(
    provider: PaymentProviderKey,
    providerRef: string,
    merchantRef?: string,
  ) {
    const columns = ['id', 'organization_id', 'plan_code', 'period'] as const;

    if (merchantRef !== undefined) {
      const byOurs = await this.db
        .selectFrom('payments')
        .select(columns)
        .where('provider', '=', provider)
        .where('id', '=', merchantRef)
        .executeTakeFirst();

      if (byOurs) return byOurs;
    }

    return this.db
      .selectFrom('payments')
      .select(columns)
      .where('provider', '=', provider)
      .where('provider_ref', '=', providerRef)
      .executeTakeFirst();
  }

  /**
   * Recopier les plafonds de l'offre dans la table que tout le produit lit.
   *
   * Les quotas ne sont pas déduits de l'abonnement à chaque lecture : ils y sont écrits.
   * Les déduire aurait obligé chaque appelant — les projets, l'IA, les membres — à
   * connaître la facturation, et un seul oubli aurait laissé un plafond périmé.
   */
  private async writeQuotas(
    trx: Kysely<Database>,
    organizationId: string,
    planCode: string,
  ): Promise<void> {
    const plans = await new BillingRepository(trx).planLimits();
    const plan = plans.get(planCode);

    if (!plan) throw new Error(`Offre inconnue au catalogue : « ${planCode} »`);

    const quotas: Quotas = {
      projectsMax: plan.projectsMax,
      aiMonthMax: plan.aiMonthMax,
      membersMax: plan.membersMax,
    };

    const columns = {
      projects_max: quotas.projectsMax,
      ai_month_max: quotas.aiMonthMax,
      members_max: quotas.membersMax,
    };

    await trx
      .insertInto('organization_quotas')
      .values({ organization_id: organizationId, ...columns })
      .onConflict((conflict) =>
        conflict
          .column('organization_id')
          .doUpdateSet({ ...columns, updated_at: new Date() }),
      )
      .execute();
  }
}
