/**
 * Lire l'état de la facturation sans rien affirmer de faux.
 *
 * Deux lectures vivent ici, et toutes deux corrigent une interface qui disait des choses
 * qu'elle ne savait pas :
 *
 *  - **ce qu'est devenu un paiement** : l'adresse de retour ne connaissait que « succès »
 *    et « annulé », si bien qu'un paiement *refusé* — mauvais code, solde insuffisant,
 *    délai dépassé — affichait « Paiement abandonné. Rien n'a été débité. » La deuxième
 *    phrase était une affirmation sur de l'argent, faite sans la moindre vérification ;
 *  - **ce qui arrivera à l'échéance** : l'écran disait « Renouvellement » à tout le monde,
 *    alors qu'en mobile money rien ne se renouvelle. Le libellé promettait un prélèvement
 *    qui n'arrivera jamais, et l'accès tombait le jour dit sans préavis.
 *
 * Les deux sont pures et prennent ce que le serveur a rendu : la vérité est dans la ligne
 * de paiement et dans l'abonnement, jamais dans les paramètres de l'URL — que n'importe
 * qui peut taper à la main.
 */

/** Ce que l'adresse de retour dit : seulement qu'on revient d'une page de paiement. */
export type Returned = 'succes' | 'annule' | null;

export type PaymentOutcome =
  /** L'encaissement est constaté et l'offre est ouverte. */
  | 'confirmed'
  /** Le client est revenu en annonçant un succès, l'encaisseur ne l'a pas encore dit. */
  | 'waiting'
  /** L'encaisseur a refusé. Il y a quelque chose à corriger et à retenter. */
  | 'refused'
  /** Rien n'a abouti : abandon, page fermée, délai dépassé. */
  | 'unfinished';

/**
 * Ce qu'est devenu le paiement, d'après **la ligne** et non d'après l'URL.
 *
 * `returned` ne sert qu'à départager les deux lectures d'une ligne encore en attente : un
 * client qui revient par le bouton « succès » attend une confirmation, celui qui revient
 * par « annuler » a renoncé. Tout le reste est décidé par l'état de la ligne.
 */
export function paymentOutcome(
  returned: Exclude<Returned, null>,
  status: 'pending' | 'settled' | 'failed' | 'canceled' | 'expired' | null,
): PaymentOutcome {
  if (status === 'settled') return 'confirmed';
  if (status === 'failed') return 'refused';

  /*
   * Une ligne en attente après un retour « succès » : on attend, et on le dit.
   *
   * C'est le seul état où la page doit encore bouger — la sonde part, le compteur tourne.
   * Les autres sont définitifs.
   */
  if (status === 'pending' && returned === 'succes') return 'waiting';

  /*
   * Aucune ligne du tout vaut « rien n'a abouti », et non une erreur.
   *
   * Un client peut arriver ici par un signet, ou avec une adresse de retour recopiée. Lui
   * montrer un échec serait inventer un paiement qui n'a jamais existé.
   */
  return 'unfinished';
}

export type Renewal =
  /** Rien ne sera prélevé : l'accès s'arrête à l'échéance. */
  | 'ends'
  /** Une carte est en place chez l'encaisseur : il prélèvera de lui-même. */
  | 'auto'
  /** Prépayé : il faut repayer avant l'échéance, et personne ne le rappellera. */
  | 'manual';

/**
 * Ce qui arrivera à l'échéance.
 *
 * L'ordre compte : une résiliation l'emporte sur tout le reste. Un abonnement par carte
 * marqué « ne pas renouveler » ne doit pas annoncer un prélèvement automatique, sinon le
 * client croirait que son clic sur « résilier » n'a pas pris.
 */
export function renewalKind(subscription: {
  status: string;
  cancel_at_period_end: boolean;
  provider: string | null;
}): Renewal {
  if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
    return 'ends';
  }

  return subscription.provider === 'stripe' ? 'auto' : 'manual';
}
