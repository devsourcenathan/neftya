import type { TFunction } from 'i18next';
import type { Warning } from '@neftya/engine';

/**
 * Le texte d'un avertissement, variables comprises.
 *
 * **Une fonction plutôt qu'un appel en ligne**, parce que l'appel en ligne était faux :
 * il passait la clé sans les `details`, et l'écran affichait « il lui faut {{tiltMm}} mm »
 * — accolades comprises. Le défaut ne datait pas d'hier et touchait tous les
 * avertissements chiffrés ; aucun test ne pouvait le voir, puisque le moteur rendait les
 * bons nombres et que la traduction existait. Il fallait regarder l'écran.
 *
 * Passée par ici, la substitution a un endroit où être vérifiée.
 */
export function warningText(t: TFunction, warning: Warning): string {
  return t(variantOf(warning), warning.details);
}

/**
 * Le message à employer, quand le même code en a plusieurs.
 *
 * Une étagère qui plie a trois sorties, sauf quand aucune épaisseur du catalogue ne suffit :
 * il n'en reste alors que deux. Proposer « passez en 0 mm » serait pire que de se taire, et
 * un message unique écrit au conditionnel — « le cas échéant » — ne se suit pas davantage.
 *
 * Le choix est ici plutôt que dans le moteur : c'est une affaire de phrase, pas de calcul,
 * et le moteur a déjà dit ce qu'il savait en rendant `thickerMm` à zéro.
 */
function variantOf(warning: Warning): string {
  const key = `warning.${warning.code}`;

  return warning.code === 'SHELF_DEFLECTION' && warning.details['thickerMm'] === 0
    ? `${key}_NO_THICKNESS`
    : key;
}
