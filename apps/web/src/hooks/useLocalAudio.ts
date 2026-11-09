'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextIndex, previousIndex, type PlaybackState, type RepeatMode } from '@nebula/player-core';
import { artwork, demoTracks, type Track } from '../lib/catalog';
import { deleteSavedSong, getSavedSong, loadSavedSongs, MAX_AUDIO_BYTES, saveSong, songToTrack, type SavedSong } from '../lib/local-library';
import {downloadLocalAudioBlob,exportedSongFilename} from '../lib/local-audio-download';
import { readAudioMetadata } from '../lib/audio-metadata';
import {readCheckpoint,saveCheckpoint} from '../lib/playback-checkpoint';
import {clearTransientPlaybackNotice} from '../lib/notice-lifecycle';
import {isPlayableExternalUrl} from '../lib/private-bridge';
import { createAudioEnhancer, normalizeAudioPreset, normalizeAudioBands, presetAudioBands, AUDIO_PRESETS, type AudioEnhancer, type AudioPreset } from '../lib/audio-enhancer';

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
  audioPreset: AudioPreset;
  audioBands: number[];
  humFilter: boolean;
  abBypass: boolean;
  storageDurability: 'unknown' | 'granted' | 'best-effort' | 'unavailable';
  setAudioPreset: (preset: AudioPreset) => void;
  setAudioBands: (bands: number[]) => void;
  setHumFilter: (enabled: boolean) => void;
  setAbBypass: (enabled: boolean) => void;
  getAudioAnalyser: () => AnalyserNode | null;
  warmAudioAnalyser: () => void;
  requestStoragePersistence: () => Promise<void>;
  importFiles: (list: FileList | File[] | null) => void;
  removeLocalTrack: (id: string) => Promise<boolean>;
  downloadLocalTrack: (id: string) => Promise<void>;
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
  const volumeRef=useRef(0.85);
  const volumeRampRef=useRef<number|null>(null);
  const [notice, setNotice] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [audioPreset, setAudioPresetState] = useState<AudioPreset>('off');
  const [audioBands, setAudioBandsState] = useState<number[]>([...AUDIO_PRESETS.off.bands]);
  const [humFilter, setHumFilterState] = useState(false);
  const [abBypass, setAbBypassState] = useState(false);
  const [storageDurability, setStorageDurability] = useState<'unknown'|'granted'|'best-effort'|'unavailable'>('unknown');
  const audioPresetRef=useRef<AudioPreset>('off');
  const customBandsRef=useRef<number[]>([...AUDIO_PRESETS.balanced.bands]);
  const humFilterRef=useRef(false);
  const abBypassRef=useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const externalAudioRef = useRef<HTMLAudioElement | null>(null);
  const enhancerRef=useRef<AudioEnhancer|null>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());
  const nextRef = useRef<() => void>(() => {});
  const checkpointWriteRef=useRef(0);
  const queueRef = useRef<Track[]>([]);
  const signedTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const signedRenewRef = useRef<(()=>void)|null>(null);
  const signedFailuresRef = useRef(0);
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
      const persistedPreset=normalizeAudioPreset(localStorage.getItem('nebula:audio-preset:v1'));
      const persistedHum=localStorage.getItem('nebula:hum-filter:v1')==='true';
      const rawBands=localStorage.getItem('nebula:audio-bands:v2');
      const storedBands=normalizeAudioBands(rawBands ? JSON.parse(rawBands) as unknown : undefined);
      customBandsRef.current=storedBands;
      setAudioPresetState(persistedPreset);audioPresetRef.current=persistedPreset;
      setAudioBandsState(presetAudioBands(persistedPreset,storedBands));
      setHumFilterState(persistedHum);humFilterRef.current=persistedHum;
      const storedVolume = Number(localStorage.getItem('nebula:volume:v1'));
      if (Number.isFinite(storedVolume) && localStorage.getItem('nebula:volume:v1') !== null) {
        const nextVolume = Math.min(1, Math.max(0, storedVolume));
        volumeRef.current=nextVolume;
        setVolumeState(nextVolume);
        if (localAudioRef.current) localAudioRef.current.volume = nextVolume;
        if (externalAudioRef.current) externalAudioRef.current.volume = nextVolume;
      }
    } catch { /* Optional browser storage may be blocked. */ }
    if(typeof navigator!=='undefined'){
      if(typeof navigator.storage?.persisted === 'function'){
        void navigator.storage.persisted().then(granted=>setStorageDurability(granted?'granted':'best-effort'))
          .catch(()=>setStorageDurability('unavailable'));
      } else setStorageDurability('unavailable');
    }
    void loadSavedSongs().then((songs) => {
      if (!active) return;
      const playable = songs.sort((a,b)=>b.createdAt-a.createdAt).map((song) => {
        const url = URL.createObjectURL(song.blob);
        urlsRef.current.set(song.id,url);
        return songToTrack(song,url);
      });
      setTracks((previous) => [...playable, ...previous.filter((t)=>!t.audioUrl || !playable.some((p)=>p.id===t.id))]);
      const checkpoint=readCheckpoint(localStorage);
      const resume=checkpoint && playable.find(t=>t.id===checkpoint.trackId);
      if(checkpoint && resume?.audioUrl){
        const queue=checkpoint.queueIds.map(id=>playable.find(t=>t.id===id)).filter((t):t is Track=>Boolean(t));
        userQueueRef.current=queue.length?queue:null;
        currentRef.current=resume.id;
        setCurrentId(resume.id);
        setTime(checkpoint.time);
        setState('paused');
        const audio=audioRef.current;
        if(audio){
          audio.pause();
          audio.src=resume.audioUrl;
          audio.addEventListener('loadedmetadata',()=>{
            if(currentRef.current!==resume.id)return;
            try{audio.currentTime=Math.min(checkpoint.time,Math.max(0,audio.duration-0.1));}
            catch{/* Safari may reject seeks before enough data is loaded */}
          },{once:true});
          audio.load();
        }
      }
      setLoadingLibrary(false);
    }).catch(() => {
      if (active) { setLoadingLibrary(false); setNotice('Tu navegador no permite abrir la biblioteca guardada. Puedes reproducir archivos durante esta sesión.'); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    const externalAudio = new Audio();
    for (const element of [audio,externalAudio]) {
      element.preload = 'metadata';
      element.volume = volume;
    }
    audioRef.current = audio;
    localAudioRef.current = audio;
    externalAudioRef.current = externalAudio;
    const persist=()=>{
      const activeAudio=audioRef.current;
      if(!activeAudio)return;
      const id=currentRef.current;
      if(!id?.startsWith('local-'))return;
      saveCheckpoint(localStorage,{
        trackId:id,time:activeAudio.currentTime||0,
        queueIds:queueRef.current.filter(t=>t.id.startsWith('local-')).map(t=>t.id),
        savedAt:Date.now(),
      });
      checkpointWriteRef.current=Date.now();
    };
    const attachListeners=(audio:HTMLAudioElement)=>{
    const isActive=()=>audioRef.current===audio;
    const onTime = () => {
      if(!isActive())return;
      setTime(audio.currentTime || 0);
      if(Date.now()-checkpointWriteRef.current>5000)persist();
      if ('mediaSession' in navigator && audio.duration && Number.isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: audio.currentTime }); }
        catch { /* Some browsers do not support position state for the current asset. */ }
      }
    };
    const onDuration = () => { if(isActive())setDuration(Number.isFinite(audio.duration) ? audio.duration : 0); };
    const onPlay = () => { if(!isActive())return; setState('playing'); setNotice(clearTransientPlaybackNotice); };
    const onPause = () => {if(!isActive())return;persist();setState((old) => old === 'ended' || old === 'error' ? old : 'paused');};
    const onPlaying = () => {
      if(!isActive())return;
      setState('playing');setNotice(clearTransientPlaybackNotice);
      // Short ramp at the moment samples actually start prevents hard-start clicks
      // on slow-loading MP3s, remote media and resumed playback.
      if(volumeRampRef.current!==null)cancelAnimationFrame(volumeRampRef.current);
      // Background tabs throttle requestAnimationFrame; never leave audio muted.
      if (document.hidden) { audio.volume = volumeRef.current; return; }
      audio.volume=0;
      const begun=performance.now();
      const ramp=(now:number)=>{
        if(audioRef.current!==audio)return;
        const progress=Math.min(1,Math.max(0,(now-begun)/90));
        audio.volume=volumeRef.current*progress;
        volumeRampRef.current=progress<1?requestAnimationFrame(ramp):null;
      };
      volumeRampRef.current=requestAnimationFrame(ramp);
    };
    const onWaiting = () => {
      if(!isActive())return;
      setState('buffering');
      if(currentRef.current?.startsWith('remote-'))setNotice('El proveedor está cargando el audio. Si no avanza, prueba otra canción.');
    };
    const onStalled = () => {
      if(!isActive())return;
      setState('buffering');
      if(currentRef.current?.startsWith('remote-'))setNotice('La transmisión se detuvo temporalmente. Revisa tu conexión o selecciona otra pista.');
    };
    const onError = () => {
      if(!isActive())return;
      // Signed R2 URLs may expire while the listener is mounted. A private
      // resolver is only available for the owner's own cloud entries.
      if(signedRenewRef.current && signedFailuresRef.current<2){
        signedFailuresRef.current++;
        setState('buffering');
        setNotice('Renovando el enlace privado de reproducción…');
        signedRenewRef.current();
        return;
      }
      setState('error');
      setNotice(currentRef.current?.startsWith('remote-')
        ? 'El proveedor no pudo servir esta canción. Prueba otra pista o abre la fuente oficial.'
        : 'El navegador no pudo cargar el audio. Revisa tu red, el formato o renueva la pista.');
    };
    const onEnded = () => {if(!isActive())return; setState('ended'); nextRef.current(); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    };
    attachListeners(audio);
    attachListeners(externalAudio);
    return () => {
      if(signedTimerRef.current)clearTimeout(signedTimerRef.current);
      if(volumeRampRef.current!==null)cancelAnimationFrame(volumeRampRef.current);
      volumeRampRef.current=null;
      signedRenewRef.current=null;
      for(const element of [audio,externalAudio]){
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
      enhancerRef.current?.dispose();
      enhancerRef.current=null;
      localAudioRef.current=null;
      externalAudioRef.current=null;
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

  const renewSignedTrack: (track:Track)=>Promise<void> = useCallback(async(track:Track)=>{
    const renew=track.renewAudioUrl;
    if(!renew || currentRef.current!==track.id)return;
    const audio=audioRef.current;
    if(!audio)return;
    try {
      const lease=await renew();
      if(currentRef.current!==track.id||audioRef.current!==audio)return;
      const next=new URL(lease.url);
      if(next.protocol!=='https:')throw new Error('Enlace firmado inseguro.');
      const position=Number.isFinite(audio.currentTime)?audio.currentTime:0;
      const wasPlaying=!audio.paused;
      setState('loading');
      audio.pause();
      audio.src=next.toString();
      const restore=()=>{
        if(currentRef.current!==track.id||audioRef.current!==audio)return;
        try{
          if(Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-0.1));
          if(wasPlaying)void audio.play().catch(()=>setNotice('Pulsa Reproducir para continuar después de renovar el enlace.'));
          else setState('paused');
        }catch{setNotice('El audio se renovó. Reanuda la canción manualmente.');}
      };
      audio.addEventListener('loadedmetadata',restore,{once:true});
      audio.load();
      signedFailuresRef.current=0;
      if(signedTimerRef.current)clearTimeout(signedTimerRef.current);
      if(currentRef.current===track.id){
        const interval=Math.max(30_000,Math.min(3_300_000,(lease.expiresInSeconds||3600)*1000-60_000));
        signedTimerRef.current=setTimeout(()=>{void renewSignedTrack(track);},interval);
      }
    }catch{
      if(currentRef.current!==track.id)return;
      setNotice('No pudimos renovar el enlace privado. Comprueba la conexión e intenta reproducir otra vez.');
      if(signedTimerRef.current)clearTimeout(signedTimerRef.current);
      signedTimerRef.current=setTimeout(()=>{void renewSignedTrack(track);},60_000);
    }
  },[]);

  const ensureEnhancer=useCallback((notify=true):AudioEnhancer|null=>{
    if(enhancerRef.current)return enhancerRef.current;
    const local=localAudioRef.current;
    if(!local || typeof AudioContext==='undefined')return null;
    try {
      const enhancer=createAudioEnhancer(local);
      enhancerRef.current=enhancer;
      enhancer.setPreset(audioPresetRef.current);
      if(audioPresetRef.current==='custom')enhancer.setBands(customBandsRef.current);
      enhancer.setHumFilter(humFilterRef.current);
      enhancer.setBypass(abBypassRef.current);
      return enhancer;
    }catch{
      if(notify)setNotice('Tu navegador no admite estos efectos de audio. El archivo original sigue disponible.');
      return null;
    }
  },[]);

  const setAudioPreset=useCallback((preset:AudioPreset)=>{
    const next=normalizeAudioPreset(preset);
    audioPresetRef.current=next;
    setAudioPresetState(next);
    setAudioBandsState(presetAudioBands(next,customBandsRef.current));
    if(next==='off'&&abBypassRef.current){
      abBypassRef.current=false;setAbBypassState(false);
    }
    try{localStorage.setItem('nebula:audio-preset:v1',next);}catch{}
    if(next!=='off'&&currentRef.current?.startsWith('local-'))ensureEnhancer();
    enhancerRef.current?.setPreset(next);
    if(next==='custom')enhancerRef.current?.setBands(customBandsRef.current);
    enhancerRef.current?.setBypass(abBypassRef.current);
    if(next!=='off')void enhancerRef.current?.resume().catch(()=>{});
  },[ensureEnhancer]);

  const setAudioBands=useCallback((bands:number[])=>{
    const normalized=normalizeAudioBands(bands);
    customBandsRef.current=normalized;
    audioPresetRef.current='custom';
    setAudioPresetState('custom');
    setAudioBandsState(normalized);
    if(abBypassRef.current){abBypassRef.current=false;setAbBypassState(false);}
    try{
      localStorage.setItem('nebula:audio-bands:v2',JSON.stringify(normalized));
      localStorage.setItem('nebula:audio-preset:v1','custom');
    }catch{}
    if(currentRef.current?.startsWith('local-'))ensureEnhancer();
    enhancerRef.current?.setBands(normalized);
    enhancerRef.current?.setBypass(false);
    void enhancerRef.current?.resume().catch(()=>{});
  },[ensureEnhancer]);

  const setHumFilter=useCallback((enabled:boolean)=>{
    humFilterRef.current=enabled;
    setHumFilterState(enabled);
    if(enabled&&abBypassRef.current){abBypassRef.current=false;setAbBypassState(false);}
    try{localStorage.setItem('nebula:hum-filter:v1',String(enabled));}catch{}
    if(enabled&&currentRef.current?.startsWith('local-'))ensureEnhancer();
    enhancerRef.current?.setHumFilter(enabled);
    enhancerRef.current?.setBypass(abBypassRef.current);
    if(enabled)void enhancerRef.current?.resume().catch(()=>{});
  },[ensureEnhancer]);

  const setAbBypass=useCallback((enabled:boolean)=>{
    const next=enabled===true;
    abBypassRef.current=next;
    setAbBypassState(next);
    if(currentRef.current?.startsWith('local-'))ensureEnhancer(false);
    enhancerRef.current?.setBypass(next);
    if(!next)void enhancerRef.current?.resume().catch(()=>{});
  },[ensureEnhancer]);

  const getAudioAnalyser=useCallback(()=>enhancerRef.current?.getAnalyser()??null,[]);

  const warmAudioAnalyser=useCallback(()=>{
    if(!currentRef.current?.startsWith('local-'))return;
    const enhancer=ensureEnhancer(false);
    if(enhancer)void enhancer.resume().catch(()=>{});
  },[ensureEnhancer]);

  const requestStoragePersistence=useCallback(async()=>{
    if(typeof navigator==='undefined'||typeof navigator.storage?.persist!=='function'){
      setStorageDurability('unavailable');
      setNotice('Este navegador no admite protección de almacenamiento. Guarda una copia ZIP desde Biblioteca.');
      return;
    }
    try{
      const granted=await navigator.storage.persist();
      setStorageDurability(granted?'granted':'best-effort');
      setNotice(granted
        ? 'Almacenamiento persistente concedido para esta instalación.'
        : 'El navegador conserva tu música local, pero puede liberar espacio. Exporta una copia ZIP de respaldo.');
    }catch{
      setStorageDurability('unavailable');
      setNotice('No pudimos solicitar almacenamiento persistente. Exporta una copia ZIP de tu música.');
    }
  },[]);

  const selectTrack = useCallback((track: Track) => {
    if (!track.audioUrl) {
      setNotice('Esta canción es parte del concepto visual. Importa tus archivos para escuchar música real.');
      return;
    }
    const isLocal=track.id.startsWith('local-');
    const audio=isLocal?localAudioRef.current:externalAudioRef.current;
    if(!audio)return;
    if(audioRef.current!==audio){
      if(volumeRampRef.current!==null)cancelAnimationFrame(volumeRampRef.current);
      volumeRampRef.current=null;
      const oldAudio=audioRef.current;
      audioRef.current=audio;
      if(oldAudio){
        oldAudio.pause();
        oldAudio.removeAttribute('src');
        oldAudio.load();
      }
    }
    if(isLocal && (audioPresetRef.current!=='off'||humFilterRef.current)){
      const enhancer=ensureEnhancer();
      enhancer?.setPreset(audioPresetRef.current);
      if(audioPresetRef.current==='custom')enhancer?.setBands(customBandsRef.current);
      enhancer?.setHumFilter(humFilterRef.current);
      enhancer?.setBypass(abBypassRef.current);
      enhancer?.fadeIn();
      void enhancer?.resume().catch(()=>{});
    }
    if(signedTimerRef.current)clearTimeout(signedTimerRef.current);
    signedRenewRef.current=null;
    signedFailuresRef.current=0;
    currentRef.current=track.id;
    if(track.renewAudioUrl){
      signedRenewRef.current=()=>{void renewSignedTrack(track);};
      const milliseconds=Math.max(30_000,Math.min(3_300_000,(track.signedAudioExpiresInSeconds||3600)*1000-60_000));
      signedTimerRef.current=setTimeout(()=>{void renewSignedTrack(track);},milliseconds);
    }
    setNotice('');
    setCurrentId(track.id);
    setTime(0);
    setDuration(0);
    setState('loading');
    audio.pause();
    audio.volume=0;
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
  }, [renewSignedTrack,ensureEnhancer]);

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
    if(track.source!=='external' || !isPlayableExternalUrl(track.audioUrl)) {
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
    const files = selected.filter(file=>file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(file.name));
    if (!files.length) { setNotice('Selecciona archivos de audio compatibles (MP3, M4A, WAV, OGG, FLAC, etc.).'); return; }
    const candidates = files.filter(file=>file.size>0 && file.size<=MAX_AUDIO_BYTES);
    if (!candidates.length) { setNotice('Los archivos deben ser de audio, no estar vacíos y pesar como máximo 100 MB cada uno.'); return; }
    if (candidates.length>50) { setNotice('Puedes importar hasta 50 archivos locales por lote. Selecciona menos canciones; no omitiremos archivos sin avisarte.'); return; }
    // Request durable origin storage while the file-picker action is active.
    if(typeof navigator!=='undefined'&&typeof navigator.storage?.persist==='function'){
      void navigator.storage.persist().then(granted=>setStorageDurability(granted?'granted':'best-effort'))
        .catch(()=>{});
    }
    setNotice('Leyendo etiquetas de tus canciones…');
    void (async()=>{
      const added=await Promise.all(candidates.map(async(file,index):Promise<{track:Track;record:SavedSong}>=>{
        const tags=await readAudioMetadata(file);
        const id='local-'+crypto.randomUUID();
        const url=URL.createObjectURL(file);
        urlsRef.current.set(id,url);
        const record:SavedSong={
          id,title:tags.title,artist:tags.artist,album:tags.album,genre:tags.genre,
          duration:'--:--',cover:tags.coverDataUrl??artwork[index%artwork.length],mimeType:file.type,filename:file.name,blob:file,
          createdAt:Date.now()+index,
        };
        return {record,track:songToTrack(record,url)};
      }));
      setTracks(previous=>[...added.map(x=>x.track),...previous]);
      userQueueRef.current=null;
      // selectTrack clears stale player notices; select before reporting import success.
      selectTrack(added[0].track);
      setNotice('Guardando tus canciones en este dispositivo…');
      const results=await Promise.allSettled(added.map(item=>saveSong(item.record)));
      const saved=results.filter(result=>result.status==='fulfilled').length;
      setNotice(saved===added.length
        ? added.length+' canción(es) guardadas en este navegador con sus metadatos disponibles.'
        : saved+' de '+added.length+' guardadas; las demás solo estarán disponibles hasta cerrar esta sesión.');
    })().catch(()=>{
      setNotice('No se pudieron procesar algunos archivos. Intenta de nuevo con un lote más pequeño.');
    });
  }, [selectTrack]);

  const downloadLocalTrack = useCallback(async (id: string): Promise<void> => {
    if(!id.startsWith('local-') || !tracksRef.current.some(item=>item.id===id&&Boolean(item.audioUrl))){
      setNotice('Esta pista no es un archivo de tu biblioteca local.');return;
    }
    try{
      const song=await getSavedSong(id);
      if(!song){setNotice('No se encontró el archivo guardado. Puedes volver a importarlo desde tu equipo.');return;}
      const name=exportedSongFilename(song);
      downloadLocalAudioBlob(song.blob,name);
      setNotice('Descarga iniciada: '+name+'. Se conserva el formato de audio original.');
    }catch{
      setNotice('No pudimos descargar el archivo de la biblioteca. Comprueba los permisos del navegador.');
    }
  }, []);

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
    volumeRef.current=nextValue;
    setVolumeState(nextValue);
    if (localAudioRef.current) localAudioRef.current.volume = nextValue;
    if (externalAudioRef.current) externalAudioRef.current.volume = nextValue;
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
      const coverPath=new URL(current.cover,location.origin);
      const mime=coverPath.protocol==='data:'
        ? (/^data:image\/png/i.test(current.cover)?'image/png':/^data:image\/jpeg/i.test(current.cover)?'image/jpeg':'image/svg+xml')
        : /\.png$/i.test(coverPath.pathname)?'image/png':/\.jpe?g$/i.test(coverPath.pathname)?'image/jpeg':'image/svg+xml';
      session.metadata = new MediaMetadata({
        title: current.title, artist: current.artist, album: current.album,
        artwork: [{src:coverPath.href,type:mime}],
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
    loadingLibrary, audioPreset, audioBands, humFilter, abBypass, storageDurability,
    setAudioPreset, setAudioBands, setHumFilter, setAbBypass, getAudioAnalyser, warmAudioAnalyser, requestStoragePersistence,
    importFiles, removeLocalTrack, downloadLocalTrack, selectTrack, playQueue, playExternal, toggle, next, previous, seek, setVolume,
    toggleShuffle: () => setShuffle((value)=>!value),
    cycleRepeat: () => setRepeat((value)=>value==='off' ? 'all' : value==='all' ? 'one' : 'off'),
    toggleFavorite,
  };
}
