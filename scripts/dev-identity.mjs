#!/usr/bin/env node
/**
 * Un Sekuu Identity de poche, pour essayer Neftya en local.
 *
 *   node scripts/dev-identity.mjs
 *
 * Il fabrique une paire de clés au démarrage, publie le JWKS, et rend des jetons —
 * exactement les trois choses dont Neftya a besoin de la plateforme pour fonctionner.
 *
 * **Ce n'est pas une porte dérobée dans l'application.** Aucun code de production ne
 * connaît ce script : l'API lit `SEKUU_JWKS_URL`, `SEKUU_ISSUER` et `SEKUU_AUDIENCE` dans
 * son environnement, et il suffit de les pointer ici. Le jour où l'on branche la vraie
 * plateforme, on change trois variables et ce fichier ne sert plus. C'est précisément la
 * différence avec un « mode développeur » codé dans l'application, qui finit par se
 * retrouver en production — DealerOS avait un `if (id === 1)` posé pour la même raison.
 *
 * Les jetons qu'il émet **ne valent que pour ce JWKS** : la vraie plateforme ne les
 * reconnaîtrait pas une seconde.
 *
 * @see docs/OPERATIONS.md §2
 */
import { createServer } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const PORT = Number(process.env.DEV_IDENTITY_PORT ?? 4000);
const ISSUER = `http://localhost:${PORT}`;
const AUDIENCE = 'sekuu-platform';

/** L'organisation et l'utilisateur de démonstration. Des UUID fixes : les projets créés survivent à un redémarrage. */
const ORGANIZATION = {
  id: '01924f00-0000-7000-8000-00000000000a',
  name: 'Atelier de démonstration',
  slug: 'atelier-demo',
  roles: ['owner'],
};

const USER = {
  id: '01924f00-0000-7000-8000-0000000000a1',
  first_name: 'Menuisier',
  last_name: 'Démo',
  email: 'demo@example.test',
  language: 'fr',
};

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...(await exportJWK(publicKey)), kid: 'dev', alg: 'RS256', use: 'sig' };

/**
 * `roles`, `products` et `limits` sont réglables par la ligne de commande : c'est ce qui
 * permet d'essayer les refus — un membre qui ne peut pas supprimer, une organisation non
 * abonnée, un quota atteint — sans toucher au code.
 */
function options(query) {
  const roles = (query.get('roles') ?? 'owner').split(',').filter(Boolean);
  const products = (query.get('products') ?? 'neftya').split(',').filter(Boolean);
  const max = query.get('projects_max');

  return {
    roles,
    products,
    limits: max === null ? {} : { neftya_projects_max: Number(max) },
  };
}

async function token({ withOrganization, roles, products, limits }) {
  const payload = {
    roles,
    products,
    limits,
    sid: 'session-de-demonstration',
    lang: 'fr',
  };

  // Sans `org`, Neftya refuse — c'est le piège numéro un de l'intégration, et ce script
  // le reproduit fidèlement plutôt que de le masquer.
  if (withOrganization) payload.org = ORGANIZATION.id;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'dev' })
    .setSubject(USER.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(privateKey);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, ISSUER);

  // L'interface appelle depuis un autre port, avec les identifiants : sans ces en-têtes,
  // le navigateur refuse la réponse.
  const origin = request.headers.origin ?? 'http://localhost:5173';
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-credentials', 'true');
  response.setHeader('access-control-allow-headers', 'authorization, content-type');
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  if (url.pathname === '/.well-known/jwks.json') {
    send(200, { keys: [jwk] });
    return;
  }

  const settings = options(url.searchParams);

  if (url.pathname === '/api/v1/auth/refresh') {
    // Comme la vraie plateforme : le jeton rendu par `refresh` ne porte pas d'organisation.
    send(200, {
      data: {
        access_token: await token({ ...settings, withOrganization: false }),
        token_type: 'Bearer',
        expires_in: 43_200,
        user: USER,
        organizations: [ORGANIZATION],
      },
      meta: { request_id: 'dev' },
    });
    return;
  }

  if (url.pathname === '/api/v1/auth/switch-organization') {
    send(200, {
      data: { access_token: await token({ ...settings, withOrganization: true }) },
      meta: { request_id: 'dev' },
    });
    return;
  }

  /** Raccourci : un jeton utilisable tout de suite, pour curl. */
  if (url.pathname === '/token') {
    send(200, {
      access_token: await token({ ...settings, withOrganization: true }),
      organization_id: ORGANIZATION.id,
      ...settings,
    });
    return;
  }

  send(404, { error: 'inconnu' });
});

server.listen(PORT, () => {
  console.log(`Identity de démonstration sur ${ISSUER}`);
  console.log('');
  console.log('Pour l’API :');
  console.log(`  SEKUU_JWKS_URL=${ISSUER}/.well-known/jwks.json`);
  console.log(`  SEKUU_ISSUER=${ISSUER}`);
  console.log(`  SEKUU_AUDIENCE=${AUDIENCE}`);
  console.log('');
  console.log('Un jeton prêt à l’emploi :');
  console.log(`  curl -s ${ISSUER}/token`);
  console.log('');
  console.log('Pour éprouver les refus :');
  console.log(`  ${ISSUER}/token?roles=member        (ne peut pas supprimer)`);
  console.log(`  ${ISSUER}/token?products=autre      (403, pas abonné à Neftya)`);
  console.log(`  ${ISSUER}/token?projects_max=1      (409 au deuxième projet)`);
});
