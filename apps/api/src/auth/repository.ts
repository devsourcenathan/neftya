import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../db/schema.js';
import type { OrganizationRole } from '@neftya/contracts';

/**
 * Persistance de l'identité locale.
 *
 * Mince par construction (ENGINEERING.md §7) : du SQL, pas de règle métier.
 * Les règles — un seul owner, invitation à usage unique, rotation des
 * sessions — vivent dans les routes, testées.
 */

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  language: string;
}

export interface MembershipRow {
  organizationId: string;
  organizationName: string;
  slug: string;
  role: OrganizationRole;
}

/**
 * Le palier gratuit, décidé le 6 octobre 2026.
 *
 * Trois projets : assez pour éprouver le moteur sur de vrais meubles, trop peu pour faire
 * tourner un atelier. Cinq analyses par mois, parce que l'IA est la seule fonction qui
 * dépense de l'argent réel à chaque appel. Un membre, parce que le collectif est ce que
 * vendent les paliers supérieurs.
 *
 * **Les exports ne sont pas bridés**, contrairement à ce qu'annonçait le brief : le plan de
 * découpe est exactement ce qu'on veut faire essayer à un menuisier, et brider le seul
 * livrable qui prouve la justesse du moteur, c'est brider la démonstration.
 *
 * @see docs/BRIEF.md section 5
 */
export const FREE_TIER = {
  projects_max: 3,
  ai_month_max: 5,
  members_max: 1,
} as const;

/** Les trois plafonds d'une organisation. `null` vaut illimité. */
export interface Quotas {
  projectsMax: number | null;
  aiMonthMax: number | null;
  membersMax: number | null;
}

export class AuthRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'first_name', 'last_name', 'language'])
      .where((expression) => expression(sql`lower(email)`, '=', email.toLowerCase()))
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      firstName: row.first_name,
      lastName: row.last_name,
      language: row.language,
    };
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<UserRow> {
    const id = uuidv7();
    await this.db
      .insertInto('users')
      .values({
        id,
        email: input.email,
        password_hash: input.passwordHash,
        first_name: input.firstName,
        last_name: input.lastName,
        language: 'fr',
      })
      .execute();
    return {
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      language: 'fr',
    };
  }

  async createOrganization(input: {
    name: string;
    createdBy: string;
  }): Promise<{ id: string; name: string; slug: string }> {
    const id = uuidv7();
    const slug = await this.uniqueSlug(input.name);
    await this.db
      .insertInto('organizations')
      .values({ id, name: input.name, slug, created_by: input.createdBy })
      .execute();
    await this.db
      .insertInto('memberships')
      .values({ organization_id: id, user_id: input.createdBy, role: 'owner' })
      .execute();

    /*
     * **Une organisation naît au palier gratuit.**
     *
     * Sans ligne de quotas, elle serait non couverte, donc illimitée — et le palier gratuit
     * du brief ne serait qu'une ligne dans un tableau. Il est posé ici plutôt qu'à
     * l'inscription parce que `createOrganization` est le seul passage obligé : l'inscription
     * et la création d'un second atelier y arrivent toutes les deux.
     *
     * Les organisations créées avant cette décision gardent leur absence de ligne, donc leur
     * absence de plafond. Les plafonner après coup aurait fermé des projets déjà créés, et un
     * quota qui se retourne contre l'existant est la leçon de SEKUU.md section 5.
     */
    await this.db
      .insertInto('organization_quotas')
      .values({ organization_id: id, ...FREE_TIER })
      .onConflict((conflict) => conflict.column('organization_id').doNothing())
      .execute();

    return { id, name: input.name, slug };
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'first_name', 'last_name', 'language'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      firstName: row.first_name,
      lastName: row.last_name,
      language: row.language,
    };
  }

  async membershipsOf(userId: string): Promise<MembershipRow[]> {
    const rows = await this.db
      .selectFrom('memberships')
      .innerJoin('organizations', 'organizations.id', 'memberships.organization_id')
      .select([
        'memberships.organization_id',
        'organizations.name',
        'organizations.slug',
        'memberships.role',
      ])
      .where('memberships.user_id', '=', userId)
      .orderBy('organizations.created_at', 'asc')
      .execute();
    return rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.name,
      slug: row.slug,
      role: row.role,
    }));
  }

  async roleOf(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationRole | null> {
    const row = await this.db
      .selectFrom('memberships')
      .select('role')
      .where('organization_id', '=', organizationId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  async createRefreshSession(input: {
    userId: string;
    organizationId: string | null;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<string> {
    const id = uuidv7();
    await this.db
      .insertInto('refresh_sessions')
      .values({
        id,
        user_id: input.userId,
        organization_id: input.organizationId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        revoked_at: null,
      })
      .execute();
    return id;
  }

  async findRefreshSession(tokenHash: string): Promise<{
    id: string;
    userId: string;
    organizationId: string | null;
    expired: boolean;
    revoked: boolean;
  } | null> {
    const row = await this.db
      .selectFrom('refresh_sessions')
      .select(['id', 'user_id', 'organization_id', 'expires_at', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      expired: row.expires_at.getTime() <= Date.now(),
      revoked: row.revoked_at !== null,
    };
  }

  /**
   * Rotation : l'ancienne ligne est révoquée, une nouvelle naît.
   * Garder l'ancienne ligne (révoquée) permet la détection de vol : rejouer
   * un jeton déjà tourné trouve une ligne révoquée, et toute la session
   * de l'utilisateur est alors révoquée.
   */
  async rotateRefreshSession(
    sessionId: string,
    next: {
      userId: string;
      organizationId: string | null;
      tokenHash: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('refresh_sessions')
        .set({ revoked_at: new Date() })
        .where('id', '=', sessionId)
        .execute();
      await trx
        .insertInto('refresh_sessions')
        .values({
          id: uuidv7(),
          user_id: next.userId,
          organization_id: next.organizationId,
          token_hash: next.tokenHash,
          expires_at: next.expiresAt,
          revoked_at: null,
        })
        .execute();
    });
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    await this.db
      .updateTable('refresh_sessions')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .execute();
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.db
      .updateTable('refresh_sessions')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async createInvitation(input: {
    organizationId: string;
    email: string;
    role: 'admin' | 'member';
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<string> {
    const id = uuidv7();
    await this.db
      .insertInto('invitations')
      .values({
        id,
        organization_id: input.organizationId,
        email: input.email,
        role: input.role,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        accepted_at: null,
        created_by: input.createdBy,
      })
      .execute();
    return id;
  }

  async consumeInvitation(tokenHash: string): Promise<{
    id: string;
    organizationId: string;
    email: string;
    role: 'admin' | 'member';
  } | null> {
    const row = await this.db
      .selectFrom('invitations')
      .select(['id', 'organization_id', 'email', 'role', 'expires_at', 'accepted_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row || row.accepted_at || row.expires_at.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role,
    };
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const invitation = await trx
        .selectFrom('invitations')
        .select(['organization_id', 'role'])
        .where('id', '=', invitationId)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('memberships')
        .values({
          organization_id: invitation.organization_id,
          user_id: userId,
          role: invitation.role,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
      await trx
        .updateTable('invitations')
        .set({ accepted_at: new Date() })
        .where('id', '=', invitationId)
        .execute();
    });
  }

  /**
   * Plafonds d'une organisation. `null` = pas de ligne, donc ressource non
   * couverte : ne pas plafonner (trois états, comme les claims Sekuu).
   */
  async getQuotas(organizationId: string): Promise<Quotas | null> {
    const row = await this.db
      .selectFrom('organization_quotas')
      .select(['projects_max', 'ai_month_max', 'members_max'])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      projectsMax: row.projects_max,
      aiMonthMax: row.ai_month_max,
      membersMax: row.members_max,
    };
  }

  async saveQuotas(organizationId: string, quotas: Partial<Quotas>): Promise<Quotas> {
    const existing = await this.getQuotas(organizationId);
    // Un champ absent ne change rien ; `null` le rend illimité. Les deux sont des
    // intentions différentes, et les confondre effacerait un plafond qu'on n'a pas touché.
    const keep = <K extends keyof Quotas>(key: K): number | null =>
      quotas[key] !== undefined
        ? (quotas[key] as number | null)
        : (existing?.[key] ?? null);

    const next: Quotas = {
      projectsMax: keep('projectsMax'),
      aiMonthMax: keep('aiMonthMax'),
      membersMax: keep('membersMax'),
    };

    const columns = {
      projects_max: next.projectsMax,
      ai_month_max: next.aiMonthMax,
      members_max: next.membersMax,
    };

    await this.db
      .insertInto('organization_quotas')
      .values({ organization_id: organizationId, ...columns })
      .onConflict((conflict) =>
        conflict
          .column('organization_id')
          .doUpdateSet({ ...columns, updated_at: new Date() }),
      )
      .execute();

    return next;
  }

  /** Combien de membres compte l'organisation, propriétaire compris. */
  async countMembers(organizationId: string): Promise<number> {
    const { count } = await this.db
      .selectFrom('memberships')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('organization_id', '=', organizationId)
      .executeTakeFirstOrThrow();
    return count;
  }

  /**
   * Les invitations en attente comptent **comme des membres**.
   *
   * Sans cela, un atelier au plafond envoie dix invitations et se retrouve à onze : chacune
   * est acceptée plus tard, une par une, et aucune ne voit les autres. Le plafond se
   * vérifierait dix fois sans être tenu une seule.
   */
  async countPendingInvitations(organizationId: string): Promise<number> {
    const { count } = await this.db
      .selectFrom('invitations')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('organization_id', '=', organizationId)
      .where('accepted_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirstOrThrow();
    return count;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 60) || 'atelier';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.db
        .selectFrom('organizations')
        .select('id')
        .where('slug', '=', candidate)
        .executeTakeFirst();
      if (!existing) return candidate;
    }
    return `${base}-${uuidv7().slice(0, 8)}`;
  }
}
