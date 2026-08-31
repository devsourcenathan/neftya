import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { backup, restore, toolsAvailable } from './backup.js';
import { createHarness, type Harness } from '../test-support/harness.js';

/**
 * **Le va-et-vient complet, pour de vrai.**
 *
 * Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un fichier
 * dont on espère quelque chose. Ce test écrit des données, les sauvegarde, **détruit le
 * schéma**, restaure, et vérifie que tout est revenu — identique, pas approchant.
 *
 * Il ne se contente pas de vérifier que les commandes rendent zéro. C'est exactement
 * l'erreur qui fait découvrir, le jour de l'incident, qu'on sauvegardait une base vide.
 *
 * @see docs/OPERATIONS.md §5
 */

const SCHEMA = 'test_sauvegarde';
const CONNECTION =
  process.env['DATABASE_URL'] ?? 'postgres://neftya:neftya@localhost:5442/neftya';

let harness: Harness;
let directory: string;

const REFERENCE = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

beforeAll(async () => {
  harness = await createHarness(SCHEMA);
  directory = mkdtempSync(join(tmpdir(), 'neftya-sauvegarde-'));
});

afterAll(async () => {
  await harness.close();
  rmSync(directory, { recursive: true, force: true });
});

async function query<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const pool = new pg.Pool({
    connectionString: CONNECTION,
    max: 1,
    options: `-c search_path=${SCHEMA}`,
  });

  try {
    return (await pool.query<T>(sql)).rows;
  } finally {
    await pool.end();
  }
}

describe('sauvegarde et restauration', () => {
  it('les outils PostgreSQL sont disponibles', async () => {
    // Ce test **échoue** au lieu de s'ignorer quand `pg_dump` manque. Un test de
    // sauvegarde qui se saute tout seul est un test qui n'a jamais tourné, et personne
    // ne s'en aperçoit avant l'incident.
    expect(await toolsAvailable()).toBe(true);
  });

  /**
   * Délai relevé explicitement : ce test lance **deux processus externes**, `pg_dump` et
   * `pg_restore`, et compresse en chemin. Cinq secondes suffisent sur une machine au repos
   * et pas sur une machine chargée — ce qui produisait un échec intermittent sans rapport
   * avec la sauvegarde.
   *
   * Contrairement au test de placement, celui-ci ne peut pas être rendu rapide : sa lenteur
   * **est** ce qu'il mesure. Relever le délai est ici la bonne réponse, et c'est la seule
   * fois où elle l'est.
   */
  it(
    'restaure à l’identique après destruction du schéma',
    { timeout: 60_000 },
    async () => {
      const headers = await harness.authorization();

      const created = await harness.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers,
        payload: { name: 'Bibliothèque', model: REFERENCE },
      });
      expect(created.statusCode).toBe(201);

      await harness.app.inject({
        method: 'PUT',
        url: '/v1/settings',
        headers,
        payload: { country: 'CM', currency: 'XAF' },
      });
      await harness.app.inject({
        method: 'PUT',
        url: '/v1/prices',
        headers,
        payload: { reference: 'panel:mdf:18', amountMinor: 15_000, currency: 'XAF' },
      });

      const before = {
        projects: await query('SELECT * FROM projects ORDER BY id'),
        settings: await query(
          'SELECT * FROM organization_settings ORDER BY organization_id',
        ),
        prices: await query('SELECT * FROM material_prices ORDER BY reference'),
      };

      expect(before.projects).toHaveLength(1);

      const file = join(directory, 'neftya.dump');
      await backup({ connectionString: CONNECTION, file, schema: SCHEMA });

      // Un fichier vide est le symptôme classique d'une sauvegarde qui « réussit ».
      expect(statSync(file).size).toBeGreaterThan(1024);

      // La destruction, pour de bon.
      await query(`DROP SCHEMA ${SCHEMA} CASCADE`);
      await expect(query('SELECT * FROM projects')).rejects.toThrow();

      await restore({ connectionString: CONNECTION, file });

      const after = {
        projects: await query('SELECT * FROM projects ORDER BY id'),
        settings: await query(
          'SELECT * FROM organization_settings ORDER BY organization_id',
        ),
        prices: await query('SELECT * FROM material_prices ORDER BY reference'),
      };

      // À l'identique : mêmes identifiants, même modèle `jsonb`, mêmes horodatages, même
      // montant. « Presque » ne suffirait pas — un projet restauré avec un autre identifiant
      // casserait tous les exports qui le citent.
      expect(after).toEqual(before);
    },
  );

  it('l’application fonctionne sur la base restaurée', async () => {
    // Restaurer des lignes ne prouve rien si les index, les contraintes et les valeurs
    // par défaut ne sont pas revenus avec.
    const headers = await harness.authorization();

    const listed = await harness.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers,
    });
    expect(listed.json().data).toHaveLength(1);

    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { name: 'Après restauration', model: REFERENCE },
    });
    expect(created.statusCode).toBe(201);

    // La contrainte de nom non vide doit être revenue elle aussi.
    const refused = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { name: '   ', model: REFERENCE },
    });
    expect(refused.statusCode).toBe(422);
  });

  it('refuse un fichier de sauvegarde inexistant au lieu de ne rien faire', async () => {
    await expect(
      restore({ connectionString: CONNECTION, file: join(directory, 'absent.dump') }),
    ).rejects.toThrow(/pg_restore/u);
  });
});
