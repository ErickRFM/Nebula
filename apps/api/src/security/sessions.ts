import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { sessions, users } from '../db/schema.js';
import { expiryFromDays, generateRefreshToken, hashToken, newId } from './tokens.js';

export type SessionContext = {
  userAgent?: string | null;
  ip?: string | null;
};

export type CreatedSession = {
  id: string;
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
};

export async function createSession(
  db: NodePgDatabase,
  userId: string,
  ttlDays: number,
  context: SessionContext,
  familyId?: string,
): Promise<CreatedSession> {
  const refreshToken = generateRefreshToken();
  const id = newId();
  const family = familyId ?? id;
  const expiresAt = expiryFromDays(ttlDays);
  await db.insert(sessions).values({
    id,
    userId,
    familyId: family,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: context.userAgent ? context.userAgent.slice(0, 300) : null,
    ip: context.ip ?? null,
    expiresAt,
  });
  return { id, familyId: family, refreshToken, expiresAt };
}

export async function findSessionByToken(db: NodePgDatabase, refreshToken: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, hashToken(refreshToken)))
    .limit(1);
  return row ?? null;
}

export async function findActiveSessionWithUser(db: NodePgDatabase, sessionId: string) {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      role: users.role,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

export async function revokeSession(db: NodePgDatabase, sessionId: string, reason: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeFamily(db: NodePgDatabase, familyId: string, reason: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
}

export async function revokeAllForUser(db: NodePgDatabase, userId: string, reason: string, exceptSessionId?: string): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(...conditions));
}

export async function markSessionUsed(db: NodePgDatabase, sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function listActiveSessions(db: NodePgDatabase, userId: string) {
  return db
    .select({
      id: sessions.id,
      familyId: sessions.familyId,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastUsedAt));
}
