import type { Furniture } from './build.js';
import type { NestedPanel, NestingResult } from './nesting.js';

/**
 * Ce qu'un placement doit respecter, quoi qu'il arrive.
 *
 * Ces vérifications vivent à côté du placement plutôt que dans son test, pour une raison
 * d'exploitation : elles servent aussi à **vérifier un plan avant de l'envoyer à
 * l'atelier**. Un plan qui viole l'une d'elles est un panneau perdu, et le découvrir à la
 * scie coûte plus cher que le découvrir dans une réponse d'API.
 *
 * Elles rendent la **liste des manquements**, pas un booléen : savoir qu'un plan est faux
 * n'aide pas, savoir en quoi il est faux aide.
 *
 * @see docs/MANUFACTURING.md §2
 */

/**
 * Deux pièces d'un même panneau se chevauchent-elles, ou dépassent-elles du panneau ?
 *
 * Le balayage trie par ordonnée et ne compare que les pièces dont les bandes se croisent :
 * comparer toutes les paires est correct mais quadratique, et ce contrôle tourne sur des
 * centaines de plans.
 */
export function panelViolations(panel: NestedPanel, kerfMm: number): string[] {
  const violations: string[] = [];

  for (const placement of panel.placements) {
    const outside =
      placement.xMm < 0 ||
      placement.yMm < 0 ||
      placement.xMm + placement.sizeXMm > panel.format.lengthMm ||
      placement.yMm + placement.sizeYMm > panel.format.widthMm;

    if (outside) violations.push(`${placement.partId} sort du panneau`);
  }

  const sorted = [...panel.placements].sort((a, b) => a.yMm - b.yMm);

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    if (!a) continue;

    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b) continue;

      // Trié par ordonnée : dès que la suivante commence après la fin de `a`, aucune des
      // suivantes ne peut la croiser.
      if (b.yMm >= a.yMm + a.sizeYMm + kerfMm) break;

      const separatedX =
        a.xMm + a.sizeXMm + kerfMm <= b.xMm || b.xMm + b.sizeXMm + kerfMm <= a.xMm;
      const separatedY =
        a.yMm + a.sizeYMm + kerfMm <= b.yMm || b.yMm + b.sizeYMm + kerfMm <= a.yMm;

      if (!separatedX && !separatedY) {
        violations.push(`${a.partId} et ${b.partId} se chevauchent`);
      }
    }
  }

  return violations;
}

/**
 * Tout ce qui peut clocher dans un plan complet.
 *
 * Une pièce doit être **placée ou signalée**, jamais perdue en silence : un plan amputé
 * d'une pièce a l'air complet.
 */
export function nestingViolations(
  furniture: Furniture,
  result: NestingResult,
): string[] {
  const violations = result.panels.flatMap((panel) =>
    panelViolations(panel, result.kerfMm),
  );

  const placed = new Map<string, number>();
  const thicknessOf = new Map(
    furniture.parts.map((part) => [part.id, part.thicknessMm]),
  );

  for (const panel of result.panels) {
    for (const placement of panel.placements) {
      placed.set(placement.partId, (placed.get(placement.partId) ?? 0) + 1);

      // On ne scie pas du 8 mm et du 18 mm dans la même planche.
      if (thicknessOf.get(placement.partId) !== panel.thicknessMm) {
        violations.push(
          `${placement.partId} sur un panneau de ${panel.thicknessMm} mm`,
        );
      }
    }
  }

  for (const part of furniture.parts) {
    const signalled = result.unplaced.filter((id) => id === part.id).length;
    const total = (placed.get(part.id) ?? 0) + signalled;

    if (total !== part.quantity) {
      violations.push(`${part.id} : ${total} au lieu de ${part.quantity}`);
    }
  }

  for (const panel of result.panels) {
    if (panel.usedAreaMm2 > panel.areaMm2) {
      violations.push(
        `panneau ${panel.thicknessMm} mm : surface posée supérieure au panneau`,
      );
    }
  }

  return violations;
}
