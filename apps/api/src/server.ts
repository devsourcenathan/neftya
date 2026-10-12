import { buildApp } from './app.js';
import { createDatabase, migrate } from './db/index.js';
import { SekuuAI } from './sekuu/ai.js';
import { LocalAI } from './ai/local-ai.js';
import { SmtpMailer } from './notify/mailer.js';
import { SekuuStorage } from './sekuu/storage.js';
import { LocalFileStore } from './storage/local-store.js';
import { TokenVerifier } from './sekuu/token-verifier.js';
import { StripeProvider } from './billing/stripe.js';

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

// Sans clé d'API Storage, les exports sont déposés sur disque (`NEFTYA_DATA_DIR`)
// plutôt que chez Sekuu : le dépôt local est le défaut, pas la dégradation.
// Avec une clé, l'ancien comportement revient — déposer chez la plateforme.
const storageKey = process.env['SEKUU_STORAGE_API_KEY'];
const dataDir = process.env['NEFTYA_DATA_DIR'] ?? './data';
// Une seule instance pour déposer et relire : deux magasins qui divergent,
// c'est un export qu'on ne retrouve pas.
const localStore = new LocalFileStore({ dataDir, db });

// L'assistant : un modèle direct d'abord, Sekuu ensuite, rien sinon.
//
// Sans modèle, l'assistant dit qu'il n'est pas configuré — il n'y a rien à
// dégrader, une interprétation n'a pas de version locale.
const openaiKey = process.env['OPENAI_API_KEY'];
const aiKey = process.env['SEKUU_AI_API_KEY'];

// Sekuu est facultatif : sans JWKS, seuls les jetons locaux sont reconnus. Exiger trois
// variables de plateforme pour démarrer obligeait à en inventer, ce qui est pire que de
// s'en passer — on ne sait plus si elles servent.
const sekuuJwks = process.env['SEKUU_JWKS_URL'];

const jwtSecret = process.env['NEFTYA_JWT_SECRET'];
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "Variable d'environnement manquante ou trop courte : NEFTYA_JWT_SECRET (32 caractères au moins).",
  );
}

/*
 * Stripe est facultatif.
 *
 * Sans clé, aucun encaisseur n'est enregistré : l'API sert le gratuit et ne propose rien
 * d'autre. Les deux variables vont ensemble — une clé sans secret de webhook donnerait un
 * paiement qu'on encaisse et qu'on n'apprend jamais, c'est-à-dire un client débité sans
 * accès. Mieux vaut refuser de démarrer que livrer cette moitié-là.
 */
const stripeKey = process.env['STRIPE_SECRET_KEY'];
const stripeWebhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

if ((stripeKey === undefined) !== (stripeWebhookSecret === undefined)) {
  throw new Error(
    'STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET vont ensemble : avec la première seule, ' +
      'un paiement est encaissé sans que rien ne l’apprenne — le client est débité et ' +
      'reste sans accès.',
  );
}

const paymentProviders =
  stripeKey && stripeWebhookSecret
    ? [new StripeProvider({ secretKey: stripeKey, webhookSecret: stripeWebhookSecret })]
    : [];

// Sans SMTP, l'envoi de devis répond 503 — comme l'assistant sans modèle.
// Un devis non envoyé n'est pas un devis perdu : la route ne fait rien sans mailer.
const smtpHost = process.env['NEFTYA_SMTP_HOST'];

const app = buildApp({
  db,
  paymentProviders,
  // Où le client revient après avoir payé. Absente, le retour tomberait sur le serveur de
  // développement — visible tout de suite en local, invisible en production.
  appUrl: process.env['NEFTYA_APP_URL'] ?? 'http://localhost:5174',
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
    : {
        storage: localStore,
        files: localStore,
      }),
  ...(openaiKey
    ? {
        ai: new LocalAI({
          db,
          baseUrl: process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
          apiKey: openaiKey,
          model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
          reasoningEffort: process.env['OPENAI_REASONING_EFFORT'] ?? 'minimal',
        }),
      }
    : aiKey
      ? {
          ai: new SekuuAI({
            baseUrl: process.env['SEKUU_AI_URL'] ?? 'https://ai.sekuu.com',
            apiKey: aiKey,
          }),
        }
      : {}),
  ...(sekuuJwks
    ? {
        verifier: new TokenVerifier({
          jwksUrl: sekuuJwks,
          issuer: required('SEKUU_ISSUER'),
          audience: required('SEKUU_AUDIENCE'),
        }),
      }
    : {}),
  jwtSecret,
  ...(smtpHost
    ? {
        mailer: new SmtpMailer({
          host: smtpHost,
          port: Number(process.env['NEFTYA_SMTP_PORT'] ?? 587),
          secure: process.env['NEFTYA_SMTP_SECURE'] === 'true',
          user: required('NEFTYA_SMTP_USER'),
          password: required('NEFTYA_SMTP_PASSWORD'),
          from: process.env['NEFTYA_SMTP_FROM'] ?? required('NEFTYA_SMTP_USER'),
        }),
      }
    : {}),
});

const applied = await migrate(db);
if (applied.length > 0) {
  console.log(`Migrations appliquées : ${applied.join(', ')}`);
}

app.listen({ port, host }).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
