import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PaymentProviderKey } from '../db/schema.js';
import type {
  CheckoutRequest,
  CheckoutStarted,
  PaymentProvider,
  ProviderEvent,
} from './provider.js';

/**
 * NotchPay, en période prépayée.
 *
 * **Il n'a pas d'abonnement.** Son API encaisse une fois et ne sait rien d'une échéance :
 * c'est nous qui prolongeons la période à chaque encaissement. C'est aussi la réalité du
 * mobile money — il n'y a pas de mandat à représenter, le client pousse l'argent depuis
 * son téléphone. Un renouvellement y est donc un acte volontaire, et l'annuel compte
 * d'autant plus : une manipulation par an au lieu de douze.
 *
 * On passe par la **page hébergée** (`authorization_url`) plutôt que par le débit direct.
 * Le débit direct demanderait de collecter le numéro et l'opérateur dans notre interface,
 * de gérer les invites USSD et les délais propres à chaque réseau. La page de NotchPay
 * fait déjà tout cela, et mieux que nous ne le ferions la première année.
 *
 * @see https://developer.notchpay.co/accept-payments/collect
 */

export const NOTCHPAY_BASE_URL = 'https://api.notchpay.co';

/** Le franc CFA, que Stripe ne prend pas. C'est toute la raison d'être de ce fournisseur. */
export const NOTCHPAY_CURRENCIES = ['XAF'] as const;

export interface NotchPayConfig {
  /** Clé publique, envoyée telle quelle dans `Authorization` — sans préfixe `Bearer`. */
  publicKey: string;
  /** Le « Hash Key » du point de terminaison. **Ni la clé publique, ni la privée.** */
  webhookHash: string;
  baseUrl?: string;
}

/** Ce que l'initialisation rend. Le reste du corps ne nous regarde pas. */
const initialised = z.object({
  transaction: z.string().min(1),
  authorization_url: z.string().url(),
});

/**
 * L'enveloppe d'un webhook.
 *
 * Validée plutôt que supposée : le corps vient du dehors, et un `data` absent ferait
 * lever une erreur de lecture là où il faut un refus propre.
 */
const webhookEvent = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    id: z.string().min(1),
    /** Notre propre identifiant de paiement, posé à l'initialisation. */
    reference: z.string().min(1).optional(),
    status: z.string().optional(),
  }),
});

export class NotchPayProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'notchpay';
  readonly currencies = NOTCHPAY_CURRENCIES;

  private readonly baseUrl: string;

  constructor(
    private readonly config: NotchPayConfig,
    /** Injectable : les tests ne doivent toucher aucun réseau. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = config.baseUrl ?? NOTCHPAY_BASE_URL;
  }

  async startCheckout(request: CheckoutRequest): Promise<CheckoutStarted> {
    const response = await this.fetchImpl(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        /*
         * La clé nue, sans `Bearer`.
         *
         * C'est inhabituel et la documentation l'écrit en toutes lettres. Ajouter le
         * préfixe par réflexe donne un 401 dont rien ne dit la cause.
         */
        authorization: this.config.publicKey,
      },
      body: JSON.stringify({
        amount: request.amountMinor,
        currency: request.currency,
        email: request.customerEmail,
        description: request.label,
        /*
         * **Notre identifiant voyage, et c'est par lui qu'on se retrouve.**
         *
         * Le webhook le rend dans `data.reference`. S'en remettre à l'identifiant de
         * NotchPay obligerait à l'avoir écrit avant que le webhook n'arrive — or il peut
         * arriver avant que notre requête d'initialisation ne soit revenue.
         */
        reference: request.idempotencyKey,
        callback: request.successUrl,
      }),
    });

    if (!response.ok) {
      /*
       * Le corps de l'erreur n'est pas relayé au client.
       *
       * Il peut contenir des éléments de configuration du compte marchand, et l'appelant
       * n'en ferait rien. Il part au journal, pas dans la réponse.
       */
      throw new Error(
        `NotchPay a refusé l’initialisation du paiement (HTTP ${String(response.status)}).`,
      );
    }

    const body = initialised.safeParse(await response.json());

    if (!body.success) {
      throw new Error('NotchPay a rendu une réponse sans adresse de paiement.');
    }

    return {
      redirectUrl: body.data.authorization_url,
      providerRef: body.data.transaction,
    };
  }

  readEvent(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): ProviderEvent {
    const signature = headers['x-notch-signature'];

    if (!signature) throw new Error('Webhook NotchPay sans signature.');

    const expected = createHmac('sha256', this.config.webhookHash)
      .update(rawBody)
      .digest('hex');

    /*
     * Comparaison à temps constant, sur des tampons de même longueur.
     *
     * **Aucun test ne distingue ceci d'un `===`** : les deux acceptent et refusent
     * exactement les mêmes signatures. La différence n'est pas fonctionnelle, elle est
     * dans le temps de réponse, et une mesure de durée en test serait instable au point
     * d'être inutile. C'est donc une garde justifiée, pas une garde couverte.
     *
     * `timingSafeEqual` lève si les longueurs diffèrent : on la contrôle d'abord, sinon
     * une signature tronquée produirait une exception au lieu d'un refus. Et on compare
     * ainsi plutôt qu'avec `===`, qui s'arrête au premier octet différent et laisse
     * mesurer, essai après essai, combien de caractères sont justes.
     */
    const given = Buffer.from(signature, 'utf8');
    const mine = Buffer.from(expected, 'utf8');

    if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
      throw new Error('Signature NotchPay invalide.');
    }

    const parsed = webhookEvent.safeParse(
      JSON.parse(rawBody.toString('utf8')) as unknown,
    );

    if (!parsed.success) throw new Error('Webhook NotchPay illisible.');

    const event = parsed.data;
    const base = { eventId: event.id, type: event.type };

    switch (event.type) {
      case 'payment.complete':
        return {
          ...base,
          kind: 'payment_settled',
          providerRef: event.data.id,
          ...(event.data.reference !== undefined
            ? { merchantRef: event.data.reference }
            : {}),
        };

      /*
       * Les trois issues négatives, traitées pareil.
       *
       * Échoué, annulé, expiré : dans les trois cas le client n'a pas payé, et notre
       * registre n'a rien d'autre à en dire. Les distinguer donnerait trois états pour une
       * seule conséquence.
       */
      case 'payment.failed':
      case 'payment.canceled':
      case 'payment.expired':
        return {
          ...base,
          kind: 'payment_failed',
          providerRef: event.data.id,
          ...(event.data.reference !== undefined
            ? { merchantRef: event.data.reference }
            : {}),
        };

      default:
        /*
         * `payment.created`, les transferts, les clients.
         *
         * Ignorés explicitement : répondre en erreur les ferait réessayer indéfiniment,
         * et `payment.created` arrive sur chaque paiement.
         */
        return { ...base, kind: 'ignored' };
    }
  }
}
