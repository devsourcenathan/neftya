import { describe, it, expect } from 'vitest';
import { build } from '@neftya/engine';
import { estimateCost } from './Budget.js';
import type { PriceReference } from '../api/projects.js';

/**
 * Le coût estimé pendant qu'on règle.
 *
 * La seule règle qui compte est négative : **un prix manquant laisse le total vide**. Faire
 * comme si la ligne valait zéro produirait un chiffre plus bas que la réalité, affiché avec
 * la même assurance qu'un vrai — et personne ne relit un nombre qui s'affiche.
 */

const furniture = build({
  dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
  compartments: [{ shelves: 1, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
});

const price = (
  reference: string,
  amount: number,
  currency = 'EUR',
): PriceReference => ({
  reference,
  amount_minor: amount,
  currency,
});

/** Tout ce que ce meuble consomme, chiffré. */
const complete = (): PriceReference[] => [
  price('panel:mdf:18', 4200),
  price('panel:mdf:8', 2600),
  price('edge_banding', 180),
  price('accessory:shelf_support_5', 35),
  price('accessory:screw_4x50', 12),
  price('accessory:glue', 650),
];

describe('le coût estimé', () => {
  it('ne dit rien tant qu’aucun prix n’est saisi', () => {
    // Un bandeau « indisponible » occuperait la place d'un réglage pour ne rien apprendre.
    expect(estimateCost(furniture, [])).toBeNull();
  });

  it('totalise quand tous les prix sont là', () => {
    const estimate = estimateCost(furniture, complete());

    expect(estimate?.missing).toBe(0);
    expect(estimate?.total?.currency).toBe('EUR');
    expect(estimate?.total?.amount).toBeGreaterThan(0);
  });

  it('laisse le total vide dès qu’un seul prix manque', () => {
    /*
     * Et le total vide, pas un total partiel : la colle retirée, le meuble paraîtrait moins
     * cher de son prix exact. C'est la même règle que le devis du dossier de fabrication,
     * et elle vaut ici parce que c'est ce chiffre-là qui décide d'acheter.
     */
    const partial = complete().filter((entry) => entry.reference !== 'accessory:glue');
    const estimate = estimateCost(furniture, partial);

    expect(estimate?.missing).toBe(1);
    expect(estimate?.total).toBeNull();
  });

  it('compte les lignes d’une autre devise comme manquantes', () => {
    // On ne sait pas additionner des euros et des francs. Les convertir demanderait un taux
    // que personne n'a saisi, donc un chiffre inventé.
    const mixed = complete().map((entry) =>
      entry.reference === 'accessory:glue'
        ? price(entry.reference, entry.amount_minor, 'CHF')
        : entry,
    );

    const estimate = estimateCost(furniture, mixed);

    expect(estimate?.missing).toBe(1);
    expect(estimate?.total).toBeNull();
  });

  it('suit le meuble : plus de matière, plus cher', () => {
    const wider = build({
      dimensions: { widthMm: 2000, heightMm: 900, depthMm: 450 },
      compartments: [{ shelves: 1, drawers: 0 }],
      material: 'mdf',
      hasBack: true,
    });

    const small = estimateCost(furniture, complete());
    const large = estimateCost(wider, complete());

    expect(large?.total?.amount).toBeGreaterThan(small?.total?.amount ?? 0);
  });
});
