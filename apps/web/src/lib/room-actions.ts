/**
 * Room action primitives shared by the rooms panel. Pure and dependency-free so
 * optimistic queue changes and revision conflicts can be tested without a server.
 */

/** Move one queue item by one slot. Returns null when the move is out of range. */
export function reorderQueue<T>(items: readonly T[], index: number, direction: -1 | 1): T[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return null;
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type RevisionRetry<T> = {
  initialRevision: number;
  send: (revision: number) => Promise<T>;
  reloadRevision: () => Promise<number>;
  isConflict: (cause: unknown) => boolean;
};

/**
 * One recovery attempt for an optimistic-concurrency conflict: reload the
 * authoritative revision and resend once. Other errors, or a second conflict,
 * propagate unchanged so the UI can still report the real cause.
 */
export async function withRevisionRetry<T>({ initialRevision, send, reloadRevision, isConflict }: RevisionRetry<T>): Promise<T> {
  try {
    return await send(initialRevision);
  } catch (cause) {
    if (!isConflict(cause)) throw cause;
    const revision = await reloadRevision();
    return send(revision);
  }
}
