import type { Furniture, Warning } from './build.js';
import { facadesOf } from './facades.js';

/**
 * Est-ce que ça rentre ?
 *
 * Le moteur sait depuis toujours si un meuble **tient debout**. Il ne savait pas s'il
 * entrait dans la pièce où il doit aller, et c'est l'autre façon de rater un premier
 * meuble : les panneaux sont justes, le montage est bon, et le meuble ne passe pas.
 *
 * Quatre contrôles, et un seul n'est pas évident :
 *
 *  - les trois cotes hors-tout contre celles de l'emplacement ;
 *  - **le redressement sur place** — on assemble un meuble haut à plat, puis on le lève.
 *    Pendant la bascule, c'est sa **diagonale** qui passe sous le plafond, pas sa hauteur.
 *    Une armoire de 2 400 dans une pièce de 2 500 ne se redresse pas : il lui faut 2 433
 *    pour 400 de profondeur. C'est la mesure que personne ne prend, et elle se découvre
 *    une fois le meuble monté par terre ;
 *  - **la plinthe**, qui écarte le meuble du mur d'autant qu'elle saille ;
 *  - **le débattement des portes**, qui demande devant le meuble la largeur d'un vantail.
 *
 * Tout est facultatif : une cote d'emplacement absente ne produit aucun avertissement.
 * Rien n'est jamais refusé — c'est celui qui pose le meuble qui décide, et il décide mieux
 * en sachant.
 *
 * @see docs/NEFTYA_ENGINE.md §7.5
 */

export type FittingCode =
  | 'SPACE_TOO_NARROW'
  | 'SPACE_TOO_SHORT'
  | 'SPACE_TOO_SHALLOW'
  | 'CANNOT_TILT_UP'
  | 'SKIRTING_HOLDS_OFF'
  | 'DOOR_SWING_CLEARANCE';

/**
 * La hauteur qu'il faut au-dessus pour redresser un meuble couché.
 *
 * C'est la diagonale du profil, car le meuble pivote sur son arête arrière basse : le coin
 * opposé décrit un arc dont le rayon vaut cette diagonale, et c'est ce coin qui touche le
 * plafond. Exportée parce qu'elle vaut d'être montrée à côté du meuble, et non seulement
 * quand elle coince.
 */
export function tiltHeightMm(heightMm: number, depthMm: number): number {
  return Math.round(Math.sqrt(heightMm * heightMm + depthMm * depthMm));
}

export function fittingWarnings(furniture: Furniture): Warning[] {
  const space = furniture.input.space;
  if (!space) return [];

  const { widthMm, depthMm } = furniture.input.dimensions;
  // Pieds compris : c'est le meuble posé qu'on compare, pas le caisson.
  const standingHeightMm = furniture.totalHeightWithLegsMm;

  const warnings: Warning[] = [];

  if (space.widthMm !== undefined && widthMm > space.widthMm) {
    warnings.push({
      code: 'SPACE_TOO_NARROW',
      details: { furnitureMm: widthMm, spaceMm: space.widthMm },
    });
  }

  if (space.heightMm !== undefined && standingHeightMm > space.heightMm) {
    warnings.push({
      code: 'SPACE_TOO_SHORT',
      details: { furnitureMm: standingHeightMm, spaceMm: space.heightMm },
    });
  }

  if (space.depthMm !== undefined && depthMm > space.depthMm) {
    warnings.push({
      code: 'SPACE_TOO_SHALLOW',
      details: { furnitureMm: depthMm, spaceMm: space.depthMm },
    });
  }

  /*
   * Le redressement, et seulement s'il y a quelque chose à redresser.
   *
   * Un meuble déjà trop haut pour la pièce est signalé juste au-dessus : répéter qu'il ne
   * se redresse pas non plus noierait le vrai cas, celui du meuble qui tient debout et qui
   * ne peut pas être levé. C'est ce cas-là qui surprend.
   */
  const tiltMm = tiltHeightMm(standingHeightMm, depthMm);

  if (
    space.heightMm !== undefined &&
    standingHeightMm <= space.heightMm &&
    tiltMm > space.heightMm
  ) {
    warnings.push({
      code: 'CANNOT_TILT_UP',
      details: {
        tiltMm,
        spaceMm: space.heightMm,
        heightMm: standingHeightMm,
        depthMm,
      },
    });
  }

  /*
   * La plinthe.
   *
   * Elle ne gêne que si le meuble descend à sa hauteur. Un meuble sur pieds plus hauts
   * qu'elle passe au-dessus et touche le mur : l'avertir serait du bruit.
   */
  if (
    space.skirtingDepthMm !== undefined &&
    space.skirtingDepthMm > 0 &&
    furniture.parameters.legHeightMm < (space.skirtingHeightMm ?? Infinity)
  ) {
    warnings.push({
      code: 'SKIRTING_HOLDS_OFF',
      details: {
        gapMm: space.skirtingDepthMm,
        totalDepthMm: depthMm + space.skirtingDepthMm,
      },
    });
  }

  /*
   * Le débattement.
   *
   * Un vantail ouvert à 90° balaie devant lui sa propre largeur. On ne connaît pas ce
   * qu'il y a en face — c'est une information, pas un défaut, et le plus large vantail
   * décide pour tous.
   */
  /*
   * La largeur dans le repère du meuble, et non `Part.widthMm`.
   *
   * Une `Part` porte sa plus grande cote en premier : sur une porte haute, `widthMm` est
   * bien le vantail, mais sur une porte large et basse c'est la hauteur. Le balayage aurait
   * été annoncé faux exactement là où un meuble bas a de grandes portes — un meuble TV.
   */
  const widestLeafMm = facadesOf(furniture)
    .filter((facade) => facade.role === 'door')
    .reduce((widest, facade) => Math.max(widest, facade.placement.sizeXMm), 0);

  if (widestLeafMm > 0) {
    warnings.push({
      code: 'DOOR_SWING_CLEARANCE',
      details: { clearanceMm: widestLeafMm },
    });
  }

  return warnings;
}
