import { describe, it, expect } from 'vitest';
import { DEV_SITE_URL, resolveSiteUrl } from '../apps/web/site-url.js';

/**
 * L'adresse publique du site.
 *
 * Elle porte cinq URL absolues de la page — canonical, `og:url`, `og:image`, le `Sitemap:`
 * de `robots.txt` et le `<loc>` du plan du site. Ce qui se joue ici n'est pas une
 * conversion de chaîne : c'est qu'une adresse fausse **ne se voit pas** sur l'écran de
 * celui qui déploie. Un canonical qui pointe ailleurs dit aux moteurs que la vraie page
 * est ailleurs ; une `og:image` absolue qui n'existe pas rend un lien partagé sans aperçu.
 * Les deux se découvrent des semaines plus tard, chez le visiteur.
 *
 * Le module vit à côté de `vite.config.ts` et non sous `src/` : c'est du code de
 * construction, et sous `src/` il serait compilé dans le paquet livré au navigateur pour
 * n'y servir à rien. `tsconfig.tests.json` le nomme donc explicitement.
 */

describe('en production', () => {
  it('refuse de construire sans adresse', () => {
    // Un défaut inventé — un domaine d'exemple, le dernier utilisé — se déploierait sans
    // bruit. Mieux vaut une construction qui s'arrête et nomme la variable.
    expect(() => resolveSiteUrl({}, 'build')).toThrow(/VITE_SITE_URL/u);
    expect(() => resolveSiteUrl({ VITE_SITE_URL: '   ' }, 'build')).toThrow(
      /VITE_SITE_URL/u,
    );
  });

  it('refuse ce qui n’est pas une URL absolue', () => {
    // « neftya.com » sans protocole est l'erreur de saisie la plus courante, et elle
    // produit des URL relatives dans des balises qui n'en acceptent aucune.
    expect(() => resolveSiteUrl({ VITE_SITE_URL: 'neftya.com' }, 'build')).toThrow(
      /absolue/u,
    );
  });

  it('refuse un protocole qu’aucun navigateur n’ira chercher', () => {
    /*
     * `new URL('mailto:x')` réussit, et `ftp://` aussi : vérifier la seule forme laisserait
     * passer une `og:image` en `mailto:`, qui construit sans erreur et ne s'affiche nulle
     * part.
     */
    for (const bad of ['mailto:bonjour@neftya.test', 'ftp://neftya.test']) {
      expect(() => resolveSiteUrl({ VITE_SITE_URL: bad }, 'build')).toThrow(/http/u);
    }
  });

  it('accepte une adresse complète', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: 'https://neftya.test' }, 'build')).toBe(
      'https://neftya.test',
    );
  });
});

describe('la barre finale', () => {
  it('tombe, parce que les gabarits en ajoutent une', () => {
    /*
     * Les modèles écrivent `${siteUrl}/og.jpg`. Conservée, la barre donnerait
     * `https://site//og.jpg` — que certains serveurs servent et d'autres non, et qu'aucun
     * validateur d'Open Graph ne pardonne. C'est le même piège que
     * `NEFTYA_ALLOWED_ORIGINS` avec barre finale, qui refusait toutes les requêtes.
     */
    for (const given of [
      'https://neftya.test/',
      'https://neftya.test///',
      'https://neftya.test',
    ]) {
      const resolved = resolveSiteUrl({ VITE_SITE_URL: given }, 'build');

      expect(resolved).toBe('https://neftya.test');
      expect(`${resolved}/og.jpg`).toBe('https://neftya.test/og.jpg');
    }
  });

  it('tombe aussi quand le site vit dans un sous-chemin', () => {
    expect(
      resolveSiteUrl({ VITE_SITE_URL: 'https://exemple.test/neftya/' }, 'build'),
    ).toBe('https://exemple.test/neftya');
  });
});

describe('en développement', () => {
  it('se contente de localhost', () => {
    // Rien n'y est indexé ni partagé : exiger une adresse publique pour lancer un serveur
    // de développement serait une corvée quotidienne sans contrepartie.
    expect(resolveSiteUrl({}, 'serve')).toBe(DEV_SITE_URL);
  });

  it('cède quand même à ce qui est posé', () => {
    // Pour vérifier un aperçu de partage sans construire : la variable l'emporte toujours.
    expect(resolveSiteUrl({ VITE_SITE_URL: 'https://essai.test' }, 'serve')).toBe(
      'https://essai.test',
    );
  });
});
