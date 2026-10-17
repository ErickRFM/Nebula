export type RoomOutputKind = 'device' | 'bluetooth';
export type RoomOutputProfile = { calibrationMs: number; outputLatencyMs: number };

const prefix = 'nebula:room-output-profile:v1:';
const legacyKey = 'nebula:party-calibration-ms:v1';
const defaults: RoomOutputProfile = { calibrationMs: 0, outputLatencyMs: 0 };

function clamp(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)) / 10) * 10
    : 0;
}

export function normalizeRoomOutputProfile(value: unknown): RoomOutputProfile {
  if (!value || typeof value !== 'object') return { ...defaults };
  const profile = value as Record<string, unknown>;
  return {
    calibrationMs: clamp(profile.calibrationMs, -1000, 1000),
    outputLatencyMs: clamp(profile.outputLatencyMs, 0, 1000),
  };
}

/** Device-specific browser settings; not a measurement of acoustic alignment. */
export function readRoomOutputProfile(
  storage: Pick<Storage, 'getItem'>, output: RoomOutputKind,
): RoomOutputProfile {
  try {
    const raw = storage.getItem(prefix + output);
    if (raw) return normalizeRoomOutputProfile(JSON.parse(raw) as unknown);
    // Preserve calibration from the original single-slider Party Sound UI.
    if (output === 'device') {
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) return normalizeRoomOutputProfile({ calibrationMs: Number(legacy) });
    }
  } catch { /* storage may be disabled or data may be invalid */ }
  return { ...defaults };
}

export function saveRoomOutputProfile(
  storage: Pick<Storage, 'setItem'>, output: RoomOutputKind, value: RoomOutputProfile,
): void {
  try { storage.setItem(prefix + output, JSON.stringify(normalizeRoomOutputProfile(value))); }
  catch { /* audio must still work when storage is unavailable */ }
}
