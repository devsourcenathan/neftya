import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Money } from '@neftya/units';
import type { Database } from '../db/schema.js';

/**
 * Les prix saisis et les exports figés.
 *
 * Comme partout, `organizationId` est le premier paramètre de chaque méthode : une requête
 * ne peut pas être écrite sans dire pour quelle organisation.
 */

export interface ProjectExport {
  id: string;
  projectId: string;
  kind: 'pdf' | 'csv';
  storageObjectId: string | null;
  createdAt: Date;
}

export class ManufacturingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Les prix, prêts à être consultés par référence. */
  async prices(organizationId: string): Promise<Map<string, Money>> {
    const rows = await this.db
      .selectFrom('material_prices')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .execute();

    return new Map(
      rows.map((row) => [
        row.reference,
        // `bigint` revient en chaîne : le pilote refuse de perdre de la précision, et il
        // a raison. La conversion est explicite, ici et nulle part ailleurs.
        { amount: Number(row.amount_minor), currency: row.currency },
      ]),
    );
  }

  async savePrice(
    organizationId: string,
    reference: string,
    price: Money,
  ): Promise<void> {
    await this.db
      .insertInto('material_prices')
      .values({
        organization_id: organizationId,
        reference,
        amount_minor: String(price.amount),
        currency: price.currency,
      })
      .onConflict((conflict) =>
        conflict.columns(['organization_id', 'reference']).doUpdateSet({
          amount_minor: String(price.amount),
          currency: price.currency,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  async deletePrice(organizationId: string, reference: string): Promise<void> {
    await this.db
      .deleteFrom('material_prices')
      .where('organization_id', '=', organizationId)
      .where('reference', '=', reference)
      .execute();
  }

  /** Enregistre l'instantané figé. Le dépôt chez Storage peut avoir échoué. */
  async recordExport(input: {
    organizationId: string;
    projectId: string;
    createdBy: string;
    kind: 'pdf' | 'csv';
    snapshot: unknown;
    storageObjectId: string | null;
  }): Promise<ProjectExport> {
    const row = await this.db
      .insertInto('project_exports')
      .values({
        id: uuidv7(),
        organization_id: input.organizationId,
        project_id: input.projectId,
        created_by: input.createdBy,
        kind: input.kind,
        snapshot: input.snapshot,
        storage_object_id: input.storageObjectId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toExport(row);
  }

  async listExports(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectExport[]> {
    const rows = await this.db
      .selectFrom('project_exports')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map(toExport);
  }
}

function toExport(row: {
  id: string;
  project_id: string;
  kind: 'pdf' | 'csv';
  storage_object_id: string | null;
  created_at: Date;
}): ProjectExport {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    storageObjectId: row.storage_object_id,
    createdAt: row.created_at,
  };
}
