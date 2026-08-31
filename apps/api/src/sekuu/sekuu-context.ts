/**
 * Qui appelle, résolu une fois par requête depuis un jeton de la plateforme.
 *
 * Remplace ce qu'un `auth()->user()` ferait ailleurs. Ce n'est délibérément pas un modèle
 * de base : **Neftya n'a pas de table `users`**, et tout l'intérêt est qu'il n'en gagne
 * jamais une. Une copie diverge, et le jour d'une demande d'effacement personne ne sait
 * qu'elle existe.
 *
 * @see docs/SEKUU.md §2, §3
 */

export type SekuuRole = 'owner' | 'admin' | 'billing_manager' | 'member';

export const SEKUU_ROLES: readonly SekuuRole[] = [
  'owner',
  'admin',
  'billing_manager',
  'member',
];

/**
 * Les quotas accordés par Billing, portés par le jeton.
 *
 * **Trois états, pas deux** : clé absente signifie « ce plan ne couvre pas cette
 * ressource », `null` signifie illimité, un entier est un plafond. Confondre les deux
 * premiers bloquerait, le jour où une clé est ajoutée au catalogue, tous les clients
 * existants.
 *
 * @see docs/SEKUU.md §5
 */
export type SekuuLimits = Record<string, number | null>;

export interface SekuuContext {
  /** Le `sub` de la plateforme. Jamais stocké comme clé étrangère. */
  readonly userId: string;
  /** Le client. La frontière d'isolation, et elle vient du jeton. */
  readonly organizationId: string;
  readonly roles: readonly SekuuRole[];
  /** Ce à quoi l'organisation a droit. Doit contenir `neftya`. */
  readonly products: readonly string[];
  readonly limits: SekuuLimits;
  /** La session de la plateforme : pour journaliser, jamais pour autoriser. */
  readonly sessionId: string | null;
  readonly language: string;
}

/**
 * Lit un plafond, en distinguant les trois états.
 *
 * `undefined` signifie « ne pas plafonner » — que la clé soit absente ou explicitement
 * illimitée. C'est au seul appelant qui compte une ressource de savoir quoi en faire.
 */
export function limitOf(context: SekuuContext, key: string): number | undefined {
  const value = context.limits[key];
  return typeof value === 'number' ? value : undefined;
}
