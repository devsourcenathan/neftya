/**
 * Le catalogue de quincaillerie.
 *
 * C'est ce qui manquait pour que Neftya sorte autre chose que des contours : **une position
 * de perçage n'existe pas dans l'absolu**, elle existe pour une charnière donnée, une
 * coulisse donnée, un tourillon donné. Tant que la quincaillerie n'était pas nommée, la
 * V1 avait raison de ne rien percer.
 *
 * Les cotes sont celles des articles courants du marché, en millimètres entiers. Elles
 * sont **ici**, visibles, plutôt que dispersées dans le calcul : le jour où un atelier
 * travaille avec une autre référence, il n'y a qu'un endroit à lire.
 *
 * @see docs/NEFTYA_ENGINE.md §12
 * @see docs/MANUFACTURING.md §6
 */

/**
 * Longueurs de coulisses du commerce.
 *
 * Ce sont des longueurs achetées, pas calculées : on ne commande pas une coulisse de
 * 372 mm. Le moteur retient la plus longue qui tient dans la profondeur utile.
 */
export const SLIDE_LENGTHS_MM = [250, 300, 350, 400, 450, 500] as const;

export type SlideLengthMm = (typeof SLIDE_LENGTHS_MM)[number];

/** Clé stable, jamais traduite, et sur laquelle s'accroche le prix saisi. */
export type HardwareKey =
  | 'hinge_35_110'
  | 'dowel_8x30'
  | 'shelf_support_5'
  | `slide_ball_${SlideLengthMm}`;

/**
 * La charnière à boîtier de 35, ouverture 110° — celle qu'on trouve partout.
 *
 * Le boîtier se fraise dans le vantail, l'embase se visse dans le montant. Les deux
 * perçages sont donc sur **deux pièces différentes**, et c'est leur alignement en hauteur
 * qui fait qu'une porte ferme.
 */
export interface HingeSpec {
  key: 'hinge_35_110';
  cupDiameterMm: number;
  cupDepthMm: number;
  /**
   * Du chant du vantail au **centre** du boîtier.
   *
   * 22 mm place le bord du boîtier à 4,5 mm du chant : assez de matière pour que la
   * fraise ne débouche pas, assez peu pour que le bras rattrape le recouvrement.
   */
  cupInsetMm: number;
  plateHoleDiameterMm: number;
  plateHoleDepthMm: number;
  /** Du chant avant du montant au premier trou d'embase. Ligne système 32. */
  plateFrontOffsetMm: number;
  plateHolePitchMm: number;
  /**
   * Du bout du vantail au centre de la charnière d'extrémité.
   *
   * Les charnières intermédiaires se répartissent également entre les deux extrêmes : un
   * vantail dont les charnières seraient toutes réparties sur la hauteur totale aurait la
   * première trop près du bout, là où le panneau est le plus fragile.
   */
  endOffsetMm: number;
}

export const HINGE: HingeSpec = {
  key: 'hinge_35_110',
  cupDiameterMm: 35,
  cupDepthMm: 13,
  cupInsetMm: 22,
  plateHoleDiameterMm: 5,
  plateHoleDepthMm: 11,
  plateFrontOffsetMm: 37,
  plateHolePitchMm: 32,
  endOffsetMm: 100,
};

/**
 * Le nombre de charnières d'un vantail dépend de sa **hauteur**, pas de son nombre.
 *
 * Deux charnières tiennent une porte basse ; une porte de dressing qui n'en aurait que
 * deux s'affaisse et finit par frotter sur le caisson. Les paliers sont ceux des
 * fabricants.
 */
export function hingesFor(leafHeightMm: number): number {
  if (leafHeightMm <= 900) return 2;
  if (leafHeightMm <= 1600) return 3;
  if (leafHeightMm <= 2000) return 4;
  return 5;
}

/**
 * Où se placent les charnières sur la hauteur d'un vantail, du bas vers le haut.
 *
 * Rendu en position **relative au bas du vantail**, en millimètres entiers.
 */
export function hingePositionsMm(leafHeightMm: number, spec: HingeSpec = HINGE): number[] {
  const count = hingesFor(leafHeightMm);
  const first = spec.endOffsetMm;
  const last = leafHeightMm - spec.endOffsetMm;

  // Un vantail trop court pour deux retraits d'extrémité : les charnières se répartissent
  // sur ce qui reste, faute de mieux. Le cas est rare et un plan vide serait pire.
  if (last <= first) {
    return spread(0, leafHeightMm, count);
  }

  return spread(first, last, count);
}

/** La coulisse à billes, montage latéral. */
export interface SlideSpec {
  key: `slide_ball_${SlideLengthMm}`;
  lengthMm: SlideLengthMm;
  holeDiameterMm: number;
  holeDepthMm: number;
  /** Du chant avant du montant au premier trou du profil de caisson. */
  cabinetFirstHoleMm: number;
  /** Trois pas de 32 : le pas de fixation courant d'un profil de caisson. */
  cabinetHolePitchMm: number;
  /** Des deux bouts du côté de tiroir aux trous du profil de tiroir. */
  drawerHoleInsetMm: number;
}

function slide(lengthMm: SlideLengthMm): SlideSpec {
  return {
    key: `slide_ball_${lengthMm}`,
    lengthMm,
    holeDiameterMm: 5,
    holeDepthMm: 11,
    cabinetFirstHoleMm: 37,
    cabinetHolePitchMm: 96,
    drawerHoleInsetMm: 32,
  };
}

export const SLIDES: readonly SlideSpec[] = SLIDE_LENGTHS_MM.map(slide);

/**
 * La plus longue coulisse qui tient dans la profondeur utile.
 *
 * `null` quand aucune n'y tient : un caisson de 200 mm de profondeur ne reçoit pas de
 * coulisse du commerce, et l'annoncer vaut mieux que d'en placer une qui dépasse.
 */
export function slideFor(usableDepthMm: number): SlideSpec | null {
  return (
    [...SLIDES].reverse().find((candidate) => candidate.lengthMm <= usableDepthMm) ?? null
  );
}

/** Le tourillon de 8, longueur 30 : l'assemblage collé courant d'un séparateur. */
export interface DowelSpec {
  key: 'dowel_8x30';
  diameterMm: number;
  lengthMm: number;
  /**
   * Profondeur percée de chaque côté.
   *
   * Deux fois 16 pour un tourillon de 30 : les deux millimètres de reste évitent que le
   * tourillon touche le fond avant que les deux pièces ne se touchent — auquel cas le
   * joint reste ouvert, quelle que soit la presse.
   */
  holeDepthMm: number;
  /** Des deux bouts de la ligne d'assemblage au premier tourillon. */
  endOffsetMm: number;
  /** Par about de séparateur. Huit par séparateur, donc. */
  countPerJoint: number;
}

export const DOWEL: DowelSpec = {
  key: 'dowel_8x30',
  diameterMm: 8,
  lengthMm: 30,
  holeDepthMm: 16,
  endOffsetMm: 50,
  countPerJoint: 4,
};

/** Le taquet d'étagère de 5, sur ligne système 32. */
export interface ShelfSupportSpec {
  key: 'shelf_support_5';
  diameterMm: number;
  holeDepthMm: number;
  /** Du chant avant du montant à la ligne de perçage. */
  frontOffsetMm: number;
  /** Du chant arrière du montant à la seconde ligne. */
  backOffsetMm: number;
  /**
   * Du dessous de l'étagère au **centre** du trou.
   *
   * Trois millimètres pour un taquet de 5 : le haut du taquet arrive un demi-millimètre
   * sous la cote nominale, et l'étagère descend d'autant. Un demi-millimètre ne se voit
   * pas ; une étagère qui ne porte pas à plat, si.
   */
  centreBelowShelfMm: number;
}

export const SHELF_SUPPORT: ShelfSupportSpec = {
  key: 'shelf_support_5',
  diameterMm: 5,
  holeDepthMm: 10,
  frontOffsetMm: 37,
  backOffsetMm: 37,
  centreBelowShelfMm: 3,
};

/**
 * `count` positions entières réparties de `first` à `last`, bornes comprises.
 *
 * L'arrondi est fait sur chaque position depuis les bornes exactes, jamais par
 * accumulation d'un pas arrondi : sur cinq charnières, un pas arrondi décale la dernière
 * de plusieurs millimètres, et c'est celle qui ne tombe plus en face de son embase.
 */
function spread(first: number, last: number, count: number): number[] {
  if (count <= 1) return [Math.round((first + last) / 2)];

  return Array.from({ length: count }, (_, index) =>
    Math.round(first + ((last - first) * index) / (count - 1)),
  );
}
