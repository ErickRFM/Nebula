import { describe, expect, it } from 'vitest';
import { expiryFromDays, generateInviteToken, generateRefreshToken, hashToken, newId } from './tokens';

describe('security tokens', () => {
  it('generates high-entropy, unique refresh tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique invite tokens and ids', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
    expect(newId()).not.toBe(newId());
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hashes tokens deterministically and irreversibly', () => {
    const token = 'example-refresh-token';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });

  it('computes future expiries from days', () => {
    const before = Date.now();
    const expiry = expiryFromDays(30).getTime();
    expect(expiry).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(before + 30 * 24 * 60 * 60 * 1000 + 1000);
  });
});
