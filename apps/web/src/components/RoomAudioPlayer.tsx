'use client';
import { useEffect, useRef, useState } from 'react';
import { correctionForDrift, desiredPositionMs, type RoomTimeline } from '@nebula/room-sync';
import type { AccountApi } from '../hooks/useAccount';
import { readRoomOutputProfile, saveRoomOutputProfile, type RoomOutputKind } from '../lib/room-output-profile';
import { listRoomAudioSinks, type RoomAudioSink } from '../lib/room-audio-sinks';

export type SharedRoom = {
  id: string; revision: number; trackId: string | null; shareEnabled: boolean;
  playbackStatus: 'playing' | 'paused'; positionMs: number; effectiveAt: string;
};
type AudioResult = { url: string; track: { id: string; title: string; artist: string }; expiresInSeconds: number };
type SinkCapableAudio = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
type RemoteAudio = HTMLAudioElement & { remote?: { prompt: () => Promise<void> } };

export function RoomAudioPlayer({ room, account, clockOffsetMs, onActivate, enabled = true, onPlaybackStateChange }: {
  room: SharedRoom; account: AccountApi; clockOffsetMs: number; onActivate: () => void;
  enabled?: boolean;
  onPlaybackStateChange?: (state: 'idle' | 'ready' | 'buffering' | 'playing' | 'error') => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState('');
  const [track, setTrack] = useState<AudioResult['track'] | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [outputKind, setOutputKind] = useState<RoomOutputKind>('device');
  const [calibrationMs, setCalibrationMs] = useState(0);
  const [outputLatencyMs, setOutputLatencyMs] = useState(0);
  const [logicalDriftMs, setLogicalDriftMs] = useState<number | null>(null);
  const [sinkSupported, setSinkSupported] = useState(false);
  const [remoteSupported, setRemoteSupported] = useState(false);
  const [audioSinks, setAudioSinks] = useState<RoomAudioSink[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState('default');
  const [sinkNotice, setSinkNotice] = useState('');
  const [sourceVersion, setSourceVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackKeyRef = useRef('');
  const resumeRef = useRef<{ position: number; wasPlaying: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) {
      audioRef.current?.pause();
      setActive(false);
      onPlaybackStateChange?.('idle');
    }
  }, [enabled, onPlaybackStateChange]);

  useEffect(() => {
    const audio = audioRef.current as RemoteAudio | null;
    setRemoteSupported(Boolean(source && enabled && audio?.remote && typeof audio.remote.prompt === 'function'));
  }, [source, enabled]);

  async function requestRemotePlayback() {
    const remote = (audioRef.current as RemoteAudio | null)?.remote;
    if (!remote || !enabled) return;
    try {
      await remote.prompt(); // Must happen in response to local user gesture.
    } catch {
      setError('El receptor externo no está disponible o no puede reproducir esta canción.');
    }
  }

  // Profiles are intentionally local to this browser and audio route. Bluetooth
  // output latency is not discoverable reliably from browser APIs.
  useEffect(() => {
    const profile = readRoomOutputProfile(window.localStorage, outputKind);
    setCalibrationMs(profile.calibrationMs);
    setOutputLatencyMs(profile.outputLatencyMs);
  }, [outputKind]);

  // Optional browser output routing (setSinkId) is independent from Bluetooth
  // pairing. No microphone permission is requested to enumerate outputs.
  useEffect(() => {
    const probe = document.createElement('audio') as SinkCapableAudio;
    if (typeof probe.setSinkId !== 'function' || !navigator.mediaDevices?.enumerateDevices) return;
    setSinkSupported(true);
    let cancelled = false;
    const refreshSinks = () => {
      void navigator.mediaDevices.enumerateDevices()
        .then(devices => { if (!cancelled) setAudioSinks(listRoomAudioSinks(devices)); })
        .catch(() => { if (!cancelled) setSinkNotice('El navegador no permitió enumerar las salidas. Usa los ajustes del sistema.'); });
    };
    refreshSinks();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshSinks);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshSinks);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current as SinkCapableAudio | null;
    if (!source || !audio || typeof audio.setSinkId !== 'function') return;
    let cancelled = false;
    void audio.setSinkId(selectedSinkId)
      .then(() => { if (!cancelled) setSinkNotice('Salida del navegador seleccionada.'); })
      .catch(() => { if (!cancelled) setSinkNotice('No se pudo seleccionar esa salida. Configúrala desde el sistema operativo.'); });
    return () => { cancelled = true; };
  }, [source, selectedSinkId]);

  function changeCalibration(value: number) {
    setCalibrationMs(value);
    saveRoomOutputProfile(window.localStorage, outputKind, { calibrationMs: value, outputLatencyMs });
  }

  function changeOutputLatency(value: number) {
    setOutputLatencyMs(value);
    saveRoomOutputProfile(window.localStorage, outputKind, { calibrationMs, outputLatencyMs: value });
  }

  useEffect(() => {
    let cancelled = false;
    setError('');
    const trackKey = room.id + ':' + (room.trackId ?? '') + ':' + room.shareEnabled;
    if (trackKeyRef.current !== trackKey) {
      trackKeyRef.current = trackKey;
      resumeRef.current = null;
      setSource(''); setTrack(null); setActive(false);
    } else {
      const audio = audioRef.current;
      if (audio) resumeRef.current = { position: audio.currentTime, wasPlaying: !audio.paused };
    }
    if (!room.trackId || !room.shareEnabled) return;
    void account.cloudRequest<AudioResult>('/v1/rooms/' + room.id + '/audio')
      .then(data => {
        if (cancelled) return;
        setSource(data.url); setTrack(data.track);
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'El audio de esta sala no está disponible.');
      });
    return () => { cancelled = true; };
  }, [room.id, room.trackId, room.shareEnabled, sourceVersion, account.cloudRequest]);

  // Signed room URLs expire after five minutes. Refresh early and preserve
  // playback position across source replacement. A failed refresh keeps the
  // previous URL until the browser or user retries.
  useEffect(() => {
    if (!source || !room.shareEnabled) return;
    const timer = window.setInterval(() => setSourceVersion(value => value + 1), 240_000);
    return () => window.clearInterval(timer);
  }, [source, room.shareEnabled]);

  const timeline: RoomTimeline = {
    revision: room.revision,
    trackId: room.trackId,
    status: room.playbackStatus,
    positionMs: room.positionMs,
    effectiveServerTimeMs: Date.parse(room.effectiveAt),
  };

  function targetMs() {
    return desiredPositionMs(timeline, Date.now(), {
      clockOffsetMs, outputLatencyMs, calibrationMs,
    });
  }

  // Reconcile each snapshot. The room state is authoritative; users still
  // must tap Play on their own device to satisfy mobile autoplay policies.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (room.playbackStatus === 'paused') {
      audio.pause(); audio.playbackRate = 1;
      if (audio.readyState >= 1) audio.currentTime = Math.max(0, room.positionMs / 1000);
      return;
    }
    const untilStart = Date.parse(room.effectiveAt) - (Date.now() + clockOffsetMs);
    if (untilStart > 0) {
      audio.pause();
      timerRef.current = setTimeout(() => {
        if (!audioRef.current || !active) return;
        audio.currentTime = Math.max(0, targetMs() / 1000);
        void audio.play().catch(() => setError('Pulsa Play en este dispositivo para habilitar el sonido.'));
      }, Math.min(untilStart, 60_000));
    } else if (active && audio.paused && audio.readyState >= 1) {
      audio.currentTime = Math.max(0, targetMs() / 1000);
      void audio.play().catch(() => setError('Pulsa Play para reanudar el audio en este dispositivo.'));
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // room timeline primitives are stable values, not object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.revision, room.trackId, room.playbackStatus, room.positionMs, room.effectiveAt, clockOffsetMs, calibrationMs, outputLatencyMs, source, active]);

  useEffect(() => {
    if (!source || room.playbackStatus !== 'playing') return;
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.readyState < 1) return;
      const correction = correctionForDrift(audio.currentTime * 1000, targetMs(), true);
      setLogicalDriftMs(Math.round(correction.errorMs));
      if (correction.kind === 'seek') {
        audio.currentTime = correction.targetPositionMs / 1000;
        audio.playbackRate = 1;
      } else {
        audio.playbackRate = correction.playbackRate;
      }
    }, 1000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, room.revision, room.playbackStatus, room.effectiveAt, room.positionMs, clockOffsetMs, calibrationMs, outputLatencyMs]);

  function activated() {
    if (!enabled) {
      audioRef.current?.pause();
      setError('Activa esta salida antes de reproducir música.');
      return;
    }
    if (room.playbackStatus !== 'playing') {
      audioRef.current?.pause();
      setError('El anfitrión ha pausado la sala. Espera a que reanude la música.');
      return;
    }
    setActive(true); onActivate(); setError('');
    onPlaybackStateChange?.('playing');
    const audio = audioRef.current;
    if (audio && room.playbackStatus === 'playing' && Date.parse(room.effectiveAt) <= Date.now() + clockOffsetMs) {
      audio.currentTime = Math.max(0, targetMs() / 1000);
    }
  }

  return <div className="room-card glass">
    <h3>Salida de audio de este dispositivo</h3>
    {!room.trackId && <p>El anfitrión todavía no ha seleccionado una canción de R2.</p>}
    {room.trackId && !room.shareEnabled && <p>El anfitrión todavía no ha autorizado compartir esta pista.</p>}
    {track && <p><strong>{track.title}</strong> · {track.artist}</p>}
    {source && !enabled && <p>Activa este dispositivo como bocina para habilitar sus controles de reproducción.</p>}
    {source && enabled && <audio ref={audioRef} src={source} controls preload="auto"
      onPause={() => onPlaybackStateChange?.('ready')}
      onWaiting={() => onPlaybackStateChange?.('buffering')}
      style={{width:'100%',maxWidth:480}}
      onPlay={activated}
      onLoadedMetadata={() => {
        const a = audioRef.current;
        if (!a) return;
        if (enabled && a.paused) onPlaybackStateChange?.('ready');
        const previous = resumeRef.current;
        resumeRef.current = null;
        if (previous && Number.isFinite(previous.position)) {
          a.currentTime = Math.max(0, previous.position);
          if (previous.wasPlaying && room.playbackStatus === 'playing') {
            void a.play().catch(() => setError('Pulsa Play para reanudar la salida de este dispositivo.'));
          }
        } else if (room.playbackStatus === 'playing') {
          a.currentTime = Math.max(0, targetMs() / 1000);
        }
      }}
      onError={() => {
        onPlaybackStateChange?.('error');
        setError('No se pudo cargar el audio. Renueva el enlace temporal.');
      }}
      aria-label="Audio de la sala"/>}
    {source && <button type="button" className="button small" onClick={()=>setSourceVersion(x=>x+1)}>Renovar enlace de audio</button>}
    {remoteSupported && <button type="button" className="button small" onClick={() => { void requestRemotePlayback(); }}>
      Transmitir a un receptor compatible
    </button>}
    {sinkSupported && <div>
      <label htmlFor="room-audio-sink">Salida física (navegador compatible)</label>
      <select id="room-audio-sink" value={selectedSinkId} onChange={e => setSelectedSinkId(e.target.value)}>
        <option value="default">Salida predeterminada</option>
        {audioSinks.map(sink => <option key={sink.id} value={sink.id}>{sink.label}</option>)}
      </select>
      {sinkNotice && <p role="status">{sinkNotice}</p>}
    </div>}
    <label htmlFor="room-output-kind">Perfil de salida de este navegador</label>
    <select id="room-output-kind" value={outputKind} onChange={e => setOutputKind(e.target.value as RoomOutputKind)}>
      <option value="device">Altavoz del teléfono / salida predeterminada</option>
      <option value="bluetooth">Bocina o audífonos Bluetooth</option>
    </select>
    <label htmlFor="room-output-latency">Retardo estimado de la salida: {outputLatencyMs} ms</label>
    <input id="room-output-latency" type="range" min="0" max="1000" step="10" value={outputLatencyMs}
      onChange={e => changeOutputLatency(Number(e.target.value))}/>
    <label htmlFor="room-calibration">Ajuste fino de sincronización: {calibrationMs} ms</label>
    <input id="room-calibration" type="range" min="-1000" max="1000" step="10" value={calibrationMs}
      onChange={e => changeCalibration(Number(e.target.value))}/>
    <p role="status">Desfase lógico estimado: {logicalDriftMs === null ? 'sin medición' : logicalDriftMs + ' ms'}. No equivale a desfase acústico medido.</p>
    <p>El perfil de calibración se guarda en este navegador. Cuando la selección de salida no esté disponible, empareja la bocina Bluetooth en los ajustes del teléfono. El perfil de calibración por sí solo no cambia la salida física. Calibra escuchando ambos dispositivos a volumen moderado.</p>
    {error && <p className="account-error" role="alert">{error}</p>}
  </div>;
}
