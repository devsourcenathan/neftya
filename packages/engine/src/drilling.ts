import type { Furniture } from './build.js';
import type { Part, Placement } from './parts.js';
import {
  facingSide,
  frameOf,
  toPartFrame,
  type Axis,
  type HoleSide,
  type PartFrame,
} from './part-frame.js';
import {
  DOWEL,
  HINGE,
  SHELF_SUPPORT,
  hingePositionsMm,
  slideFor,
  type HardwareKey,
} from './hardware.js';

/**
 * Les positions de perçage.
 *
 * C'est ce qui fait passer Neftya d'un outil de préparation à une sortie d'usinage. Un
 * perçage n'existe que **pour une quincaillerie donnée** : le catalogue devait donc venir
 * d'abord, et il vient d'abord.
 *
 * Deux règles portent tout le reste :
 *
 *  - **un jeu de trous par instance, jamais par pièce**. Les deux vantaux d'une paire sont
 *    la même `Part` en quantité 2 et ne se percent pas pareil : l'un charnière à gauche,
 *    l'autre à droite. Les grouper les percerait tous les deux du même côté ;
 *  - **les coordonnées sont dans le repère de la face qu'on perce**. Voir `HoleSide`.
 *
 * Le module ne relit aucune variable interne de `build` : il retrouve les voisins d'une
 * pièce **par la géométrie de ses instances**. Un perçage calculé depuis les mêmes
 * intermédiaires que la construction ne dirait que ce que la construction croit déjà.
 *
 * @see docs/NEFTYA_ENGINE.md §12
 * @see docs/MANUFACTURING.md §6
 */

export type HolePurpose =
  | 'hinge_cup'
  | 'hinge_plate'
  | 'shelf_support'
  | 'slide_cabinet'
  | 'slide_drawer'
  | 'dowel';

export interface Hole {
  xMm: number;
  yMm: number;
  diameterMm: number;
  /** Profondeur borgne. Aucun perçage du moteur ne traverse. */
  depthMm: number;
  side: HoleSide;
  /** Ce que le trou reçoit. Clé stable, jamais traduite. */
  purpose: HolePurpose;
  hardware: HardwareKey;
}

export interface DrilledPart {
  partId: string;
  /**
   * Rang de l'instance dans `Part.instances`.
   *
   * C'est la seule façon de désigner « le côté gauche » quand les deux côtés sont la même
   * pièce en quantité 2.
   */
  instanceIndex: number;
  holes: Hole[];
}

export interface DrillingWarning {
  code: 'NO_SLIDE_FITS';
  partId?: string;
  details: Record<string, number | string>;
}

export interface HardwareLine {
  key: HardwareKey;
  quantity: number;
}

export interface DrillingResult {
  /** Une entrée par instance percée. Une instance sans trou n'apparaît pas. */
  parts: DrilledPart[];
  /** La quincaillerie **déduite des trous**, jamais comptée à part. */
  hardware: HardwareLine[];
  warnings: DrillingWarning[];
}

interface Piece {
  part: Part;
  instance: Placement;
  instanceIndex: number;
  frame: PartFrame;
}

const VERTICAL_ROLES = new Set(['side', 'divider']);

export function drilling(furniture: Furniture): DrillingResult {
  const pieces = piecesOf(furniture);
  const verticals = pieces.filter((piece) => VERTICAL_ROLES.has(piece.part.role));
  const horizontals = pieces.filter(
    (piece) => piece.part.role === 'top' || piece.part.role === 'bottom',
  );

  const drilled = new Map<string, { piece: Piece; holes: Hole[] }>();
  const warnings: DrillingWarning[] = [];

  const add = (piece: Piece, hole: Hole) => {
    const key = `${piece.part.id}#${piece.instanceIndex}`;
    const entry = drilled.get(key) ?? { piece, holes: [] };
    entry.holes.push(hole);
    drilled.set(key, entry);
  };

  for (const shelf of pieces.filter((piece) => piece.part.role === 'shelf')) {
    shelfSupports(shelf, verticals, add);
  }

  for (const door of pieces.filter((piece) => piece.part.role === 'door')) {
    hinges(door, verticals, add);
  }

  for (const side of pieces.filter((piece) => piece.part.role === 'drawer_side')) {
    slides(side, verticals, add, warnings);
  }

  for (const divider of pieces.filter((piece) => piece.part.role === 'divider')) {
    dowels(divider, horizontals, add);
  }

  const parts = [...drilled.values()]
    .map(({ piece, holes }) => ({
      partId: piece.part.id,
      instanceIndex: piece.instanceIndex,
      // Un ordre stable : le moteur est déterministe jusque dans ses listes.
      holes: [...holes].sort(
        (a, b) => a.side.localeCompare(b.side) || a.yMm - b.yMm || a.xMm - b.xMm,
      ),
    }))
    .sort(
      (a, b) => a.partId.localeCompare(b.partId) || a.instanceIndex - b.instanceIndex,
    );

  return { parts, hardware: hardwareOf(parts), warnings };
}

/* ------------------------------------------------------------------- étagères */

/**
 * Quatre taquets par étagère : deux devant, deux derrière, dans les deux montants qui la
 * portent.
 *
 * Les montants sont retrouvés par la géométrie — celui dont le chant droit s'arrête juste
 * avant l'étagère, celui dont le chant gauche commence juste après. L'étagère étant coupée
 * plus étroite que son ouverture, elle ne les touche pas : c'est bien un voisinage, pas un
 * contact, et un test d'égalité ne trouverait rien.
 */
function shelfSupports(
  shelf: Piece,
  verticals: readonly Piece[],
  add: (piece: Piece, hole: Hole) => void,
): void {
  const [sx0, sx1] = span(shelf.instance, 'x');
  const [sz0, sz1] = span(shelf.instance, 'z');
  const shelfCentreX = (sx0 + sx1) / 2;

  const carriers = [
    nearestBefore(verticals, sx0, shelf),
    nearestAfter(verticals, sx1, shelf),
  ].filter((piece): piece is Piece => piece !== null);

  for (const carrier of carriers) {
    const side = facingSide(carrier.frame, shelfCentreX);

    for (const zMm of [
      sz0 + SHELF_SUPPORT.frontOffsetMm,
      sz1 - SHELF_SUPPORT.backOffsetMm,
    ]) {
      // Sur une étagère très peu profonde, les deux lignes se croiseraient : deux taquets
      // au même endroit et un porte-à-faux devant.
      if (zMm <= sz0 || zMm >= sz1) continue;

      add(carrier, {
        ...toPartFrame(
          carrier.frame,
          { x: shelfCentreX, y: shelf.instance.yMm - SHELF_SUPPORT.centreBelowShelfMm, z: zMm },
          side,
        ),
        diameterMm: SHELF_SUPPORT.diameterMm,
        depthMm: SHELF_SUPPORT.holeDepthMm,
        side,
        purpose: 'shelf_support',
        hardware: SHELF_SUPPORT.key,
      });
    }
  }
}

/* --------------------------------------------------------------------- portes */

/**
 * Le boîtier dans le vantail, l'embase dans le montant, **à la même hauteur**.
 *
 * Le côté charnière se déduit de la géométrie : c'est celui des deux chants verticaux du
 * vantail qui a un montant en face. Sur une paire, le vantail de gauche n'a rien à sa
 * droite — le jeu central — et charnière donc à gauche ; l'autre l'inverse. Sur un vantail
 * unique, les deux chants ont un montant : la convention est alors la gauche, comme une
 * porte de meuble courante.
 */
function hinges(
  door: Piece,
  verticals: readonly Piece[],
  add: (piece: Piece, hole: Hole) => void,
): void {
  const [dx0, dx1] = span(door.instance, 'x');
  const [dz0, dz1] = span(door.instance, 'z');

  // Un vantail est **en applique** : il déborde le caisson en haut et en bas, et aucun
  // montant ne couvre sa hauteur. Exiger la couverture ne trouvait aucun montant, et le
  // moteur ne perçait aucune charnière — sans rien dire.
  const covering = verticals.filter((piece) => overlapsHeight(piece, door.instance));
  const left = stileNear(covering, dx0);
  const right = stileNear(covering, dx1);
  if (!left && !right) return;

  // **La gauche par convention, dès qu'un montant s'y trouve.** Départager les deux
  // chants par la distance ne mesure rien : la façade recouvre la moitié du séparateur,
  // et le millimètre d'écart qui en résulte charnièrerait les deux vantaux d'un buffet
  // sur son séparateur central, ouvrant chaque porte vers le mur.
  //
  // Le vantail droit d'une paire est le seul qui n'a **rien** à sa gauche — le jeu
  // central — et c'est ce qui le désigne.
  const hingeLeft = left !== null;
  const stile = (hingeLeft ? left : right) as Piece;

  const cupXMm = hingeLeft ? dx0 + HINGE.cupInsetMm : dx1 - HINGE.cupInsetMm;
  // Le boîtier se fraise sur la face qui regarde le caisson, jamais sur celle qu'on voit.
  const doorSide = facingSide(door.frame, dz1 + 1);
  const stileSide = facingSide(stile.frame, (dx0 + dx1) / 2);
  const stileFrontZ = span(stile.instance, 'z')[0];

  for (const offset of hingePositionsMm(door.instance.sizeYMm)) {
    const yMm = door.instance.yMm + offset;

    add(door, {
      ...toPartFrame(door.frame, { x: cupXMm, y: yMm, z: dz0 }, doorSide),
      diameterMm: HINGE.cupDiameterMm,
      depthMm: HINGE.cupDepthMm,
      side: doorSide,
      purpose: 'hinge_cup',
      hardware: HINGE.key,
    });

    for (let index = 0; index < 2; index += 1) {
      const zMm = stileFrontZ + HINGE.plateFrontOffsetMm + index * HINGE.plateHolePitchMm;

      add(stile, {
        ...toPartFrame(stile.frame, { x: 0, y: yMm, z: zMm }, stileSide),
        diameterMm: HINGE.plateHoleDiameterMm,
        depthMm: HINGE.plateHoleDepthMm,
        side: stileSide,
        purpose: 'hinge_plate',
        hardware: HINGE.key,
      });
    }
  }
}

/* -------------------------------------------------------------------- tiroirs */

/**
 * Une coulisse se perce des deux côtés : le profil de tiroir sur le côté du caisson, le
 * profil de caisson sur le montant, **à la même hauteur**.
 *
 * La longueur est choisie dans le catalogue : la plus longue qui tienne dans la profondeur
 * du caisson de tiroir. Aucune n'y tenant, rien n'est percé et le moteur le dit — un
 * perçage pour une coulisse qui n'existe pas est pire que pas de perçage.
 */
function slides(
  drawerSide: Piece,
  verticals: readonly Piece[],
  add: (piece: Piece, hole: Hole) => void,
  warnings: DrillingWarning[],
): void {
  const boxDepthMm = drawerSide.instance.sizeZMm;
  const spec = slideFor(boxDepthMm);

  if (!spec) {
    warnings.push({
      code: 'NO_SLIDE_FITS',
      partId: drawerSide.part.id,
      details: { usableDepthMm: boxDepthMm },
    });
    return;
  }

  const [ax0, ax1] = span(drawerSide.instance, 'x');
  const az0 = span(drawerSide.instance, 'z')[0];
  const sideCentreX = (ax0 + ax1) / 2;

  const covering = verticals.filter((piece) => coversHeight(piece, drawerSide.instance));
  const stile = nearestTo(covering, sideCentreX);
  if (!stile) return;

  // Une coulisse est un plan horizontal : le profil de tiroir et celui de caisson sont à
  // la même hauteur, sinon le tiroir coince au premier centimètre.
  const yMm = Math.round(centre(drawerSide.instance, 'y'));

  const drawerFace = facingSide(drawerSide.frame, centre(stile.instance, 'x'));
  const stileFace = facingSide(stile.frame, sideCentreX);

  for (const zMm of [
    az0 + spec.drawerHoleInsetMm,
    az0 + boxDepthMm - spec.drawerHoleInsetMm,
  ]) {
    add(drawerSide, {
      ...toPartFrame(drawerSide.frame, { x: 0, y: yMm, z: zMm }, drawerFace),
      diameterMm: spec.holeDiameterMm,
      depthMm: spec.holeDepthMm,
      side: drawerFace,
      purpose: 'slide_drawer',
      hardware: spec.key,
    });
  }

  const stileFrontZ = span(stile.instance, 'z')[0];
  for (
    let offset = spec.cabinetFirstHoleMm;
    offset <= spec.lengthMm;
    offset += spec.cabinetHolePitchMm
  ) {
    add(stile, {
      ...toPartFrame(stile.frame, { x: 0, y: yMm, z: stileFrontZ + offset }, stileFace),
      diameterMm: spec.holeDiameterMm,
      depthMm: spec.holeDepthMm,
      side: stileFace,
      purpose: 'slide_cabinet',
      hardware: spec.key,
    });
  }
}

/* ----------------------------------------------------------------- tourillons */

/**
 * Un séparateur se tourillonne dans le dessus et le dessous.
 *
 * Chaque tourillon fait **deux** trous : un dans le chant du séparateur, un dans la face
 * du panneau horizontal, en face. Les compter séparément gonflerait la nomenclature du
 * double — c'est pourquoi le décompte de quincaillerie divise par deux.
 */
function dowels(
  divider: Piece,
  horizontals: readonly Piece[],
  add: (piece: Piece, hole: Hole) => void,
): void {
  const [dy0, dy1] = span(divider.instance, 'y');
  const [dz0, dz1] = span(divider.instance, 'z');
  const dividerCentreX = centre(divider.instance, 'x');

  const first = dz0 + DOWEL.endOffsetMm;
  const last = dz1 - DOWEL.endOffsetMm;
  // Un séparateur moins profond que deux retraits d'about ne se tourillonne pas en ligne.
  if (last <= first) return;

  const positions = Array.from({ length: DOWEL.countPerJoint }, (_, index) =>
    Math.round(first + ((last - first) * index) / (DOWEL.countPerJoint - 1)),
  );

  for (const [jointY, end] of [
    [dy0, 'min'],
    [dy1, 'max'],
  ] as const) {
    const partner = horizontals.find((piece) => touchesAt(piece, 'y', jointY));
    const edge = edgeSideFor(divider.frame, 'y', end);

    for (const zMm of positions) {
      const point = { x: dividerCentreX, y: jointY, z: zMm };

      add(divider, {
        // Sur un chant, `xMm` court le long du chant et `yMm` s'enfonce depuis la face de
        // référence : un tourillon est centré dans l'épaisseur.
        xMm: alongEdge(divider.frame, point, edge),
        yMm: Math.round(divider.frame.thicknessMm / 2),
        diameterMm: DOWEL.diameterMm,
        depthMm: DOWEL.holeDepthMm,
        side: edge,
        purpose: 'dowel',
        hardware: DOWEL.key,
      });

      if (!partner) continue;

      const side = facingSide(partner.frame, jointY);
      add(partner, {
        ...toPartFrame(partner.frame, point, side),
        diameterMm: DOWEL.diameterMm,
        depthMm: DOWEL.holeDepthMm,
        side,
        purpose: 'dowel',
        hardware: DOWEL.key,
      });
    }
  }
}

/* ------------------------------------------------------------------- décompte */

/**
 * La quincaillerie **déduite des trous**.
 *
 * Un décompte tenu à part de la géométrie finit par diverger d'elle : on ajoute une
 * charnière au calcul sans la percer, ou l'inverse, et le plan et la liste de courses ne
 * parlent plus du même meuble. Ici l'un ne peut pas bouger sans l'autre.
 */
function hardwareOf(parts: readonly DrilledPart[]): HardwareLine[] {
  const counts = new Map<HardwareKey, number>();

  const bump = (key: HardwareKey, by: number) =>
    counts.set(key, (counts.get(key) ?? 0) + by);

  for (const part of parts) {
    for (const hole of part.holes) {
      switch (hole.purpose) {
        // Une charnière, un boîtier. Les trous d'embase sont les mêmes charnières, comptées
        // une seconde fois si on les additionnait.
        case 'hinge_cup':
        case 'shelf_support':
          bump(hole.hardware, 1);
          break;
        // Deux trous par profil de tiroir, deux profils par paire de coulisses.
        case 'slide_drawer':
          bump(hole.hardware, 0.25);
          break;
        case 'dowel':
          bump(hole.hardware, 0.5);
          break;
        default:
          break;
      }
    }
  }

  return [...counts.entries()]
    .map(([key, quantity]) => ({ key, quantity: Math.round(quantity) }))
    .filter((line) => line.quantity > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ géométrie */

function piecesOf(furniture: Furniture): Piece[] {
  return furniture.parts.flatMap((part) =>
    part.instances.map((instance, instanceIndex) => ({
      part,
      instance,
      instanceIndex,
      frame: frameOf(part, instance),
    })),
  );
}

function span(instance: Placement, axis: Axis): [number, number] {
  const start = axis === 'x' ? instance.xMm : axis === 'y' ? instance.yMm : instance.zMm;
  const size =
    axis === 'x'
      ? instance.sizeXMm
      : axis === 'y'
        ? instance.sizeYMm
        : instance.sizeZMm;

  return [start, start + size];
}

function centre(instance: Placement, axis: Axis): number {
  const [min, max] = span(instance, axis);
  return (min + max) / 2;
}

/** Le montant et la pièce se croisent-ils en hauteur ? */
function overlapsHeight(piece: Piece, instance: Placement): boolean {
  const [py0, py1] = span(piece.instance, 'y');
  const [iy0, iy1] = span(instance, 'y');
  return py0 < iy1 && py1 > iy0;
}

/** Le montant couvre-t-il toute la hauteur de la pièce ? Un séparateur trop court ne porte rien. */
function coversHeight(piece: Piece, instance: Placement): boolean {
  const [py0, py1] = span(piece.instance, 'y');
  const [iy0, iy1] = span(instance, 'y');
  return py0 <= iy0 && py1 >= iy1;
}

function nearestBefore(
  pieces: readonly Piece[],
  limitMm: number,
  neighbour: Piece,
): Piece | null {
  return (
    pieces
      .filter(
        (piece) =>
          span(piece.instance, 'x')[1] <= limitMm + 1 &&
          coversHeight(piece, neighbour.instance),
      )
      .sort((a, b) => span(b.instance, 'x')[1] - span(a.instance, 'x')[1])[0] ?? null
  );
}

function nearestAfter(
  pieces: readonly Piece[],
  limitMm: number,
  neighbour: Piece,
): Piece | null {
  return (
    pieces
      .filter(
        (piece) =>
          span(piece.instance, 'x')[0] >= limitMm - 1 &&
          coversHeight(piece, neighbour.instance),
      )
      .sort((a, b) => span(a.instance, 'x')[0] - span(b.instance, 'x')[0])[0] ?? null
  );
}

function distanceTo(piece: Piece, xMm: number): number {
  return Math.abs(centre(piece.instance, 'x') - xMm);
}

/**
 * Le montant qui se trouve **derrière** un chant vertical de façade, s'il y en a un.
 *
 * La tolérance vaut l'épaisseur du montant : une façade en applique recouvre la moitié de
 * son séparateur, son chant ne tombe donc jamais exactement sur un bord de panneau.
 */
function stileNear(pieces: readonly Piece[], xMm: number): Piece | null {
  return (
    [...pieces]
      .filter((piece) => distanceTo(piece, xMm) <= piece.frame.thicknessMm)
      .sort((a, b) => distanceTo(a, xMm) - distanceTo(b, xMm))[0] ?? null
  );
}

function nearestTo(pieces: readonly Piece[], xMm: number): Piece | null {
  return [...pieces].sort((a, b) => distanceTo(a, xMm) - distanceTo(b, xMm))[0] ?? null;
}

function touchesAt(piece: Piece, axis: Axis, valueMm: number): boolean {
  const [min, max] = span(piece.instance, axis);
  return min === valueMm || max === valueMm;
}

/** Lequel des quatre chants d'une pièce regarde un bout donné d'un axe du meuble. */
function edgeSideFor(
  frame: PartFrame,
  axis: Axis,
  end: 'min' | 'max',
): Extract<HoleSide, `edge_${string}`> {
  const letter = frame.lengthAxis === axis ? 'x' : 'y';
  return `edge_${letter}_${end}` as Extract<HoleSide, `edge_${string}`>;
}

/** La position d'un point le long d'un chant, depuis le coin d'origine de ce chant. */
function alongEdge(
  frame: PartFrame,
  point: Record<Axis, number>,
  edge: HoleSide,
): number {
  const axis = edge.startsWith('edge_x') ? frame.widthAxis : frame.lengthAxis;
  return point[axis] - frame.originMm[axis];
}
