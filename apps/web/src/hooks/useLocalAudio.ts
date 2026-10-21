'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextIndex, previousIndex, type PlaybackState, type RepeatMode } from '@nebula/player-core';
import { artwork, demoTracks, type Track } from '../lib/catalog';
import { deleteSavedSong, loadSavedSongs, MAX_AUDIO_BYTES, saveSong, songToTrack, type SavedSong } from '../lib/local-library';

export type Player = {
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
  loadingLibrary: boolean;
  importFiles: (list: FileList | File[] | null) => void;
  removeLocalTrack: (id: string) => Promise<boolean>;
  selectTrack: (track: Track) => void;
  playQueue: (songs: Track[]) => void;
  playExternal: (track: Track) => void;
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
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());
  const nextRef = useRef<() => void>(() => {});
  const queueRef = useRef<Track[]>([]);
  const userQueueRef = useRef<Track[] | null>(null);
  const currentRef = useRef<string | null>(null);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>('off');
  const tracksRef = useRef<Track[]>(demoTracks);
  const current = tracks.find((track) => track.id === currentId);
  const ownTracks = tracks.filter((track) => track.id.startsWith('local-') && Boolean(track.audioUrl));

  useEffect(() => {
    let active = true;
    try {
      const stored = localStorage.getItem('nebula:favorites:v1');
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((x): x is string => typeof x === 'string'));
      }
      const storedVolume = Number(localStorage.getItem('nebula:volume:v1'));
      if (Number.isFinite(storedVolume) && localStorage.getItem('nebula:volume:v1') !== null) {
        const nextVolume = Math.min(1, Math.max(0, storedVolume));
        setVolumeState(nextVolume);
        if (audioRef.current) audioRef.current.volume = nextVolume;
      }
    } catch { /* Optional browser storage may be blocked. */ }
    void loadSavedSongs().then((songs) => {
      if (!active) return;
      const playable = songs.sort((a,b)=>b.createdAt-a.createdAt).map((song) => {
        const url = URL.createObjectURL(song.blob);
        urlsRef.current.set(song.id,url);
        return songToTrack(song,url);
      });
      setTracks((previous) => [...playable, ...previous.filter((t)=>!t.audioUrl || !playable.some((p)=>p.id===t.id))]);
      setLoadingLibrary(false);
    }).catch(() => {
      if (active) { setLoadingLibrary(false); setNotice('Tu navegador no permite abrir la biblioteca guardada. Puedes reproducir archivos durante esta sesión.'); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audioRef.current = audio;
    const onTime = () => {
      setTime(audio.currentTime || 0);
      if ('mediaSession' in navigator && audio.duration && Number.isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: audio.currentTime }); }
        catch { /* Some browsers do not support position state for the current asset. */ }
      }
    };
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => { setState('playing'); setNotice(''); };
    const onPause = () => setState((old) => old === 'ended' || old === 'error' ? old : 'paused');
    const onWaiting = () => setState('buffering');
    const onError = () => {
      setState('error');
      setNotice('El navegador no pudo cargar el audio. La fuente puede estar caída, bloqueada o usar un formato incompatible. Prueba otra pista.');
    };
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
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
      urlsRef.current.clear();
    };
  // The player is a single persistent instance per mounted app.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  tracksRef.current = tracks;
  queueRef.current = userQueueRef.current ?? tracks.filter((track) => Boolean(track.audioUrl));
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
    void audio.play().catch((error: unknown) => {
      if (audioRef.current !== audio || audio.src !== track.audioUrl) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setState('paused');
        setNotice('El navegador bloqueó el inicio automático. Pulsa Reproducir para escuchar.');
        return;
      }
      setState('error');
      setNotice('No fue posible iniciar esta pista. Comprueba la disponibilidad del audio o intenta con otra.');
    });
  }, []);

  const next = useCallback(() => {
    const list = queueRef.current;
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
    const list = queueRef.current;
    if (!list.length) return;
    const index = list.findIndex((track) => track.id === currentRef.current);
    selectTrack(list[previousIndex(Math.max(0,index), list.length, repeatRef.current) ?? 0]);
  }, [selectTrack]);

  const playExternal = useCallback((track: Track) => {
    if(track.source!=='external' || !track.audioUrl || !track.audioUrl.startsWith('https://')) {
      setNotice('La pista externa no tiene una fuente segura de audio.');
      return;
    }
    // External tracks are transient. They are not user-owned IndexedDB entries.
    setTracks((existing) => [track, ...existing.filter((item)=>item.id!==track.id && item.source!=='external')]);
    userQueueRef.current = [track];
    queueRef.current = [track];
    selectTrack(track);
  },[selectTrack]);

  const playQueue = useCallback((songs: Track[]) => {
    const playable = songs.filter((track) => Boolean(track.audioUrl));
    if (!playable.length) { setNotice('Esta colección no tiene canciones reproducibles.'); return; }
    userQueueRef.current = playable;
    queueRef.current = playable;
    selectTrack(playable[0]);
  }, [selectTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src || !currentRef.current) {
      const first = queueRef.current[0];
      if (first) selectTrack(first);
      else setNotice('Para comenzar, importa uno o varios archivos de música.');
    } else if (audio.paused) {
      void audio.play().catch(() => setNotice('Tu navegador no pudo iniciar la reproducción.'));
    } else audio.pause();
  }, [selectTrack]);

  const importFiles = useCallback((input: FileList | File[] | null) => {
    const selected = input ? Array.from(input) : [];
    const files = selected.filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(file.name));
    if (!files.length) { setNotice('Selecciona archivos de audio compatibles (MP3, M4A, WAV, OGG, FLAC, etc.).'); return; }
    const candidates = files.filter((file) => file.size > 0 && file.size <= MAX_AUDIO_BYTES).slice(0, 50);
    if (!candidates.length) { setNotice('Los archivos deben ser de audio, no estar vacíos y pesar como máximo 100 MB cada uno.'); return; }
    const added = candidates.map((file, index): { track: Track; record: SavedSong } => {
      const id = 'local-' + crypto.randomUUID();
      const url = URL.createObjectURL(file);
      urlsRef.current.set(id, url);
      const record: SavedSong = { id, title:file.name.replace(/\.[^.]+$/, ''), artist:'Mi música local', album:'Archivos importados', genre:'Mis canciones', duration:'--:--', cover:artwork[index % artwork.length], mimeType:file.type, blob:file, createdAt:Date.now()+index };
      return {record,track:songToTrack(record,url)};
    });
    setTracks((previous) => [...added.map((x)=>x.track),...previous]);
    userQueueRef.current = null;
    setNotice('Guardando tus canciones en este dispositivo…');
    void Promise.allSettled(added.map((item)=>saveSong(item.record))).then((results) => {
      const saved = results.filter((r)=>r.status==='fulfilled').length;
      setNotice(saved===added.length
        ? added.length + ' canción(es) guardadas en este navegador. También funcionan sin internet.'
        : saved + ' de ' + added.length + ' guardadas; las demás solo estarán disponibles hasta cerrar esta sesión.');
    });
    selectTrack(added[0].track);
  }, [selectTrack]);

  const removeLocalTrack = useCallback(async (id: string): Promise<boolean> => {
    const track = tracksRef.current.find((item)=>item.id===id);
    if (!track?.audioUrl || !track.id.startsWith('local-')) return false;
    try { await deleteSavedSong(id); }
    catch { setNotice('No fue posible eliminar la canción del almacenamiento.'); return false; }
    if (currentRef.current===id) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      setCurrentId(null); setState('idle'); setTime(0); setDuration(0);
    }
    userQueueRef.current = null;
    setTracks((prev)=>prev.filter((item)=>item.id!==id));
    setFavorites((prev)=>{
      const next=prev.filter((item)=>item!==id);
      try {localStorage.setItem('nebula:favorites:v1',JSON.stringify(next));} catch { /* optional */ }
      return next;
    });
    const url=urlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); urlsRef.current.delete(id); }
    setNotice('Canción eliminada de este navegador.');
    return true;
  }, []);

  const seek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(value) && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0,Math.min(value,audio.duration));
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextValue = Math.min(1,Math.max(0,value));
    setVolumeState(nextValue);
    if (audioRef.current) audioRef.current.volume = nextValue;
    try { localStorage.setItem('nebula:volume:v1',String(nextValue)); } catch { /* optional */ }
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((previous) => {
      const updated=previous.includes(id) ? previous.filter((x)=>x!==id) : [...previous,id];
      try {localStorage.setItem('nebula:favorites:v1',JSON.stringify(updated));} catch { /* optional */ }
      return updated;
    });
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (current) {
      session.metadata = new MediaMetadata({
        title: current.title, artist: current.artist, album: current.album,
        artwork: [{src: new URL(current.cover, location.origin).href, sizes:'512x512', type:'image/svg+xml'}],
      });
    }
    session.playbackState = state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'none';
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', toggle], ['pause',toggle], ['nexttrack',next], ['previoustrack',previous],
      ['seekto',(event)=>{if (typeof event.seekTime==='number') seek(event.seekTime);} ],
    ];
    for (const [action,handler] of actions) { try { session.setActionHandler(action,handler); } catch { /* unsupported action */ } }
    return () => { for (const [action] of actions) { try { session.setActionHandler(action,null); } catch { /* unsupported action */ } } };
  }, [current, state, toggle, next, previous, seek]);

  return {
    tracks, ownTracks, current, state, notice, setNotice, time, duration, volume, shuffle, repeat, favorites,
    loadingLibrary, importFiles, removeLocalTrack, selectTrack, playQueue, playExternal, toggle, next, previous, seek, setVolume,
    toggleShuffle: () => setShuffle((value)=>!value),
    cycleRepeat: () => setRepeat((value)=>value==='off' ? 'all' : value==='all' ? 'one' : 'off'),
    toggleFavorite,
  };
}
