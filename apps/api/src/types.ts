import type { Role } from './db/schema.js';

export type Principal = {
  userId: string;
  role: Role;
  sessionId: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
