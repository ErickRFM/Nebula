'use client';
import { useEffect, useRef, useState } from 'react';
import { correctionForDrift, desiredPositionMs, type RoomTimeline } from '@nebula/room-sync';
import type { AccountApi } from '../hooks/useAccount';

export type SharedRoom = {
  id: string; revision: number; trackId: string | null; shareEnabled: boolean;
  playbackStatus: 'playing' | 'paused'; positionMs: number; effectiveAt: string;
};
type AudioResult = { url: string; track: { id: string; title: string; artist: string }; expiresInSeconds: number };
const key = 'nebula:party-calibration-ms:v1';

export function RoomAudioPlayer({ room, account, clockOffsetMs, onActivate }: {
  room: SharedRoom; account: AccountApi; clockOffsetMs: number; onActivate: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState('');
  const [track, setTrack] = useState<AudioResult['track'] | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [calibrationMs, setCalibrationMs] = useState(0);
  const [sourceVersion, setSourceVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackKeyRef = useRef('');
  const resumeRef = useRef<{ position: number; wasPlaying: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved)) setCalibrationMs(Math.max(-500, Math.min(500, saved)));
    } catch { /* optional storage */ }
  }, []);

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
      clockOffsetMs, outputLatencyMs: 0, calibrationMs,
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
  }, [room.revision, room.trackId, room.playbackStatus, room.positionMs, room.effectiveAt, clockOffsetMs, calibrationMs, source, active]);

  useEffect(() => {
    if (!source || room.playbackStatus !== 'playing') return;
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.readyState < 1) return;
      const correction = correctionForDrift(audio.currentTime * 1000, targetMs(), true);
      if (correction.kind === 'seek') {
        audio.currentTime = correction.targetPositionMs / 1000;
        audio.playbackRate = 1;
      } else {
        audio.playbackRate = correction.playbackRate;
      }
    }, 1000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, room.revision, room.playbackStatus, room.effectiveAt, room.positionMs, clockOffsetMs, calibrationMs]);

  function activated() {
    if (room.playbackStatus !== 'playing') {
      audioRef.current?.pause();
      setError('El anfitrión ha pausado la sala. Espera a que reanude la música.');
      return;
    }
    setActive(true); onActivate(); setError('');
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
    {source && <audio ref={audioRef} src={source} controls preload="auto"
      style={{width:'100%',maxWidth:480}}
      onPlay={activated}
      onLoadedMetadata={() => {
        const a = audioRef.current;
        if (!a) return;
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
      onError={() => setError('No se pudo cargar el audio. Renueva el enlace temporal.')}
      aria-label="Audio de la sala"/>}
    {source && <button type="button" className="button small" onClick={()=>setSourceVersion(x=>x+1)}>Renovar enlace de audio</button>}
    <label htmlFor="room-calibration">Compensación de salida: {calibrationMs} ms</label>
    <input id="room-calibration" type="range" min="-500" max="500" step="10" value={calibrationMs}
      onChange={e => {
        const value = Number(e.target.value);
        setCalibrationMs(value);
        try { localStorage.setItem(key, String(value)); } catch { /* optional */ }
      }}/>
    <p>Conecta tu bocina Bluetooth desde los ajustes del teléfono. La calibración es manual; la sincronización acústica exacta todavía requiere pruebas físicas.</p>
    {error && <p className="account-error" role="alert">{error}</p>}
  </div>;
}
