const validInvite = /^[A-Za-z0-9_-]{20,80}$/;

/** URL fragments are not sent to the server in HTTP requests or referrers. */
export function roomInviteFromHash(hash: string): string | null {
  if (!hash.startsWith('#room=')) return null;
  try {
    const token = decodeURIComponent(hash.slice('#room='.length));
    return validInvite.test(token) ? token : null;
  } catch { return null; }
}

export function buildRoomInviteLink(href: string, code: string): string {
  if (!validInvite.test(code)) throw new Error('invalid_room_invite');
  const url = new URL(href);
  // Do not carry unrelated search params into a shared invitation.
  url.search = '';
  url.hash = 'room=' + encodeURIComponent(code);
  return url.toString();
}
