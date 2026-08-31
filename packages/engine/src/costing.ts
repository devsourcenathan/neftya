import type { BillOfMaterials } from './bill-of-materials.js';

/**
 * Les **quantités** à chiffrer. Pas les prix.
 *
 * Le moteur ne connaît aucun tarif, et n'en connaîtra pas : le prix d'un panneau varie
 * fortement selon la région et le fournisseur. Livrer des prix par défaut inventés
 * donnerait un devis faux, ce qui est pire que pas de devis du tout.
 *
 * Le moteur dit « un panneau de MDF 18 mm en 2440 × 1220, et 7,04 m de chant ». Ce que
 * cela coûte est saisi par l'utilisateur et mémorisé par son organisation.
 *
 * @see docs/MANUFACTURING.md §5
 */

export type CostUnit = 'panel' | 'metre' | 'piece';

export interface CostLine {
  /**
   * Identifiant stable de l'article, sur lequel s'accroche le prix saisi.
   *
   * `panel:mdf:18` et non « Panneau MDF 18 mm » : un libellé traduit changerait de valeur
   * d'une langue à l'autre, et le prix saisi ne se retrouverait plus.
   */
  reference: string;
  unit: CostUnit;
  /** En unités entières pour `panel` et `piece` ; au centième pour `metre`. */
  quantity: number;
}

export function costLines(bill: BillOfMaterials): CostLine[] {
  const lines: CostLine[] = bill.panels.map((panel) => ({
    reference: `panel:${panel.material}:${panel.thicknessMm}`,
    unit: 'panel' as const,
    quantity: panel.quantity,
  }));

  if (bill.edgeBandingMm > 0) {
    lines.push({
      reference: 'edge_banding',
      unit: 'metre',
      // Au centième de mètre : on achète du chant au mètre, pas au millimètre.
      quantity: Math.ceil(bill.edgeBandingMm / 10) / 100,
    });
  }

  for (const accessory of bill.accessories) {
    lines.push({
      reference: `accessory:${accessory.key}`,
      unit: 'piece',
      quantity: accessory.quantity,
    });
  }

  return lines;
}
