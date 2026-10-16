import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { auditEvents } from '../db/schema.js';
import { newId } from './tokens.js';

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  target?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(db: NodePgDatabase, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId(),
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    target: input.target ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    metadata: input.metadata ?? {},
  });
}

export function requestMeta(request: { ip?: string; headers: Record<string, unknown> }): { ip: string | null; userAgent: string | null } {
  const agent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: typeof agent === 'string' ? agent : null,
  };
}
