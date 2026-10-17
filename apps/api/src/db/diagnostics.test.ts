import { describe, expect, it } from 'vitest';
import { classifyDatabaseFailure } from './diagnostics';

describe('safe database failure diagnostics', () => {
  it('classifies common pool failures without exposing the connection string', () => {
    expect(classifyDatabaseFailure({ code: '28P01', message: 'password authentication failed for postgres://secret' }))
      .toEqual({ category: 'credentials', code: '28P01' });
    expect(classifyDatabaseFailure({ code: 'ENOTFOUND', hostname: 'private.example' }))
      .toEqual({ category: 'network', code: 'ENOTFOUND' });
    expect(classifyDatabaseFailure({ code: 'ETIMEDOUT' }))
      .toEqual({ category: 'timeout', code: 'ETIMEDOUT' });
  });
  it('does not copy arbitrary error strings into logs', () => {
    expect(classifyDatabaseFailure({ code: 'postgres://user:secret@host', message: 'sensitive' }))
      .toEqual({ category: 'unknown', code: 'unknown' });
    expect(classifyDatabaseFailure(new Error('postgresql://secret'))).toEqual({ category: 'unknown', code: 'unknown' });
  });
});
