import Stripe from 'stripe';
import type { PaymentProviderKey } from '../db/schema.js';
import type {
  CheckoutRequest,
  CheckoutStarted,
  PaymentProvider,
  ProviderEvent,
} from './provider.js';

/**
 * Stripe, en abonnement récurrent.
 *
 * **Le prix part d'ici, pas d'un catalogue Stripe.** `price_data` crée le tarif en ligne à
 * chaque session, ce qui laisse l'environnement seul maître des montants. Déclarer des
 * `Price` chez Stripe aurait donné deux catalogues à tenir d'accord, et le jour où ils
 * divergent, c'est le montant de Stripe qui est débité — pas celui qu'affiche la page.
 *
 * **La signature est vérifiée par le SDK**, et c'est délibéré. `constructEvent` compare
 * l'empreinte *et* l'horodatage : sans la seconde, un webhook authentique capté une fois
 * peut être rejoué indéfiniment pour prolonger un abonnement. C'est une vingtaine de
 * lignes de HMAC qu'on écrit vite et mal.
 */

/** Les devises que ce fournisseur porte ici. Le franc CFA passe par le mobile money. */
export const STRIPE_CURRENCIES = ['EUR'] as const;

export interface StripeConfig {
  secretKey: string;
  /** Le secret du point de terminaison, différent de la clé d'API. */
  webhookSecret: string;
}

export class StripeProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'stripe';
  readonly currencies = STRIPE_CURRENCIES;

  private readonly stripe: Stripe;

  constructor(
    private readonly config: StripeConfig,
    /** Injectable pour les tests : ils ne doivent toucher aucun réseau. */
    client?: Stripe,
  ) {
    this.stripe = client ?? new Stripe(config.secretKey);
  }

  async startCheckout(request: CheckoutRequest): Promise<CheckoutStarted> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        customer_email: request.customerEmail,
        /*
         * L'organisation voyage dans les deux sens.
         *
         * `client_reference_id` revient sur la session, les métadonnées reviennent sur
         * l'abonnement et sur chaque facture de renouvellement. Sans les secondes, un
         * `invoice.paid` reçu dans six mois ne dirait pas à qui l'attribuer — il faudrait
         * remonter par la référence Stripe, et une seule requête ratée perdrait le lien.
         */
        client_reference_id: request.organizationId,
        metadata: {
          organization_id: request.organizationId,
          plan_code: request.planCode,
        },
        subscription_data: {
          metadata: {
            organization_id: request.organizationId,
            plan_code: request.planCode,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountMinor,
              recurring: { interval: request.period === 'yearly' ? 'year' : 'month' },
              product_data: { name: request.label },
            },
          },
        ],
      },
      /*
       * L'idempotence de Stripe, en plus de la nôtre.
       *
       * La nôtre empêche deux lignes dans notre registre ; celle-ci empêche deux sessions
       * chez lui. Un double clic au moment où le réseau hésite déclenche exactement ce
       * cas, et la seconde requête reçoit alors la première session au lieu d'en ouvrir
       * une autre.
       */
      { idempotencyKey: request.idempotencyKey },
    );

    /*
     * Une session sans adresse n'est pas une session.
     *
     * Le type le permet — `url` est nullable pour les sessions embarquées — mais pas ce
     * mode. Rendre une chaîne vide enverrait le client sur une page blanche.
     */
    if (!session.url) {
      throw new Error('Stripe a rendu une session sans adresse de paiement.');
    }

    return { redirectUrl: session.url, providerRef: session.id };
  }

  readEvent(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): ProviderEvent {
    const signature = headers['stripe-signature'];

    if (!signature) throw new Error('Webhook Stripe sans signature.');

    // Lève si l'empreinte ou l'horodatage ne vont pas. On ne rattrape pas : une signature
    // fausse est une tentative d'ouvrir un abonnement sans payer.
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.webhookSecret,
    );

    return translate(event);
  }

  async portalUrl(customerRef: string, returnUrl: string): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerRef,
      return_url: returnUrl,
    });

    return session.url;
  }
}

/**
 * Le vocabulaire de Stripe, traduit dans le nôtre.
 *
 * Quatre événements seulement. Stripe en émet des dizaines, et en traduire davantage
 * donnerait du code qu'aucun appel n'exerce — mais chacun de ceux-ci change un droit
 * d'accès, et les manquer laisse un client payé sans service ou servi sans payer.
 */
function translate(event: Stripe.Event): ProviderEvent {
  const base = { eventId: event.id, type: event.type };

  switch (event.type) {
    /*
     * La première période. C'est ici que l'abonnement s'ouvre.
     *
     * `invoice.paid` arrive aussi, et plus tard : s'appuyer sur lui seul laisserait le
     * client devant un écran « merci » sans accès pendant quelques secondes.
     */
    case 'checkout.session.completed': {
      const session = event.data.object;

      return {
        ...base,
        kind: 'payment_settled',
        providerRef: session.id,
        ...(typeof session.subscription === 'string'
          ? { subscriptionRef: session.subscription }
          : {}),
        ...(typeof session.customer === 'string'
          ? { customerRef: session.customer }
          : {}),
      };
    }

    /*
     * Les renouvellements, les résiliations et les impayés, tous par le même événement.
     *
     * Stripe y met l'état et la nouvelle échéance : c'est lui qui fait autorité sur la
     * date de fin, et la recalculer de notre côté ferait deux vérités.
     */
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;

      return {
        ...base,
        kind: 'subscription_changed',
        subscriptionRef: subscription.id,
        status: statusOf(subscription.status, event.type),
        currentPeriodEnd: periodEndOf(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    }

    case 'checkout.session.expired':
      return { ...base, kind: 'payment_failed', providerRef: event.data.object.id };

    default:
      return { ...base, kind: 'ignored' };
  }
}

/**
 * L'état Stripe, ramené aux trois que porte notre abonnement.
 *
 * Stripe en a huit. Les distinguer tous obligerait à décider, pour chacun, s'il ouvre ou
 * ferme l'accès — alors que la question n'en admet que trois réponses.
 */
function statusOf(
  status: Stripe.Subscription.Status,
  type: string,
): 'active' | 'past_due' | 'canceled' {
  if (type === 'customer.subscription.deleted') return 'canceled';

  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      /*
       * `canceled`, `incomplete`, `incomplete_expired`, `paused`.
       *
       * Aucun ne sert l'abonnement. Les traiter en bloc est volontaire : la nuance entre
       * « jamais confirmé » et « résilié » intéresse la comptabilité, pas le contrôle
       * d'accès, et c'est `current_period_end` qui coupe de toute façon.
       */
      return 'canceled';
  }
}

/**
 * La fin de période, prise sur l'article d'abonnement.
 *
 * Stripe l'a déplacée de l'abonnement vers ses `items` : un abonnement peut porter
 * plusieurs articles aux échéances distinctes. Les nôtres n'en ont qu'un, et c'est la plus
 * lointaine qui décide — servir jusqu'à la plus proche couperait un client qui a payé.
 */
function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((end): end is number => typeof end === 'number');

  if (ends.length === 0) return null;

  return new Date(Math.max(...ends) * 1000);
}
