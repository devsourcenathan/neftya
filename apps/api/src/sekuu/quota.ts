import type { Kysely } from 'kysely';
import { conflict } from '../http/errors.js';
import type { Database } from '../db/schema.js';
import { limitOf, type SekuuContext } from './sekuu-context.js';

/**
 * Les plafonds, et **un seul endroit où ils se lisent**.
 *
 * Il y en avait deux. Les projets lisaient les revendications du jeton — donc un plafond
 * réglé par le patron ne mordait qu'au jeton suivant, jusqu'à quinze minutes plus tard.
 * L'IA lisait `organization_quotas` en base, donc tout de suite. Même famille de règle,
 * deux latences, et aucune des deux n'était fausse : c'est l'écart qui l'était.
 *
 * Depuis que l'identité est locale, la table **est** la source de vérité. Les
 * revendications restent le repli, pour un jeton signé par une plateforme qui, elle, ne
 * partage pas notre base.
 *
 * @see docs/SEKUU.md §5
 */

export const PROJECTS_QUOTA_KEY = 'neftya_projects_max';
export const AI_QUOTA_KEY = 'neftya_ai_month_max';

const COLUMNS = {
  [PROJECTS_QUOTA_KEY]: 'projects_max',
  [AI_QUOTA_KEY]: 'ai_month_max',
} as const;

export type QuotaKey = keyof typeof COLUMNS;

/**
 * Trois états, et ils ne se confondent pas :
 *
 * - `undefined` — **non couvert** : aucune ligne pour cette organisation. On ne plafonne
 *   pas, et on laisse les revendications du jeton décider si elles en portent un.
 * - `null` — **illimité**, explicitement. On ne plafonne pas, et on ne consulte rien
 *   d'autre : quelqu'un a décidé.
 * - un nombre — le plafond.
 *
 * Confondre les deux premiers ferait d'un réglage « illimité » une porte ouverte au
 * plafond d'un jeton périmé.
 */
export interface QuotaSource {
  limit(organizationId: string, key: QuotaKey): Promise<number | null | undefined>;
}

export class LocalQuotas implements QuotaSource {
  constructor(private readonly db: Kysely<Database>) {}

  async limit(
    organizationId: string,
    key: QuotaKey,
  ): Promise<number | null | undefined> {
    const row = await this.db
      .selectFrom('organization_quotas')
      .select(COLUMNS[key])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (!row) return undefined;

    return (row as Record<string, number | null>)[COLUMNS[key]] ?? null;
  }
}

/**
 * Fait respecter un plafond, **sans jamais bloquer par défaut**.
 *
 * Un plafond absent et un plafond explicitement illimité laissent tous deux passer.
 * DealerOS avait fait l'inverse : le jour où une clé de quota est ajoutée au catalogue,
 * toutes les organisations dont le plan ne la porte pas encore se retrouvent bloquées.
 *
 * Un plafond atteint rend **409**, ici comme pour l'IA. Deux codes pour un même refus
 * obligeraient l'interface à écrire deux fois le même traitement.
 */
export async function enforceLimit(
  context: SekuuContext,
  key: QuotaKey,
  count: () => Promise<number>,
  message: string,
  source?: QuotaSource,
): Promise<void> {
  const max = await resolveLimit(context, key, source);
  if (max === undefined) return;

  if ((await count()) >= max) {
    throw conflict(message);
  }
}

/** Le plafond en vigueur, ou `undefined` : ne pas plafonner. */
export async function resolveLimit(
  context: SekuuContext,
  key: QuotaKey,
  source?: QuotaSource,
): Promise<number | undefined> {
  if (source) {
    const local = await source.limit(context.organizationId, key);
    // Une ligne existe : elle décide, y compris quand elle dit « illimité ».
    if (local !== undefined) return local ?? undefined;
  }

  return limitOf(context, key);
}
