import { describe, it, expect, afterEach } from 'vitest';
import { connectionString, createHarness } from './harness.js';

/**
 * Le refus du banc d'essai quand il ne sait pas où il écrit.
 *
 * Ce test porte sur ce qui a laissé passer un défaut pendant un mois : un repli sur
 * `localhost:5442` répondait quand `DATABASE_URL` n'arrivait pas jusqu'aux tests, et la
 * suite travaillait ailleurs qu'on croyait sans jamais s'en plaindre.
 *
 * Il ne vérifie pas qu'une erreur est levée — il vérifie qu'elle **nomme la variable**.
 * Une erreur qui ne la nomme pas renvoie à une heure de recherche, ce qui est exactement
 * le coût que le repli prétendait éviter.
 */

const ABSENT = Symbol('absent');

function withoutDatabaseUrl<T>(body: () => T): T {
  const saved = 'DATABASE_URL' in process.env ? process.env['DATABASE_URL'] : ABSENT;
  delete process.env['DATABASE_URL'];
  try {
    return body();
  } finally {
    if (saved === ABSENT) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = saved as string;
    }
  }
}

afterEach(() => {
  // Les autres fichiers tournent dans un autre processus, mais celui-ci doit se rendre
  // intact : un test qui laisse l'environnement abîmé fait échouer son voisin.
  expect(process.env['DATABASE_URL']).toBeTruthy();
});

describe('quand DATABASE_URL manque', () => {
  it('refuse, au lieu de composer un port plausible', () => {
    withoutDatabaseUrl(() => {
      expect(() => connectionString()).toThrow(/DATABASE_URL/);
    });
  });

  it('dit où la renseigner', () => {
    withoutDatabaseUrl(() => {
      // Le message doit suffire : qui lit cette erreur n'a pas le code sous les yeux.
      expect(() => connectionString()).toThrow(/\.env/);
    });
  });

  it("n'ouvre aucune connexion avant de refuser", async () => {
    await withoutDatabaseUrl(async () => {
      // Un refus qui arriverait après la première requête aurait déjà créé un schéma
      // quelque part — et ce « quelque part » est précisément l'inconnue.
      await expect(createHarness('test_refus')).rejects.toThrow(/DATABASE_URL/);
    });
  });
});

describe('quand elle est là', () => {
  it('la rend telle quelle', () => {
    expect(connectionString()).toBe(process.env['DATABASE_URL']);
  });
});
