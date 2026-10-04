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
     * `strictPort` plutôt qu'un repli silencieux sur 5175 : ce port est inscrit
     * dans le CORS de l'API, et en changer sans le dire ferait refuser toutes
     * les requêtes sans expliquer pourquoi.
     */
    port: 5174,
    strictPort: true,
  },
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
});
