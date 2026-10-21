import { describe, expect, it } from 'vitest';
import { readRoomEventStream, parseRoomSocketMessage, type RoomEvent } from './room-event-stream';

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const part of chunks) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

describe('private room event stream parser', () => {
  it('reassembles fragmented server events and ignores retry/heartbeat frames', async () => {
    const events: RoomEvent[] = [];
    await readRoomEventStream(stream([
      'retry: 1000\n\n:event-heartbeat\n\n',
      'event: room\ndata: {"revision":',
      '3,"participantCount":2}\n\n',
      'event: room\ndata: {"revision":4,"participantCount":3}\n\n',
    ]), item => events.push(item));
    expect(events).toEqual([
      { revision: 3, participantCount: 2 },
      { revision: 4, participantCount: 3 },
    ]);
  });
  it('does not allow malformed or negative revisions into consumers', async () => {
    const events: RoomEvent[] = [];
    await readRoomEventStream(stream([
      'event: room\ndata: {bad json}\n\n',
      'event: room\ndata: {"revision":-1,"participantCount":1}\n\n',
      'event: ignored\ndata: {"revision":3,"participantCount":1}\n\n',
    ]), item => events.push(item));
    expect(events).toHaveLength(0);
  });
  it('rejects unbounded event frames', async () => {
    await expect(readRoomEventStream(stream(['data: ' + 'x'.repeat(34000)]), () => {})).rejects.toThrow('room_event_frame_too_large');
  });
});

describe('WebSocket room event validation', () => {
  it('accepts a room snapshot and rejects injected/malformed payloads', () => {
    expect(parseRoomSocketMessage('{"type":"room","revision":3,"participantCount":2}')).toEqual({revision:3,participantCount:2});
    expect(parseRoomSocketMessage('{"type":"playlist","revision":3,"participantCount":2}')).toBeNull();
    expect(parseRoomSocketMessage('{"type":"room","revision":-1,"participantCount":2}')).toBeNull();
    expect(parseRoomSocketMessage('{}')).toBeNull();
    expect(parseRoomSocketMessage('not json')).toBeNull();
  });
});
