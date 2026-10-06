import { describe, it, expect } from 'vitest';
import type { AssemblyStep } from '@neftya/engine';
import { partStateAt, placedAtStep } from './AssemblyGuide.js';

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
