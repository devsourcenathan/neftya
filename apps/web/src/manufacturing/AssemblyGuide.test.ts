import { describe, it, expect } from 'vitest';
import { assemblySteps, build, drilling, furnitureInput } from '@neftya/engine';
import type { AssemblyStep } from '@neftya/engine';
import { fittingSheet, partStateAt, placedAtStep } from './AssemblyGuide.js';

/**
 * Ce que le dessin d'une étape montre, et ce qu'il tait.
 *
 * Toute la décision tient dans ces deux fonctions, et elles sont ici plutôt que dans le
 * composant pour la même raison que `nextPoll` : une règle écrite au milieu d'un rendu est
 * vraie le jour où on l'écrit et fausse au premier état ajouté.
 */

const STEPS = [
  {
    index: 1,
    total: 3,
    key: 'carcass',
    parts: [
      { id: 'P02', role: 'bottom', quantity: 1 },
      { id: 'P03', role: 'side', quantity: 2 },
    ],
  },
  {
    index: 2,
    total: 3,
    key: 'top',
    // `P03` revient : il est **mentionné** ici, il a été **posé** à l'étape 1.
    parts: [
      { id: 'P01', role: 'top', quantity: 1 },
      { id: 'P03', role: 'side', quantity: 2 },
    ],
  },
  {
    index: 3,
    total: 3,
    key: 'shelves',
    parts: [{ id: 'P05', role: 'shelf', quantity: 2 }],
  },
] as unknown as AssemblyStep[];

describe('à quelle étape une pièce est posée', () => {
  it('retient la première qui la nomme, pas la dernière', () => {
    const placedAt = placedAtStep(STEPS);

    // Un côté est mentionné au caisson puis au dessus. Le prendre à la dernière le ferait
    // apparaître deux étapes trop tard, et on chercherait sur quoi visser le dessus.
    expect(placedAt.get('P03')).toBe(0);
    expect(placedAt.get('P01')).toBe(1);
    expect(placedAt.get('P05')).toBe(2);
  });
});

describe('ce que montre le dessin d’une étape', () => {
  const placedAt = placedAtStep(STEPS);

  it('cache ce qui n’est pas encore posé', () => {
    // Un meuble entier à chaque étape ne dirait pas ce qu'il y a à faire.
    expect(partStateAt(placedAt, 'P05', 0)).toBe('absent');
    expect(partStateAt(placedAt, 'P01', 0)).toBe('absent');
  });

  it('met en avant ce qu’on pose maintenant', () => {
    expect(partStateAt(placedAt, 'P02', 0)).toBe('posee');
    expect(partStateAt(placedAt, 'P01', 1)).toBe('posee');
  });

  it('garde en transparence ce qui est déjà là', () => {
    // Sans elles, une étagère flotte dans le vide et on ne sait plus de quel meuble il
    // s'agit.
    expect(partStateAt(placedAt, 'P02', 1)).toBe('deja');
    expect(partStateAt(placedAt, 'P03', 2)).toBe('deja');
  });

  it('ne repose pas une pièce à chaque fois qu’on la mentionne', () => {
    // `P03` est nommé aux étapes 1 et 2 : il est posé une fois.
    expect(partStateAt(placedAt, 'P03', 0)).toBe('posee');
    expect(partStateAt(placedAt, 'P03', 1)).toBe('deja');
  });

  it('tait une pièce qu’aucune étape ne nomme', () => {
    // Elle existe au plan de découpe sans figurer au montage : la montrer en pleine
    // couleur ferait chercher une consigne qui n'existe pas.
    expect(partStateAt(placedAt, 'P99', 2)).toBe('absent');
  });
});

/**
 * La fiche de pose : ce qu'il faut savoir pour **poser** une pièce.
 *
 * Tout y était calculé depuis le premier jour — le sens d'ouverture, les coordonnées de
 * chaque trou, le fil, les chants — et rien n'était montré. Le dossier n'affichait que des
 * comptes pendant que les positions dormaient dans l'export DXF, qui ne sert qu'à une
 * machine à commande numérique.
 */
describe('la fiche de pose', () => {
  const furniture = build(
    furnitureInput.parse({
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
      compartments: [
        { shelves: 1, doors: 1 },
        { shelves: 1, doors: 1 },
      ],
      material: 'mdf',
      hasBack: true,
    }),
  );

  const drilled = drilling(furniture).parts;
  const steps = assemblySteps(furniture);
  const doorStep = steps.find((candidate) => candidate.key === 'doors') as AssemblyStep;

  it('donne une ligne par exemplaire, pas par pièce', () => {
    /*
     * **Une paire de vantaux, donc une seule pièce en quantité deux.**
     *
     * Le meuble du dessus a deux portes de largeurs différentes : ce sont deux pièces, et
     * une fiche par pièce y suffirait par accident. Une paire, elle, est la même pièce
     * percée de deux façons — l'une charnière à gauche, l'autre à droite. C'est le cas qui
     * distingue « par pièce » de « par exemplaire », et c'est celui qu'il faut éprouver.
     */
    const paire = build(
      furnitureInput.parse({
        dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
        compartments: [{ doors: 2 }],
        material: 'mdf',
        hasBack: true,
      }),
    );

    const leaves = paire.parts.filter((part) => part.role === 'door');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.quantity).toBe(2);

    const step = assemblySteps(paire).find((c) => c.key === 'doors') as AssemblyStep;
    const entries = fittingSheet(paire, drilling(paire).parts, step);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.copy)).toEqual([1, 2]);
  });

  it('dit de quel côté la porte s’ouvre', () => {
    for (const entry of fittingSheet(furniture, drilled, doorStep)) {
      // Su depuis toujours : c'est ce qui place la poignée du bon côté. Jamais affiché.
      expect(entry.hinge === 'left' || entry.hinge === 'right').toBe(true);
    }
  });

  it('ne parle d’ouverture que pour une porte', () => {
    const shelves = steps.find((c) => c.key === 'shelves') as AssemblyStep;

    for (const entry of fittingSheet(furniture, drilled, shelves)) {
      expect(entry.hinge).toBeNull();
    }
  });

  it('groupe les trous par face', () => {
    const entries = fittingSheet(furniture, drilled, doorStep);
    const faces = entries.flatMap((entry) => entry.holes);

    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      // On ne perce pas une pièce en la retournant à chaque trou : une face, tous ses
      // trous, puis on retourne.
      for (const hole of face.items) expect(hole.side).toBe(face.side);
    }
  });

  it('donne des coordonnées, pas un compte', () => {
    const holes = fittingSheet(furniture, drilled, doorStep).flatMap((entry) =>
      entry.holes.flatMap((face) => face.items),
    );

    expect(holes.length).toBeGreaterThan(0);
    for (const hole of holes) {
      expect(Number.isInteger(hole.xMm)).toBe(true);
      expect(Number.isInteger(hole.yMm)).toBe(true);
      expect(hole.diameterMm).toBeGreaterThan(0);
    }
  });

  it('garde une pièce que rien ne perce', () => {
    const back = steps.find((candidate) => candidate.key === 'back') as AssemblyStep;
    const entries = fittingSheet(furniture, drilled, back);

    // Le fond n'a aucun trou : il entre en rainure. L'omettre de la fiche ferait croire
    // qu'on l'a oublié.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.holes).toHaveLength(0);
  });
});
