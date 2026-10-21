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

  it('signs downloads as short-lived attachments without exposing secrets', () => {
    const now=new Date('2026-10-16T12:00:00Z');
    const signed=new URL(presignR2(settings,'GET',key,300,undefined,now,'Mi-cancion.mp3'));
    expect(signed.searchParams.get('response-content-disposition')).toBe('attachment; filename="Mi-cancion.mp3"');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.href).not.toContain(settings.secretAccessKey);
    expect(() => presignR2(settings,'GET',key,300,undefined,now,'../bad.mp3')).toThrow('invalid_download_filename');
    expect(() => presignR2(settings,'PUT',key,300,'audio/mpeg',now,'no.mp3')).toThrow('invalid_download_filename');
    expect(presignR2(settings,'GET',key,300,undefined,now)).not.toBe(signed.href);
  });

  it('signs only private PNG or JPEG artwork objects with the exact content type',()=>{
    const cover=key.replace('.mp3','.png');
    const put=new URL(presignR2(settings,'PUT',cover,600,'image/png',new Date('2026-10-16T12:00:00Z')));
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(new URL(presignR2(settings,'GET',cover,3600)).searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(()=>presignR2(settings,'PUT',cover,600,'image/svg+xml')).toThrow('invalid_signed_content_type');
    expect(()=>presignR2(settings,'PUT',cover,600,'image/gif')).toThrow('invalid_signed_content_type');
  });

  it('allows only supported audio filename extensions', () => {
    expect(audioMimeForFilename('Mi canción.MP3')).toBe('audio/mpeg');
    expect(audioMimeForFilename('recording.flac')).toBe('audio/flac');
    expect(audioMimeForFilename('bad.html')).toBeNull();
    expect(audioMimeForFilename('song.mp3.exe')).toBeNull();
  });
});
