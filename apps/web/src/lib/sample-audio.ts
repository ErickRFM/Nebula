import type { Track } from './catalog';

let cachedSampleUrl: string | null = null;

export function getSampleAudioUrl(): string {
  if (cachedSampleUrl) return cachedSampleUrl;
  if (typeof window === 'undefined') return '';

  try {
    const sampleRate = 22050;
    const durationSeconds = 6;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // 'RIFF'
    view.setUint32(4, 36 + dataSize, true);
    // WAVE identifier
    view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // 'WAVE'
    // fmt subchunk
    view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // 'fmt '
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono channel
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    // data subchunk
    view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // 'data'
    view.setUint32(40, dataSize, true);

    // Warm ambient chords: A3 (220Hz), C4 (261.63Hz), E4 (329.63Hz), G4 (392Hz)
    const freqs = [220, 261.63, 329.63, 392.0];
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Smooth Hann window for seamless looping
      const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / numSamples));
      let sample = 0;
      for (let f = 0; f < freqs.length; f++) {
        sample += Math.sin(2 * Math.PI * freqs[f] * t) * (0.28 / freqs.length);
      }
      const val = Math.max(-1, Math.min(1, sample * env));
      view.setInt16(offset, Math.floor(val * 32767), true);
      offset += 2;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    cachedSampleUrl = URL.createObjectURL(blob);
    return cachedSampleUrl;
  } catch {
    return '';
  }
}

export const SAMPLE_ROOM_TRACK: Track = {
  id: 'sample-cosmic-pulse',
  title: 'Pulso Cósmico (Muestra NÉBULA)',
  artist: 'NÉBULA Sound Lab',
  album: 'Cosmic Glass',
  genre: 'Ambient',
  cover: '/art/orbita.svg',
  duration: '0:06',
};
