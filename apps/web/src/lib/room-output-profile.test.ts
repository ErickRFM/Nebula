import { describe, expect, it } from 'vitest';
import { normalizeRoomOutputProfile, readRoomOutputProfile, saveRoomOutputProfile } from './room-output-profile';

describe('Party Sound local output profiles', () => {
  function store() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
  }

  it('stores phone and Bluetooth calibration independently', () => {
    const storage = store();
    saveRoomOutputProfile(storage, 'device', { calibrationMs: -80, outputLatencyMs: 40 });
    saveRoomOutputProfile(storage, 'bluetooth', { calibrationMs: 170, outputLatencyMs: 260 });
    expect(readRoomOutputProfile(storage, 'device')).toEqual({ calibrationMs: -80, outputLatencyMs: 40 });
    expect(readRoomOutputProfile(storage, 'bluetooth')).toEqual({ calibrationMs: 170, outputLatencyMs: 260 });
  });

  it('rejects malformed values and clamps untrusted persisted data', () => {
    expect(normalizeRoomOutputProfile({ calibrationMs: 9000, outputLatencyMs: -10 }))
      .toEqual({ calibrationMs: 1000, outputLatencyMs: 0 });
    expect(normalizeRoomOutputProfile({ calibrationMs: 'Infinity', outputLatencyMs: NaN }))
      .toEqual({ calibrationMs: 0, outputLatencyMs: 0 });
    expect(normalizeRoomOutputProfile(null)).toEqual({ calibrationMs: 0, outputLatencyMs: 0 });
  });

  it('migrates the legacy single-slider calibration without losing it', () => {
    const storage = store();
    storage.setItem('nebula:party-calibration-ms:v1', '-150');
    expect(readRoomOutputProfile(storage, 'device')).toEqual({ calibrationMs: -150, outputLatencyMs: 0 });
    expect(readRoomOutputProfile(storage, 'bluetooth')).toEqual({ calibrationMs: 0, outputLatencyMs: 0 });
  });

  it('survives blocked browser storage', () => {
    const storage = { getItem: (_key: string): string | null => { throw Error('blocked'); }, setItem: (_key: string, _value: string): void => { throw Error('blocked'); } };
    expect(readRoomOutputProfile(storage, 'device')).toEqual({ calibrationMs: 0, outputLatencyMs: 0 });
    expect(() => saveRoomOutputProfile(storage, 'bluetooth', { calibrationMs: 30, outputLatencyMs: 90 })).not.toThrow();
  });
});
