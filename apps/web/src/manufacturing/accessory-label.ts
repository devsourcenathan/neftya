import type { TFunction } from 'i18next';

/**
 * Le libellé traduit d'un article de quincaillerie.
 *
 * Les coulisses portent leur **longueur dans leur clé** — `slide_ball_350` — parce qu'on
 * n'achète pas « une coulisse », on achète une coulisse de 350. Six entrées de traduction
 * pour six longueurs diraient six fois la même chose : une seule, paramétrée, suffit.
 *
 * Cette fonction est partagée par la liste des matériaux et l'éditeur de prix. Les deux
 * traduisaient la clé chacun de leur côté, et l'un des deux affichait `accessory.slide_ball_500`
 * en clair dans le devis — visible en trois secondes dans un navigateur, invisible pour la
 * centaine de tests qui regardaient chaque vue séparément.
 */
export function accessoryLabel(t: TFunction, key: string): string {
  const slide = /^slide_ball_(\d+)$/u.exec(key);
  if (slide) return t('accessory.slide_ball', { length: Number(slide[1]) });

  // Même raison pour les barres : l'entraxe est la cote qui décide du perçage, et celle
  // qu'on lit sur une facture. Quatre entrées de traduction diraient quatre fois la même.
  const bar = /^pull_bar_(\d+)$/u.exec(key);
  if (bar) return t('accessory.pull_bar', { centres: Number(bar[1]) });

  return t(`accessory.${key}`);
}
