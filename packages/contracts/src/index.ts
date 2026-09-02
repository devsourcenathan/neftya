/**
 * Contrats partagés entre l'API et l'interface.
 *
 * Un type métier est déclaré une fois et importé partout. DealerOS porte 94 types
 * réécrits à la main entre son back et son front, sans contrat généré : un statut
 * ajouté côté serveur n'y cassait aucun build, il produisait un `undefined` à
 * l'exécution.
 *
 * @see docs/ENGINEERING.md §4
 */
export * from './envelope.js';
export * from './localised.js';
export type { Millimetres } from '@neftya/engine';
