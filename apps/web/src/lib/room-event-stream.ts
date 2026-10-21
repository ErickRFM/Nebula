'use client';

import { useEffect, useRef } from 'react';
import { isAccountApiConfigured } from '../hooks/useAccount';

export type RoomEvent = { revision: number; participantCount: number };

/** Decode SSE frames across arbitrarily chunked network reads. */
export async function readRoomEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RoomEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (!signal?.aborted) {
      const next = await reader.read();
      if (next.done) break;
      pending += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
      if (pending.length > 32_768) throw new Error('room_event_frame_too_large');
      let cut = pending.indexOf('\n\n');
      while (cut >= 0) {
        const frame = pending.slice(0, cut);
        pending = pending.slice(cut + 2);
        const kind = frame.split('\n').find(line => line.startsWith('event: '))?.slice(7);
        const raw = frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
        if (kind === 'room' && raw.length) {
          let value: unknown;
          try { value = JSON.parse(raw); } catch { value = null; }
          if (value && typeof value === 'object' &&
              Number.isSafeInteger((value as RoomEvent).revision) &&
              Number.isSafeInteger((value as RoomEvent).participantCount) &&
              (value as RoomEvent).revision >= 0 &&
              (value as RoomEvent).participantCount >= 0) {
            onEvent(value as RoomEvent);
          }
        }
        cut = pending.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function parseRoomSocketMessage(payload: unknown): RoomEvent | null {
  if (typeof payload !== 'string' || payload.length > 1024) return null;
  try {
    const candidate: unknown = JSON.parse(payload);
    if (!candidate || typeof candidate !== 'object') return null;
    const value = candidate as RoomEvent & { type?: string };
    return value.type === 'room' && Number.isSafeInteger(value.revision) &&
      value.revision >= 0 && Number.isSafeInteger(value.participantCount) &&
      value.participantCount >= 0
      ? { revision: value.revision, participantCount: value.participantCount } : null;
  } catch { return null; }
}

/**
 * Short-lived one-use WebSocket subprotocol token (never in the URL), with
 * SSE + REST fallback. Enabled only after deploy-specific smoke tests using
 * NEXT_PUBLIC_NEBULA_WS_ENABLED=true; default remains SSE.
 */
export function useRoomEventStream(roomId: string | null, token: string | null, onEvent: (event: RoomEvent) => void): void {
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);
  useEffect(() => {
    if (!roomId || !token || !isAccountApiConfigured) return;
    const root = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
    const wsEnabled = process.env.NEXT_PUBLIC_NEBULA_WS_ENABLED === 'true' && !root;
    const controller = new AbortController();
    let disposed = false;
    let activeSocket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const onState = (event: RoomEvent) => { if (!disposed) handler.current(event); };
    const recheck = () => onState({ revision: -1, participantCount: 0 });

    async function streamSse(): Promise<void> {
      try {
        const response = await fetch(root + '/v1/rooms/' + encodeURIComponent(roomId!) + '/events', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' },
          cache: 'no-store', signal: controller.signal,
        });
        if ([401, 403, 404].includes(response.status)) { recheck(); return; }
        if (!response.ok || !response.body) return;
        attempts = 0;
        await readRoomEventStream(response.body, onState, controller.signal);
        if (!controller.signal.aborted) recheck();
      } catch {
        // The room's existing REST polling remains a recovery fallback.
      }
    }

    async function streamSocket(): Promise<boolean> {
      if (!wsEnabled) return false;
      try {
        const result = await fetch('/v1/rooms/' + encodeURIComponent(roomId!) + '/ws-ticket', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token },
          cache: 'no-store', signal: controller.signal,
        });
        if ([401, 403, 404].includes(result.status)) { recheck(); return false; }
        if (!result.ok) return false;
        const response: { ticket?: string; endpoint?: string } = await result.json();
        if (!response.ticket || !/^[A-Za-z0-9_-]{43}$/.test(response.ticket) ||
            response.endpoint !== '/api/room-ws') return false;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host + response.endpoint,
          ['nebula.room.v1', response.ticket]);
        activeSocket = socket;
        const opened = await new Promise<boolean>(resolve => {
          const timeout = window.setTimeout(() => { socket.close(); resolve(false); }, 5000);
          socket.onopen = () => { clearTimeout(timeout); resolve(true); };
          socket.onerror = () => { clearTimeout(timeout); resolve(false); };
          socket.onclose = () => { clearTimeout(timeout); resolve(false); };
        });
        if (!opened || controller.signal.aborted) { socket.close(); return false; }
        attempts = 0;
        await new Promise<void>(resolve => {
          socket.onmessage = message => {
            const event = parseRoomSocketMessage(message.data);
            if (event) onState(event);
          };
          socket.onerror = () => resolve();
          socket.onclose = () => resolve();
          controller.signal.addEventListener('abort', () => {
            socket.close();
            resolve();
          }, { once: true });
        });
        if (!controller.signal.aborted) recheck();
        return true;
      } catch { return false; }
    }

    const run = async () => {
      if (disposed || controller.signal.aborted) return;
      if (wsEnabled) {
        const active = await streamSocket();
        if (!active && !controller.signal.aborted) await streamSse();
      } else await streamSse();
      if (!disposed && !controller.signal.aborted) {
        const backoff = Math.min(8000, 1000 * (2 ** Math.min(3, attempts++)));
        retryTimer = setTimeout(() => { void run(); }, backoff);
      }
    };
    void run();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
      activeSocket?.close();
    };
  }, [roomId, token]);
}
