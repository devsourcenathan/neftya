// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { portalUrl, signOut, type Session } from './session.js';
import { displayName, initials, switchTo } from './AccountMenu.js';

/**
 * Le compte, l'abonnement et la déconnexion.
 *
 * Ce test existe à cause d'un manque réel, signalé par un utilisateur une fois la session
 * unique en place : depuis Neftya on ne pouvait **ni voir son compte, ni son abonnement,
 * ni se déconnecter**. La session fonctionnait ; il n'y avait simplement aucune porte de
 * sortie.
 *
 * Le point qui compte est la déconnexion. Vider le jeton en mémoire suffirait à faire
 * disparaître l'écran connecté — et laisserait la personne connectée sur tous les autres
 * produits Sekuu, pendant que celui-ci prétend le contraire.
 */

const originalFetch = globalThis.fetch;

/**
 * L'origine du portail, **lue du module** et non écrite ici.
 *
 * Elle vient d'une variable d'environnement : la coder en dur ferait passer ce test sur le
 * poste qui a un `.env.local` et échouer en intégration continue, ce qui est exactement le
 * contraire de ce qu'on demande à un test. On vérifie donc les invariants — le produit, le
 * retour, le chemin — pas l'adresse d'un déploiement.
 */
const PORTAL = new URL(portalUrl('login')).origin;

const SESSION: Session = {
  accessToken: 'jeton-de-test',
  expiresAt: Date.now() + 900_000,
  user: {
    id: 'u1',
    first_name: 'Amina',
    last_name: 'Ngo',
    email: 'amina@example.test',
    language: 'fr',
  },
  organizations: [
    { id: 'o1', name: 'Atelier du Wouri', slug: 'wouri', roles: ['owner'] },
  ],
  organizationId: 'o1',
  language: 'fr',
};

/**
 * `window.location` n'est pas assignable dans happy-dom : lui écrire `href` tenterait une
 * navigation. On l'échange contre un objet simple, et on lit où le code voulait aller.
 */
function captureNavigation(): { current: string } {
  const target = { current: '' };

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: 'http://neftya.sekuu.test:5174/projects/42',
      set: undefined,
    },
  });

  Object.defineProperty(window.location, 'href', {
    configurable: true,
    get: () => 'http://neftya.sekuu.test:5174/projects/42',
    set: (value: string) => {
      target.current = value;
    },
  });

  return target;
}

beforeEach(() => {
  captureNavigation();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('adresses du portail', () => {
  it('porte le produit là où il décide de quelque chose', () => {
    // `product` mène jusqu'au choix du plan. Sans lui, le portail connecte la personne,
    // la laisse créer une organisation, puis s'arrête — et Neftya répond 403 à un compte
    // qui vient pourtant d'être créé pour lui.
    for (const path of ['subscribe', 'subscription'] as const) {
      expect(portalUrl(path)).toContain('product=neftya');
    }
  });

  it('ne le porte pas là où il ne décide de rien', () => {
    for (const path of ['login', 'register', 'account'] as const) {
      expect(portalUrl(path)).not.toContain('product=');
    }
  });

  it('ramène toujours là d’où l’on vient, encodé', () => {
    const target = 'http://neftya.sekuu.test:5174/projects/42?vue=3d';

    for (const path of [
      'login',
      'register',
      'subscribe',
      'subscription',
      'account',
    ] as const) {
      const url = portalUrl(path, target);

      // Encodé, sinon le `?vue=3d` de la cible devient un paramètre du portail et la
      // redirection retombe sur une page tronquée.
      expect(url).toContain(`redirect=${encodeURIComponent(target)}`);
      expect(url.startsWith(`${PORTAL}/`)).toBe(true);
    }
  });

  it('mène le compte à la racine du portail', () => {
    // L'aperçu du compte n'a pas de chemin à lui ; inventer `/account` mènerait à un 404
    // chez la plateforme.
    expect(portalUrl('account').startsWith(`${PORTAL}/?`)).toBe(true);
  });
});

describe('déconnexion', () => {
  it('la demande à la plateforme, avec le cookie et le jeton', async () => {
    const fetch = vi.fn(async () => ({ ok: true }) as Response);
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

    await signOut(SESSION);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    // Le chemin, pas l'origine : Neftya distingue Identity — qu'il appelle — du portail —
    // où il navigue. En production ce sont deux hôtes, et les confondre ferait passer ce
    // test en local pour rien.
    expect(url.endsWith('/api/v1/auth/logout')).toBe(true);
    expect(init.method).toBe('POST');
    // Sans le cookie, la plateforme ne sait pas quelle session révoquer : la personne
    // resterait connectée sur tous les autres produits.
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer jeton-de-test',
    );
  });

  it('renvoie au portail sans redirection de retour', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true }) as Response) as never;
    const navigation = captureNavigation();

    await signOut(SESSION);

    // Renvoyer quelqu'un qui vient de se déconnecter là d'où il vient le reconnecterait
    // aussitôt, tant que le cookie de l'appareil est encore valide.
    expect(navigation.current).toBe(`${PORTAL}/login`);
    expect(navigation.current).not.toContain('redirect=');
  });

  it('sort quand même si la plateforme ne répond pas', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as never;
    const navigation = captureNavigation();

    // Un bouton de déconnexion qui ne fait rien parce que le réseau a toussé est pire
    // qu'une déconnexion incomplète : la personne reste sur un écran connecté.
    await expect(signOut(SESSION)).resolves.toBeUndefined();
    expect(navigation.current).toBe(`${PORTAL}/login`);
  });
});

describe('comment quelqu’un est nommé', () => {
  it('prend son nom quand il en a un', () => {
    expect(displayName(SESSION)).toBe('Amina Ngo');
    expect(initials(SESSION)).toBe('AN');
  });

  it('retombe sur l’adresse quand il n’en a pas', () => {
    // Quelqu'un qui s'inscrit par téléphone n'a pas encore de nom, et la barre doit tout
    // de même afficher quelque chose qui l'identifie.
    const anonymous: Session = {
      ...SESSION,
      user: { ...SESSION.user, first_name: '', last_name: '' },
    };

    expect(displayName(anonymous)).toBe('amina@example.test');
    expect(initials(anonymous)).toBe('A');
  });

  it('ne rend jamais un rond vide', () => {
    const nameless: Session = {
      ...SESSION,
      user: { ...SESSION.user, first_name: '', last_name: '', email: '' },
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
