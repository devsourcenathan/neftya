/**
 * La session locale — **le seul module qui parle à `/v1/auth`**.
 *
 * Neftya porte ses comptes au lieu de rediriger vers un portail : inscription,
 * connexion et choix d'organisation sont des appels à sa propre API, et le
 * jeton vit en mémoire. Le rafraîchissement, opaque, dort dans
 * `localStorage` — lisible par un script de la page, comme tout ce qu'elle
 * contient : la rotation à chaque usage et la révocation au rejouement
 * bornent ce que sa fuite ouvre (voir `AUTH_LOCAL.md` §2).
 *
 * L'interface de ce module est volontairement proche de l'ancienne (Sekuu) :
 * `SessionProvider` n'a pas à savoir qui a signé.
 *
 * @see docs/AUTH_LOCAL.md
 */

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

/** Le rafraîchissement survit à la fermeture de l'onglet ; le jeton, non. */
const REFRESH_TOKEN = 'neftya.refreshToken';
/** L'organisation choisie survit elle aussi : c'est un confort, pas un secret. */
const CHOSEN_ORGANIZATION = 'neftya.organization';

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Session {
  accessToken: string;
  /** Fin de validité, en millisecondes epoch, lue dans le jeton. */
  expiresAt: number;
  user: SessionUser;
  organizations: SessionOrganization[];
  /** `null` quand plusieurs organisations et aucun choix — l'écran tranche. */
  organizationId: string | null;
  language: string;
}

export class NotSignedIn extends Error {
  constructor() {
    super('Aucune session locale.');
    this.name = 'NotSignedIn';
  }
}

/**
 * L'API n'a pas répondu du tout.
 *
 * À distinguer de `NotSignedIn` : l'un veut dire « connectez-vous », l'autre
 * « réessayez ». Les confondre enverrait au formulaire quelqu'un dont le
 * réseau a simplement toussé.
 */
export class ApiUnreachable extends Error {
  constructor(cause: unknown) {
    super("L'API Neftya est injoignable.");
    this.name = 'ApiUnreachable';
    this.cause = cause;
  }
}

/** Ce que l'API rend quand un identifiant ou un jeton est refusé. */
export class CredentialsRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsRejected';
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<Session> {
  return toSession(
    await call('/v1/auth/register', {
      method: 'POST',
      body: {
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        organizationName: input.organizationName,
      },
    }),
  );
}

export async function login(input: LoginInput): Promise<Session> {
  const session = toSession(
    await call('/v1/auth/login', {
      method: 'POST',
      body: { email: input.email, password: input.password },
    }),
  );

  // Une seule organisation : l'appel l'a déjà activée. Plusieurs : reprendre
  // le choix précédent s'il est toujours valide, sinon laisser l'écran trancher.
  if (!session.organizationId) {
    const remembered = window.localStorage.getItem(CHOSEN_ORGANIZATION);
    const chosen = session.organizations.find(
      (organization) => organization.id === remembered,
    );
    const single =
      chosen ??
      (session.organizations.length === 1 ? session.organizations[0] : undefined);
    if (single) return switchOrganization(session, single.id);
  } else {
    window.localStorage.setItem(CHOSEN_ORGANIZATION, session.organizationId);
  }

  return session;
}

/**
 * Un seul rafraîchissement à la fois.
 *
 * Le jeton de rafraîchissement **tourne à chaque usage** : deux appels
 * concurrents dont le second rejoue l'ancien révoqueraient toute la session.
 * C'est la détection de vol, et elle est volontairement brutale.
 */
let inFlight: Promise<Session> | null = null;

export function refresh(): Promise<Session> {
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function performRefresh(): Promise<Session> {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN);
  if (!refreshToken) throw new NotSignedIn();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (error) {
    throw new ApiUnreachable(error);
  }

  if (!response.ok) {
    if (response.status === 401) {
      forgetSession();
      throw new NotSignedIn();
    }
    throw new ApiUnreachable(`refresh : réponse ${response.status}`);
  }

  return toSession(await response.json());
}

export async function switchOrganization(
  session: Session,
  organizationId: string,
): Promise<Session> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/switch`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ organizationId }),
    });
  } catch (error) {
    throw new ApiUnreachable(error);
  }

  if (!response.ok) throw new NotSignedIn();

  const next = toSession(await response.json(), session);
  window.localStorage.setItem(CHOSEN_ORGANIZATION, organizationId);

  return next;
}

/**
 * Ouvre une session utilisable, en enchaînant ce qui doit l'être.
 *
 * Sans jeton de rafraîchissement stocké, il n'y a pas de session — c'est
 * l'écran de connexion qui prend la suite, pas une erreur.
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

export async function signOut(session: Session | null): Promise<void> {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN);
  if (refreshToken) {
    try {
      await fetch(`${API_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // L'API injoignable ne doit pas retenir quelqu'un sur un écran connecté :
      // le jeton local est effacé de toute façon, ci-dessous.
    }
  }
  void session;
  forgetSession();
}

export function forgetOrganization(): void {
  window.localStorage.removeItem(CHOSEN_ORGANIZATION);
}

function forgetSession(): void {
  window.localStorage.removeItem(REFRESH_TOKEN);
  window.localStorage.removeItem(CHOSEN_ORGANIZATION);
}

/**
 * Lit les claims sans vérifier la signature.
 *
 * **La vérification est le travail du serveur**, qui la fait contre son
 * secret. Le navigateur ne lit ces claims que pour savoir quoi afficher et
 * quand rafraîchir ; s'y fier pour autoriser quoi que ce soit reviendrait
 * à faire confiance au client.
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

async function call(
  path: string,
  init: { method: string; body: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(init.body),
    });
  } catch (error) {
    throw new ApiUnreachable(error);
  }

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok || !payload?.success) {
    const code = payload?.error?.code;
    const message = payload?.error?.message ?? `réponse ${response.status}`;
    if (code === 'CONFLICT' || response.status === 401 || response.status === 422) {
      throw new CredentialsRejected(message);
    }
    throw new ApiUnreachable(message);
  }

  return payload;
}

function toSession(body: unknown, previous?: Session): Session {
  const data = (body as { data?: Record<string, unknown> }).data ?? {};
  const accessToken = String(data['accessToken'] ?? data['access_token'] ?? '');
  const claims = readClaims(accessToken);

  const organizationId =
    typeof claims['org'] === 'string'
      ? claims['org']
      : typeof data['organizationId'] === 'string'
        ? data['organizationId']
        : null;
  const expirySeconds = typeof claims['exp'] === 'number' ? claims['exp'] : null;

  const rawUser = (data['user'] as Record<string, unknown> | undefined) ?? {};
  const rawOrganizations =
    (data['organizations'] as Record<string, unknown>[] | undefined) ?? [];

  const session: Session = {
    accessToken,
    expiresAt: expirySeconds
      ? expirySeconds * 1000
      : Date.now() + Number(data['expiresIn'] ?? data['expires_in'] ?? 900) * 1000,
    user: {
      id: String(rawUser['id'] ?? previous?.user.id ?? ''),
      email: String(rawUser['email'] ?? previous?.user.email ?? ''),
      firstName: String(
        rawUser['firstName'] ?? rawUser['first_name'] ?? previous?.user.firstName ?? '',
      ),
      lastName: String(
        rawUser['lastName'] ?? rawUser['last_name'] ?? previous?.user.lastName ?? '',
      ),
    },
    organizations: rawOrganizations.map((organization) => ({
      id: String(organization['id'] ?? ''),
      name: String(organization['name'] ?? ''),
      slug: String(organization['slug'] ?? ''),
      role: String(
        organization['role'] ??
          (Array.isArray(organization['roles']) ? organization['roles'][0] : '') ??
          '',
      ),
    })),
    organizationId,
    language:
      typeof claims['lang'] === 'string'
        ? claims['lang']
        : (previous?.language ?? 'fr'),
  };

  const stored = String(data['refreshToken'] ?? data['refresh_token'] ?? '');
  if (stored) window.localStorage.setItem(REFRESH_TOKEN, stored);

  return session;
}
