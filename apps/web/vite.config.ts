import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
     * Les deux produits doivent pouvoir tourner en même temps — c'est la seule
     * façon d'éprouver qu'une session ouverte sur l'un ouvre l'autre, ce qui
     * est le propre d'une plateforme. `strictPort` plutôt qu'un repli
     * silencieux sur 5175 : ce port est inscrit dans les origines autorisées de
     * la plateforme et dans le CORS de l'API, et en changer sans le dire ferait
     * refuser toutes les requêtes sans expliquer pourquoi.
     */
    port: 5174,
    strictPort: true,

    /*
     * Vite refuse par défaut tout `Host` qu'il ne connaît pas — une protection
     * contre le rebinding DNS, pas un réglage à contourner.
     *
     * La session unique ne se teste que sous un sous-domaine partagé : le
     * cookie de rafraîchissement est posé sur `.sekuu.test` et ne voyage pas
     * jusqu'à `localhost`. D'où ce nom, et lui seul.
     */
    allowedHosts: ['neftya.sekuu.test'],
  },
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
});
