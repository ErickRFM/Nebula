import { describe, expect, it } from 'vitest';
import { buildRoomInviteLink, roomInviteFromHash } from './room-invite-link';

describe('private room deep links', () => {
  const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  it('shares a URL fragment without leaking the invite through HTTP queries', () => {
    const url = new URL(buildRoomInviteLink('https://nebula.example/?tracking=secret#old', code));
    expect(url.search).toBe('');
    expect(url.hash).toBe('#room=' + code);
    expect(roomInviteFromHash(url.hash)).toBe(code);
  });
  it('rejects malformed, short, encoded and unrelated fragments', () => {
    expect(roomInviteFromHash('#room=abc')).toBeNull();
    expect(roomInviteFromHash('#room=%2Fetc%2Fpasswd')).toBeNull();
    expect(roomInviteFromHash('#room=%ZZ')).toBeNull();
    expect(roomInviteFromHash('#other=' + code)).toBeNull();
    expect(() => buildRoomInviteLink('https://nebula.example/', 'bad')).toThrow('invalid_room_invite');
  });
});
