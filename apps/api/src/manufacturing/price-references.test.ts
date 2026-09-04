import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import {
  createHarness,
  ORGANIZATION_A,
  ORGANIZATION_B,
  type Harness,
} from '../test-support/harness.js';

/**
 * Les prix orphelins du catalogue de quincaillerie.
 *
 * Le 2 septembre 2026, `accessory:hinge` est devenu `accessory:hinge_35_110` : un perçage
 * n'existe pas pour « une charnière » mais pour une charnière donnée. Les prix déjà saisis
 * sont restés sur les anciennes clés, donc invisibles au devis.
 *
 * La migration reporte les **renommages exacts**, et laisse en place ce qui ne l'est pas.
 * Ce test vérifie les deux, parce que le second est une décision et non un oubli.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_prix_references');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

/**
 * Rejoue **le fichier de migration**, et non une copie de son contenu.
 *
 * Une copie passerait le test tout en laissant le fichier livré dire autre chose. C'est le
 * genre de divergence qui ne se voit qu'en production, sur une base qu'on ne peut plus
 * remettre en arrière.
 */
const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
  '0004_hardware_price_references.sql',
);

async function migrate(): Promise<void> {
  await sql.raw(readFileSync(MIGRATION, 'utf8')).execute(harness.db);
}

const price = async (
  reference: string,
  amountMinor: number,
  organizationId = ORGANIZATION_A,
) =>
  await harness.db
    .insertInto('material_prices')
    .values({
      organization_id: organizationId,
      reference,
      // La colonne est un `bigint` : Kysely la veut en chaîne.
      amount_minor: String(amountMinor),
      currency: 'XAF',
    })
    .execute();

const references = async (organizationId = ORGANIZATION_A) =>
  (
    await harness.db
      .selectFrom('material_prices')
      .select(['reference', 'amount_minor'])
      .where('organization_id', '=', organizationId)
      .orderBy('reference')
      .execute()
  ).map((row) => [row.reference, Number(row.amount_minor)] as const);

describe('les renommages exacts', () => {
  it('reportent le prix sur la nouvelle référence', async () => {
    await price('accessory:hinge', 850);
    await price('accessory:dowel_8', 30);
    await price('accessory:shelf_support', 45);

    await migrate();

    expect(await references()).toEqual([
      ['accessory:dowel_8x30', 30],
      ['accessory:hinge_35_110', 850],
      ['accessory:shelf_support_5', 45],
    ]);
  });

  it('gardent le montant, à l’unité mineure près', async () => {
    await price('accessory:hinge', 1_234);
    await migrate();

    // Un report qui arrondirait un montant produirait un devis faux, et personne ne
    // relirait un nombre qui s'affiche.
    expect(await references()).toEqual([['accessory:hinge_35_110', 1_234]]);
  });

  it('ne touchent pas aux autres organisations', async () => {
    await price('accessory:hinge', 850, ORGANIZATION_A);
    await price('accessory:hinge', 990, ORGANIZATION_B);

    await migrate();

    expect(await references(ORGANIZATION_A)).toEqual([['accessory:hinge_35_110', 850]]);
    expect(await references(ORGANIZATION_B)).toEqual([['accessory:hinge_35_110', 990]]);
  });

  it('laissent la nouvelle référence gagner quand les deux existent', async () => {
    await price('accessory:hinge', 850);
    await price('accessory:hinge_35_110', 900);

    await migrate();

    // La plus récente a été saisie en connaissance du changement. L'écraser reviendrait à
    // rendre un prix corrigé à sa valeur d'avant.
    const rows = await references();
    expect(rows).toContainEqual(['accessory:hinge_35_110', 900]);
  });

  it('se rejouent sans dommage', async () => {
    await price('accessory:hinge', 850);

    await migrate();
    await migrate();

    // Une migration doit pouvoir tourner deux fois : une reprise après incident la
    // rejouera.
    expect(await references()).toEqual([['accessory:hinge_35_110', 850]]);
  });
});

describe('ce qui reste orphelin, et c’est voulu', () => {
  it('laisse le prix des coulisses là où il est', async () => {
    await price('accessory:drawer_slide_pair', 4_500);

    await migrate();

    // `drawer_slide_pair` correspond maintenant à six références, et une coulisse de 250
    // ne coûte pas ce que coûte une de 500. Recopier le montant sur les six inventerait
    // cinq tarifs — précisément ce que le changement de référence visait à empêcher.
    expect(await references()).toEqual([['accessory:drawer_slide_pair', 4_500]]);
  });

  it('n’invente aucun prix de longueur', async () => {
    await price('accessory:drawer_slide_pair', 4_500);

    await migrate();

    const created = (await references()).filter(([reference]) =>
      reference.startsWith('accessory:slide_ball_'),
    );

    expect(created).toEqual([]);
  });
});
