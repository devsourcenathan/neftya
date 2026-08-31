import type { ColumnType } from 'kysely';
import type { ParsedFurnitureInput } from '@neftya/engine';

/**
 * Le schéma, tel que Kysely le voit.
 *
 * Deux règles y sont visibles à l'œil nu, et c'est voulu :
 *
 *  - **toute table porte `organization_id`**, et sa valeur vient du jeton ;
 *  - **il n'y a pas de table `users`** — l'identité vit sur la plateforme.
 *
 * Le modèle paramétrique est stocké en `jsonb` : c'est une structure qui évolue avec le
 * moteur, pas un schéma relationnel. Les données **dérivées** — liste de pièces, plan de
 * découpe — ne sont pas stockées, elles sont recalculées. Une seule exception, par nature :
 * l'instantané d'export, qui est figé.
 *
 * @see docs/ENGINEERING.md §6
 */

/** Écrit par la base à l'insertion, jamais renvoyé autrement qu'en `Date`. */
type CreatedAt = ColumnType<Date, undefined, never>;
type UpdatedAt = ColumnType<Date, undefined, Date>;
type DeletedAt = ColumnType<Date | null, undefined, Date | null>;

export interface ProjectsTable {
  /** UUIDv7, fabriqué par l'application : ordonné dans le temps, sans compteur exposé. */
  id: string;
  organization_id: string;
  /** Le `sub` du créateur. Une référence logique, jamais une clé étrangère. */
  created_by: string;
  name: string;
  /** L'entrée du moteur. Ce qui fait foi ; tout le reste s'en dérive. */
  model: ParsedFurnitureInput;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: DeletedAt;
}

export interface OrganizationSettingsTable {
  organization_id: string;
  /**
   * ISO 3166-1 alpha-2. `null` signifie « suivre la plateforme » : le jour où Sekuu expose
   * `organizations.country`, il devient la valeur par défaut sans aucune migration.
   *
   * @see docs/I18N.md §3
   */
  country: string | null;
  /** ISO 4217. Même règle que `country`. */
  currency: string | null;
  unit_system: 'metric' | 'imperial';
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Les prix saisis, par organisation.
 *
 * `reference` est la clé stable du moteur (`panel:mdf:18`), jamais un libellé traduit.
 *
 * @see docs/MANUFACTURING.md §5
 */
export interface MaterialPricesTable {
  organization_id: string;
  reference: string;
  /** Unités mineures. `bigint` côté base, lu en `string` par le pilote. */
  amount_minor: string;
  currency: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Les exports — **la seule donnée dérivée stockée**, et par nature.
 *
 * Un plan parti à l'atelier ne doit pas changer parce que le projet a été modifié depuis.
 * Tout le reste est recalculé ; celui-ci est figé.
 */
export interface ProjectExportsTable {
  id: string;
  organization_id: string;
  project_id: string;
  created_by: string;
  kind: 'pdf' | 'csv';
  snapshot: unknown;
  /** `null` quand Storage était indisponible : l'export reste consultable. */
  storage_object_id: string | null;
  created_at: CreatedAt;
}

export interface Database {
  projects: ProjectsTable;
  organization_settings: OrganizationSettingsTable;
  material_prices: MaterialPricesTable;
  project_exports: ProjectExportsTable;
}
