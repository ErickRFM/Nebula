'use client';

import { useCallback, useEffect, useId } from 'react';
import type { Player } from '../hooks/useLocalAudio';
import { AUDIO_BANDS, MAX_EQ_DB, type AudioPreset } from '../lib/audio-enhancer';
import { EqCurve } from './EqCurve';

const PRESETS: { value: AudioPreset; label: string; hint: string }[] = [
  { value: 'off', label: 'Original', hint: 'Sin procesar' },
  { value: 'balanced', label: 'Equilibrado', hint: 'Tono neutro' },
  { value: 'clarity', label: 'Claridad', hint: 'Detalle y aire' },
  { value: 'bass', label: 'Graves', hint: 'Peso y cuerpo' },
  { value: 'vocal', label: 'Voz', hint: 'Voces al frente' },
  { value: 'punch', label: 'Impacto', hint: 'Golpe y energía' },
  { value: 'treble', label: 'Agudos', hint: 'Brillo limpio' },
  { value: 'podcast', label: 'Podcast', hint: 'Voz hablada' },
  { value: 'night', label: 'Noche', hint: 'Escucha suave' },
  { value: 'electronic', label: 'Electrónica', hint: 'Club y sintes' },
  { value: 'custom', label: 'Personalizado', hint: 'Tu curva' },
];

function formatGain(value: number) {
  return (value > 0 ? '+' : '') + value.toFixed(1);
}

/** All controls change the actual signal graph, not just its appearance. */
export function AudioStudio({ player, compact = false }: { player: Player; compact?: boolean }) {
  const id = useId();
  const active = Boolean(player.current?.id.startsWith('local-'));
  const enhanced = player.audioPreset !== 'off' || player.humFilter;
  const effective = enhanced && !player.abBypass;
  const resetDisabled = player.audioPreset === 'off' && !player.humFilter && !player.abBypass;

  useEffect(() => {
    if (active && player.state === 'playing') player.warmAudioAnalyser();
  }, [active, player.state, player.warmAudioAnalyser]);

  const changeBand = useCallback((index: number, value: number) => {
    const next = [...player.audioBands];
    next[index] = value;
    player.setAudioBands(next);
  }, [player.audioBands, player.setAudioBands]);

  const reset = () => {
    player.setAudioPreset('off');
    player.setHumFilter(false);
    player.setAbBypass(false);
  };

  return <section className={'audio-studio' + (compact ? ' audio-studio-compact' : '')} aria-label="NÉBULA Audio Studio">
    <div className="audio-studio-heading">
      <div>
        <span className="audio-studio-eyebrow">NÉBULA AUDIO STUDIO</span>
        <h3>Tu música, con más definición</h3>
        <p>Arrastra la curva para moldear el sonido en tiempo real. Los archivos originales no se modifican.</p>
      </div>
      <span className={'audio-studio-status' + (effective ? ' is-enhanced' : '')}>
        {effective ? 'Efectos activos' : enhanced ? 'A/B · original' : 'Sin efectos'}
      </span>
    </div>

    <fieldset className="eq-presets">
      <legend>Perfil del ecualizador</legend>
      <div className="eq-preset-list">
        {PRESETS.map((preset) => <label className={'eq-preset' + (player.audioPreset === preset.value ? ' is-selected' : '')} key={preset.value}>
          <input type="radio" name={id + '-preset'} value={preset.value} aria-label={preset.label}
            checked={player.audioPreset === preset.value}
            onChange={() => player.setAudioPreset(preset.value)}/>
          <span className="eq-preset-name">{preset.label}</span>
          <span className="eq-preset-hint">{preset.hint}</span>
        </label>)}
      </div>
    </fieldset>

    <EqCurve bands={player.audioBands} onChange={changeBand}
      getAnalyser={player.getAudioAnalyser} active={active && player.state === 'playing'}/>

    <div className="eq-toolbar">
      <div className="eq-ab" role="group" aria-label="Comparar A/B">
        <span className="eq-ab-caption">A/B</span>
        <button type="button" aria-pressed={!player.abBypass} disabled={!enhanced}
          onClick={() => player.setAbBypass(false)}>Procesado</button>
        <button type="button" aria-pressed={player.abBypass} disabled={!enhanced}
          onClick={() => player.setAbBypass(true)}>Original</button>
      </div>
      <button type="button" className="button eq-reset" onClick={reset} disabled={resetDisabled}>
        Restablecer
      </button>
    </div>

    <div className="eq-faders" role="group" aria-label="Ajuste fino por banda">
      {AUDIO_BANDS.map((band, index) => {
        const value = player.audioBands[index] ?? 0;
        return <label className="eq-fader" key={band.frequency}>
          <span className="eq-fader-value">{formatGain(value)}<small> dB</small></span>
          <input type="range" aria-label={'Banda ' + band.label} aria-valuetext={formatGain(value) + ' dB'}
            min={-MAX_EQ_DB} max={MAX_EQ_DB} step={0.5} value={value}
            onChange={(event) => changeBand(index, Number(event.target.value))}
            onDoubleClick={() => changeBand(index, 0)}/>
          <span className="eq-fader-label">{band.label}</span>
        </label>;
      })}
    </div>

    <div className="audio-studio-footer">
      <div>
        <strong>Dinámica controlada</strong>
        <p>Compresión suave y limitador de seguridad para evitar saturación aun con refuerzos altos.</p>
      </div>
      <span className="audio-studio-value">{player.audioPreset === 'off' ? 'Sin procesar' : 'Comprimido'}</span>
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
