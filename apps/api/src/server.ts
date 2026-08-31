import { buildApp } from './app.js';
import { createDatabase, migrate } from './db/index.js';
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

const app = buildApp({
  db,
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
