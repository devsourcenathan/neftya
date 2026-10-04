import type { SekuuAI } from '../sekuu/ai.js';
import type { LocalAI } from './local-ai.js';

/**
 * Ce que les routes de l'assistant exigent : soumettre, relire.
 *
 * `SekuuAI` (distant) et `LocalAI` (modèle direct) parlent tous deux ainsi :
 * la route ne sait pas qui répond, elle sait seulement traduire les refus.
 */
export type AiService = Pick<SekuuAI | LocalAI, 'extract' | 'read'>;
