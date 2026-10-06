import { describe, it, expect } from 'vitest';
import { build, cuttingOrder, nest } from '@neftya/engine';
import type { TFunction } from 'i18next';
import { asText } from './CuttingOrder.js';

/**
 * La fiche en texte brut.
 *
 * C'est elle qui part au magasin — collée dans un message, dans un formulaire de commande,
 * ou lue à voix haute au comptoir. Le tableau à l'écran ne fait aucune de ces trois choses,
 * et une cote perdue ici coûte un panneau.
 */

/** Un `t` qui rend la clé et ses variables : on teste la fiche, pas les traductions. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key) as unknown as TFunction;

const order = (() => {
  const furniture = build({
    dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
    compartments: [
      { shelves: 1, drawers: 0 },
      { shelves: 1, drawers: 0 },
    ],
    material: 'mdf',
    hasBack: true,
  });

  return cuttingOrder(furniture, nest(furniture));
})();

describe('la fiche en texte brut', () => {
  const text = asText(order, t);

  it('porte chaque cote de la commande', () => {
    for (const group of order.groups) {
      for (const piece of group.pieces) {
        expect(
          text,
          `${piece.lengthMm} × ${piece.widthMm} manque à la fiche`,
        ).toContain(`${piece.quantity} × ${piece.lengthMm} × ${piece.widthMm} mm`);
      }
    }
  });

  it('annonce les panneaux à acheter avant les coupes', () => {
    const lines = text.split('\n');
    const firstPiece = lines.findIndex((line) => line.startsWith('  '));
    const firstPanel = lines.findIndex((line) => line.startsWith('cuttingOrder.buy'));

    expect(firstPanel).toBeGreaterThanOrEqual(0);
    expect(firstPanel).toBeLessThan(firstPiece);
  });

  it('ne perd aucun morceau en route', () => {
    // La somme des quantités dictées vaut celle de la commande. Un morceau oublié dans la
    // fiche est un morceau qu'on découvre manquant une fois rentré.
    const dictated = [...text.matchAll(/^ {2}(\d+) × /gmu)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    );

    expect(dictated).toBe(order.totalPieces);
  });

  it('signale le fil bloqué, et seulement lui', () => {
    const locked = asText(
      cuttingOrder(
        ...((): [ReturnType<typeof build>, ReturnType<typeof nest>] => {
          const furniture = build({
            dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
            compartments: [{ shelves: 1, drawers: 0 }],
            material: 'mdf',
            hasBack: true,
            respectGrain: true,
          });
          return [furniture, nest(furniture)];
        })(),
      ),
      t,
    );

    expect(locked).toContain('cuttingOrder.grainLocked');
    // Le meuble de référence ne respecte pas le fil : rien ne doit être bloqué.
    expect(text).not.toContain('cuttingOrder.grainLocked');
  });
});
