// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openSession, refresh, forgetOrganization } from './session.js';

/**
 * L'ouverture de session — les deux pièges du contrat Identity.
 *
 * Ces deux points figuraient dans la liste de contrôle de SEKUU.md §10 sans test, donc
 * sans preuve. Ils sont tous les deux du genre qui marche à la main et casse en charge :
 *
 * 1. **Un seul rafraîchissement à la fois.** Le jeton de rafraîchissement ne se rejoue
 *    pas — le rejouer révoque la session entière, c'est la détection de vol et elle est
 *    volontairement brutale. Deux appels concurrents déconnectent l'utilisateur, ce qui
 *    arrive dès qu'une page lance deux requêtes au chargement.
 * 2. **`switch-organization` enchaîné.** Un jeton frais ne porte pas d'organisation.
 *    Sans l'enchaînement, Neftya voit un jeton valide, signé, non expiré, et refuse tout.
 *
 * @see docs/SEKUU.md §10
 */

const originalFetch = globalThis.fetch;

/** Un jeton dont seules les revendications comptent : la signature est l'affaire du serveur. */
function token(claims: Record<string, unknown>): string {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, ...claims }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `entete.${payload}.signature`;
}

const ORGANIZATIONS = [
  { id: 'org-1', name: 'Atelier Ngo', slug: 'ngo', roles: ['owner'] },
  { id: 'org-2', name: 'Atelier Fouda', slug: 'fouda', roles: ['member'] },
];

const body = (accessToken: string, organizations = ORGANIZATIONS) => ({
  data: {
    access_token: accessToken,
    organizations,
    user: {
      id: 'u1',
      first_name: 'Amina',
      last_name: 'Ngo',
      email: 'amina@example.test',
      language: 'fr',
    },
  },
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Compte les appels par point d'accès, pour pouvoir dire « une fois », pas « au moins une ». */
function identity(options: {
  refresh?: () => Response | Promise<Response>;
  switch?: () => Response | Promise<Response>;
}) {
  const calls = { refresh: 0, switch: 0 };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) {
      calls.refresh += 1;
      return options.refresh?.() ?? json(body(token({})));
    }
    if (url.includes('/auth/switch-organization')) {
      calls.switch += 1;
      return options.switch?.() ?? json(body(token({ org: 'org-1' })));
    }
    throw new Error(`Appel inattendu : ${url}`);
  });
  globalThis.fetch = fetcher as unknown as typeof fetch;
  return calls;
}

/**
 * Un `localStorage` de substitution, posé à la main.
 *
 * Celui de happy-dom est inutilisable sous Node 25, qui expose son propre `localStorage`
 * expérimental et le laisse sans méthodes quand aucun fichier n'est configuré. Le stocker
 * ici dans une `Map` rend le test indépendant de ce différend, et le choix d'organisation
 * est de toute façon la seule chose qu'on y lit.
 */
beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  });

  forgetOrganization();
});

afterEach(async () => {
  // Le rafraîchissement en cours est un état de module : le laisser en vol ferait réussir
  // ou échouer le test suivant selon l'ordre, ce qui est la pire espèce de test.
  //
  // **Avant** de rendre le vrai `fetch`, sans quoi ce drainage sort sur le réseau et va
  // chercher `identity.sekuu.com` pour de bon — ce qu'aucun test ne doit faire.
  await refresh().catch(() => {});
  globalThis.fetch = originalFetch;
});

describe('un seul rafraîchissement à la fois', () => {
  it('ne rejoue pas le jeton quand deux appels partent ensemble', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = identity({
      refresh: async () => {
        await held;
        return json(body(token({ org: 'org-1' })));
      },
    });

    const [first, second] = [refresh(), refresh()];
    release?.();
    const [a, b] = await Promise.all([first, second]);

    // Deux appels auraient rejoué le jeton, donc révoqué la session entière.
    expect(calls.refresh).toBe(1);
    expect(a).toBe(b);
  });

  it('rafraîchit de nouveau une fois le précédent retombé', async () => {
    const calls = identity({});

    await refresh();
    await refresh();

    // La sérialisation n'est pas un cache : un jeton expiré doit pouvoir être remplacé.
    expect(calls.refresh).toBe(2);
  });

  it('ne reste pas bloqué après un échec', async () => {
    const calls = identity({ refresh: () => json({ message: 'non' }, 401) });

    await expect(refresh()).rejects.toThrow();
    await expect(refresh()).rejects.toThrow();

    // Un verrou qu'un échec ne libère pas interdirait toute reconnexion sans recharger
    // la page.
    expect(calls.refresh).toBe(2);
  });
});

describe('switch-organization enchaîné après le rafraîchissement', () => {
  it('enchaîne quand il n’y a qu’une organisation', async () => {
    const calls = identity({
      refresh: () => json(body(token({}), [ORGANIZATIONS[0]!])),
    });

    const session = await openSession();

    // Sans cet appel, le jeton est valide et l'API refuse tout — le piège numéro un.
    expect(calls.switch).toBe(1);
    expect(session.organizationId).toBe('org-1');
  });

  it('n’enchaîne pas quand le jeton porte déjà une organisation', async () => {
    const calls = identity({ refresh: () => json(body(token({ org: 'org-2' }))) });

    const session = await openSession();

    // Un appel de trop écrirait un choix que personne n'a fait.
    expect(calls.switch).toBe(0);
    expect(session.organizationId).toBe('org-2');
  });

  it('laisse le choix à l’utilisateur quand il y en a plusieurs', async () => {
    const calls = identity({});

    const session = await openSession();

    expect(calls.switch).toBe(0);
    // `null` est la bonne réponse : choisir pour quelqu'un l'enfermerait dans une
    // organisation qu'il n'a pas demandée.
    expect(session.organizationId).toBeNull();
  });

  it('reprend le choix précédent quand il est toujours valide', async () => {
    window.localStorage.setItem('neftya.organization', 'org-2');
    const calls = identity({ switch: () => json(body(token({ org: 'org-2' }))) });

    const session = await openSession();

    expect(calls.switch).toBe(1);
    expect(session.organizationId).toBe('org-2');
  });

  it('ignore un choix qui n’est plus dans la liste', async () => {
    window.localStorage.setItem('neftya.organization', 'org-partie');
    const calls = identity({});

    const session = await openSession();

    // Quitter une organisation ne doit pas enfermer dans une erreur au prochain
    // chargement.
    expect(calls.switch).toBe(0);
    expect(session.organizationId).toBeNull();
  });
});
