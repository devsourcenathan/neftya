// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  forgetOrganization,
  login,
  openSession,
  refresh,
  register,
  signOut,
  switchOrganization,
} from './session.js';

/**
 * La session locale — inscription, connexion, rotation, choix d'organisation.
 *
 * Deux invariants portent tout, comme avant avec Sekuu :
 *
 * 1. **Un seul rafraîchissement à la fois.** Le jeton tourne à chaque usage :
 *    deux appels concurrents dont le second rejoue l'ancien révoqueraient
 *    toute la session côté API.
 * 2. **Le choix d'organisation survit, le jeton non.** Le rafraîchissement
 *    dort dans `localStorage`, l'accès en mémoire.
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
  { id: 'org-1', name: 'Atelier Ngo', slug: 'ngo', role: 'owner' },
  { id: 'org-2', name: 'Atelier Fouda', slug: 'fouda', role: 'member' },
];

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function api(options: {
  register?: () => Response | Promise<Response>;
  login?: () => Response | Promise<Response>;
  refresh?: () => Response | Promise<Response>;
  switch?: () => Response | Promise<Response>;
  logout?: () => Response | Promise<Response>;
}) {
  const calls = { register: 0, login: 0, refresh: 0, switch: 0, logout: 0 };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/v1/auth/register')) {
      calls.register += 1;
      return (
        options.register?.() ??
        json({ success: true, data: freshSession('org-1', [ORGANIZATIONS[0]!]) })
      );
    }
    if (url.includes('/v1/auth/login')) {
      calls.login += 1;
      return (
        options.login?.() ??
        json({ success: true, data: freshSession(null, ORGANIZATIONS) })
      );
    }
    if (url.includes('/v1/auth/refresh')) {
      calls.refresh += 1;
      return (
        options.refresh?.() ??
        json({ success: true, data: freshSession('org-1', [ORGANIZATIONS[0]!]) })
      );
    }
    if (url.includes('/v1/auth/switch')) {
      calls.switch += 1;
      return (
        options.switch?.() ??
        json({ success: true, data: freshSession('org-1', ORGANIZATIONS) })
      );
    }
    if (url.includes('/v1/auth/logout')) {
      calls.logout += 1;
      return options.logout?.() ?? json({ success: true, data: { loggedOut: true } });
    }
    throw new Error(`Appel inattendu : ${url}`);
  });
  globalThis.fetch = fetcher as unknown as typeof fetch;
  return calls;
}

function freshSession(
  organizationId: string | null,
  organizations: typeof ORGANIZATIONS,
) {
  return {
    accessToken: token({ org: organizationId }),
    refreshToken: 'rafraichissement-opaque',
    expiresIn: 900,
    user: {
      id: 'u1',
      email: 'amina@example.test',
      firstName: 'Amina',
      lastName: 'Ngo',
    },
    organizations,
    organizationId,
  };
}

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
  // **Avant** de rendre le vrai `fetch`, sans quoi ce drainage sort sur le réseau.
  window.localStorage.setItem('neftya.refreshToken', 'drainage');
  await refresh().catch(() => {});
  window.localStorage.clear();
  globalThis.fetch = originalFetch;
});

describe('inscription et connexion', () => {
  it('adopte la session rendue par l’inscription', async () => {
    api({});
    const session = await register({
      email: 'amina@example.test',
      password: 'mot-de-passe-long',
      firstName: 'Amina',
      lastName: 'Ngo',
      organizationName: 'Atelier Ngo',
    });

    expect(session.organizationId).toBe('org-1');
    expect(window.localStorage.getItem('neftya.refreshToken')).toBe(
      'rafraichissement-opaque',
    );
  });

  it('rejette des identifiants refusés avec le message de l’API', async () => {
    api({
      login: () =>
        json(
          {
            success: false,
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Email ou mot de passe incorrect.',
            },
          },
          401,
        ),
    });

    await expect(
      login({ email: 'amina@example.test', password: 'mauvais-mot-de-passe' }),
    ).rejects.toThrow('Email ou mot de passe incorrect.');
  });
});

describe('un seul rafraîchissement à la fois', () => {
  it('ne rejoue pas le jeton quand deux appels partent ensemble', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = api({
      refresh: async () => {
        await held;
        return json({
          success: true,
          data: freshSession('org-1', [ORGANIZATIONS[0]!]),
        });
      },
    });

    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');
    const [first, second] = [refresh(), refresh()];
    release?.();
    const [a, b] = await Promise.all([first, second]);

    // Deux appels auraient rejoué le jeton, donc révoqué la session entière.
    expect(calls.refresh).toBe(1);
    expect(a).toBe(b);
  });

  it('rafraîchit de nouveau une fois le précédent retombé', async () => {
    const calls = api({});
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');

    await refresh();
    await refresh();

    // La sérialisation n'est pas un cache : un jeton expiré doit pouvoir être remplacé.
    expect(calls.refresh).toBe(2);
  });

  it('retombe anonyme quand l’API révoque, et oublie le jeton', async () => {
    api({ refresh: () => json({ message: 'non' }, 401) });
    window.localStorage.setItem('neftya.refreshToken', 'jeton-vole');

    await expect(refresh()).rejects.toThrow();
    expect(window.localStorage.getItem('neftya.refreshToken')).toBeNull();
  });
});

describe('choix d’organisation', () => {
  it('reprend le choix précédent quand il est toujours valide', async () => {
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');
    window.localStorage.setItem('neftya.organization', 'org-2');
    const calls = api({
      refresh: () => json({ success: true, data: freshSession(null, ORGANIZATIONS) }),
      switch: () => json({ success: true, data: freshSession('org-2', ORGANIZATIONS) }),
    });

    const session = await openSession();

    expect(calls.switch).toBe(1);
    expect(session.organizationId).toBe('org-2');
  });

  it('laisse le choix à l’utilisateur quand il y en a plusieurs', async () => {
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');
    const calls = api({
      refresh: () => json({ success: true, data: freshSession(null, ORGANIZATIONS) }),
    });

    const session = await openSession();

    expect(calls.switch).toBe(0);
    expect(session.organizationId).toBeNull();
  });

  it('est anonyme sans jeton stocké', async () => {
    api({});
    await expect(openSession()).rejects.toThrow('Aucune session locale.');
  });

  it('change d’organisation et mémorise le choix', async () => {
    const calls = api({});
    const current = await register({
      email: 'amina@example.test',
      password: 'mot-de-passe-long',
      firstName: 'Amina',
      lastName: 'Ngo',
      organizationName: 'Atelier Ngo',
    });

    const next = await switchOrganization(current, 'org-2');

    expect(calls.switch).toBe(1);
    expect(next.organizationId).toBe('org-1');
    expect(window.localStorage.getItem('neftya.organization')).toBe('org-2');
  });
});

describe('déconnexion', () => {
  it('révoque côté API puis oublie tout', async () => {
    const calls = api({});
    const current = await register({
      email: 'amina@example.test',
      password: 'mot-de-passe-long',
      firstName: 'Amina',
      lastName: 'Ngo',
      organizationName: 'Atelier Ngo',
    });
    await signOut(current);

    expect(calls.logout).toBe(1);
    expect(window.localStorage.getItem('neftya.refreshToken')).toBeNull();
  });

  it('oublie quand même si l’API ne répond pas', async () => {
    api({
      logout: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');

    await expect(signOut(null)).resolves.toBeUndefined();
    expect(window.localStorage.getItem('neftya.refreshToken')).toBeNull();
  });
});
