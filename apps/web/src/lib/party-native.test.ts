import { describe, expect, it } from 'vitest';
import { sanitizeNearbyServices } from './party-native';

describe('nearby NÉBULA discovery boundary', () => {
  it('shows only plausible advertised services without duplicates', () => {
    expect(sanitizeNearbyServices({ services: [
      { id: 'a', name: 'NÉBULA A' }, { id: 'a', name: 'duplicate' },
      { id: 'b', name: 'NÉBULA B' }, { id: '', name: 'invalid' },
    ] })).toEqual([{ id: 'a', name: 'NÉBULA A' }, { id: 'b', name: 'NÉBULA B' }]);
  });
  it('rejects malformed input', () => {
    expect(sanitizeNearbyServices({ services: 'fake' })).toEqual([]);
    expect(sanitizeNearbyServices(null)).toEqual([]);
    expect(sanitizeNearbyServices({ services: [{ id: 'x', name: '' }] })).toEqual([]);
  });
});
