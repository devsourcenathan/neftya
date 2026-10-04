import { describe, it, expect, vi } from 'vitest';
import { CONNECT_ATTEMPTS, withConnectRetry } from './index.js';

/**
 * Le réessai à l'ouverture d'une connexion.
 *
 * Il vient d'un `500` observé sur une inscription : trois lectures rendues parallèles ont
 * ouvert trois connexions d'un coup sur une base serverless endormie, et l'une s'est fait
 * fermer au nez — « Connection terminated unexpectedly ». Cent quatre secondes, et une
 * erreur interne, alors que la base répondait une seconde plus tard.
 *
 * Deux choses se vérifient ici, et la seconde compte autant que la première : **seule
 * l'ouverture est réessayée**. Rejouer une requête dont on ne sait pas si elle a abouti
 * créerait deux projets pour un clic.
 */

/** Un pool qui échoue `failures` fois, puis rend une connexion. */
function flaky(failures: number) {
  let attempts = 0;

  return {
    attempts: () => attempts,
    pool: {
      connect: async () => {
        attempts += 1;
        if (attempts <= failures) {
          throw new Error('Connection terminated unexpectedly');
        }
        return { client: 'ouvert' };
      },
    },
  };
}

const immediately = async () => {};

describe('ouvrir une connexion', () => {
  it('réussit du premier coup quand la base est éveillée', async () => {
    const { pool, attempts } = flaky(0);

    await expect(withConnectRetry(pool, immediately).connect()).resolves.toEqual({
      client: 'ouvert',
    });
    expect(attempts()).toBe(1);
  });

  it('rattrape un réveil de base', async () => {
    const { pool, attempts } = flaky(2);

    await expect(withConnectRetry(pool, immediately).connect()).resolves.toEqual({
      client: 'ouvert',
    });
    // Le réveil a coûté deux tentatives ; l'appelant n'a rien vu.
    expect(attempts()).toBe(3);
  });

  it('renonce au bout de trois essais, et rend l’erreur d’origine', async () => {
    const { pool, attempts } = flaky(99);

    await expect(withConnectRetry(pool, immediately).connect()).rejects.toThrow(
      'Connection terminated unexpectedly',
    );

    /*
     * **Trois, écrit en clair.**
     *
     * Ce test disait `toBe(CONNECT_ATTEMPTS)` : il lisait la constante, donc il suivait
     * n'importe quelle valeur qu'on lui donnait. Porter le plafond à cinquante le laissait
     * passer — et un réessai sans fin masque une panne au lieu de la rattraper.
     */
    expect(attempts()).toBe(3);
    expect(CONNECT_ATTEMPTS).toBe(3);
  });

  it('ne retient pas l’appelant plus d’une seconde', async () => {
    const delays: number[] = [];
    const { pool } = flaky(99);

    await withConnectRetry(pool, async (ms) => {
      delays.push(ms);
    })
      .connect()
      .catch(() => {});

    // Une attente qui s'allonge finit par ressembler à une panne pour celui qui attend.
    const total = delays.reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeLessThanOrEqual(1_000);
  });

  it('espace les essais, au lieu de marteler', async () => {
    const delays: number[] = [];
    const { pool } = flaky(2);

    await withConnectRetry(pool, async (ms) => {
      delays.push(ms);
    }).connect();

    // Croissant : une base qui met du temps à se réveiller a le temps de le faire.
    expect(delays).toEqual([250, 500]);
  });
});

describe('la forme à rappel', () => {
  it('passe telle quelle, et aboutit', async () => {
    /*
     * **Le test qui manquait.**
     *
     * L'enveloppe n'acceptait que `connect()`. Or `pool.query()` appelle
     * `connect(callback)` par-dessous : le rappel était ignoré, le pool attendait
     * indéfiniment, et les soixante `beforeAll` du banc d'essai dépassaient leur délai
     * d'un coup. Dix-huit fichiers en échec, pour une enveloppe de quinze lignes.
     */
    let received: unknown = null;

    const pool = withConnectRetry({
      connect: ((...args: unknown[]) => {
        const callback = args[0] as (error: unknown, client: unknown) => void;
        callback(null, { client: 'par rappel' });
      }) as never,
    });

    (pool.connect as unknown as (cb: (e: unknown, c: unknown) => void) => void)(
      (_error, client) => {
        received = client;
      },
    );

    expect(received).toEqual({ client: 'par rappel' });
  });

  it('n’empêche pas la forme promise de réessayer', async () => {
    const { pool, attempts } = flaky(1);

    await withConnectRetry(pool, immediately).connect();

    expect(attempts()).toBe(2);
  });
});

describe('ce qui n’est pas réessayé', () => {
  it('une requête qui échoue échoue, une seule fois', async () => {
    const query = vi.fn(async () => {
      throw new Error('deadlock detected');
    });

    const pool = withConnectRetry({
      connect: async () => ({ query }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const client = (await pool.connect()) as { query: () => Promise<unknown> };
    await expect(client.query()).rejects.toThrow('deadlock');

    /*
     * Une seule fois, et c'est le point.
     *
     * Un réessai posé sur la requête rejouerait un `INSERT` dont on ne sait pas s'il a
     * abouti — l'ouverture d'une connexion, elle, n'a aucun effet de bord.
     */
    expect(query).toHaveBeenCalledTimes(1);
  });
});
