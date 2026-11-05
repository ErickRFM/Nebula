'use client';

import { useId } from 'react';
import type { Player } from '../hooks/useLocalAudio';
import { AUDIO_BANDS, MAX_EQ_DB, type AudioPreset } from '../lib/audio-enhancer';

const PROFILES: { value: AudioPreset; label: string }[] = [
  { value: 'off', label: 'Original · sin efectos' },
  { value: 'balanced', label: 'Mejora equilibrada' },
  { value: 'clarity', label: 'Claridad y detalle' },
  { value: 'bass', label: 'Graves definidos' },
  { value: 'vocal', label: 'Voces presentes' },
  { value: 'punch', label: 'Impacto y energía' },
  { value: 'custom', label: 'Personalizado' },
];

/** All controls change the actual signal graph, not just its appearance. */
export function AudioStudio({ player, compact = false }: { player: Player; compact?: boolean }) {
  const id = useId();
  const active = Boolean(player.current?.id.startsWith('local-'));
  const enhanced = player.audioPreset !== 'off' || player.humFilter;

  return <section className={'audio-studio' + (compact ? ' audio-studio-compact' : '')} aria-label="NÉBULA Audio Studio">
    <div className="audio-studio-heading">
      <div>
        <span className="audio-studio-eyebrow">NÉBULA AUDIO STUDIO</span>
        <h3>Tu música, con más definición</h3>
        <p>Ecualización de 7 bandas y dinámica controlada. Los archivos originales no se modifican.</p>
      </div>
      <span className={'audio-studio-status' + (enhanced ? ' is-enhanced' : '')}>{enhanced ? 'Efectos activos' : 'Sonido original'}</span>
    </div>
    <div className="audio-studio-profile">
      <label htmlFor={id + '-preset'}>Perfil del ecualizador</label>
      <select id={id + '-preset'} className="audio-setting-select" value={player.audioPreset} onChange={(event) => player.setAudioPreset(event.target.value as AudioPreset)}>
        {PROFILES.map((profile) => <option value={profile.value} key={profile.value}>{profile.label}</option>)}
      </select>
    </div>
    <div className="audio-studio-eq" role="group" aria-label="Ecualizador de siete bandas">
      {AUDIO_BANDS.map((band, index) => {
        const value = player.audioBands[index] ?? 0;
        return <label className="audio-studio-band" key={band.frequency}>
          <span className="audio-band-value">{value > 0 ? '+' : ''}{value.toFixed(1)} <small>dB</small></span>
          <input type="range" aria-label={'Banda ' + band.label} min={-MAX_EQ_DB} max={MAX_EQ_DB} step={0.5}
            value={value} onChange={(event) => {
              const next = [...player.audioBands];
              next[index] = Number(event.target.value);
              player.setAudioBands(next);
            }}/>
          <span className="audio-band-label">{band.label}</span>
        </label>;
      })}
    </div>
    <div className="audio-studio-footer">
      <div>
        <strong>Nivelación de sonido</strong>
        <p>Compresión suave para reducir saltos bruscos de intensidad entre fragmentos de la canción.</p>
      </div>
      <span className="audio-studio-value">{player.audioPreset === 'off' ? 'Sin procesar' : 'Dinámica'}</span>
    </div>
    <div className="audio-studio-footer">
      <div>
        <strong>Reducir zumbido</strong>
        <p>Filtros opcionales para interferencias de grabación de 60 y 120 Hz. No reparan zumbidos del dispositivo.</p>
      </div>
      <button type="button" role="switch" aria-checked={player.humFilter} aria-label="Reducir zumbido"
        className={'toggle ' + (player.humFilter ? 'on' : '')} onClick={() => player.setHumFilter(!player.humFilter)}><span/></button>
    </div>
    <p className="audio-studio-disclosure" role="status">{active
      ? 'Estos ajustes se aplican a la pista local en reproducción.'
      : 'Disponible para música importada a tu biblioteca local; los videos y fuentes externas no se procesan.'}</p>
  </section>;
}
