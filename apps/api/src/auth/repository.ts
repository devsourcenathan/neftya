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
