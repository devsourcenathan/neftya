import type { Furniture } from './build.js';
import type { MaterialKey } from './materials.js';
import type { NestingResult, PanelFormat } from './nesting.js';

/**
 * La fiche de débit à remettre au comptoir de découpe.
 *
 * Ce n'est pas le plan de découpe. Le plan de découpe s'adresse à quelqu'un qui scie
 * lui-même : il montre où poser chaque pièce sur le panneau, et il suppose une scie à
 * format. Celui qui fait son premier meuble n'en a pas, et un 2440 × 1220 n'entre ni
 * dans sa voiture ni dans son salon. En revanche l'enseigne coupe, et souvent pour rien.
 *
 * La fiche répond donc à une question différente : **qu'est-ce que je commande, et
 * qu'est-ce que je fais couper ?** Elle ne porte que des cotes finies et des quantités —
 * le placement, le trait de scie et le délignage sont l'affaire du magasin, pas la
 * sienne.
 *
 * **Elle ne calcule pas le nombre de panneaux : elle le lit du placement.** Recompter ici
 * donnerait deux chiffres pour la même chose, et le jour où ils divergeraient, personne
 * ne saurait lequel croire — ni combien de panneaux acheter.
 *
 * @see docs/MANUFACTURING.md §1
 */

export interface CuttingOrderPiece {
  /** Toujours la plus grande cote en premier, comme on l'annonce au comptoir. */
  lengthMm: number;
  widthMm: number;
  quantity: number;
  /**
   * Le fil court dans la longueur : la pièce ne peut pas être tournée.
   *
   * Dit au comptoir, et non déduit sur place : un opérateur qui pivote une façade de
   * décor bois pour gagner de la chute fait une pièce qui se voit à trois mètres.
   */
  grainLocked: boolean;
  /**
   * Les repères des pièces réunies sur cette ligne — `P03`, `P05`…
   *
   * Le magasin n'en a pas l'usage ; celui qui rentre avec ses panneaux coupés, si. C'est
   * ce qui permet de retrouver sur le plan la pièce qu'on tient à la main.
   */
  ids: readonly string[];
}

export interface CuttingOrderGroup {
  material: MaterialKey;
  thicknessMm: number;
  /** Combien de panneaux acheter, lu du placement. */
  panels: number;
  /** Le panneau **acheté**, cotes nominales — celui qu'on demande au rayon. */
  format: PanelFormat;
  pieces: CuttingOrderPiece[];
  /** Nombre de morceaux à couper, quantités comprises. */
  totalPieces: number;
}

export interface CuttingOrder {
  groups: CuttingOrderGroup[];
  /**
   * La plus petite cote de toute la commande.
   *
   * Rendue parce qu'elle décide de la faisabilité : beaucoup d'enseignes refusent de
   * couper sous une centaine de millimètres — la pièce passerait sous le presseur. Mieux
   * vaut l'apprendre devant son écran que devant le comptoir.
   */
  smallestSideMm: number;
  /** Morceaux à couper, toutes matières confondues. */
  totalPieces: number;
}

/** Au-dessous, une enseigne refuse généralement la coupe. Indicatif, jamais bloquant. */
export const STORE_MIN_CUT_MM = 100;

export function cuttingOrder(
  furniture: Furniture,
  nesting: NestingResult,
): CuttingOrder {
  const groups = new Map<string, CuttingOrderGroup>();

  for (const panel of nesting.panels) {
    const key = groupKey(panel.material, panel.thicknessMm);
    const group = groups.get(key);

    if (group) {
      group.panels += 1;
      continue;
    }

    groups.set(key, {
      material: panel.material,
      thicknessMm: panel.thicknessMm,
      panels: 1,
      format: panel.format,
      pieces: [],
      totalPieces: 0,
    });
  }

  /*
   * Ce que le placement n'a pas pu poser ne se commande pas.
   *
   * `nest` rend ces pièces dans `unplaced` plutôt que de les taire. La règle est bien
   * celle-là, et non « la matière n'a aucun panneau » : un dessus de 3 600 mm dépasse le
   * plus grand format alors que les côtés du même meuble, en 18 mm eux aussi, tiennent
   * très bien. Le groupe existe donc, et la pièce infaisable se serait glissée dans la
   * commande — pour n'être refusée qu'au comptoir.
   */
  const unplaced = new Set(nesting.unplaced);

  for (const part of furniture.parts) {
    if (unplaced.has(part.id)) continue;

    const group = groups.get(groupKey(part.material, part.thicknessMm));
    if (!group) continue;

    /*
     * Le fil ne bloque que si le projet le demande — la même condition que le placement.
     *
     * Écrite ici en double, elle disait « fil bloqué » sur un mélaminé uni : le comptoir
     * aurait refusé de pivoter des pièces qu'il pouvait pivoter, et le client aurait payé
     * la chute d'une contrainte que personne n'avait posée.
     */
    const grainLocked = furniture.input.respectGrain && part.grain !== 'none';

    /*
     * Les cotes sont prises telles quelles : une `Part` porte déjà la plus grande en
     * premier. Les remettre dans l'ordre ici serait du code qu'aucune entrée n'exerce, et
     * un test écrit pour lui ne prouverait que son existence. Le contrat est pinné dans
     * `cutting-order.test.ts`, là où il est vrai.
     */
    const { lengthMm, widthMm } = part;

    /*
     * **Deux pièces de mêmes cotes sont une seule ligne**, quel que soit leur rôle.
     *
     * Le comptoir ne coupe pas des côtés et des étagères : il coupe deux fois 864 × 450.
     * Une ligne par rôle ferait dicter la même cote plusieurs fois — et chaque répétition
     * est une occasion de la transcrire de travers.
     *
     * **Les cotes seules font la clé, et le verrou de fil se cumule.** Il avait sa place
     * dans la clé ; aucun meuble ne produit deux pièces de mêmes cotes aux fils
     * différents, et une distinction qu'aucune entrée n'atteint ne peut que fabriquer des
     * lignes en double le jour où elle se trompe. Cumulé, le verrou penche du côté sûr :
     * on ne dira jamais au comptoir qu'il peut pivoter une pièce qui ne le peut pas.
     *
     * Aucun meuble d'aujourd'hui ne mélange les deux sur une même ligne : le cumul n'est
     * donc pas couvert par un test, et il est là pour que le résultat ne dépende pas de
     * l'ordre d'arrivée des pièces le jour où un meuble le fera.
     */
    const pieceKey = `${lengthMm}x${widthMm}`;
    const existing = group.pieces.find((piece) => keyOf(piece) === pieceKey);

    if (existing) {
      existing.quantity += part.quantity;
      existing.ids = [...existing.ids, part.id];
      existing.grainLocked ||= grainLocked;
    } else {
      group.pieces.push({
        lengthMm,
        widthMm,
        quantity: part.quantity,
        grainLocked,
        ids: [part.id],
      });
    }

    group.totalPieces += part.quantity;
  }

  // Les grandes coupes d'abord : c'est l'ordre dans lequel une scie à panneaux débite, et
  // celui dans lequel l'opérateur attend qu'on les lui donne.
  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      pieces: [...group.pieces].sort(
        (a, b) => b.lengthMm - a.lengthMm || b.widthMm - a.widthMm,
      ),
    }))
    .sort(
      (a, b) => b.thicknessMm - a.thicknessMm || a.material.localeCompare(b.material),
    );

  const sides = ordered.flatMap((group) =>
    group.pieces.flatMap((piece) => [piece.lengthMm, piece.widthMm]),
  );

  return {
    groups: ordered,
    smallestSideMm: sides.length > 0 ? Math.min(...sides) : 0,
    totalPieces: ordered.reduce((total, group) => total + group.totalPieces, 0),
  };
}

function groupKey(material: MaterialKey, thicknessMm: number): string {
  return `${material}|${thicknessMm}`;
}

function keyOf(piece: CuttingOrderPiece): string {
  return `${piece.lengthMm}x${piece.widthMm}`;
}
