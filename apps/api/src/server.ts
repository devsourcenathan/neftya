import { buildApp } from './app.js';
import { createDatabase, migrate } from './db/index.js';
import { SekuuAI } from './sekuu/ai.js';
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

// Distincte de celle de Storage, delibérément : une clé d'IA dépense, et sa fuite coûte de
// l'argent à chaque appel. Sans elle, l'assistant dit qu'il n'est pas configuré.
const aiKey = process.env['SEKUU_AI_API_KEY'];

const jwtSecret = process.env['NEFTYA_JWT_SECRET'];
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "Variable d'environnement manquante ou trop courte : NEFTYA_JWT_SECRET (32 caractères au moins).",
  );
}

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
  ...(aiKey
    ? {
        ai: new SekuuAI({
          baseUrl: process.env['SEKUU_AI_URL'] ?? 'https://ai.sekuu.com',
          apiKey: aiKey,
        }),
      }
    : {}),
  verifier: new TokenVerifier({
    jwksUrl: required('SEKUU_JWKS_URL'),
    issuer: required('SEKUU_ISSUER'),
    audience: required('SEKUU_AUDIENCE'),
  }),
  jwtSecret,
});

const applied = await migrate(db);
if (applied.length > 0) {
  console.log(`Migrations appliquées : ${applied.join(', ')}`);
}

app.listen({ port, host }).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
