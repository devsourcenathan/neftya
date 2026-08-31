import {
  assemblySteps,
  billOfMaterials,
  build,
  costLines,
  cutList,
  nest,
  type AssemblyStep,
  type BillOfMaterials,
  type CutListRow,
  type NestingResult,
  type ParsedFurnitureInput,
} from '@neftya/engine';
import { multiply, sum, type Money } from '@neftya/units';

/**
 * Tout ce que la fabrication demande, calculé à partir du seul modèle.
 *
 * Rien de tout cela n'est stocké : liste de découpe, placement, nomenclature et coûts sont
 * recalculés à chaque appel. Un plan stocké se désynchronise du projet sans que personne
 * ne s'en aperçoive — sauf l'atelier, trop tard.
 *
 * La seule exception est l'export, figé par nature.
 *
 * @see docs/ENGINEERING.md §6
 */

export interface PricedLine {
  reference: string;
  unit: string;
  quantity: number;
  /** `null` tant que l'utilisateur n'a pas saisi ce prix. Jamais un prix inventé. */
  unitPrice: Money | null;
  total: Money | null;
}

export interface Quotation {
  lines: PricedLine[];
  /** `null` tant qu'un seul prix manque : un total partiel se lit comme un total. */
  total: Money | null;
  currency: string;
  missing: string[];
}

export interface ManufacturingPlan {
  cutList: CutListRow[];
  nesting: NestingResult;
  bill: BillOfMaterials;
  assembly: AssemblyStep[];
  quotation: Quotation;
}

export function manufacturingPlan(
  model: ParsedFurnitureInput,
  prices: Map<string, Money>,
  currency: string,
): ManufacturingPlan {
  const furniture = build(model);
  const nesting = nest(furniture);
  const bill = billOfMaterials(furniture, nesting);

  return {
    cutList: cutList(furniture),
    nesting,
    bill,
    assembly: assemblySteps(furniture),
    quotation: quote(costLines(bill), prices, currency),
  };
}

/**
 * Le devis, avec ses trous.
 *
 * Un prix manquant laisse la ligne **sans total**, et le devis sans total général. Faire
 * comme si la ligne valait zéro produirait un devis chiffré et faux, ce qui est pire que
 * pas de devis du tout : personne ne relit un nombre qui s'affiche.
 */
function quote(
  lines: { reference: string; unit: string; quantity: number }[],
  prices: Map<string, Money>,
  currency: string,
): Quotation {
  const priced: PricedLine[] = lines.map((line) => {
    const unitPrice = prices.get(line.reference) ?? null;

    return {
      reference: line.reference,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice,
      total: unitPrice ? multiply(unitPrice, line.quantity) : null,
    };
  });

  const missing = priced.filter((line) => !line.total).map((line) => line.reference);

  return {
    lines: priced,
    total:
      missing.length > 0
        ? null
        : sum(
            priced.map((line) => line.total as Money),
            currency,
          ),
    currency,
    missing,
  };
}

/**
 * Le CSV que la plupart des scies à panneaux et des optimiseurs tiers savent lire.
 *
 * Point-virgule et non virgule : le séparateur décimal français est la virgule, et un
 * fichier ouvert dans un tableur francophone se retrouverait en une seule colonne.
 */
export function cutListCsv(rows: CutListRow[]): string {
  const header = 'id;longueur_mm;largeur_mm;epaisseur_mm;quantite;materiau;chant_mm';

  const body = rows.map((row) =>
    [
      row.id,
      row.lengthMm,
      row.widthMm,
      row.thicknessMm,
      row.quantity,
      row.material,
      row.edgeBandingMm,
    ].join(';'),
  );

  // CRLF et BOM : c'est ce qu'attendent les tableurs sous Windows, et une scie ne relit
  // pas un fichier qu'un opérateur n'a pas pu ouvrir.
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}
