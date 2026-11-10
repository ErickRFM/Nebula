'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Clapperboard, Disc3, Mic2, Moon, Orbit, Sparkles } from 'lucide-react';
import type { Player } from '../hooks/useLocalAudio';
import { AUDIO_BANDS, AUDIO_PRESETS, MAX_EQ_DB, type AudioPreset } from '../lib/audio-enhancer';
import type { AudioMeter } from '../lib/audio-mastering';
import { EqCurve } from './EqCurve';

const PROFILES: {
  value: AudioPreset;
  label: string;
  hint: string;
  icon: typeof Sparkles;
}[] = [
  { value: 'natural', label: 'Natural', hint: 'Presencia sin colorear', icon: Sparkles },
  { value: 'cine', label: 'Cine', hint: 'Graves y diálogo', icon: Clapperboard },
  { value: 'spatial', label: 'Espacial', hint: 'Imagen amplia', icon: Orbit },
  { value: 'club', label: 'Club', hint: 'Punch y graves', icon: Disc3 },
  { value: 'night', label: 'Noche', hint: 'Volumen estable', icon: Moon },
  { value: 'vocal', label: 'Voz', hint: 'Claridad hablada', icon: Mic2 },
];

const CLASSIC: { value: AudioPreset; label: string; hint: string }[] = [
  { value: 'off', label: 'Original', hint: 'Sin procesar' },
  { value: 'balanced', label: 'Equilibrado', hint: 'Tono neutro' },
  { value: 'clarity', label: 'Claridad', hint: 'Detalle y aire' },
  { value: 'bass', label: 'Graves', hint: 'Peso y cuerpo' },
  { value: 'punch', label: 'Impacto', hint: 'Golpe y energía' },
  { value: 'treble', label: 'Agudos', hint: 'Brillo limpio' },
  { value: 'podcast', label: 'Podcast', hint: 'Voz hablada' },
  { value: 'electronic', label: 'Electrónica', hint: 'Club y sintes' },
  { value: 'custom', label: 'Personalizado', hint: 'Tu curva' },
];

const MODULES: {
  key: 'bass' | 'width' | 'dynamics';
  label: string;
  hint: string;
}[] = [
  { key: 'bass', label: 'Graves armónicos', hint: 'Se sienten incluso en altavoces pequeños.' },
  { key: 'width', label: 'Anchura estéreo', hint: 'Graves siempre en mono; el resto se abre.' },
  { key: 'dynamics', label: 'Dinámica', hint: 'Compresión multibanda suave por rango.' },
];

function formatGain(value: number) {
  return (value > 0 ? '+' : '') + value.toFixed(1);
}

function formatMeter(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(1);
}

/** All controls change the actual signal graph, not just its appearance. */
export function AudioStudio({ player, compact = false }: { player: Player; compact?: boolean }) {
  const id = useId();
  const [meter, setMeter] = useState<AudioMeter | null>(null);
  const active = Boolean(player.current?.id.startsWith('local-'));
  const enhanced = player.audioPreset !== 'off' || player.humFilter;
  const effective = enhanced && !player.abBypass;
  const presetOn = player.audioPreset !== 'off';
  const targetLufs = AUDIO_PRESETS[player.audioPreset].targetLufs;
  const natural = AUDIO_PRESETS.natural;
  const resetDisabled = player.audioPreset === 'natural' && !player.humFilter && !player.abBypass &&
    player.audioMaster.intensity === 60 && player.audioMaster.bass === natural.bass &&
    player.audioMaster.width === natural.width && player.audioMaster.dynamics === natural.dynamics;

  useEffect(() => {
    if (active && player.state === 'playing') player.warmAudioAnalyser();
  }, [active, player.state, player.warmAudioAnalyser]);

  useEffect(() => {
    if (!active || player.state !== 'playing' || !effective) {
      setMeter(null);
      return;
    }
    const tick = () => setMeter(player.getAudioMeter());
    tick();
    const timer = window.setInterval(tick, 400);
    return () => window.clearInterval(timer);
  }, [active, player.state, effective, player.getAudioMeter]);

  const changeBand = useCallback((index: number, value: number) => {
    const next = [...player.audioBands];
    next[index] = value;
    player.setAudioBands(next);
  }, [player.audioBands, player.setAudioBands]);

  const reset = () => {
    player.setAudioPreset('natural');
    player.setAudioMaster({
      intensity: 60,
      bass: natural.bass,
      width: natural.width,
      dynamics: natural.dynamics,
    });
    player.setHumFilter(false);
    player.setAbBypass(false);
  };

  const lufs = meter?.lufs ?? null;
  const peak = meter?.peakDb ?? null;
  const correlation = meter?.correlation ?? null;
  const leveler = meter?.levelerDb ?? 0;
  const peakWidth = peak === null ? 0 : Math.min(100, Math.max(0, (peak + 48) / 48 * 100));
  const correlationLeft = correlation === null ? 50 : (correlation + 1) / 2 * 100;

  return <section className={'audio-studio' + (compact ? ' audio-studio-compact' : '')} aria-label="NÉBULA Audio Studio">
    <div className="audio-studio-heading">
      <div>
        <span className="audio-studio-eyebrow">NÉBULA AUDIO STUDIO · V4</span>
        <h3>Tu música, con más cuerpo y detalle</h3>
        <p>Nivelado, dinámica multibanda, graves armónicos y escena estéreo en tiempo real. Los archivos originales no se modifican.</p>
      </div>
      <span className={'audio-studio-status' + (effective ? ' is-enhanced' : '')}>
        {effective ? 'Inmersión activa' : enhanced ? 'A/B · original' : 'Sin efectos'}
      </span>
    </div>

    <fieldset className="eq-profiles">
      <legend>Perfil de inmersión</legend>
      <div className="eq-profile-grid">
        {PROFILES.map(({ value, label, hint, icon: Icon }) => <label
          className={'eq-profile' + (player.audioPreset === value ? ' is-selected' : '')} key={value}>
          <input type="radio" name={id + '-profile'} value={value} aria-label={label}
            checked={player.audioPreset === value}
            onChange={() => player.setAudioPreset(value)}/>
          <span className="eq-profile-icon"><Icon size={18} aria-hidden="true"/></span>
          <span className="eq-profile-name">{label}</span>
          <span className="eq-profile-hint">{hint}</span>
        </label>)}
      </div>
    </fieldset>

    <div className={'eq-master' + (presetOn ? '' : ' is-disabled')}>
      <div className="eq-master-top">
        <div>
          <span className="eq-master-label">Intensidad de inmersión</span>
          <p>Escala el motor completo. La curva manual se mantiene independiente.</p>
        </div>
        <strong className="eq-master-value">{player.audioMaster.intensity}%</strong>
      </div>
      <input type="range" min={0} max={100} step={1} value={player.audioMaster.intensity}
        aria-label="Intensidad de inmersión" aria-valuetext={player.audioMaster.intensity + '%'}
        disabled={!presetOn}
        onChange={(event) => player.setAudioMaster({ intensity: Number(event.target.value) })}/>
      <div className="eq-master-scale" aria-hidden="true"><span>Suave</span><span>Intensa</span></div>
    </div>

    <div className="eq-modules" role="group" aria-label="Ajuste del motor de audio">
      {MODULES.map((module) => <label className={'eq-module' + (presetOn ? '' : ' is-disabled')} key={module.key}>
        <span className="eq-module-head">
          <span>{module.label}</span>
          <strong>{player.audioMaster[module.key]}</strong>
        </span>
        <input type="range" min={0} max={100} step={1} value={player.audioMaster[module.key]}
          aria-label={module.label} aria-valuetext={player.audioMaster[module.key] + '%'}
          disabled={!presetOn}
          onChange={(event) => player.setAudioMaster({ [module.key]: Number(event.target.value) })}/>
        <span className="eq-module-hint">{module.hint}</span>
      </label>)}
    </div>

    <div className="eq-meters" role="group" aria-label="Medidores de audio">
      <div className="eq-meter">
        <span className="eq-meter-label">Sonoridad</span>
        <strong className="eq-meter-value">{formatMeter(lufs)}<small>LUFS</small></strong>
        <span className="eq-meter-note">Objetivo {targetLufs} LUFS</span>
      </div>
      <div className="eq-meter">
        <span className="eq-meter-label">Pico</span>
        <strong className="eq-meter-value">{formatMeter(peak)}<small>dB</small></strong>
        <div className="eq-meter-bar" aria-hidden="true"><span style={{ width: peakWidth + '%' }}/></div>
        <span className="eq-meter-note">Techo seguro −1 dB</span>
      </div>
      <div className="eq-meter">
        <span className="eq-meter-label">Imagen estéreo</span>
        <strong className="eq-meter-value">{correlation === null ? '—' : (correlation >= 0 ? '+' : '') + correlation.toFixed(2)}</strong>
        <div className="eq-meter-bar is-correlation" aria-hidden="true"><span style={{ left: correlationLeft + '%' }}/></div>
        <span className="eq-meter-note">{correlation !== null && correlation > 0.85 ? 'Casi mono' : 'Graves en mono'}</span>
      </div>
      <div className="eq-meter">
        <span className="eq-meter-label">Nivelador</span>
        <strong className="eq-meter-value">{formatMeter(leveler)}<small>dB</small></strong>
        <span className="eq-meter-note">{leveler < -0.1 ? 'Atenuando' : leveler > 0.1 ? 'Realzando' : 'En equilibrio'}</span>
      </div>
    </div>

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

    <details className="eq-classic">
      <summary>Ecualización manual</summary>
      <div className="eq-preset-list" role="group" aria-label="Presets de ecualización">
        {CLASSIC.map((preset) => <label
          className={'eq-preset' + (player.audioPreset === preset.value ? ' is-selected' : '')} key={preset.value}>
          <input type="radio" name={id + '-preset'} value={preset.value} aria-label={preset.label}
            checked={player.audioPreset === preset.value}
            onChange={() => player.setAudioPreset(preset.value)}/>
          <span className="eq-preset-name">{preset.label}</span>
          <span className="eq-preset-hint">{preset.hint}</span>
        </label>)}
      </div>
    </details>

    <div className="audio-studio-footer">
      <div>
        <strong>Motor de inmersión</strong>
        <p>Limitador de picos, nivelado de sonoridad y compresión por bandas para ganar cuerpo sin saturar.</p>
      </div>
      <span className="audio-studio-value">{effective ? 'Activo' : 'Sin procesar'}</span>
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
