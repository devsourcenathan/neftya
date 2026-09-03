import { describe, it, expect } from 'vitest';
import {
  canRedo,
  canUndo,
  initialHistory,
  reduceHistory,
  HISTORY_DEPTH,
  MERGE_WINDOW_MS,
  type History,
} from './history.js';
import { defaultModel } from './model.js';
import type { DesignerAction } from './model.js';

/**
 * L'annulation.
 *
 * Elle vient **avant** les menus contextuels, et non après : la manipulation directe sans
 * `Ctrl+Z` fait peur, on cesse d'essayer, et un menu qui supprime un compartiment devient
 * un piège plutôt qu'un outil.
 */

const start = () => initialHistory(defaultModel());

function play(history: History, actions: [DesignerAction, number?][]): History {
  return actions.reduce(
    (state, [action, atMs]) =>
      reduceHistory(state, {
        type: 'do',
        action,
        ...(atMs === undefined ? {} : { atMs }),
      }),
    history,
  );
}

const width = (history: History) => history.present.dimensions.widthMm;

describe('les pas', () => {
  it('revient à l’état d’avant, puis y renonce', () => {
    const after = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1200 }, 0],
    ]);

    expect(width(after)).toBe(1200);
    expect(canUndo(after)).toBe(true);

    const undone = reduceHistory(after, { type: 'undo' });
    expect(width(undone)).toBe(1800);
    expect(canRedo(undone)).toBe(true);

    expect(width(reduceHistory(undone, { type: 'redo' }))).toBe(1200);
  });

  it('ne rend rien à annuler au départ', () => {
    const empty = start();

    expect(canUndo(empty)).toBe(false);
    expect(canRedo(empty)).toBe(false);
    // Un `Ctrl+Z` sur une pile vide ne doit pas jeter, ni changer quoi que ce soit.
    expect(reduceHistory(empty, { type: 'undo' })).toBe(empty);
    expect(reduceHistory(empty, { type: 'redo' })).toBe(empty);
  });

  it('abandonne le futur dès qu’on repart ailleurs', () => {
    const after = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1200 }, 0],
      [{ type: 'dimension', axis: 'heightMm', valueMm: 900 }, 5_000],
    ]);
    const undone = reduceHistory(after, { type: 'undo' });

    const diverged = play(undone, [
      [{ type: 'material', material: 'plywood' }, 10_000],
    ]);

    // Refaire une hauteur qu'on a défaite, après avoir changé de matériau, rétablirait un
    // meuble que personne n'a demandé.
    expect(canRedo(diverged)).toBe(false);
  });
});

describe('ce qui ne fait pas un pas', () => {
  it('ignore une action qui ne change rien', () => {
    const before = start();
    // 1800 est déjà la largeur : l'action passe par `clamp` et reconstruit un objet neuf
    // aux mêmes valeurs. Comparer les identités ne verrait rien.
    const after = reduceHistory(before, {
      type: 'do',
      action: { type: 'dimension', axis: 'widthMm', valueMm: 1800 },
      atMs: 0,
    });

    expect(after).toBe(before);
    expect(canUndo(after)).toBe(false);
  });

  it('ignore une valeur repoussée par les bornes', () => {
    const at = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 99_999 }, 0],
    ]);
    const again = play(at, [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 100_000 }, 5_000],
    ]);

    // Le curseur est au maximum : continuer à tirer ne doit pas empiler des pas qu'il
    // faudra ensuite annuler un par un.
    expect(again.past.length).toBe(at.past.length);
  });
});

describe('les gestes continus', () => {
  it('fond un glissement en un seul pas', () => {
    // Faire glisser un curseur produit une action par pixel. Sans fusion, annuler ne
    // reculerait que d'un millimètre.
    const dragged = play(
      start(),
      [1700, 1600, 1500, 1400].map((valueMm, step) => [
        { type: 'dimension', axis: 'widthMm', valueMm },
        step * 40,
      ]),
    );

    expect(width(dragged)).toBe(1400);
    expect(dragged.past).toHaveLength(1);
    expect(width(reduceHistory(dragged, { type: 'undo' }))).toBe(1800);
  });

  it('ouvre un pas neuf après une pause', () => {
    const paused = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1700 }, 0],
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1400 }, MERGE_WINDOW_MS + 1],
    ]);

    expect(paused.past).toHaveLength(2);
  });

  it('ne fond pas deux axes différents', () => {
    const both = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1700 }, 0],
      [{ type: 'dimension', axis: 'heightMm', valueMm: 1900 }, 40],
    ]);

    expect(both.past).toHaveLength(2);
  });

  it('ne fond jamais deux clics de compteur', () => {
    // Trois clics sur « + » sont trois décisions. Les fondre ferait reculer de deux quand
    // on demande un.
    const clicked = play(start(), [
      [{ type: 'shelves', index: 0, count: 4 }, 0],
      [{ type: 'shelves', index: 0, count: 5 }, 40],
      [{ type: 'shelves', index: 0, count: 6 }, 80],
    ]);

    expect(clicked.past).toHaveLength(3);
  });

  it('ne fond pas dans le pas qu’on vient d’annuler', () => {
    const dragged = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1700 }, 0],
    ]);
    const undone = reduceHistory(dragged, { type: 'undo' });
    const again = play(undone, [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1500 }, 40],
    ]);

    // Sans cette précaution, le geste suivant remplacerait l'état d'un pas défait — et
    // l'annulation qu'on vient de faire disparaîtrait de l'historique.
    expect(again.past).toHaveLength(1);
    expect(width(reduceHistory(again, { type: 'undo' }))).toBe(1800);
  });
});

describe('la profondeur', () => {
  it('oublie les plus anciens plutôt que de gonfler sans fin', () => {
    const many = play(
      start(),
      Array.from({ length: HISTORY_DEPTH + 20 }, (_, step) => [
        { type: 'shelves', index: 0, count: (step % 9) + 1 } as DesignerAction,
        step * 1_000,
      ]),
    );

    expect(many.past).toHaveLength(HISTORY_DEPTH);
  });
});

describe('repartir d’un modèle chargé', () => {
  it('efface l’historique', () => {
    const after = play(start(), [
      [{ type: 'dimension', axis: 'widthMm', valueMm: 1200 }, 0],
    ]);
    const loaded = reduceHistory(after, { type: 'reset', model: defaultModel() });

    // Annuler après l'ouverture d'un projet ramènerait à l'état d'un autre projet.
    expect(canUndo(loaded)).toBe(false);
    expect(canRedo(loaded)).toBe(false);
  });
});
