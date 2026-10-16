import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invites, sessions, users, type Role } from '../db/schema.js';
import type { Config } from '../config.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { generateInviteToken, hashToken, newId, expiryFromDays } from '../security/tokens.js';
import { recordAudit, requestMeta } from '../security/audit.js';
import {
  createSession,
  findActiveSessionWithUser,
  findSessionByToken,
  listActiveSessions,
  revokeAllForUser,
  revokeFamily,
  revokeSession,
} from '../security/sessions.js';

const accountInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
const inviteAcceptInput = accountInput.extend({
  token: z.string().min(20).max(200),
});
const inviteCreateInput = z.object({ email: z.string().trim().toLowerCase().email().max(254).optional() });
const idInput = z.object({ id: z.string().uuid() });

const CLIENT_HEADER = 'x-nebula-client';
const REFRESH_PATH = '/v1/auth';

function fail(reason: string) {
  return { error: reason };
}

function asRole(value: string): Role {
  return value === 'owner' ? 'owner' : 'member';
}

export function createGuards(db: NodePgDatabase) {
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    let payload: unknown;
    try {
      payload = await request.jwtVerify();
    } catch {
      return reply.code(401).send(fail('unauthorized'));
    }
    const sid = payload && typeof payload === 'object' && typeof (payload as { sid?: unknown }).sid === 'string'
      ? (payload as { sid: string }).sid
      : null;
    if (!sid) return reply.code(401).send(fail('unauthorized'));
    const row = await findActiveSessionWithUser(db, sid);
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
      return reply.code(401).send(fail('unauthorized'));
    }
    request.principal = { userId: row.userId, role: asRole(row.role), sessionId: row.sessionId };
  };

  const requireOwner = async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (!request.principal) return;
    if (request.principal.role !== 'owner') return reply.code(403).send(fail('forbidden'));
  };

  return { requireAuth, requireOwner };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  { db, config }: { db: NodePgDatabase; config: Config },
): void {
  const { requireAuth } = createGuards(db);

  const signAccess = (user: { id: string; role: string }, sessionId: string) =>
    app.jwt.sign({ sub: user.id, role: asRole(user.role), sid: sessionId }, { expiresIn: config.accessTtlSeconds });

  const setRefreshCookie = (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(config.cookieName, token, {
      path: REFRESH_PATH,
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      domain: config.cookieDomain,
      expires: expiresAt,
    });
  };

  const clearRefreshCookie = (reply: FastifyReply) => {
    reply.clearCookie(config.cookieName, { path: REFRESH_PATH, domain: config.cookieDomain });
  };

  const readRefreshToken = (request: FastifyRequest): string | null => {
    const fromCookie = request.cookies?.[config.cookieName];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
    const body = request.body as { refreshToken?: unknown } | undefined;
    if (body && typeof body.refreshToken === 'string' && body.refreshToken.length > 0) return body.refreshToken;
    return null;
  };

  const hasClientHeader = (request: FastifyRequest): boolean => {
    const header = request.headers[CLIENT_HEADER];
    return typeof header === 'string' && header.length > 0;
  };

  const issueSession = async (
    user: { id: string; role: string },
    request: FastifyRequest,
    reply: FastifyReply,
    familyId?: string,
  ) => {
    const meta = requestMeta(request);
    const session = await createSession(db, user.id, config.refreshTtlDays, meta, familyId);
    setRefreshCookie(reply, session.refreshToken, session.expiresAt);
    return signAccess(user, session.id);
  };

  app.post('/v1/auth/register', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!config.allowPublicRegistration) return reply.code(403).send(fail('registration_closed'));
    const parsed = accountInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('invalid_credentials_format'));
    const { email, password } = parsed.data;
    const hash = await hashPassword(password);
    try {
      const [user] = await db
        .insert(users)
        .values({ id: randomUUID(), email, passwordHash: hash, role: 'member' })
        .returning({ id: users.id, email: users.email, role: users.role });
      const accessToken = await issueSession(user, request, reply);
      await recordAudit(db, { actorUserId: user.id, action: 'account_registered', ...requestMeta(request) });
      return reply.code(201).send({ user, accessToken, expiresInSeconds: config.accessTtlSeconds });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return reply.code(409).send(fail('account_already_exists'));
      request.log.error(error);
      return reply.code(500).send(fail('server_error'));
    }
  });

  app.post('/v1/auth/login', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = accountInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('invalid_credentials_format'));
    const [user] = await db
      .select({ id: users.id, email: users.email, role: users.role, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    const meta = requestMeta(request);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      await recordAudit(db, { action: 'login_failed', target: parsed.data.email, ...meta });
      return reply.code(401).send(fail('invalid_credentials'));
    }
    const accessToken = await issueSession(user, request, reply);
    await recordAudit(db, { actorUserId: user.id, action: 'login_succeeded', ...meta });
    return { user: { id: user.id, email: user.email, role: asRole(user.role) }, accessToken, expiresInSeconds: config.accessTtlSeconds };
  });

  app.post('/v1/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!hasClientHeader(request)) return reply.code(400).send(fail('missing_client_header'));
    const meta = requestMeta(request);
    const token = readRefreshToken(request);
    if (!token) return reply.code(401).send(fail('missing_refresh_token'));
    const session = await findSessionByToken(db, token);
    if (!session) {
      await recordAudit(db, { action: 'refresh_failed', ...meta });
      clearRefreshCookie(reply);
      return reply.code(401).send(fail('invalid_refresh_token'));
    }
    if (session.revokedAt) {
      await revokeFamily(db, session.familyId, 'reuse_detected');
      await recordAudit(db, { actorUserId: session.userId, action: 'session_family_revoked', target: session.familyId, ...meta });
      clearRefreshCookie(reply);
      return reply.code(401).send(fail('refresh_token_reused'));
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await revokeSession(db, session.id, 'expired');
      clearRefreshCookie(reply);
      return reply.code(401).send(fail('refresh_token_expired'));
    }
    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!user) {
      await revokeSession(db, session.id, 'user_missing');
      clearRefreshCookie(reply);
      return reply.code(401).send(fail('invalid_refresh_token'));
    }
    await revokeSession(db, session.id, 'rotated');
    const accessToken = await issueSession(user, request, reply, session.familyId);
    await recordAudit(db, { actorUserId: user.id, action: 'token_refreshed', ...meta });
    return { accessToken, expiresInSeconds: config.accessTtlSeconds };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    if (!hasClientHeader(request)) return reply.code(400).send(fail('missing_client_header'));
    const meta = requestMeta(request);
    let sessionId: string | null = null;
    try {
      const payload = await request.jwtVerify();
      if (payload && typeof payload === 'object' && typeof (payload as { sid?: unknown }).sid === 'string') {
        sessionId = (payload as { sid: string }).sid;
      }
    } catch {
      sessionId = null;
    }
    if (!sessionId) {
      const token = readRefreshToken(request);
      if (token) {
        const session = await findSessionByToken(db, token);
        sessionId = session?.id ?? null;
      }
    }
    if (sessionId) {
      const [owned] = await db
        .select({ userId: sessions.userId })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      await revokeSession(db, sessionId, 'logout');
      await recordAudit(db, { actorUserId: owned?.userId ?? null, action: 'logout', ...meta });
    }
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.get('/v1/auth/sessions', { preHandler: requireAuth }, async (request) => {
    const principal = request.principal!;
    const items = await listActiveSessions(db, principal.userId);
    return {
      items: items.map((session) => ({ ...session, current: session.id === principal.sessionId })),
    };
  });

  app.delete('/v1/auth/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    if (!params.success) return reply.code(400).send(fail('invalid_session_id'));
    const principal = request.principal!;
    const [owned] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, params.data.id))
      .limit(1);
    if (!owned || owned.userId !== principal.userId) return reply.code(404).send(fail('session_not_found'));
    await revokeSession(db, params.data.id, 'revoked_by_user');
    await recordAudit(db, { actorUserId: principal.userId, action: 'session_revoked', target: params.data.id, ...requestMeta(request) });
    return reply.code(204).send();
  });

  app.post('/v1/auth/sessions/revoke-all', { preHandler: requireAuth }, async (request) => {
    const principal = request.principal!;
    await revokeAllForUser(db, principal.userId, 'revoked_all', principal.sessionId);
    await recordAudit(db, { actorUserId: principal.userId, action: 'sessions_revoked_all', ...requestMeta(request) });
    return { revoked: true };
  });

  app.post('/v1/auth/accept-invite', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = inviteAcceptInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('invalid_invite_payload'));
    const meta = requestMeta(request);
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, hashToken(parsed.data.token)), isNull(invites.usedAt)))
      .limit(1);
    if (!invite || invite.expiresAt.getTime() <= Date.now()) {
      await recordAudit(db, { action: 'invite_rejected', ...meta });
      return reply.code(401).send(fail('invalid_invite'));
    }
    const email = invite.email ?? parsed.data.email;
    if (invite.email && invite.email !== parsed.data.email) {
      return reply.code(400).send(fail('invite_email_mismatch'));
    }
    const hash = await hashPassword(parsed.data.password);
    try {
      const [user] = await db
        .insert(users)
        .values({ id: newId(), email, passwordHash: hash, role: 'member' })
        .returning({ id: users.id, email: users.email, role: users.role });
      await db
        .update(invites)
        .set({ usedAt: new Date(), usedBy: user.id })
        .where(eq(invites.id, invite.id));
      const accessToken = await issueSession(user, request, reply);
      await recordAudit(db, { actorUserId: user.id, action: 'invite_accepted', target: invite.id, ...meta });
      return reply.code(201).send({ user, accessToken, expiresInSeconds: config.accessTtlSeconds });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return reply.code(409).send(fail('account_already_exists'));
      request.log.error(error);
      return reply.code(500).send(fail('server_error'));
    }
  });
}

export function registerAdminRoutes(
  app: FastifyInstance,
  { db }: { db: NodePgDatabase },
): void {
  const { requireOwner } = createGuards(db);

  app.post('/v1/admin/invites', { preHandler: requireOwner }, async (request, reply) => {
    const parsed = inviteCreateInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(fail('invalid_invite_input'));
    const token = generateInviteToken();
    const expiresAt = expiryFromDays(7);
    const [invite] = await db
      .insert(invites)
      .values({
        id: newId(),
        email: parsed.data.email ?? null,
        tokenHash: hashToken(token),
        createdBy: request.principal!.userId,
        expiresAt,
      })
      .returning({ id: invites.id, email: invites.email, expiresAt: invites.expiresAt });
    await recordAudit(db, {
      actorUserId: request.principal!.userId,
      action: 'invite_created',
      target: invite.id,
      ...requestMeta(request),
    });
    return reply.code(201).send({ invite, token });
  });

  app.get('/v1/admin/users', { preHandler: requireOwner }, async () => {
    const items = await db
      .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.createdAt);
    return { items };
  });
}
