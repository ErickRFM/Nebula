import { describe, expect, it, vi } from 'vitest';
import { reorderQueue, withRevisionRetry } from './room-actions';

describe('reorderQueue', () => {
  it('swaps one item with its neighbour without mutating the source', () => {
    const source = ['a', 'b', 'c'];
    expect(reorderQueue(source, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(reorderQueue(source, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('rejects out-of-range moves instead of producing a partial order', () => {
    expect(reorderQueue(['a', 'b'], 0, -1)).toBeNull();
    expect(reorderQueue(['a', 'b'], 1, 1)).toBeNull();
    expect(reorderQueue(['a', 'b'], 2, -1)).toBeNull();
    expect(reorderQueue([], 0, 1)).toBeNull();
    expect(reorderQueue(['a'], 0.5, 1)).toBeNull();
  });
});

describe('withRevisionRetry', () => {
  const conflict = Object.assign(new Error('conflict'), { status: 409 });
  const isConflict = (cause: unknown) => (cause as { status?: number }).status === 409;

  it('returns the first result without reloading when there is no conflict', async () => {
    const reloadRevision = vi.fn(async () => 99);
    const send = vi.fn(async (revision: number) => 'rev-' + revision);
    await expect(withRevisionRetry({ initialRevision: 4, send, reloadRevision, isConflict })).resolves.toBe('rev-4');
    expect(reloadRevision).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reloads the authoritative revision and resends once after a conflict', async () => {
    const reloadRevision = vi.fn(async () => 8);
    const send = vi.fn(async (revision: number) => {
      if (revision === 4) throw conflict;
      return 'rev-' + revision;
    });
    await expect(withRevisionRetry({ initialRevision: 4, send, reloadRevision, isConflict })).resolves.toBe('rev-8');
    expect(reloadRevision).toHaveBeenCalledTimes(1);
    expect(send.mock.calls.map(call => call[0])).toEqual([4, 8]);
  });

  it('does not retry non-conflict failures', async () => {
    const reloadRevision = vi.fn(async () => 8);
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 });
    const send = vi.fn(async () => { throw forbidden; });
    await expect(withRevisionRetry({ initialRevision: 4, send, reloadRevision, isConflict })).rejects.toBe(forbidden);
    expect(reloadRevision).not.toHaveBeenCalled();
  });

  it('propagates a second conflict so the UI reports the real cause', async () => {
    const reloadRevision = vi.fn(async () => 8);
    const send = vi.fn(async () => { throw conflict; });
    await expect(withRevisionRetry({ initialRevision: 4, send, reloadRevision, isConflict })).rejects.toBe(conflict);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
