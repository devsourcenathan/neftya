import type { Furniture } from './build.js';
import type { Part, Placement } from './parts.js';

/**
 * Les façades, et de quel côté elles s'ouvrent.
 *
 * ## Pourquoi ce module existe
 *
 * Deux choses ont besoin de savoir de quel chant un vantail s'ouvre : **les charnières**,
 * qui se posent sur l'autre, et **la poignée**, qui se pose sur celui-là. Écrire la règle
 * deux fois, c'est la voir diverger le jour où l'une des deux est corrigée — et une porte
 * dont la poignée est du côté des charnières ne s'ouvre pas.
 *
 * ## Le rang d'une façade
 *
 * Un vantail ou une façade de tiroir se désigne par son compartiment et son **rang** :
 * les vantaux de gauche à droite, les tiroirs **du bas vers le haut**. C'est l'ordre dans
 * lequel le moteur les empile, et celui dans lequel un menuisier les compte.
 *
 * @see docs/NEFTYA_ENGINE.md §12.3
 */

export type FacadeRole = 'door' | 'drawer_face';

export interface Facade {
  role: FacadeRole;
  /** Le compartiment, tel que le moteur l'a marqué sur l'instance. */
  compartment: number;
  /** Vantaux de gauche à droite, tiroirs du bas vers le haut. */
  slot: number;
  part: Part;
  placement: Placement;
}

/** Toutes les façades du meuble, rangées par compartiment puis par rang. */
export function facadesOf(furniture: Furniture): Facade[] {
  const found: Omit<Facade, 'slot'>[] = [];

  for (const part of furniture.parts) {
    if (part.role !== 'door' && part.role !== 'drawer_face') continue;

    for (const placement of part.instances) {
      if (placement.compartment === undefined) continue;

      found.push({
        role: part.role,
        compartment: placement.compartment,
        part,
        placement,
      });
    }
  }

  const byGroup = new Map<string, Omit<Facade, 'slot'>[]>();
  for (const facade of found) {
    const key = `${facade.compartment}|${facade.role}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), facade]);
  }

  return [...byGroup.values()].flatMap((group) =>
    [...group]
      // Les vantaux se comptent de gauche à droite, les tiroirs du bas vers le haut.
      .sort((a, b) =>
        a.role === 'door'
          ? a.placement.xMm - b.placement.xMm
          : a.placement.yMm - b.placement.yMm,
      )
      .map((facade, slot) => ({ ...facade, slot })),
  );
}

/** La façade d'un compartiment, à un rang donné. */
export function facadeAt(
  furniture: Furniture,
  compartment: number,
  role: FacadeRole,
  slot: number,
): Facade | null {
  return (
    facadesOf(furniture).find(
      (facade) =>
        facade.compartment === compartment &&
        facade.role === role &&
        facade.slot === slot,
    ) ?? null
  );
}

/**
 * De quel chant un vantail est charnière.
 *
 * **La gauche par convention, dès qu'un montant s'y trouve.** Le vantail droit d'une paire
 * est le seul qui n'a rien à sa gauche — le jeu central — et c'est ce qui le désigne.
 *
 * Départager les deux chants par la distance ne mesurerait rien : la façade recouvre la
 * moitié de son séparateur, et le millimètre d'écart qui en résulte charnièrerait les deux
 * vantaux d'un buffet sur son séparateur central, ouvrant chaque porte vers le mur.
 *
 * `null` quand aucun montant ne borde le vantail : il n'y a alors pas de côté à choisir,
 * et rien ne doit être percé plutôt qu'un côté tiré au hasard.
 */
export function hingeEdgeOf(
  furniture: Furniture,
  placement: Placement,
): 'left' | 'right' | null {
  const stiles = furniture.parts
    .filter((part) => part.role === 'side' || part.role === 'divider')
    .flatMap((part) =>
      part.instances.map((instance) => ({
        centreXMm: instance.xMm + instance.sizeXMm / 2,
        thicknessMm: instance.sizeXMm,
        fromYMm: instance.yMm,
        toYMm: instance.yMm + instance.sizeYMm,
      })),
    )
    // Un vantail est en applique : il déborde le caisson en haut et en bas, et aucun
    // montant ne couvre sa hauteur. Le croisement suffit donc, la couverture non.
    .filter(
      (stile) =>
        stile.fromYMm < placement.yMm + placement.sizeYMm &&
        stile.toYMm > placement.yMm,
    );

  /**
   * La tolérance vaut l'épaisseur du montant : une façade en applique recouvre la moitié
   * de son séparateur, son chant ne tombe donc jamais exactement sur un bord de panneau.
   */
  const near = (xMm: number) =>
    stiles.some((stile) => Math.abs(stile.centreXMm - xMm) <= stile.thicknessMm);

  if (near(placement.xMm)) return 'left';
  if (near(placement.xMm + placement.sizeXMm)) return 'right';

  return null;
}
