/**
 * La session de la plateforme — **le seul module qui parle à Identity**.
 *
 * C'est une exigence de la plateforme, pas une préférence de style : il n'existe pas
 * encore de flux délégué « Se connecter avec Sekuu », et le jour où il existera, seul ce
 * fichier devra changer.
 *
 * Neftya ne voit jamais de mot de passe : la connexion se fait sur le portail, qui rend la
 * main avec la session posée dans le cookie partagé. Neftya appelle `refresh` et obtient
 * un jeton.
 *
 * @see Sekuu-Platform/docs/03-services/identity/04-integrer-un-produit.md §6
 * @see docs/SEKUU.md §7
 */

const IDENTITY_URL =
  import.meta.env['VITE_SEKUU_IDENTITY_URL'] ?? 'https://identity.sekuu.com';
const PORTAL_URL =
  import.meta.env['VITE_SEKUU_PORTAL_URL'] ?? 'https://platform.sekuu.com';

/** L'organisation choisie survit à la fermeture de l'onglet ; le jeton, non. */
const CHOSEN_ORGANIZATION = 'neftya.organization';

export interface SekuuOrganization {
  id: string;
  name: string;
  slug: string;
  roles: string[];
}

export interface SekuuUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  language: string;
}

export interface Session {
  accessToken: string;
  /** Fin de validité, en millisecondes epoch, lue dans le jeton. */
  expiresAt: number;
  user: SekuuUser;
  organizations: SekuuOrganization[];
  /** `null` tant que `switch-organization` n'a pas été appelé. */
  organizationId: string | null;
  language: string;
}

export class NotSignedIn extends Error {
  constructor() {
    super('Aucune session Sekuu.');
    this.name = 'NotSignedIn';
  }
}

/**
 * Envoie l'utilisateur se connecter sur le portail, et revenir ici.
 *
 * Le portail valide `redirect` contre la liste des origines de produits. Si celle de
 * Neftya n'y figure pas, l'utilisateur atterrit sur l'accueil de la plateforme — sans
 * erreur, ce qui rend le symptôme déroutant : ajouter l'origine à `SEKUU_ALLOWED_ORIGINS`.
 */
export function redirectToPortal(
  path: 'login' | 'register' | 'subscribe' = 'login',
): void {
  const target = path === 'subscribe' ? 'subscribe?product=neftya&' : `${path}?`;
  window.location.href = `${PORTAL_URL}/${target}redirect=${encodeURIComponent(window.location.href)}`;
}

/**
 * Un seul rafraîchissement à la fois.
 *
 * Un jeton de rafraîchissement **ne se rejoue pas** : le rejouer révoque la session
 * entière — c'est la détection de vol, et elle est volontairement brutale. Deux appels
 * concurrents déconnecteraient l'utilisateur, ce qui se produit dès qu'une page lance deux
 * requêtes au chargement.
 */
let inFlight: Promise<Session> | null = null;

export function refresh(): Promise<Session> {
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function performRefresh(): Promise<Session> {
  // `credentials: 'include'` : le jeton de rafraîchissement est un cookie HttpOnly du
  // domaine de la plateforme. Le JavaScript de Neftya ne le lit jamais, et c'est le but.
  const response = await fetch(`${IDENTITY_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) throw new NotSignedIn();

  return toSession(await response.json());
}

/**
 * Le piège numéro un : un jeton frais **ne porte pas d'organisation**.
 *
 * Sans cet appel, Neftya voit un jeton valide, signé, non expiré, et refuse tout. Il rend
 * un **nouveau** jeton, celui qui porte `org`, `roles` et `products`.
 */
export async function switchOrganization(
  session: Session,
  organizationId: string,
): Promise<Session> {
  const response = await fetch(`${IDENTITY_URL}/api/v1/auth/switch-organization`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ organization_id: organizationId }),
  });

  if (!response.ok) throw new NotSignedIn();

  const next = toSession(await response.json(), session);
  window.localStorage.setItem(CHOSEN_ORGANIZATION, organizationId);

  return next;
}

/**
 * Ouvre une session utilisable, en enchaînant ce qui doit l'être.
 *
 * Une seule organisation : les deux appels s'enchaînent sans rien demander. Plusieurs :
 * le choix précédent est repris s'il est toujours valide, sinon c'est à l'utilisateur de
 * trancher — et `organizationId` reste `null` jusque-là.
 */
export async function openSession(): Promise<Session> {
  const session = await refresh();
  if (session.organizationId) return session;

  const remembered = window.localStorage.getItem(CHOSEN_ORGANIZATION);
  const chosen =
    session.organizations.find((organization) => organization.id === remembered) ??
    (session.organizations.length === 1 ? session.organizations[0] : undefined);

  return chosen ? switchOrganization(session, chosen.id) : session;
}

export function forgetOrganization(): void {
  window.localStorage.removeItem(CHOSEN_ORGANIZATION);
}

/**
 * Lit les claims sans vérifier la signature.
 *
 * **La vérification est le travail du serveur**, qui la fait hors ligne contre le JWKS.
 * Le navigateur ne lit ces claims que pour savoir quoi afficher et quand rafraîchir ; s'y
 * fier pour autoriser quoi que ce soit reviendrait à faire confiance au client.
 */
export function readClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) return {};

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toSession(body: unknown, previous?: Session): Session {
  const data = (body as { data?: Record<string, unknown> }).data ?? {};
  const accessToken = String(data['access_token'] ?? '');
  const claims = readClaims(accessToken);

  const organizationId = typeof claims['org'] === 'string' ? claims['org'] : null;
  const expirySeconds = typeof claims['exp'] === 'number' ? claims['exp'] : null;

  return {
    accessToken,
    // À défaut de `exp` — un jeton illisible —, on considère la durée annoncée, et à
    // défaut de celle-ci les 900 secondes du contrat.
    expiresAt: expirySeconds
      ? expirySeconds * 1000
      : Date.now() + Number(data['expires_in'] ?? 900) * 1000,
    user: (data['user'] as SekuuUser | undefined) ?? previous?.user ?? EMPTY_USER,
    organizations:
      (data['organizations'] as SekuuOrganization[] | undefined) ??
      previous?.organizations ??
      [],
    organizationId,
    language: typeof claims['lang'] === 'string' ? claims['lang'] : 'fr',
  };
}

const EMPTY_USER: SekuuUser = {
  id: '',
  first_name: '',
  last_name: '',
  email: '',
  language: 'fr',
};
