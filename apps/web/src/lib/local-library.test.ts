import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, songToTrack } from './local-library';
describe('local music records', () => {
  it('enforces a finite file-size policy', () => expect(MAX_AUDIO_BYTES).toBe(104857600));
  it('keeps stable identity when rebuilding a playable track', () => {
    const t = songToTrack({ id: 'one', title: 'Test',artist:'Me',album:'Home',genre:'Local',cover:'/art/orbita.svg',duration:'--:--',mimeType:'audio/mpeg',blob:new Blob(['x']),createdAt:0 },'blob:test');
    expect(t.id).toBe('one');
    expect(t.audioUrl).toBe('blob:test');
  });
});
