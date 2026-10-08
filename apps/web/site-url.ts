/**
 * L'adresse publique du site, d'où sortent toutes les URL absolues de la page.
 *
 * `canonical`, `og:url`, `og:image`, le `Sitemap:` de `robots.txt` et le `<loc>` du plan du
 * site doivent porter une adresse **absolue** — une URL relative n'y veut rien dire. Elles
 * doivent donc toutes porter *la même*, et la coder en dur dans cinq endroits garantit qu'un
 * jour l'un d'eux dira autre chose.
 *
 * **Absente en production, la construction échoue.** Ce n'est pas de la rigueur pour la
 * rigueur : un `canonical` qui pointe vers un autre domaine dit aux moteurs que la vraie
 * page est ailleurs, et une `og:image` absolue qui n'existe pas rend un lien partagé sans
 * aperçu. Dans les deux cas, le défaut ne se voit pas sur l'écran de celui qui déploie — il
 * se voit chez le visiteur, des semaines plus tard. Mieux vaut refuser de construire.
 *
 * En développement, `localhost` suffit : rien n'y est indexé ni partagé.
 */
export const DEV_SITE_URL = 'http://localhost:5174';

export function resolveSiteUrl(
  env: Record<string, string | undefined>,
  command: 'build' | 'serve',
): string {
  const raw = env['VITE_SITE_URL']?.trim();

  if (!raw) {
    if (command === 'serve') return DEV_SITE_URL;

    throw new Error(
      "VITE_SITE_URL est absente. L'adresse publique du site est obligatoire pour " +
        'construire : elle porte le canonical, l’Open Graph et le plan du site. ' +
        'Exemple : VITE_SITE_URL=https://neftya.example.com',
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `VITE_SITE_URL n’est pas une URL absolue : « ${raw} ». Attendu par exemple ` +
        'https://neftya.example.com',
    );
  }

  /*
   * Le protocole est vérifié, et pas seulement la forme.
   *
   * `new URL('mailto:x')` réussit, et `ftp://` aussi. Une `og:image` en `mailto:` passerait
   * la construction pour ne jamais s'afficher nulle part.
   */
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `VITE_SITE_URL doit être en http ou https : « ${raw} » est en ${parsed.protocol}`,
    );
  }

  /*
   * Sans barre finale, toujours.
   *
   * Les gabarits concatènent `${siteUrl}/og.jpg`. Avec une barre conservée, cela donnerait
   * `https://site//og.jpg` — que certains serveurs servent et d'autres non, et qu'aucun
   * validateur d'Open Graph ne pardonne. C'est le même piège que le `NEFTYA_ALLOWED_ORIGINS`
   * avec barre finale qui refusait toutes les requêtes.
   */
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, '')}`;
}
