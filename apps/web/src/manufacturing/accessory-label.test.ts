import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import {
  billOfMaterials,
  build,
  drilling,
  nest,
  type FurnitureInput,
} from '@neftya/engine';
import '../i18n.js';
import { accessoryLabel } from './accessory-label.js';

/**
 * Chaque article que le moteur sait produire porte un libellé.
 *
 * **Ce test naît d'un défaut trouvé en trois secondes dans un navigateur.** La liste des
 * matériaux et l'éditeur de prix traduisaient la clé chacun de leur côté, et l'éditeur
 * affichait `accessory.slide_ball_500` en clair au milieu du devis. Une centaine de tests
 * regardaient chaque vue séparément ; aucun ne regardait la clé qui les traverse.
 *
 * La couverture part donc du **moteur**, pas d'une liste écrite à la main : une clé de
 * catalogue ajoutée sans traduction fait échouer ce test, dans les deux langues.
 */

const MODELS: FurnitureInput[] = [
  {
    dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
    compartments: [
      { shelves: 1, drawers: 0, doors: 0 },
      { shelves: 1, drawers: 0, doors: 0 },
    ],
  },
  {
    dimensions: { widthMm: 2000, heightMm: 2400, depthMm: 600 },
    compartments: [
      { shelves: 2, drawers: 3, doors: 2 },
      { shelves: 3, drawers: 0, doors: 1 },
    ],
  },
  // Des profondeurs variées : la coulisse retenue change de longueur, donc de clé.
  ...[300, 350, 400, 450, 500, 620].map((depthMm) => ({
    dimensions: { widthMm: 900, heightMm: 800, depthMm },
    compartments: [{ shelves: 0, drawers: 2, doors: 1 }],
  })),
];

/** Toutes les clés d'accessoire que ces meubles produisent. */
const KEYS = [
  ...new Set(
    MODELS.flatMap((input) => {
      const furniture = build(input);
      const bill = billOfMaterials(furniture, nest(furniture), drilling(furniture));

      return bill.accessories.map((line) => line.key);
    }),
  ),
].sort();

describe('libellés de quincaillerie', () => {
  it('couvre les six longueurs de coulisses, et pas une seule', () => {
    // Si ce compte tombe à un, les modèles ci-dessus ne varient plus assez pour éprouver
    // la clé paramétrée, et le test ne prouverait plus grand-chose.
    const slides = KEYS.filter((key) => key.startsWith('slide_'));

    expect(slides.length).toBeGreaterThanOrEqual(4);
  });

  it.each(['fr', 'en'])('traduit chaque article en %s', async (language) => {
    const t = await i18next.changeLanguage(language);

    const raw = KEYS.filter((key) => {
      const label = accessoryLabel(t, key);
      // i18next rend la clé complète quand la traduction manque.
      return label === `accessory.${key}` || label.includes('accessory.');
    });

    expect(raw).toEqual([]);
  });

  it('nomme la longueur de la coulisse, pas seulement « coulisse »', async () => {
    const t = await i18next.changeLanguage('fr');

    // On n'achète pas « une coulisse » : la longueur est ce qu'on lit sur la facture.
    expect(accessoryLabel(t, 'slide_ball_350')).toContain('350');
    expect(accessoryLabel(t, 'slide_ball_500')).toContain('500');
  });
});
