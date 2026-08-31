import type { SekuuContext, SekuuRole } from './sekuu-context.js';

/**
 * Ce qu'un rôle Sekuu autorise **chez Neftya**.
 *
 * La plateforme dit qu'un utilisateur est `admin` de son organisation ; elle ne dit pas ce
 * qu'un `admin` peut faire ici, et c'est très bien ainsi — c'est le métier de Neftya, pas
 * le sien.
 *
 * Les `scopes` de la plateforme (`organization.manage`, `users.invite`…) ne sont **jamais**
 * réutilisés pour ces droits : le jour où Sekuu en ajoute un, l'autorisation de Neftya
 * changerait sans que personne ne l'ait décidé.
 *
 * @see docs/SEKUU.md §6
 */

export type Permission =
  | 'project.read'
  | 'project.write'
  | 'project.delete'
  | 'settings.write'
  /**
   * Le besoin métier réel : un menuisier salarié accède au plan de découpe et au guide
   * d'assemblage sans voir les marges. Sekuu n'a pas de rôle `carpenter` et n'en aura pas ;
   * c'est à Neftya de décider ce que `member` autorise.
   */
  | 'costs.read';

const GRANTS: Record<Permission, readonly SekuuRole[]> = {
  'project.read': ['owner', 'admin', 'billing_manager', 'member'],
  'project.write': ['owner', 'admin', 'member'],
  'project.delete': ['owner', 'admin'],
  'settings.write': ['owner', 'admin'],
  'costs.read': ['owner', 'admin'],
};

export function can(context: SekuuContext, permission: Permission): boolean {
  return context.roles.some((role) => GRANTS[permission].includes(role));
}
