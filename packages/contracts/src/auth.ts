import { z } from 'zod';

/**
 * Contrats d'authentification locale Neftya.
 *
 * Un type métier est déclaré une fois, ici, et importé partout : l'API valide
 * avec ces schémas, l'interface les réutilise pour ses formulaires.
 * Le type TypeScript est toujours inféré, jamais réécrit à côté.
 *
 * @see docs/ENGINEERING.md §4
 * @see docs/AUTH_LOCAL.md
 */

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .describe('Adresse email du compte. Normalisée : rognée et en minuscules.');

export const password = z
  .string()
  .min(12, 'Douze caractères au moins.')
  .max(256, '256 caractères au plus.')
  .describe("Mot de passe en clair, jamais stocké : seul son condensat scrypt l'est.");

export const registerBody = z.object({
  email,
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  /** L'atelier créé avec le compte. Un compte naît toujours dans une organisation. */
  organizationName: z.string().trim().min(1).max(120),
});

export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email,
  password: z.string().min(1, 'Mot de passe requis.'),
});

export type LoginBody = z.infer<typeof loginBody>;

export const refreshBody = z.object({
  refreshToken: z.string().min(1, 'Jeton de rafraîchissement requis.'),
});

export type RefreshBody = z.infer<typeof refreshBody>;

export const createOrganizationBody = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CreateOrganizationBody = z.infer<typeof createOrganizationBody>;

export const switchOrganizationBody = z.object({
  organizationId: z.uuid(),
});

export type SwitchOrganizationBody = z.infer<typeof switchOrganizationBody>;

export const inviteBody = z.object({
  email,
  role: z.enum(['admin', 'member']),
});

export type InviteBody = z.infer<typeof inviteBody>;

export const acceptInviteBody = z.object({
  token: z.string().min(1, "Jeton d'invitation requis."),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export type AcceptInviteBody = z.infer<typeof acceptInviteBody>;

/** Rôle local. `owner` : créateur, un seul par organisation, incessible sauf transfert explicite. */
export const organizationRole = z.enum(['owner', 'admin', 'member']);
export type OrganizationRole = z.infer<typeof organizationRole>;

export const sessionResource = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  organizations: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      role: organizationRole,
    }),
  ),
  organizationId: z.uuid().nullable(),
});

export type SessionResource = z.infer<typeof sessionResource>;

/**
 * Plafonds d'une organisation. `null` = illimité, champ absent = inchangé.
 * Seul `owner` peut les écrire ; tout membre actif peut les lire.
 */
export const quotasBody = z.object({
  projectsMax: z.number().int().nonnegative().nullable().optional(),
  aiMonthMax: z.number().int().nonnegative().nullable().optional(),
  /**
   * Au moins un : celui qui crée l'organisation en est le propriétaire, et un plafond de
   * zéro la rendrait invalide à l'instant de sa création.
   */
  membersMax: z.number().int().min(1).nullable().optional(),
});

export type QuotasBody = z.infer<typeof quotasBody>;

export const quotasResource = z.object({
  projectsMax: z.number().int().nonnegative().nullable(),
  aiMonthMax: z.number().int().nonnegative().nullable(),
  membersMax: z.number().int().nonnegative().nullable(),
});

export type QuotasResource = z.infer<typeof quotasResource>;
