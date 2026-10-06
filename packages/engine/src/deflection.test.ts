import { describe, it, expect } from 'vitest';
import { deflectionRemedy, shelfDeflection } from './deflection.js';
import { PANEL_THICKNESSES_MM } from './materials.js';

/**
 * Le remède à une étagère qui plie.
 *
 * « Réduisez la portée ou augmentez l'épaisseur » nommait le remède sans donner la dose, et
 * une consigne qu'on ne peut pas suivre vaut un silence. Ce qui est testé ici, c'est que les
 * deux chiffres rendus s'appliquent tels quels — l'épaisseur tient vraiment, et la portée
 * aussi, au millimètre près.
 */

describe('le remède', () => {
  /** Une étagère d'un mètre en 18 mm de MDF sous 20 kg : elle plie, et ça se voit. */
  const SAGGING = {
    spanMm: 1000,
    depthMm: 300,
    thicknessMm: 18,
    material: 'mdf' as const,
    loadKg: 20,
  };

  it('part bien d’une étagère qui plie', () => {
    expect(shelfDeflection(SAGGING).excessive).toBe(true);
  });

  it('donne une épaisseur qui tient vraiment', () => {
    // Pas une épaisseur « au-dessus », celle qui passe : proposer du 19 là où il faut du 22
    // ferait racheter un panneau pour rien.
    const { thicknessMm } = deflectionRemedy({
      ...SAGGING,
      thicknessesMm: PANEL_THICKNESSES_MM.metric,
    });

    expect(thicknessMm).not.toBeNull();
    expect(
      shelfDeflection({ ...SAGGING, thicknessMm: thicknessMm as number }).excessive,
    ).toBe(false);
  });

  it('donne la première du catalogue, pas la plus épaisse', () => {
    const { thicknessMm } = deflectionRemedy({
      ...SAGGING,
      thicknessesMm: PANEL_THICKNESSES_MM.metric,
    });

    const smaller = PANEL_THICKNESSES_MM.metric.filter(
      (candidate) =>
        candidate > SAGGING.thicknessMm && candidate < (thicknessMm as number),
    );

    for (const candidate of smaller) {
      expect(
        shelfDeflection({ ...SAGGING, thicknessMm: candidate }).excessive,
        `${candidate} mm aurait suffi`,
      ).toBe(true);
    }
  });

  it('rend null quand aucune épaisseur du catalogue n’y suffit', () => {
    // Trois mètres de portée : il n'y a pas d'épaisseur de panneau qui tienne, et le dire
    // vaut mieux que de proposer le 25 en espérant.
    const { thicknessMm } = deflectionRemedy({
      ...SAGGING,
      spanMm: 3000,
      thicknessesMm: PANEL_THICKNESSES_MM.metric,
    });

    expect(thicknessMm).toBeNull();
  });

  it('donne une portée qui tient, au millimètre près', () => {
    /*
     * La valeur rendue passe, et un millimètre de plus ne passe pas. C'est ce qui fait la
     * différence entre un chiffre qu'on applique et un chiffre qu'on vérifie : arrondi dans
     * le mauvais sens, il envoie couper une étagère qui plie encore.
     */
    const { maxSpanMm } = deflectionRemedy({
      ...SAGGING,
      thicknessesMm: PANEL_THICKNESSES_MM.metric,
    });

    expect(maxSpanMm).toBeLessThan(SAGGING.spanMm);
    expect(shelfDeflection({ ...SAGGING, spanMm: maxSpanMm }).excessive).toBe(false);
    expect(shelfDeflection({ ...SAGGING, spanMm: maxSpanMm + 1 }).excessive).toBe(true);
  });

  it('suit le catalogue impérial quand la pièce en vient', () => {
    // 19,05 mm est un 3/4 de pouce. Répondre « passez en 22 » enverrait chercher une
    // épaisseur qu'aucun rayon ne vend là où ce panneau s'achète.
    const { thicknessMm } = deflectionRemedy({
      ...SAGGING,
      thicknessMm: 19.05,
      thicknessesMm: PANEL_THICKNESSES_MM.imperial,
    });

    expect(thicknessMm).toBe(25.4);
  });
});
