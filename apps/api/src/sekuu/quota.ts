import { conflict } from '../http/errors.js';
import { limitOf, type SekuuContext } from './sekuu-context.js';

/**
 * Fait respecter un plafond du plan, **sans jamais bloquer par défaut**.
 *
 * `limitOf` rend `undefined` aussi bien pour un plafond absent que pour un plafond
 * explicitement illimité, et dans les deux cas on laisse passer. DealerOS avait fait
 * l'inverse : le jour où une clé de quota est ajoutée au catalogue, toutes les
 * organisations dont le plan ne la porte pas encore se retrouvent bloquées.
 *
 * @see docs/SEKUU.md §5
 */
export async function enforceLimit(
  context: SekuuContext,
  key: string,
  count: () => Promise<number>,
  message: string,
): Promise<void> {
  const max = limitOf(context, key);
  if (max === undefined) return;

  if ((await count()) >= max) {
    throw conflict(message);
  }
}
