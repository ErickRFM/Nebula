import { describe, expect, it } from 'vitest';
import { classifyDatabaseFailure, describeDatabaseConnectionShape } from './diagnostics';

describe('safe database failure diagnostics', () => {
  it('classifies common pool failures without exposing the connection string', () => {
    expect(classifyDatabaseFailure({ code: '28P01', message: 'password authentication failed for postgres://secret' }))
      .toEqual({ category: 'credentials', code: '28P01' });
    expect(classifyDatabaseFailure({ code: 'ENOTFOUND', hostname: 'private.example' }))
      .toEqual({ category: 'network', code: 'ENOTFOUND' });
    expect(classifyDatabaseFailure({ code: 'ETIMEDOUT' }))
      .toEqual({ category: 'timeout', code: 'ETIMEDOUT' });
  });
  it('recognizes generic Supabase pooler SQLSTATE without leaking messages', () => {
    expect(classifyDatabaseFailure({ code: 'XX000', message: 'Tenant or user not found for secret-host' }))
      .toEqual({ category: 'pooler_configuration', code: 'XX000' });
    expect(classifyDatabaseFailure({ code: 'XX000', message: 'Circuit breaker open' }))
      .toEqual({ category: 'pooler_capacity', code: 'XX000' });
  });
  it('describes connection shape without returning credentials or hostname', () => {
    const shape = describeDatabaseConnectionShape('postgresql://postgres.project:password123@aws-1-us-west-2.pooler.supabase.com:5432/postgres');
    expect(shape).toEqual({ valid: true, kind: 'pooler', poolerUsername: true, port: 5432 });
    expect(JSON.stringify(shape)).not.toContain('password123');
    expect(JSON.stringify(shape)).not.toContain('aws-1');
    expect(describeDatabaseConnectionShape('bad')).toEqual({ valid: false, kind: 'invalid', poolerUsername: false, port: null });
  });
  it('does not copy arbitrary error strings into logs', () => {
    expect(classifyDatabaseFailure({ code: 'postgres://user:secret@host', message: 'sensitive' }))
      .toEqual({ category: 'unknown', code: 'unknown' });
    expect(classifyDatabaseFailure(new Error('postgresql://secret'))).toEqual({ category: 'unknown', code: 'unknown' });
  });
});
