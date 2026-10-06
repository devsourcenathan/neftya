import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { drilling } from './drilling.js';
import { assemblySteps } from './assembly.js';
import { billOfMaterials } from './bill-of-materials.js';
import { nest } from './nesting.js';
import { DOWEL, SCREW } from './hardware.js';
import type { FurnitureInput } from './input.js';

/**
 * Le mode vissé.
 *
 * Le tourillon demande un gabarit de perçage et deux trous qui se font face au dixième.
 * Décalés d'un millimètre, le meuble ne ferme plus d'équerre, et rien ne le rattrape : c'est
 * le ratage du premier meuble. La vis traverse et mord ; elle se voit, et elle se monte avec
 * une perceuse.
 *
 * Ce qui est testé ici n'est pas que le mode existe, mais qu'il produise un montage
 * faisable — et que l'autre mode n'ait pas bougé.
 */

const BASE: FurnitureInput = {
  dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

const screwed = build({ ...BASE, parameters: { joinery: 'screw' } });
const dowelled = build(BASE);

const holesOf = (furniture: ReturnType<typeof build>, purpose: string) =>
  drilling(furniture)
    .parts.flatMap((part) => part.holes)
    .filter((hole) => hole.purpose === purpose);

describe('le mode d’assemblage', () => {
  it('reste le tourillon par défaut', () => {
    // Un projet enregistré avant que le mode existe doit percer exactement comme avant.
    expect(dowelled.parameters.joinery).toBe('dowel');
    expect(holesOf(dowelled, 'dowel').length).toBeGreaterThan(0);
    expect(holesOf(dowelled, 'screw_pilot')).toEqual([]);
    expect(holesOf(dowelled, 'screw_clearance')).toEqual([]);
  });

  it('remplace les tourillons, il ne s’y ajoute pas', () => {
    // Les deux à la fois percerait deux fois le même joint : le séparateur serait criblé,
    // et la nomenclature commanderait les deux quincailleries.
    expect(holesOf(screwed, 'dowel')).toEqual([]);
    expect(holesOf(screwed, 'screw_pilot').length).toBeGreaterThan(0);
    expect(holesOf(screwed, 'screw_clearance').length).toBeGreaterThan(0);
  });
});

describe('les deux trous d’une vis', () => {
  const clearance = holesOf(screwed, 'screw_clearance');
  const pilot = holesOf(screwed, 'screw_pilot');

  it('vont par paires', () => {
    expect(clearance).toHaveLength(pilot.length);
  });

  it('encadrent le diamètre de la vis, et de part et d’autre', () => {
    /*
     * C'est **l'invariant du montage vissé**, et la raison pour laquelle un premier meuble
     * rate. Le trou de passage doit être plus large que la vis : sinon elle se visse dans
     * les deux pièces à la fois et les écarte au lieu de les serrer — le joint reste
     * ouvert, et aucune presse n'y change rien. L'avant-trou doit être plus étroit : sinon
     * la vis tourne dans le vide.
     */
    for (const hole of clearance) {
      expect(hole.diameterMm).toBeGreaterThan(SCREW.diameterMm);
    }

    for (const hole of pilot) {
      expect(hole.diameterMm).toBeLessThan(SCREW.diameterMm);
      expect(hole.diameterMm).toBeGreaterThan(0);
    }
  });

  it('se perce du dehors, du côté où la tête se loge', () => {
    /*
     * La face d'attaque est portée, pas déduite — et elle n'est pas celle des coordonnées.
     *
     * Percé de l'intérieur, la tête de vis serait prise entre les deux panneaux, et l'éclat
     * de sortie tomberait sur la face qu'on regarde. Les deux se paient sur le meuble fini.
     */
    for (const hole of clearance) {
      expect(hole.drillFrom).toBeDefined();
      expect(hole.drillFrom).not.toBe(hole.side);
    }

    // Un trou borgne n'a pas de face d'attaque : on perce depuis celle qui porte les cotes,
    // et un champ en plus ne ferait que donner une seconde chose à garder juste.
    for (const hole of pilot) expect(hole.drillFrom).toBeUndefined();
  });

  it('traverse d’un côté, s’arrête de l’autre', () => {
    // Un passage qui ne sort pas n'est pas un passage. Un avant-trou qui sort abîme la face
    // opposée, et la vis n'a plus rien pour mordre sur ses derniers millimètres.
    for (const hole of clearance) expect(hole.through).toBe(true);

    for (const hole of pilot) {
      expect(hole.through).toBeUndefined();
      expect(hole.depthMm).toBeLessThan(SCREW.lengthMm);
    }
  });
});

describe('ce que le mode vissé commande', () => {
  it('compte une vis par paire de trous, pas une par trou', () => {
    const line = drilling(screwed).hardware.find(
      (candidate) => candidate.key === SCREW.key,
    );

    const pairs = holesOf(screwed, 'screw_clearance').length;

    expect(line?.quantity).toBe(pairs);
    expect(drilling(screwed).hardware.some((l) => l.key === DOWEL.key)).toBe(false);
  });

  it('nomme la vis dans le guide de montage, et au bon nombre', () => {
    const step = assemblySteps(screwed).find(
      (candidate) => candidate.key === 'dividers',
    );
    const drilled = drilling(screwed).hardware.find((l) => l.key === SCREW.key);

    expect(step?.fastener?.key).toBe(SCREW.key);

    /*
     * Le guide et le perçage comptent la même chose.
     *
     * L'apprenti n'a que le guide sous les yeux ; s'il annonce un nombre et que les trous
     * en disent un autre, c'est au montage qu'il le découvre — avec ce qu'il a acheté.
     */
    expect(step?.fastener?.quantity).toBe(drilled?.quantity);
  });

  it('annonce les tourillons quand c’est un montage tourillonné', () => {
    const step = assemblySteps(dowelled).find(
      (candidate) => candidate.key === 'dividers',
    );
    const drilled = drilling(dowelled).hardware.find((l) => l.key === DOWEL.key);

    expect(step?.fastener?.key).toBe(DOWEL.key);
    expect(step?.fastener?.quantity).toBe(drilled?.quantity);
  });

  it('porte la vis à la nomenclature, et pas le tourillon', () => {
    const bill = billOfMaterials(screwed, nest(screwed), drilling(screwed));
    const keys = bill.accessories.map((line) => line.key);

    expect(keys).toContain(SCREW.key);
    expect(keys).not.toContain(DOWEL.key);
  });
});

describe('la ligne d’assemblage', () => {
  it('est la même dans les deux modes', () => {
    /*
     * Changer de mode déplace la quincaillerie, jamais le joint.
     *
     * Les deux lignes partent du même calcul : si elles divergeaient, un meuble percé puis
     * changé de mode se retrouverait avec deux lignes de trous à quelques millimètres
     * l'une de l'autre, et le séparateur ne tiendrait sur aucune des deux.
     */
    /*
     * Les trous du séparateur seulement.
     *
     * Chaque fixation en perce deux, sur deux pièces, et chaque pièce a son propre repère :
     * mêler les deux compare des millimètres qui ne se comptent pas depuis le même bord.
     */
    const dividerHoles = (furniture: ReturnType<typeof build>, purpose: string) => {
      const divider = furniture.parts.find((part) => part.role === 'divider');

      return drilling(furniture)
        .parts.filter((part) => part.partId === divider?.id)
        .flatMap((part) => part.holes)
        .filter((hole) => hole.purpose === purpose)
        .map((hole) => hole.xMm);
    };

    const dowels = [...new Set(dividerHoles(dowelled, 'dowel'))].sort((a, b) => a - b);
    const pilots = [...new Set(dividerHoles(screwed, 'screw_pilot'))].sort(
      (a, b) => a - b,
    );

    // Les bouts coïncident : même retrait d'about, même ligne. Le milieu diffère, les deux
    // modes n'ayant pas le même nombre de fixations.
    expect(pilots[0]).toBe(dowels[0]);
    expect(pilots.at(-1)).toBe(dowels.at(-1));
  });

  it('ne perce rien sur un séparateur trop peu profond', () => {
    // Moins de deux retraits d'about : il n'y a pas de ligne, et une fixation unique au
    // milieu ne tiendrait pas le joint. Mieux vaut ne rien percer que percer pour rien.
    const shallow = build({
      ...BASE,
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 90 },
      parameters: { joinery: 'screw' },
    });

    expect(2 * SCREW.endOffsetMm).toBeGreaterThan(90);
    expect(holesOf(shallow, 'screw_pilot')).toEqual([]);
    expect(holesOf(shallow, 'screw_clearance')).toEqual([]);
  });
});
