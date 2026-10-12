import type { BillingPeriod, PaymentProviderKey } from '../db/schema.js';

/**
 * Ce que Neftya demande à un encaisseur, et ce qu'elle en attend.
 *
 * Deux fournisseurs très différents passent par là : Stripe, qui tient lui-même un
 * abonnement et le renouvelle ; NotchPay, qui encaisse une fois et ne sait rien d'une
 * période. L'interface est donc écrite **du point de vue de Neftya** — « ouvre un
 * paiement, dis-moi où envoyer le client, préviens-moi quand c'est réglé » — et non comme
 * le plus petit dénominateur de leurs deux API.
 *
 * C'est ce qui permet au prépayé et au récurrent d'arriver au même endroit :
 * `entitlementOf` ne verra qu'une date de fin, quelle que soit la façon dont elle a été
 * posée.
 */

export interface CheckoutRequest {
  organizationId: string;
  planCode: string;
  period: BillingPeriod;
  currency: string;
  /** En unité mineure, tel que l'environnement le donne. Jamais recalculé ici. */
  amountMinor: number;
  /** Ce que le client verra sur sa facture et sur la page de paiement. */
  label: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * La clé d'idempotence, décidée par l'appelant.
   *
   * Transmise au fournisseur **et** écrite dans notre registre : deux clics sur « Payer »
   * ne doivent ouvrir ni deux sessions chez lui ni deux lignes chez nous.
   */
  idempotencyKey: string;
}

export interface CheckoutStarted {
  /** Où envoyer le client. Page hébergée dans les deux cas : on ne touche pas aux cartes. */
  redirectUrl: string;
  /** L'identifiant de la session chez le fournisseur, pour retrouver la ligne au webhook. */
  providerRef: string;
}

/**
 * Ce qu'un webhook nous apprend, traduit dans notre vocabulaire.
 *
 * Les fournisseurs n'ont pas les mêmes événements : Stripe parle de sessions, d'abonnements
 * et de factures ; NotchPay d'un paiement qui aboutit ou non. On ne garde que ce qui change
 * un droit d'accès — le reste est du bruit qu'il vaut mieux ignorer explicitement que
 * traduire pour rien.
 */
export type ProviderEvent =
  /** Un encaissement a réussi. Pour un prépayé, c'est lui qui prolonge la période. */
  | {
      kind: 'payment_settled';
      eventId: string;
      type: string;
      providerRef: string;
      /** L'abonnement chez le fournisseur, quand il en tient un. */
      subscriptionRef?: string;
      /** L'identifiant client chez le fournisseur, à retenir pour la suite. */
      customerRef?: string;
      /*
       * **Pas d'échéance ici, et c'est voulu.**
       *
       * Aucun encaissement n'en porte une : une session Stripe réglée n'a pas de période,
       * et un paiement mobile money n'en connaît aucune. L'échéance est donc calculée par
       * nous à l'encaissement — puis, chez Stripe, corrigée dans la seconde par le
       * `customer.subscription.updated` qui suit, lequel fait autorité.
       *
       * Un champ optionnel qu'aucun fournisseur ne remplit aurait été une branche que
       * rien n'exerce, et dont on aurait cru qu'elle marchait.
       */
    }
  /** Un encaissement a échoué, été annulé ou a expiré. */
  | { kind: 'payment_failed'; eventId: string; type: string; providerRef: string }
  /** L'abonnement du fournisseur a changé : échéance repoussée, résiliation, impayé. */
  | {
      kind: 'subscription_changed';
      eventId: string;
      type: string;
      subscriptionRef: string;
      status: 'active' | 'past_due' | 'canceled';
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  /** Reçu, authentique, mais sans effet sur un droit d'accès. */
  | { kind: 'ignored'; eventId: string; type: string };

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  /** Les devises que ce fournisseur sait encaisser. Hors de cette liste, il ne propose rien. */
  readonly currencies: readonly string[];

  startCheckout(request: CheckoutRequest): Promise<CheckoutStarted>;

  /**
   * Authentifier puis traduire un webhook.
   *
   * **Le corps brut, pas l'objet analysé.** Les deux fournisseurs signent les octets reçus ;
   * re-sérialiser un JSON analysé change l'ordre des clés et les espaces, donc la signature,
   * et la vérification échoue pour une raison qui n'a rien à voir avec la sécurité. La
   * documentation de NotchPay se contredit d'ailleurs sur ce point — son exemple Node signe
   * une copie re-sérialisée.
   *
   * Lève si la signature ne vaut pas : un webhook non authentifié est une tentative
   * d'ouvrir un abonnement sans payer, et il n'a pas à être distingué d'une panne.
   */
  readEvent(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): ProviderEvent;

  /**
   * L'adresse du portail où le client change de carte ou résilie, s'il en existe un.
   *
   * `null` pour un fournisseur qui n'en a pas : en mobile money il n'y a pas de carte à
   * remplacer, et une résiliation s'y fait en ne repayant pas.
   */
  portalUrl?(customerRef: string, returnUrl: string): Promise<string>;
}
