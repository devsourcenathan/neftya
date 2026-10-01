import { describe, it, expect } from 'vitest';
import {
  MAX_POLLS,
  POLL_INTERVAL_MS,
  gaveUp,
  nextPoll,
  type InterpretationStatus,
} from './assistant.js';

/**
 * Quand redemander, et quand s'arrêter.
 *
 * Toute la logique du cycle est ici, hors du composant. Un `refetchInterval` écrit en place
 * est vrai le jour où on l'écrit et faux au premier état ajouté — et un onglet qui
 * interroge la plateforme indéfiniment est un défaut que personne ne voit et que tout le
 * monde paie.
 */

describe('tant que ce n’est pas fini', () => {
  it('redemande sur une génération en file ou en cours', () => {
    expect(nextPoll('queued', 0)).toBe(POLL_INTERVAL_MS);
    expect(nextPoll('running', 3)).toBe(POLL_INTERVAL_MS);
  });

  it('ne redemande rien avant d’avoir soumis', () => {
    expect(nextPoll(undefined, 0)).toBe(false);
  });
});

describe('les états terminaux', () => {
  const terminal: InterpretationStatus[] = [
    'succeeded',
    'unusable',
    'failed',
    'cancelled',
  ];

  it('arrêtent le sondage, y compris « inutilisable »', () => {
    for (const status of terminal) {
      // `unusable` est terminal au même titre que `succeeded` : la génération est finie, et
      // la redemander ne la rendra pas meilleure — elle coûterait un appel de plus pour rien.
      expect(nextPoll(status, 0)).toBe(false);
    }
  });
});

describe('renoncer', () => {
  it('s’arrête au plafond', () => {
    expect(nextPoll('running', MAX_POLLS - 1)).toBe(POLL_INTERVAL_MS);
    expect(nextPoll('running', MAX_POLLS)).toBe(false);
  });

  it('distingue « renoncé » de « terminé »', () => {
    // Les deux arrêtent le sondage ; un seul des deux doit le dire à l'utilisateur.
    expect(gaveUp('running', MAX_POLLS)).toBe(true);
    expect(gaveUp('running', 1)).toBe(false);
    expect(gaveUp('succeeded', MAX_POLLS)).toBe(false);
    expect(gaveUp(undefined, MAX_POLLS)).toBe(false);
  });

  it('laisse une demi-minute, pas une journée', () => {
    // Trente secondes : assez pour une génération lente, trop peu pour qu'un onglet oublié
    // interroge la plateforme sans fin.
    expect((MAX_POLLS * POLL_INTERVAL_MS) / 1_000).toBe(30);
  });
});
