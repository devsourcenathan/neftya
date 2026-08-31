import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  SEKUU_ROLES,
  type SekuuContext,
  type SekuuLimits,
  type SekuuRole,
} from './sekuu-context.js';

/**
 * Vérification **hors ligne** du jeton de la plateforme.
 *
 * Les clés publiques sont récupérées une fois et mises en cache ; aucune requête n'est
 * faite à Sekuu par appel. Un produit qui interrogerait la plateforme à chaque requête
 * ajouterait un aller-retour réseau à chaque page, et tomberait avec elle.
 *
 * Quatre contrôles, aucun facultatif : signature RS256 contre le `kid` de l'en-tête,
 * `iss`, `aud`, et `exp`. Vérifier la signature sans vérifier `aud` laisserait entrer un
 * jeton émis pour un autre destinataire — signé par la même clé, donc valide en apparence.
 *
 * @see docs/SEKUU.md §3
 */

export class InvalidSekuuToken extends Error {
  constructor(reason: string) {
    super(`Jeton Sekuu invalide : ${reason}`);
    this.name = 'InvalidSekuuToken';
  }
}

export interface TokenVerifierOptions {
  /** `https://platform.sekuu.com/.well-known/jwks.json` */
  jwksUrl: string;
  /** `https://identity.sekuu.com` */
  issuer: string;
  /** `sekuu-platform` */
  audience: string;
  /**
   * Injectable pour les tests, qui signent leurs propres jetons : la vérification se
   * teste sans réseau, ce qui est tout l'intérêt d'une vérification hors ligne.
   */
  keyStore?: JWTVerifyGetKey;
}

export class TokenVerifier {
  private readonly keyStore: JWTVerifyGetKey;

  constructor(private readonly options: TokenVerifierOptions) {
    this.keyStore =
      options.keyStore ??
      // Une heure de cache : assez long pour ne pas peser, assez court pour qu'une
      // rotation de clé se propage sans intervention. La bibliothèque relit d'elle-même
      // sur `kid` inconnu — le signe d'une rotation, pas d'une attaque.
      createRemoteJWKSet(new URL(options.jwksUrl), { cacheMaxAge: 3_600_000 });
  }

  /** @throws {InvalidSekuuToken} */
  async verify(token: string): Promise<SekuuContext> {
    let payload: JWTPayload;

    try {
      ({ payload } = await jwtVerify(token, this.keyStore, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['RS256'],
      }));
    } catch (error) {
      throw new InvalidSekuuToken(
        error instanceof Error ? error.message : 'vérification impossible',
      );
    }

    return toContext(payload);
  }
}

/**
 * Un jeton fraîchement obtenu par `login` **ne porte pas d'organisation** : il faut
 * enchaîner `switch-organization`. Sans `org`, Neftya n'ouvre rien du tout — c'est le
 * piège numéro un de l'intégration, et il coûte une heure de débogage à qui l'ignore.
 */
function toContext(payload: JWTPayload): SekuuContext {
  const organizationId = payload['org'];
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new InvalidSekuuToken(
      'aucune organisation active — appeler switch-organization après login',
    );
  }

  const subject = payload.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new InvalidSekuuToken('aucun sujet');
  }

  return {
    userId: subject,
    organizationId,
    roles: asRoles(payload['roles']),
    products: asStrings(payload['products']),
    limits: asLimits(payload['limits']),
    sessionId: typeof payload['sid'] === 'string' ? payload['sid'] : null,
    language: typeof payload['lang'] === 'string' ? payload['lang'] : 'fr',
  };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Un rôle que la plateforme ajouterait et que Neftya ignore est écarté, pas deviné. */
function asRoles(value: unknown): SekuuRole[] {
  return asStrings(value).filter((role): role is SekuuRole =>
    (SEKUU_ROLES as readonly string[]).includes(role),
  );
}

function asLimits(value: unknown): SekuuLimits {
  if (typeof value !== 'object' || value === null) return {};

  const limits: SekuuLimits = {};
  for (const [key, raw] of Object.entries(value)) {
    // `null` est conservé tel quel : il vaut « illimité », et l'écraser en confondrait le
    // sens avec « non couvert ».
    if (raw === null || typeof raw === 'number') limits[key] = raw;
  }
  return limits;
}
