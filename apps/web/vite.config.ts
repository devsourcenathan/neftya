import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolveSiteUrl } from './site-url.js';

/**
 * L'adresse publique, posée une fois et distribuée partout.
 *
 * La page porte cinq URL absolues — canonical, `og:url`, `og:image`, le `Sitemap:` de
 * `robots.txt` et le `<loc>` du plan du site. Codées en dur, elles finissent par ne plus
 * dire la même chose ; et tant que l'adresse définitive n'est pas arrêtée, elles mentiraient
 * toutes les cinq.
 *
 * `robots.txt` et `sitemap.xml` sont **émis ici** plutôt que posés dans `public/` : un
 * fichier de `public/` est recopié tel quel, sans substitution, et aurait gardé un domaine
 * figé là où tout le reste suit la variable.
 */
function siteUrl(): Plugin {
  let resolved = '';

  return {
    name: 'neftya:site-url',

    config(_config, { command, mode }) {
      /*
       * Les fichiers `.env` sont lus **à côté de cette configuration**, pas depuis le
       * répertoire courant : c'est là que Vite les cherche pour le code client, et les
       * variables du front vivent dans `apps/web/.env.local`. Avec `process.cwd()`, une
       * construction lancée depuis la racine du dépôt n'en aurait trouvé aucun et aurait
       * échoué sur une variable pourtant posée.
       *
       * L'environnement réel du processus l'emporte ensuite : c'est lui que pose un
       * hébergeur, et il doit pouvoir couvrir un fichier laissé dans le dépôt.
       */
      const env = { ...loadEnv(mode, import.meta.dirname, 'VITE_'), ...process.env };
      resolved = resolveSiteUrl(env, command);
    },

    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', resolved);
    },

    generateBundle() {
      const lines = (rows: readonly string[]) => rows.join('\n') + '\n';

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: lines([
          'User-agent: *',
          'Allow: /',
          '',
          `Sitemap: ${resolved}/sitemap.xml`,
        ]),
      });

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: lines([
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${resolved}/</loc>`,
          '    <changefreq>weekly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
        ]),
      });
    },
  };
}

export default defineConfig({
  server: {
    /*
     * La boucle locale en IPv4, explicitement.
     *
     * Par défaut Vite écoute `localhost`, que Node résout souvent vers `::1`
     * sous Windows — tandis qu'une entrée `hosts` pointe vers `127.0.0.1`.
     * Rien n'écoute alors sur l'adresse visée, et le navigateur annonce un
     * refus de connexion : un symptôme qui ne dit rien de sa cause.
     */
    host: '127.0.0.1',

    /*
     * 5174, et non le 5173 par défaut : DealerOS occupe celui-ci.
     *
     * `strictPort` plutôt qu'un repli silencieux sur 5175 : ce port est inscrit
     * dans le CORS de l'API, et en changer sans le dire ferait refuser toutes
     * les requêtes sans expliquer pourquoi.
     */
    port: 5174,
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), siteUrl()],
  build: { outDir: 'dist' },
});
