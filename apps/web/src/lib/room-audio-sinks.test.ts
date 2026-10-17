import { describe, expect, it } from 'vitest';
import { listRoomAudioSinks } from './room-audio-sinks';

describe('optional browser audio output selection', () => {
  it('lists only unique audio outputs without exposing input devices', () => {
    const result = listRoomAudioSinks([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Microphone' },
      { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
      { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Bocina Bluetooth' },
      { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Duplicate' },
      { kind: 'audiooutput', deviceId: 'speaker-2', label: '' },
    ]);
    expect(result).toEqual([
      { id: 'speaker-1', label: 'Bocina Bluetooth' },
      { id: 'speaker-2', label: 'Salida de audio 2' },
    ]);
  });
  it('handles browsers that expose no selectable outputs', () => {
    expect(listRoomAudioSinks([{ kind: 'audiooutput', deviceId: 'default', label: '' }])).toEqual([]);
  });
});
