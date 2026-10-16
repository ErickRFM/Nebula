'use client';
import { useState, type FormEvent } from 'react';
import { CircleUserRound, Cloud, CloudOff, ListMusic, LockKeyhole, LogOut, Monitor, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { AccountApi } from '../hooks/useAccount';

function describeDevice(userAgent:string|null):string {
  if(!userAgent) return 'Dispositivo desconocido';
  const browser = /Firefox/i.test(userAgent) ? 'Firefox' : /Edg/i.test(userAgent) ? 'Edge' : /Chrome/i.test(userAgent) ? 'Chrome' : /Safari/i.test(userAgent) ? 'Safari' : 'Navegador';
  const os = /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS' : /Windows/i.test(userAgent) ? 'Windows' : /Mac OS X/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Sistema desconocido';
  return browser+' · '+os;
}

function formatDate(value:string):string {
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'});
}

export function AccountPanel({account}: {account:AccountApi}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [playlistName,setPlaylistName]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success=await account.login(email,password);
    if(success) setPassword('');
  }
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(await account.createServerPlaylist(playlistName.trim())) setPlaylistName('');
  }

  return <section className="account-page">
    <div className="eyebrow">TU UNIVERSO, TU CUENTA</div>
    <h1 className="page-title">Cuenta NÉBULA</h1>
    <p className="page-description">Accede a tu biblioteca privada. El contenido solo está disponible para cuentas autorizadas por el propietario.</p>
    {!account.configured ? <div className="settings-panel glass">
      <CloudOff size={29} color="#d3aaff"/>
      <h2>Servicio de cuentas sin configurar</h2>
      <p>Para usar la sesión privada, inicia la API y configura <code>NEXT_PUBLIC_API_URL</code> al arrancar Next.js.</p>
      <p className="disclosure">Puedes seguir usando la biblioteca, favoritos y playlists locales sin cuenta.</p>
    </div> : account.restoring ? <div className="settings-panel glass">
      <Cloud size={29} color="#d3aaff"/>
      <h2>Comprobando sesión…</h2>
      <p className="disclosure">Recuperando tu sesión segura desde la cookie de refresco.</p>
    </div> : account.user ? <>
      <div className="account-session glass">
        <div className="account-user-icon"><CircleUserRound size={28}/></div>
        <div className="account-user-label">
          <strong>Sesión activa {account.user.role==='owner' && <span className="server-pill"><ShieldCheck size={14}/> Propietario</span>}</strong>
          <span>{account.user.email}</span>
          <small>Tu sesión se conserva de forma segura; puedes cerrarla o revocar dispositivos cuando quieras.</small>
        </div>
        <button type="button" className="button secondary" onClick={()=>void account.logout()}><LogOut size={17}/> Salir</button>
      </div>
      <section className="content-section">
        <div className="section-heading"><h2>Dispositivos y sesiones</h2><button type="button" className="button secondary small" disabled={account.busy} onClick={()=>void account.revokeOtherSessions()}><ShieldCheck size={16}/> Cerrar las demás</button></div>
        <div className="personal-playlists account-remote-list">{account.sessions.length===0 ? <p className="empty-note">No hay sesiones activas registradas.</p> : account.sessions.map((item)=><div className="playlist-entry glass" key={item.id}>
          <Monitor size={21}/><div className="account-user-label"><strong>{describeDevice(item.userAgent)}{item.current?' · Este dispositivo':''}</strong><small>Iniciada {formatDate(item.createdAt)} · Último uso {formatDate(item.lastUsedAt)}</small></div>
          {item.current ? <span className="server-pill">Actual</span> : <button type="button" className="icon-button" aria-label="Cerrar esta sesión" onClick={()=>{if(window.confirm('¿Cerrar esta sesión remota?')) void account.revokeSession(item.id);}}><Trash2 size={17}/></button>}
        </div>)}</div>
      </section>
      <section className="content-section">
        <div className="section-heading"><h2>Playlists de mi cuenta</h2><span className="server-pill"><Cloud size={16}/> PostgreSQL</span></div>
        <form className="playlist-create glass" onSubmit={(event)=>void create(event)}>
          <label className="sr-only" htmlFor="cloud-playlist-name">Nombre de playlist en nube</label>
          <input id="cloud-playlist-name" value={playlistName} onChange={(event)=>setPlaylistName(event.target.value)} placeholder="Nueva playlist de mi cuenta" maxLength={80} required/>
          <button className="button primary small" disabled={account.playlistsBusy} type="submit"><Plus size={16}/> Crear en cuenta</button>
        </form>
        {account.playlistsBusy && <p className="disclosure">Sincronizando con el servidor…</p>}
        <div className="personal-playlists account-remote-list">{account.serverPlaylists.length===0 ? <p className="empty-note">No hay playlists guardadas en la cuenta.</p> : account.serverPlaylists.map((item)=><div className="playlist-entry glass" key={item.id}>
          <ListMusic size={21}/><strong className="remote-title">{item.name}</strong><span className="server-pill">En cuenta</span>
          <button type="button" className="icon-button" disabled={account.playlistsBusy} aria-label={'Eliminar playlist '+item.name+' del servidor'} onClick={()=>{if(window.confirm('¿Eliminar '+item.name+' de tu cuenta?')) void account.removeServerPlaylist(item.id);}}><Trash2 size={17}/></button>
        </div>)}</div>
        <p className="disclosure">En esta etapa las playlists remotas solo almacenan nombre y propietario. Sus canciones y los archivos de audio aún no se sincronizan.</p>
      </section>
    </> : <div className="auth-card glass">
      <div className="account-user-icon"><LockKeyhole size={27}/></div>
      <h2>Iniciar sesión</h2>
      <p>NÉBULA es una biblioteca privada. El registro público está desactivado: solo acceden las cuentas autorizadas por el propietario mediante invitación.</p>
      <form onSubmit={(event)=>void submit(event)} className="auth-form">
        <label htmlFor="account-email">Correo electrónico</label>
        <input id="account-email" type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="tu@correo.com" maxLength={254}/>
        <label htmlFor="account-password">Contraseña</label>
        <input id="account-password" type="password" required autoComplete="current-password" minLength={12} maxLength={128} value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="Mínimo 12 caracteres"/>
        <button className="button primary" type="submit" disabled={account.busy}>{account.busy?'Conectando…':'Entrar'}</button>
      </form>
      <p className="disclosure">¿Necesitas acceso? El propietario puede crear una invitación desde la administración privada.</p>
    </div>}
    {account.error && <p className="account-error" role="alert">{account.error}</p>}
  </section>;
}
