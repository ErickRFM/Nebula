'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import {
  AudioLines, Bell, ChevronLeft, ChevronRight, CircleUserRound, CloudUpload,
  Compass, Disc3, Download, Headphones, Heart, Home, Library, ListMusic,
  Mic2, MonitorSpeaker, MoreHorizontal, Music2, Pause, Play, Plus,
  Repeat, Repeat1, Search, Settings2, Shuffle, SkipBack, SkipForward,
  SlidersHorizontal, Sparkles, Users, Volume2, Waves, X, Trash2, ListPlus,
  type LucideIcon,
} from 'lucide-react';
import { formatTime } from '@nebula/player-core';
import { artwork, demoTracks, mixes, type Track } from '../lib/catalog';
import { Cover, TrackCover } from './Cover';
import { useLocalAudio } from '../hooks/useLocalAudio';
import { usePlaylists } from '../hooks/usePlaylists';
import { useAccount } from '../hooks/useAccount';
import { AccountPanel } from './AccountPanel';
import { ExplorePanel } from './ExplorePanel';
import { CloudLibrary } from './CloudLibrary';

type Screen = 'inicio' | 'buscar' | 'biblioteca' | 'playlists' | 'salas' | 'ajustes' | 'cuenta' | 'explorar' | 'reproductor';
const navigation: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'buscar', label: 'Buscar', icon: Search },
  { id: 'biblioteca', label: 'Biblioteca', icon: Library },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'salas', label: 'Salas', icon: Waves },
  { id: 'ajustes', label: 'Ajustes', icon: Settings2 },
  { id: 'cuenta', label: 'Cuenta', icon: CircleUserRound },
];
const genres = ['Todos', 'Electrónica', 'Chill', 'Pop', 'Ambient', 'Indie'];
type PlayerApi = ReturnType<typeof useLocalAudio>;

function Brand() {
  return <div className="brand"><span className="brand-mark"><Sparkles size={23}/></span><span>NÉBULA <small>MUSIC</small></span></div>;
}
function Tag({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div>; }
function SectionHeader({title, action, onAction}: {title: string; action?: string; onAction?: () => void}) {
  return <div className="section-heading"><h2>{title}</h2>{action && <button className="text-action" type="button" onClick={onAction}>{action}<ChevronRight size={15}/></button>}</div>;
}
function UploadButton({ onFiles, small=false }: {onFiles: (files: FileList | null) => void; small?: boolean}) {
  return <label className={small ? 'button primary small' : 'button primary'}>
    <Plus size={16}/> Importar música
    <input className="file-input" type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac" onChange={(e: ChangeEvent<HTMLInputElement>) => { onFiles(e.target.files); e.target.value = ''; }} aria-label="Importar archivos de audio propios"/>
  </label>;
}
function TrackRow({ track, player, index, onRemove, onAdd }: { track: Track; player: PlayerApi; index?: number; onRemove?: (id: string) => void; onAdd?: (id: string) => void }) {
  const favorite = player.favorites.includes(track.id);
  return <div className="track-row">
    {index !== undefined && <span className="track-index">{index + 1}</span>}
    <button className="track-main" type="button" onClick={() => player.selectTrack(track)} title={track.audioUrl ? 'Reproducir' : 'Canción de demostración, sin audio'}>
      <TrackCover track={track} className="track-thumb"/>
      <span className="track-descriptor"><strong>{track.title}</strong><small>{track.artist}{!track.audioUrl ? ' · Vista previa' : ''}</small></span>
    </button>
    <span className="track-album">{track.album}</span>
    {track.audioUrl && onAdd && <button type="button" className="icon-button" aria-label={'Añadir ' + track.title + ' a playlist'} title="Añadir a playlist" onClick={()=>onAdd(track.id)}><ListPlus size={18}/></button>}
    {track.audioUrl && onRemove && <button type="button" className="icon-button" aria-label={'Eliminar ' + track.title + ' de este dispositivo'} title="Eliminar archivo guardado" onClick={()=>onRemove(track.id)}><Trash2 size={17}/></button>}
    <span className="track-length">{track.duration}</span>
    <button className={'icon-button heart-button ' + (favorite ? 'active' : '')} type="button" aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={() => player.toggleFavorite(track.id)}><Heart size={18} fill={favorite ? 'currentColor' : 'none'}/></button>
  </div>;
}
function AlbumCard({ title, subtitle, cover, onClick }: {title: string; subtitle: string; cover: string; onClick: () => void}) {
  return <button type="button" className="album-card" onClick={onClick}>
    <span className="album-cover-wrap"><Cover source={cover} alt={'Ilustración de ' + title} className="album-cover"/><span className="album-play"><Play size={20} fill="currentColor"/></span></span>
    <strong>{title}</strong><span>{subtitle}</span>
  </button>;
}
function MiniPlayer({player,onExpand}: {player: PlayerApi; onExpand: () => void}) {
  const current = player.current;
  if (!current) return null;
  return <div className="mini-player glass">
    <button className="mini-track" type="button" onClick={onExpand}>
      <TrackCover track={current} className="mini-cover"/><span><strong>{current.title}</strong><small>{current.artist}</small></span>
    </button>
    <button type="button" className="icon-button mini-heart" aria-label="Favorito" onClick={() => player.toggleFavorite(current.id)}><Heart size={18} fill={player.favorites.includes(current.id) ? 'currentColor' : 'none'}/></button>
    <div className="mini-controls">
      <button aria-label="Anterior" className="icon-button" onClick={player.previous} type="button"><SkipBack size={19}/></button>
      <button aria-label={player.state === 'playing' ? 'Pausar' : 'Reproducir'} className="mini-play" onClick={player.toggle} type="button">{player.state === 'playing' ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
      <button aria-label="Siguiente" className="icon-button" onClick={player.next} type="button"><SkipForward size={19}/></button>
    </div>
    <div className="mini-progress" style={{width: player.duration ? (100 * player.time / player.duration) + '%' : '0%'}}/>
  </div>;
}
function FullPlayer({player,onBack}: {player: PlayerApi; onBack: () => void}) {
  const current = player.current;
  return <section className="full-player">
    <div className="full-top"><button className="icon-button glass-chip" aria-label="Volver" onClick={onBack} type="button"><ChevronLeft/></button><Tag>REPRODUCIENDO AHORA</Tag><button className="icon-button glass-chip" title="Opciones próximamente" aria-label="Más opciones" type="button" disabled><MoreHorizontal/></button></div>
    <div className="player-stage">
      <div className="player-art"><Cover source={current?.cover ?? artwork[0]} alt={current ? 'Portada del álbum ' + current.album : 'Arte visual NÉBULA'} className="player-cover"/></div>
      <div className="player-detail">
        <Tag>AHORA SUENA EN TU ESPACIO</Tag>
        <div className="player-title"><div><h1>{current?.title ?? 'Tu próximo descubrimiento'}</h1><p>{current?.artist ?? 'Importa música para comenzar'}</p></div>{current && <button type="button" aria-label="Favorito" className="icon-button heart-button" onClick={() => player.toggleFavorite(current.id)}><Heart size={24} fill={player.favorites.includes(current.id) ? 'currentColor' : 'none'}/></button>}</div>
        <label className="sr-only" htmlFor="playback-seek">Posición de reproducción</label>
        <input id="playback-seek" className="seek-range" type="range" min="0" max={player.duration || 1} step=".1" value={Math.min(player.time, player.duration || 1)} onChange={(e)=>player.seek(Number(e.target.value))} disabled={!current}/>
        <div className="timestamps"><span>{formatTime(player.time)}</span><span>{formatTime(player.duration)}</span></div>
        <div className="player-actions">
          <button className={'icon-button ' + (player.shuffle ? 'is-on' : '')} type="button" title="Aleatorio" aria-label="Aleatorio" aria-pressed={player.shuffle} onClick={player.toggleShuffle}><Shuffle size={20}/></button>
          <button className="icon-button" type="button" aria-label="Anterior" onClick={player.previous}><SkipBack size={24}/></button>
          <button className="primary-play" type="button" aria-label={player.state === 'playing' ? 'Pausar' : 'Reproducir'} onClick={player.toggle}>{player.state === 'playing' ? <Pause size={26} fill="currentColor"/> : <Play size={26} fill="currentColor"/>}</button>
          <button className="icon-button" type="button" aria-label="Siguiente" onClick={player.next}><SkipForward size={24}/></button>
          <button className={'icon-button ' + (player.repeat !== 'off' ? 'is-on' : '')} type="button" aria-label="Repetición" title={'Repetición: ' + player.repeat} onClick={player.cycleRepeat}>{player.repeat === 'one' ? <Repeat1 size={20}/> : <Repeat size={20}/>}</button>
        </div>
        <div className="volume-row"><Volume2 size={20}/><label className="sr-only" htmlFor="playback-volume">Volumen</label><input id="playback-volume" type="range" min="0" max="1" step=".01" value={player.volume} onChange={(e)=>player.setVolume(Number(e.target.value))}/><span>{Math.round(player.volume*100)}%</span></div>
        <div className="lyrics-panel glass"><div className="lyrics-heading"><Mic2 size={18}/> Letras y momentos</div><p>Las letras sincronizadas estarán disponibles cuando contemos con los permisos correspondientes.</p></div>
      </div>
    </div>
  </section>;
}
export function NebulaApp() {
  const [screen, setScreen] = useState<Screen>('inicio');
  const [previousScreen, setPreviousScreen] = useState<Screen>('inicio');
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Todos');
  const [libraryFilter, setLibraryFilter] = useState<'canciones'|'favoritos'|'albumes'>('canciones');
  const [reducedMotion, setReducedMotion] = useState(false);
  const player = useLocalAudio();
  const playlistStore = usePlaylists();
  const account = useAccount();
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);

  const localCount = player.ownTracks.length;
  const currentPlaylist = playlistStore.playlists.find((item)=>item.id === activePlaylist);
  function addToPlaylist(trackId: string) {
    const target = currentPlaylist ?? playlistStore.playlists[0];
    if (!target) { player.setNotice('Crea primero una playlist para añadir canciones.'); navigate('playlists'); return; }
    playlistStore.addSong(target.id, trackId);
    player.setNotice('Canción añadida a ' + target.title + '.');
  }
  function deleteFromLibrary(trackId: string) {
    if (!window.confirm('¿Eliminar esta canción guardada de este navegador?')) return;
    void player.removeLocalTrack(trackId).then((deleted)=>{if(deleted) playlistStore.removeFromAll(trackId);});
  }
  function createPlaylist() {
    const id = playlistStore.create(playlistTitle);
    if (id) { setActivePlaylist(id); setPlaylistTitle(''); player.setNotice('Playlist creada y guardada en este navegador.'); }
    else player.setNotice('Escribe un nombre para crear la playlist.');
  }
  const filteredTracks = player.tracks.filter((track) => {
    const query = search.toLocaleLowerCase('es');
    const matchesText = (track.title + ' ' + track.artist + ' ' + track.album + ' ' + track.genre).toLocaleLowerCase('es').includes(query);
    return matchesText && (genre === 'Todos' || track.genre === genre);
  });

  useEffect(() => {
    try { setReducedMotion(localStorage.getItem('nebula:reduced-motion') === 'true'); } catch { /* optional */ }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
    try { localStorage.setItem('nebula:reduced-motion', String(reducedMotion)); } catch { /* optional */ }
    return () => document.documentElement.classList.remove('reduce-motion');
  }, [reducedMotion]);
  function navigate(target: Screen) {
    if (target === 'reproductor' && screen !== 'reproductor') setPreviousScreen(screen);
    setScreen(target);
  }
  const playbackActive = Boolean(player.current);
  return <div className="nebula-shell">
    <div className="background-orb orb-one"/><div className="background-orb orb-two"/><div className="background-orb orb-three"/>
    <aside className="sidebar glass">
      <Brand/>
      <div className="sidebar-label">TU UNIVERSO</div>
      <nav aria-label="Navegación principal" className="side-links">{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={()=>navigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={'nav-item ' + (screen === item.id ? 'selected' : '')}><Icon size={19}/>{item.label}</button>; })}</nav>
      <div className="sidebar-label extra-label">TU MÚSICA</div>
      <div className="side-collection"><span><Disc3 size={16}/> En mi órbita</span><span><Waves size={16}/> Noches de neón</span><span><Headphones size={16}/> Marea tranquila</span></div>
      <div className="sidebar-footer"><span className="status-dot"/> F01 · Vista preliminar</div>
    </aside>
    <div className="workspace">
      <header className="topbar glass">
        <div className="mobile-brand"><Brand/></div><div className="desktop-location"><span>Descubre tu propio universo</span></div>
        <div className="topbar-actions">
          <button className="icon-button glass-chip" title="Buscar" aria-label="Buscar" type="button" onClick={()=>navigate('buscar')}><Search size={19}/></button>
          <button className="icon-button glass-chip desktop-only" title="Notificaciones: próximamente" aria-label="Notificaciones no disponibles" type="button" disabled><Bell size={19}/></button>
          <button className="icon-button glass-chip" title="Mi cuenta" aria-label="Mi cuenta" type="button" onClick={()=>navigate('cuenta')}><CircleUserRound size={20}/></button>
        </div>
      </header>
      <main className={'main-area ' + (screen === 'reproductor' ? 'main-player' : '')}>
        {screen === 'inicio' && <>
          <section className="hero glass"><div className="hero-copy"><Tag>✦ BIENVENIDO A TU UNIVERSO</Tag><h1>La música se siente <em>diferente</em> aquí.</h1><p>Un espacio para tus canciones, tus momentos y todo lo que te mueve.</p><div className="hero-actions"><UploadButton onFiles={player.importFiles}/><button className="button secondary" type="button" onClick={()=>navigate('biblioteca')}>Mi biblioteca</button></div></div><div className="hero-planet" aria-hidden="true"><div className="planet-rings"/></div></section>
          <section className="content-section"><SectionHeader title="Para tu momento" action="Explorar" onAction={()=>navigate('buscar')}/><div className="album-grid">{mixes.map((mix)=><AlbumCard key={mix.title} {...mix} onClick={()=>navigate('playlists')}/>)}</div></section>
          <section className="content-section"><SectionHeader title="Tus mixes favoritos" action="Ver todos" onAction={()=>navigate('playlists')}/><div className="mix-grid">{mixes.slice(0,3).map((mix)=><button className="mix-pill glass" key={mix.title} type="button" onClick={()=>navigate('playlists')}><Cover source={mix.cover} alt="" className="mix-thumb"/><span><strong>{mix.title}</strong><small>{mix.subtitle}</small></span></button>)}</div></section>
          <section className="content-section"><SectionHeader title="Escucha tu música" action="Biblioteca" onAction={()=>navigate('biblioteca')}/><div className="track-list glass">{player.tracks.slice(0,5).map((track,i)=><TrackRow key={track.id} track={track} player={player} index={i}/>)}</div></section>
        </>}
        {screen === 'buscar' && <>
          <Tag>EXPLORA NUEVAS FRECUENCIAS</Tag><h1 className="page-title">¿Qué quieres escuchar?</h1><p className="page-description">Busca entre tus canciones y explora sonidos favoritos.</p>
          <div className="search-field glass"><Search size={21}/><input aria-label="Buscar canciones, artistas o álbumes" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Artistas, canciones, álbumes..."/>{search && <button type="button" className="icon-button" aria-label="Borrar búsqueda" onClick={()=>setSearch('')}><X size={16}/></button>}</div>
          <div className="chip-row">{genres.map((name)=><button type="button" key={name} className={'chip ' + (genre === name ? 'active' : '')} onClick={()=>setGenre(name)}>{name}</button>)}</div>
          <section className="content-section"><SectionHeader title="Explora por sonido"/><div className="genre-grid">{genres.slice(1).map((name,i)=><button className={'genre-card genre-' + i} type="button" onClick={()=>setGenre(name)} key={name}><strong>{name}</strong><Disc3 size={56}/></button>)}</div></section>
          <section className="content-section"><SectionHeader title={search || genre !== 'Todos' ? 'Resultados de búsqueda' : 'Escucha algo nuevo'}/><div className="track-list glass">{filteredTracks.length ? filteredTracks.map((track,i)=><TrackRow key={track.id} track={track} player={player} index={i}/>) : <p className="empty-note">No encontramos canciones con esos filtros.</p>}</div></section>
        </>}
        {screen === 'biblioteca' && <>
          <div className="heading-with-action"><div><Tag>TODO LO QUE TE MUEVE</Tag><h1 className="page-title">Tu biblioteca</h1><p className="page-description">Tu colección, a tu ritmo y en un solo lugar.</p></div><UploadButton onFiles={player.importFiles} small/></div>
          <div className="stats-grid"><div className="stat-card glass"><Tag>MI COLECCIÓN</Tag><strong>{localCount} <span>pistas propias</span></strong><small>{player.loadingLibrary ? 'Cargando...' : 'Disponibles en este dispositivo'}</small></div><div className="stat-card glass blue"><Tag>TUS FAVORITOS</Tag><strong>{player.favorites.length} <span>guardadas</span></strong><small>Las que siempre vuelven</small></div></div>
          <CloudLibrary account={account} onPlay={player.playExternal}/>
          <section className="content-section"><SectionHeader title="Colección musical" action="Playlists" onAction={()=>navigate('playlists')}/><div className="chip-row">{(['canciones','favoritos','albumes'] as const).map((item)=><button type="button" key={item} className={'chip ' + (libraryFilter === item ? 'active' : '')} onClick={()=>setLibraryFilter(item)}>{item === 'albumes' ? 'Álbumes' : item === 'favoritos' ? 'Favoritos' : 'Canciones'}</button>)}</div>{libraryFilter === 'albumes' ? <div className="album-grid">{mixes.map((mix)=><AlbumCard key={mix.title} {...mix} onClick={()=>player.setNotice('Los álbumes de demostración estarán disponibles con un catálogo autorizado.')}/>)}</div> : <div className="track-list glass">{player.tracks.filter((track)=>libraryFilter !== 'favoritos' || player.favorites.includes(track.id)).map((track,i)=><TrackRow key={track.id} track={track} player={player} index={i} onAdd={addToPlaylist} onRemove={deleteFromLibrary}/>)}</div>}</section>
          <div className="disclosure">Los archivos importados se guardan en este navegador mediante IndexedDB cuando el almacenamiento está disponible. No se suben a servidores. El navegador puede eliminar datos locales al liberar espacio o borrar datos del sitio.</div>
        </>}
        {screen === 'playlists' && <>
          <div className="heading-with-action"><div><Tag>TODO TIENE SU PROPIA VIBRA</Tag><h1 className="page-title">Mis playlists</h1><p className="page-description">Crea listas con tus canciones guardadas en este dispositivo.</p></div></div>
          <form className="playlist-create glass" onSubmit={(event)=>{event.preventDefault();createPlaylist();}}>
            <label className="sr-only" htmlFor="playlist-title">Nombre de la playlist</label>
            <input id="playlist-title" placeholder="Nombre de nueva playlist" value={playlistTitle} maxLength={80} onChange={(event)=>setPlaylistTitle(event.target.value)}/>
            <button type="submit" className="button primary small"><Plus size={16}/> Crear playlist</button>
          </form>
          <section className="content-section">
            <SectionHeader title="Mis colecciones locales"/>
            {playlistStore.playlists.length === 0 ? <div className="disclosure">Todavía no hay playlists personales. Crea una arriba y añade canciones desde la biblioteca.</div> :
            <div className="personal-playlists">{playlistStore.playlists.map((list)=><div className={'playlist-entry glass ' + (activePlaylist===list.id?'chosen':'')} key={list.id}>
              <button type="button" className="playlist-entry-main" onClick={()=>setActivePlaylist(list.id)}><ListMusic size={19}/><strong>{list.title}</strong><small>{list.trackIds.length} canciones</small></button>
              <button type="button" className="icon-button" title="Reproducir lista" aria-label={'Reproducir '+list.title} onClick={()=>player.playQueue(list.trackIds.map((id)=>player.tracks.find((track)=>track.id===id)).filter((track):track is Track=>Boolean(track)))}><Play size={17}/></button>
              <button type="button" className="icon-button" title="Eliminar lista" aria-label={'Eliminar '+list.title} onClick={()=>{if(window.confirm('¿Eliminar playlist '+list.title+'?')){playlistStore.remove(list.id);if(activePlaylist===list.id)setActivePlaylist(null);}}}><Trash2 size={17}/></button>
            </div>)}</div>}
          </section>
          {currentPlaylist && <section className="content-section"><SectionHeader title={'Canciones · '+currentPlaylist.title}/><div className="track-list glass">
            {currentPlaylist.trackIds.length===0 ? <p className="empty-note">Añade canciones desde la Biblioteca utilizando el botón de lista.</p> : currentPlaylist.trackIds.map((id,index)=>{const track=player.tracks.find((entry)=>entry.id===id);return track ? <div key={id} className="playlist-track"><TrackRow track={track} player={player} index={index}/><button type="button" className="icon-button" aria-label={'Quitar '+track.title+' de esta lista'} onClick={()=>playlistStore.removeSong(currentPlaylist.id,id)}><X size={17}/></button></div> : null;})}
          </div></section>}
          <section className="content-section"><SectionHeader title="Selecciones de ejemplo"/><div className="album-grid">{mixes.map((mix)=><AlbumCard key={mix.title} {...mix} onClick={()=>player.setNotice('Este mix es ilustrativo; añade tus propias canciones a una playlist para escucharlas.')}/>)}</div></section>
          <div className="disclosure">Las playlists se guardan en el navegador actual; aún no se sincronizan con otros dispositivos.</div>
        </>}
        {screen === 'salas' && <>
          <Tag>ES MEJOR CUANDO SE COMPARTE</Tag><h1 className="page-title">Salas musicales</h1><p className="page-description">En el futuro podrás organizar momentos para escuchar junto a otras personas.</p>
          <section className="room-hero glass"><span className="room-icon"><Users size={27}/></span><div><h2>Crea tu propio espacio</h2><p>Invita a tus amigos, prepara una cola de reproducción y comparte descubrimientos.</p></div><button className="button primary small" type="button" onClick={()=>player.setNotice('Las salas reales requieren backend, permisos y sincronización. Todavía no están activas.')}><Plus size={16}/> Crear sala</button></section>
          <section className="content-section"><SectionHeader title="Próximamente"/><div className="room-grid"><div className="room-card glass"><Waves size={26}/><h3>Órbita compartida</h3><p>Cola colaborativa, anfitrión e invitaciones seguras.</p><span className="soon">En planificación</span></div><div className="room-card glass"><AudioLines size={26}/><h3>Marea tranquila</h3><p>Reproducción sincronizada entre dispositivos compatibles.</p><span className="soon">Investigación técnica</span></div></div></section>
        </>}
        {screen === 'ajustes' && <>
          <Tag>PERSONALIZA TU EXPERIENCIA</Tag><h1 className="page-title">Configuración</h1><p className="page-description">Haz que NÉBULA suene y se vea como a ti te gusta.</p>
          <section className="settings-panel glass"><h2>Reproducción</h2><div className="setting-row"><div><strong>Audio de mejor calidad</strong><p>Estará disponible al integrar streaming y perfiles de calidad.</p></div><span className="soon">Próximamente</span></div><div className="setting-row"><div><strong>Reproducción continua</strong><p>Pasar a la siguiente pista de tus archivos locales.</p></div><span className="status-dot"/></div><div className="setting-row"><div><strong>Salida de audio</strong><p>Controlada por el navegador o el sistema operativo.</p></div><MonitorSpeaker size={22}/></div></section>
          <section className="settings-panel glass"><h2>Apariencia y accesibilidad</h2><div className="setting-row"><div><strong>Reducir animaciones</strong><p>Disminuir movimiento decorativo en la interfaz.</p></div><button className={'toggle ' + (reducedMotion ? 'on' : '')} type="button" role="switch" aria-checked={reducedMotion} aria-label="Reducir animaciones" onClick={()=>setReducedMotion((v)=>!v)}><span/></button></div><div className="setting-row"><div><strong>Estilo visual</strong><p>Cosmic Glass · Oscuro nocturno.</p></div><span className="setting-value">Cósmico oscuro</span></div></section>
          <div className="disclosure">Versión F01 · Sin cuenta, servicio remoto ni sincronización de preferencias.</div>
        </>}
        {screen === 'cuenta' && <AccountPanel account={account}/>}
        {screen === 'explorar' && <ExplorePanel account={account} onAccount={()=>navigate('cuenta')} onPlay={player.playExternal}/>}
        {screen === 'reproductor' && <FullPlayer player={player} onBack={()=>navigate(previousScreen)}/>}
      </main>
      {screen !== 'reproductor' && playbackActive && <MiniPlayer player={player} onExpand={()=>navigate('reproductor')}/>}
      <nav className="bottom-nav glass" aria-label="Navegación móvil">{navigation.filter((item)=>item.id !== 'ajustes' && item.id !== 'cuenta' && item.id !== 'salas').map((item)=>{const Icon=item.icon;return <button type="button" key={item.id} onClick={()=>navigate(item.id)} className={screen===item.id ? 'active' : ''} aria-current={screen===item.id ? 'page' : undefined}><Icon size={21}/><span>{item.label}</span></button>;})}</nav>
    </div>
    {player.notice && <div className="toast glass" role="status"><span>{player.notice}</span><button type="button" onClick={()=>player.setNotice('')} className="icon-button" aria-label="Cerrar aviso"><X size={18}/></button></div>}
  </div>;
}
