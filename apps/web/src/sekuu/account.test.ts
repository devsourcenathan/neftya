// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signOut, type Session } from './session.js';
import { displayName, initials, switchTo } from './AccountMenu.js';

/**
 * Le compte local : nom, déconnexion, changement d'organisation.
 *
 * Le point qui compte est la déconnexion. Révoquer côté API **puis**
 * oublier ici : l'inverse laisserait un jeton valide dans `localStorage`
 * pendant que l'écran prétend le contraire.
 */

const originalFetch = globalThis.fetch;

const SESSION: Session = {
  accessToken: 'jeton-de-test',
  expiresAt: Date.now() + 900_000,
  user: {
    id: 'u1',
    firstName: 'Amina',
    lastName: 'Ngo',
    email: 'amina@example.test',
  },
  organizations: [{ id: 'o1', name: 'Atelier du Wouri', slug: 'wouri', role: 'owner' }],
  organizationId: 'o1',
  language: 'fr',
};

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
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('déconnexion', () => {
  it('révoque le rafraîchissement côté API, puis oublie', async () => {
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');
    const fetch = vi.fn(async () => ({ ok: true }) as Response);
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

    await signOut(SESSION);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    expect(url.endsWith('/v1/auth/logout')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toContain('jeton-stocke');
    expect(window.localStorage.getItem('neftya.refreshToken')).toBeNull();
  });

  it('oublie quand même si l’API ne répond pas', async () => {
    window.localStorage.setItem('neftya.refreshToken', 'jeton-stocke');
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as never;

    // Un bouton de déconnexion qui ne fait rien parce que le réseau a toussé est pire
    // qu'une déconnexion incomplète : la personne reste sur un écran connecté.
    await expect(signOut(SESSION)).resolves.toBeUndefined();
    expect(window.localStorage.getItem('neftya.refreshToken')).toBeNull();
  });
});

describe('comment quelqu’un est nommé', () => {
  it('prend son nom quand il en a un', () => {
    expect(displayName(SESSION)).toBe('Amina Ngo');
    expect(initials(SESSION)).toBe('AN');
  });

  it('retombe sur l’adresse quand il n’en a pas', () => {
    const anonymous: Session = {
      ...SESSION,
      user: { ...SESSION.user, firstName: '', lastName: '' },
    };

    expect(displayName(anonymous)).toBe('amina@example.test');
    expect(initials(anonymous)).toBe('A');
  });

  it('ne rend jamais un rond vide', () => {
    const nameless: Session = {
      ...SESSION,
      user: { ...SESSION.user, firstName: '', lastName: '', email: '' },
    };

    expect(initials(nameless)).toBe('?');
    expect(displayName(nameless)).toBe('—');
  });
});

describe('changer d’organisation', () => {
  const spies = () => ({
    forgetCache: vi.fn(),
    goHome: vi.fn(async () => undefined),
  });

  it('vide le cache et revient à l’accueil, dans cet ordre', async () => {
    const order: string[] = [];
    const actions = {
      choose: vi.fn(async () => {
        order.push('choose');
        return true;
      }),
      forgetCache: vi.fn(() => {
        order.push('cache');
      }),
      goHome: vi.fn(async () => {
        order.push('home');
      }),
    };

    await expect(switchTo('o2', actions)).resolves.toBe(true);

    // Projets, réglages et modèles chargés appartiennent à l'organisation qu'on quitte.
    // Sans le vidage, l'écran affiche les données de l'ancienne sous le nom de la
    // nouvelle — et rien ne le signale.
    expect(order).toEqual(['choose', 'cache', 'home']);
  });

  it('ne touche à rien quand le changement échoue', async () => {
    const actions = { choose: vi.fn(async () => false), ...spies() };

    await expect(switchTo('o2', actions)).resolves.toBe(false);

    // Vider l'écran de quelqu'un dont l'adhésion a été révoquée le laisserait devant une
    // application vide, sans lui dire ce qui s'est passé.
    expect(actions.forgetCache).not.toHaveBeenCalled();
    expect(actions.goHome).not.toHaveBeenCalled();
  });

  it('quitte la page du projet en cours', async () => {
    const actions = { choose: vi.fn(async () => true), ...spies() };

    await switchTo('o2', actions);

    // Un projet ouvert n'existe pas chez la nouvelle organisation : y rester répondrait
    // 404 sans expliquer pourquoi.
    expect(actions.goHome).toHaveBeenCalledTimes(1);
  });
});
