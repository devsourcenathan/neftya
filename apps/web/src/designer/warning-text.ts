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
  return t(`warning.${warning.code}`, warning.details);
}
