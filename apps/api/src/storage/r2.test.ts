import { describe, expect, it } from 'vitest';
import { audioMimeForFilename, presignR2, readR2Settings } from './r2';

const settings = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'exampleAccessKey',
  secretAccessKey: 'exampleSecretKey',
  bucket: 'nebula-music-private',
};
const key = 'users/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.mp3';

describe('Cloudflare R2 private signed URLs', () => {
  it('requires all four R2 variables and a valid account/bucket', () => {
    expect(readR2Settings({})).toBeNull();
    expect(readR2Settings({
      R2_ACCOUNT_ID: settings.accountId,
      R2_ACCESS_KEY_ID: settings.accessKeyId,
      R2_SECRET_ACCESS_KEY: settings.secretAccessKey,
      R2_BUCKET: settings.bucket,
    })).toEqual(settings);
    expect(readR2Settings({ ...{
      R2_ACCOUNT_ID: 'bad',
      R2_ACCESS_KEY_ID: settings.accessKeyId,
      R2_SECRET_ACCESS_KEY: settings.secretAccessKey,
      R2_BUCKET: settings.bucket,
    } })).toBeNull();
  });

  it('signs private PUTs with an exact audio content type', () => {
    const signed = new URL(presignR2(settings, 'PUT', key, 600, 'audio/mpeg', new Date('2026-10-16T12:00:00.000Z')));
    expect(signed.protocol).toBe('https:');
    expect(signed.host).toBe(settings.accountId + '.r2.cloudflarestorage.com');
    expect(signed.pathname).toContain('/nebula-music-private/users/');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(signed.searchParams.get('X-Amz-Date')).toBe('20261016T120000Z');
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.search).not.toContain(settings.secretAccessKey);
  });

  it('binds the signature to the method, object, secret and signed content type', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const put = presignR2(settings, 'PUT', key, 600, 'audio/mpeg', now);
    const get = presignR2(settings, 'GET', key, 600, undefined, now);
    const other = presignR2({ ...settings, secretAccessKey: 'other' }, 'PUT', key, 600, 'audio/mpeg', now);
    expect(put).not.toBe(get);
    expect(put).not.toBe(other);
    expect(new URL(get).searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(() => presignR2(settings, 'GET', '../private.mp3', 600)).toThrow('invalid_object_key');
    expect(() => presignR2(settings, 'GET', key, 3601)).toThrow('invalid_presign_ttl');
  });

  it('allows only supported audio filename extensions', () => {
    expect(audioMimeForFilename('Mi canción.MP3')).toBe('audio/mpeg');
    expect(audioMimeForFilename('recording.flac')).toBe('audio/flac');
    expect(audioMimeForFilename('bad.html')).toBeNull();
    expect(audioMimeForFilename('song.mp3.exe')).toBeNull();
  });
});
