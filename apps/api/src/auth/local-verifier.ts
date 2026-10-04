import { InvalidSekuuToken } from '../sekuu/token-verifier.js';
import type { SekuuContext } from '../sekuu/sekuu-context.js';
import { verifyAccess } from './tokens.js';

/**
 * Vérifie les jetons locaux avec la même interface que Sekuu.
 *
 * `TokenVerifier` (RS256, JWKS distant) et celui-ci (HS256, secret local)
 * sont interchangeables : l'authentificateur ne sait pas qui a signé,
 * il sait seulement qui appelle. C'est ce qui permet la bascule
 * `AUTH_PROVIDER` sans toucher aux routes métier.
 */
export class LocalVerifier {
  constructor(private readonly secret: string) {}

  async verify(token: string): Promise<SekuuContext> {
    return verifyAccess(this.secret, token);
  }
}

/**
 * Composite : essaie le local, puis Sekuu.
 *
 * Pendant la transition, les deux sortes de jetons coexistent — les tests
 * historiques signent en RS256 Sekuu, les nouveaux comptes en HS256 local.
 * Quand Sekuu reviendra, ce composite choisira selon `AUTH_PROVIDER` ;
 * en attendant, essayer les deux évite un drapeau qui casserait la moitié
 * de la suite selon sa valeur.
 */
export class CompositeVerifier {
  constructor(
    private readonly local: LocalVerifier | null,
    private readonly sekuu: { verify(token: string): Promise<SekuuContext> } | null,
  ) {}

  async verify(token: string): Promise<SekuuContext> {
    const failures: string[] = [];
    if (this.local) {
      try {
        return await this.local.verify(token);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'local');
      }
    }
    if (this.sekuu) {
      try {
        return await this.sekuu.verify(token);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'sekuu');
      }
    }
    throw new InvalidSekuuToken(failures.join(' ; ') || 'aucun vérifieur configuré');
  }
}
