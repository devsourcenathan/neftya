import { buildApp } from './app.js';
import { createDatabase, migrate } from './db/index.js';
import { SekuuStorage } from './sekuu/storage.js';
import { TokenVerifier } from './sekuu/token-verifier.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Démarrer sans configuration puis échouer à la première requête coûte plus cher
    // que refuser de démarrer.
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '0.0.0.0';

const db = createDatabase(required('DATABASE_URL'));

// Sans clé d'API, les exports restent produits et enregistrés ; ils ne sont simplement
// pas déposés chez Storage. Refuser de démarrer pour cela empêcherait de travailler en
// local, où personne n'a de clé.
const storageKey = process.env['SEKUU_STORAGE_API_KEY'];

const app = buildApp({
  db,
  // Séparées par des virgules. Vide : aucune origine navigateur n'est admise, ce qui est
  // le bon défaut — une liste oubliée doit empêcher l'interface de fonctionner, pas
  // ouvrir l'API à tout le monde.
  allowedOrigins: (process.env['NEFTYA_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(storageKey
    ? {
        storage: new SekuuStorage({
          baseUrl: process.env['SEKUU_STORAGE_URL'] ?? 'https://storage.sekuu.com',
          apiKey: storageKey,
        }),
      }
    : {}),
  verifier: new TokenVerifier({
    jwksUrl: required('SEKUU_JWKS_URL'),
    issuer: required('SEKUU_ISSUER'),
    audience: required('SEKUU_AUDIENCE'),
  }),
});

const applied = await migrate(db);
if (applied.length > 0) {
  console.log(`Migrations appliquées : ${applied.join(', ')}`);
}

app.listen({ port, host }).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
