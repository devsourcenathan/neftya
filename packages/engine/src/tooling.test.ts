import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { drilling } from './drilling.js';
import { compareTools, tooling } from './tooling.js';
import type { FurnitureInput } from './input.js';
import type { ToolKey } from './tooling.js';

/**
 * L'outillage, et le niveau qui s'en déduit.
 *
 * Ce qui est testé n'est pas que la liste existe, mais qu'elle **suive le meuble**. Une
 * liste écrite d'avance aurait été juste le jour où on l'a écrite : ce qu'il faut tenir,
 * c'est qu'un meuble sans porte ne réclame pas de Forstner, et qu'un meuble vissé ne
 * réclame pas de gabarit de tourillonnage.
 */

const BASE: FurnitureInput = {
  dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
  compartments: [{ shelves: 1, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
};

const toolsFor = (over: Partial<FurnitureInput> = {}) => {
  const furniture = build({ ...BASE, ...over });
  const result = tooling(drilling(furniture));

  return { ...result, keys: result.tools.map((tool) => tool.key) as ToolKey[] };
};

describe('ce que la liste contient toujours', () => {
  it('porte la perceuse, la visseuse et de quoi tenir et vérifier', () => {
    const { keys } = toolsFor();

    for (const key of ['drill', 'driver', 'clamps', 'square', 'tape'] as const) {
      expect(keys).toContain(key);
    }
  });

  it('marque la scie comme ce dont on peut se passer', () => {
    // Le magasin coupe : c'est tout l'objet de la fiche de débit. Laisser la scie à panneaux
    // au même rang que le mètre ruban découragerait pour rien.
    const { tools } = toolsFor();
    const saw = tools.find((tool) => tool.key === 'saw');

    expect(saw?.optional).toBe(true);
    expect(tools.filter((tool) => tool.optional).map((tool) => tool.key)).toEqual([
      'saw',
    ]);
  });
});

describe('ce que la liste déduit du meuble', () => {
  it('ne réclame une Forstner que s’il y a des portes', () => {
    /*
     * Le boîtier de charnière est un trou de 35, et une mèche à bois de 35 n'existe pas.
     * C'est l'outil qui arrête le plus de monde, et il n'a aucune raison d'apparaître sur
     * un meuble ouvert.
     */
    expect(toolsFor().keys).not.toContain('forstner_35');
    expect(toolsFor({ compartments: [{ shelves: 1, doors: 1 }] }).keys).toContain(
      'forstner_35',
    );
  });

  it('ne réclame un gabarit que pour les tourillons', () => {
    // C'est l'information qui permet de changer d'avis avant d'avoir percé.
    expect(toolsFor({ compartments: [{ shelves: 1 }, { shelves: 1 }] }).keys).toContain(
      'dowel_jig',
    );

    expect(
      toolsFor({
        compartments: [{ shelves: 1 }, { shelves: 1 }],
        parameters: { joinery: 'screw' },
      } as Partial<FurnitureInput>).keys,
    ).not.toContain('dowel_jig');
  });

  it('nomme les mèches par les diamètres que le meuble perce', () => {
    const screwed = toolsFor({
      compartments: [{ shelves: 1 }, { shelves: 1 }],
      parameters: { joinery: 'screw' },
    } as Partial<FurnitureInput>);

    // 5,5 de passage et 3 d'avant-trou : deux diamètres qu'aucune liste écrite d'avance
    // n'aurait prévus, puisqu'ils n'existent que depuis le mode vissé.
    expect(screwed.keys).toContain('bit_5_5');
    expect(screwed.keys).toContain('bit_3');
    expect(screwed.keys).toContain('countersink');

    const dowelled = toolsFor({ compartments: [{ shelves: 1 }, { shelves: 1 }] });
    expect(dowelled.keys).toContain('bit_8');
    expect(dowelled.keys).not.toContain('bit_5_5');
    expect(dowelled.keys).not.toContain('countersink');
  });

  it('dit pourquoi chaque outil est là', () => {
    // « Une mèche de 5 » ne dit pas si on peut s'en passer ; « pour les taquets d'étagère »
    // le dit. Seuls les outils de toujours n'ont pas de raison nommée.
    const { tools } = toolsFor({ compartments: [{ shelves: 1, doors: 1 }] });

    for (const tool of tools) {
      const universal = ['drill', 'driver', 'clamps', 'square', 'tape', 'saw'];
      if (universal.includes(tool.key)) continue;

      expect(tool.reasons.length, `${tool.key} sans raison`).toBeGreaterThan(0);
    }
  });
});

describe('l’ordre de la liste', () => {
  it('se lit comme une liste de courses', () => {
    /*
     * Trier sur la clé rangeait « Fraise à lamer » entre les serre-joints et la perceuse :
     * un ordre alphabétique dans la langue des clés, que personne ne lit. On range par ce
     * qu'on fait — ce qu'on a déjà, ce qu'il faut acheter, les mèches, le reste, et la scie
     * en dernier puisqu'on peut s'en passer.
     */
    const { keys } = toolsFor({
      compartments: [{ shelves: 1, doors: 1 }, { shelves: 1 }],
      parameters: { joinery: 'screw' },
    } as Partial<FurnitureInput>);

    const at = (key: ToolKey) => keys.indexOf(key);

    expect(at('drill')).toBe(0);
    expect(at('drill')).toBeLessThan(at('forstner_35'));
    expect(at('forstner_35')).toBeLessThan(at('bit_3'));
    expect(at('bit_3')).toBeLessThan(at('countersink'));
    expect(at('saw')).toBe(keys.length - 1);
  });

  it('compare les diamètres en nombres, pas en texte', () => {
    // Les diamètres d'aujourd'hui se trient pareil des deux façons. Celui-ci non : en
    // texte, `bit_10` passe avant `bit_3`, et la liste enverrait chercher les mèches dans
    // un ordre que le rayon ne connaît pas.
    expect(compareTools('bit_10', 'bit_3')).toBeGreaterThan(0);
    expect(compareTools('bit_5_5', 'bit_8')).toBeLessThan(0);
  });

  it('range les mèches par diamètre croissant', () => {
    // L'ordre du tiroir et celui du rayon. Trié en texte, « Ø 5,5 » passait avant « Ø 8 »
    // par accident, et « Ø 10 » serait passé avant « Ø 3 ».
    const { keys } = toolsFor({
      compartments: [{ shelves: 1 }, { shelves: 1 }],
      parameters: { joinery: 'screw' },
    } as Partial<FurnitureInput>);

    const diameters = keys
      .filter((key) => key.startsWith('bit_'))
      .map((key) => Number(key.slice(4).replace('_', '.')));

    expect(diameters.length).toBeGreaterThan(1);
    expect(diameters).toEqual([...diameters].sort((a, b) => a - b));
  });
});

describe('le niveau', () => {
  it('est débutant quand rien ne dépasse la perceuse', () => {
    const simple = toolsFor({ compartments: [{ shelves: 2 }] });

    expect(simple.level).toBe('beginner');
    expect(simple.demanding).toEqual([]);
  });

  it('monte d’un cran pour la Forstner et pour le gabarit', () => {
    expect(toolsFor({ compartments: [{ shelves: 1, doors: 1 }] }).level).toBe(
      'intermediate',
    );
    expect(toolsFor({ compartments: [{ shelves: 1 }, { shelves: 1 }] }).level).toBe(
      'intermediate',
    );
  });

  it('passe à confirmé dès qu’une poignée se fraise', () => {
    /*
     * Une poche n'est demandée par aucun trou : c'est la défonceuse, et elle s'apprend sur
     * des chutes avant de toucher une façade. Une liste qui ne lirait que les perçages
     * aurait oublié exactement l'outil dont l'absence arrête le travail.
     */
    const shelled = toolsFor({
      compartments: [
        {
          shelves: 1,
          doors: 1,
          pulls: [{ target: 'door', slot: 0, key: 'pull_shell' }],
        },
      ],
    } as Partial<FurnitureInput>);

    expect(shelled.keys).toContain('router');
    expect(shelled.level).toBe('advanced');
    // Le plus exigeant décide, et les autres restent nommés.
    expect(shelled.demanding[0]).toBe('router');
    expect(shelled.demanding).toContain('forstner_35');
  });
});
