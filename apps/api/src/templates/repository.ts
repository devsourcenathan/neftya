import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { LocalisedName } from '@neftya/contracts';
import type { ParsedFurnitureInput } from '@neftya/engine';
import type { Database } from '../db/schema.js';

/**
 * Les modèles d'une organisation.
 *
 * Comme partout, `organizationId` est le premier paramètre de chaque méthode : on ne peut
 * pas écrire une requête sans dire pour quelle organisation.
 */

export interface Template {
  id: string;
  name: LocalisedName;
  model: ParsedFurnitureInput;
  createdBy: string;
  updatedAt: Date;
}

export class TemplateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(organizationId: string): Promise<Template[]> {
    const rows = await this.db
      .selectFrom('templates')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc')
      .execute();

    return rows.map(toTemplate);
  }

  async create(input: {
    organizationId: string;
    createdBy: string;
    name: LocalisedName;
    model: ParsedFurnitureInput;
  }): Promise<Template> {
    const row = await this.db
      .insertInto('templates')
      .values({
        id: uuidv7(),
        organization_id: input.organizationId,
        created_by: input.createdBy,
        name: input.name,
        model: input.model,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTemplate(row);
  }

  /** Suppression douce, comme pour un projet : un modèle est de la donnée de travail. */
  async softDelete(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .updateTable('templates')
      .set({ deleted_at: new Date() })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst();

    return row !== undefined;
  }

  async count(organizationId: string): Promise<number> {
    const row = await this.db
      .selectFrom('templates')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    return Number(row.total);
  }
}

function toTemplate(row: {
  id: string;
  name: LocalisedName;
  model: ParsedFurnitureInput;
  created_by: string;
  updated_at: Date;
}): Template {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}
