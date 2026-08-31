import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';

/**
 * Les réglages Neftya d'une organisation.
 *
 * `country` et `currency` sont **nuls par défaut**, et nul veut dire « suivre la
 * plateforme ». Recopier la valeur de Sekuu à la création la figerait : le client qui
 * corrige son pays chez Sekuu garderait l'ancien ici, sans savoir pourquoi.
 *
 * @see docs/I18N.md §3
 */

export interface OrganizationSettings {
  organizationId: string;
  country: string | null;
  currency: string | null;
  unitSystem: 'metric' | 'imperial';
}

export class SettingsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async get(organizationId: string): Promise<OrganizationSettings> {
    const row = await this.db
      .selectFrom('organization_settings')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return row
      ? {
          organizationId: row.organization_id,
          country: row.country,
          currency: row.currency,
          unitSystem: row.unit_system,
        }
      : { organizationId, country: null, currency: null, unitSystem: 'metric' };
  }

  async save(
    organizationId: string,
    changes: Partial<Omit<OrganizationSettings, 'organizationId'>>,
  ): Promise<OrganizationSettings> {
    const current = await this.get(organizationId);
    const next = { ...current, ...changes };

    const row = await this.db
      .insertInto('organization_settings')
      .values({
        organization_id: organizationId,
        country: next.country,
        currency: next.currency,
        unit_system: next.unitSystem,
      })
      .onConflict((conflict) =>
        conflict.column('organization_id').doUpdateSet({
          country: next.country,
          currency: next.currency,
          unit_system: next.unitSystem,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      organizationId: row.organization_id,
      country: row.country,
      currency: row.currency,
      unitSystem: row.unit_system,
    };
  }
}
