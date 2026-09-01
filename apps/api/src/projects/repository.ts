import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { ParsedFurnitureInput } from '@neftya/engine';
import type { Database } from '../db/schema.js';

/**
 * L'accès aux projets.
 *
 * **Chaque méthode prend `organizationId` en premier paramètre**, et l'applique. Ce n'est
 * pas une convention de style : c'est ce qui rend impossible d'écrire une requête qui
 * l'oublie. DealerOS avait quarante gardes de cloisonnement copiées-collées dans ses
 * contrôleurs, dont une manquante — la faille venait de là.
 *
 * @see docs/SEKUU.md §4
 */

export interface Project {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  model: ParsedFurnitureInput;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Nombre d'exports figés. **Compté par la base, pas deviné.**
   *
   * C'est ce qui distingue un projet parti à l'atelier d'un brouillon, et la seule chose
   * qui le distingue : tout le reste — pièces, plan, devis — est recalculable à tout
   * moment et ne dit rien de l'avancement.
   */
  exportCount: number;
}

export class ProjectRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(organizationId: string): Promise<Project[]> {
    const rows = await this.db
      .selectFrom('projects')
      .selectAll()
      // Une sous-requête corrélée plutôt qu'une requête par projet : la liste doit tenir
      // en un aller-retour, quel que soit le nombre de projets.
      .select((eb) =>
        eb
          .selectFrom('project_exports')
          .select((inner) => inner.fn.countAll<string>().as('total'))
          .whereRef('project_exports.project_id', '=', 'projects.id')
          .where('project_exports.organization_id', '=', organizationId)
          .as('export_count'),
      )
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc')
      .execute();

    return rows.map(toProject);
  }

  /**
   * Rend `null` quand le projet appartient à une autre organisation, exactement comme
   * s'il n'existait pas. L'appelant répond alors `404` : distinguer `403` de `404` dirait
   * à qui essaie des identifiants au hasard lesquels existent.
   */
  async find(organizationId: string, id: string): Promise<Project | null> {
    const row = await this.db
      .selectFrom('projects')
      .selectAll()
      .select((eb) =>
        eb
          .selectFrom('project_exports')
          .select((inner) => inner.fn.countAll<string>().as('total'))
          .whereRef('project_exports.project_id', '=', 'projects.id')
          .where('project_exports.organization_id', '=', organizationId)
          .as('export_count'),
      )
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ? toProject(row) : null;
  }

  async countActive(organizationId: string): Promise<number> {
    const row = await this.db
      .selectFrom('projects')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    return Number(row.total);
  }

  async create(input: {
    organizationId: string;
    createdBy: string;
    name: string;
    model: ParsedFurnitureInput;
  }): Promise<Project> {
    const row = await this.db
      .insertInto('projects')
      .values({
        // UUIDv7 : ordonné dans le temps, donc localité d'index, sans exposer de compteur.
        id: uuidv7(),
        organization_id: input.organizationId,
        created_by: input.createdBy,
        name: input.name,
        model: input.model,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toProject(row);
  }

  async update(
    organizationId: string,
    id: string,
    changes: { name?: string; model?: ParsedFurnitureInput },
  ): Promise<Project | null> {
    const row = await this.db
      .updateTable('projects')
      .set({ ...changes, updated_at: new Date() })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row ? toProject(row) : null;
  }

  /** Suppression douce : un projet est de la donnée commerciale, pas un brouillon. */
  async softDelete(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .updateTable('projects')
      .set({ deleted_at: new Date() })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst();

    return row !== undefined;
  }
}

function toProject(row: {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  model: ParsedFurnitureInput;
  created_at: Date;
  updated_at: Date;
  export_count?: string | number | null;
}): Project {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    name: row.name,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // `count` revient en chaîne : le pilote refuse de perdre de la précision sur un
    // `bigint`, et il a raison. La conversion est explicite.
    exportCount: Number(row.export_count ?? 0),
  };
}
