'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextIndex, previousIndex, type PlaybackState, type RepeatMode } from '@nebula/player-core';
import { artwork, demoTracks, type Track } from '../lib/catalog';

type Player = {
  tracks: Track[];
  ownTracks: Track[];
  current: Track | undefined;
  state: PlaybackState;
  notice: string;
  setNotice: (value: string) => void;
  time: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  favorites: string[];
  importFiles: (list: FileList | File[] | null) => void;
  selectTrack: (track: Track) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (id: string) => void;
};

export function useLocalAudio(): Player {
  const [tracks, setTracks] = useState<Track[]>(demoTracks);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [state, setState] = useState<PlaybackState>('idle');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [notice, setNotice] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [favorites, setFavorites] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef<string[]>([]);
  const nextRef = useRef<() => void>(() => {});
  const playlistRef = useRef<Track[]>([]);
  const currentRef = useRef<string | null>(null);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>('off');
  const current = tracks.find((track) => track.id === currentId);
  const ownTracks = tracks.filter((track) => Boolean(track.audioUrl));

  useEffect(() => {
    try {
      const value = localStorage.getItem('nebula:favorites:v1');
      if (value) {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((x): x is string => typeof x === 'string'));
      }
    } catch { /* Corrupted preferences should not break audio. */ }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audioRef.current = audio;
    const onTime = () => setTime(audio.currentTime || 0);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setState('playing');
    const onPause = () => setState((old) => old === 'ended' ? old : 'paused');
    const onWaiting = () => setState('buffering');
    const onError = () => { setState('error'); setNotice('No se pudo reproducir este archivo. Revisa su formato.'); };
    const onEnded = () => { setState('ended'); nextRef.current(); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  // Only initialize media once per mount, including strict-mode remount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  playlistRef.current = tracks.filter((track) => Boolean(track.audioUrl));
  currentRef.current = currentId;
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;

  const selectTrack = useCallback((track: Track) => {
    if (!track.audioUrl) {
      setNotice('Esta canción es parte del concepto visual. Importa tus archivos para escuchar música real.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    setNotice('');
    setCurrentId(track.id);
    setTime(0);
    setDuration(0);
    setState('loading');
    audio.pause();
    audio.src = track.audioUrl;
    audio.load();
    void audio.play().catch(() => {
      setState('paused');
      setNotice('Pulsa reproducir para iniciar el audio o comprueba la compatibilidad del archivo.');
    });
  }, []);

  const next = useCallback(() => {
    const list = playlistRef.current;
    if (!list.length) return;
    const index = list.findIndex((track) => track.id === currentRef.current);
    if (index < 0) { selectTrack(list[0]); return; }
    const upcoming = nextIndex(index, list.length, { shuffle: shuffleRef.current, repeat: repeatRef.current });
    if (upcoming === null) { setState('ended'); audioRef.current?.pause(); return; }
    selectTrack(list[upcoming]);
  }, [selectTrack]);
  nextRef.current = next;

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const list = playlistRef.current;
    if (!list.length) return;
    const index = list.findIndex((track) => track.id === currentRef.current);
    selectTrack(list[previousIndex(Math.max(0,index), list.length, repeatRef.current) ?? 0]);
  }, [selectTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src || !currentRef.current) {
      const first = playlistRef.current[0];
      if (first) selectTrack(first);
      else setNotice('Para comenzar, importa uno o varios archivos de música.');
    } else if (audio.paused) {
      void audio.play().catch(() => setNotice('Tu navegador no pudo iniciar la reproducción.'));
    } else audio.pause();
  }, [selectTrack]);

  const importFiles = useCallback((input: FileList | File[] | null) => {
    const selected = input ? Array.from(input) : [];
    const audioFiles = selected.filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(file.name));
    if (!audioFiles.length) {
      setNotice('Selecciona archivos de audio compatibles (MP3, M4A, WAV, OGG, FLAC, etc.).');
      return;
    }
    const added = audioFiles.map((file, index): Track => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      const id = 'local-' + Date.now().toString(36) + '-' + index + '-' + Math.random().toString(36).slice(2);
      return {
        id, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Mi música local',
        album: 'Archivos importados', genre: 'Mis canciones',
        duration: '--:--', cover: artwork[index % artwork.length], audioUrl: url,
      };
    });
    setTracks((previous) => [...added, ...previous]);
    setNotice(added.length + (added.length === 1 ? ' canción importada solo en esta sesión.' : ' canciones importadas solo en esta sesión.'));
    selectTrack(added[0]);
  }, [selectTrack]);

  const seek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(value) && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0,Math.min(value,audio.duration));
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextValue = Math.min(1, Math.max(0, value));
    setVolumeState(nextValue);
    if (audioRef.current) audioRef.current.volume = nextValue;
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((previous) => {
      const updated = previous.includes(id) ? previous.filter((x) => x !== id) : [...previous, id];
      try { localStorage.setItem('nebula:favorites:v1', JSON.stringify(updated)); } catch { /* Storage may be blocked. */ }
      return updated;
    });
  }, []);

  return {
    tracks, ownTracks, current, state, notice, setNotice, time, duration, volume, shuffle, repeat, favorites,
    importFiles, selectTrack, toggle, next, previous, seek, setVolume,
    toggleShuffle: () => setShuffle((value) => !value),
    cycleRepeat: () => setRepeat((value) => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'),
    toggleFavorite,
  };
}
