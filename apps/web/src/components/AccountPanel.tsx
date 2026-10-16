'use client';
import { useState, type FormEvent } from 'react';
import { CircleUserRound, Cloud, CloudOff, ListMusic, LockKeyhole, LogOut, Plus, Trash2 } from 'lucide-react';
import type { AccountApi } from '../hooks/useAccount';

export function AccountPanel({account}: {account:AccountApi}) {
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [playlistName,setPlaylistName]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success=await account.login(mode,email,password);
    if(success) setPassword('');
  }
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(await account.createServerPlaylist(playlistName.trim())) setPlaylistName('');
  }

  return <section className="account-page">
    <div className="eyebrow">TU UNIVERSO, TU CUENTA</div>
    <h1 className="page-title">Cuenta NÉBULA</h1>
    <p className="page-description">Accede a tus playlists guardadas en PostgreSQL. Tus archivos musicales siguen siendo privados y locales en este navegador.</p>
    {!account.configured ? <div className="settings-panel glass">
      <CloudOff size={29} color="#d3aaff"/>
      <h2>Servicio de cuentas sin configurar</h2>
      <p>Para usar registro e inicio de sesión, inicia la API y configura <code>NEXT_PUBLIC_API_URL</code> al arrancar Next.js.</p>
      <p className="disclosure">Puedes seguir usando la biblioteca, favoritos y playlists locales sin cuenta.</p>
    </div> : account.user ? <>
      <div className="account-session glass">
        <div className="account-user-icon"><CircleUserRound size={28}/></div>
        <div className="account-user-label"><strong>Sesión activa</strong><span>{account.user.email}</span><small>Sesión temporal; al recargar esta página tendrás que volver a iniciar sesión.</small></div>
        <button type="button" className="button secondary" onClick={account.logout}><LogOut size={17}/> Salir</button>
      </div>
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
      <h2>{mode==='login'?'Iniciar sesión':'Crear cuenta'}</h2>
      <p>El servidor guardará tu identidad y las playlists de cuenta. NÉBULA nunca guarda el token de acceso en el navegador de forma persistente.</p>
      <form onSubmit={(event)=>void submit(event)} className="auth-form">
        <label htmlFor="account-email">Correo electrónico</label>
        <input id="account-email" type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="tu@correo.com" maxLength={254}/>
        <label htmlFor="account-password">Contraseña</label>
        <input id="account-password" type="password" required autoComplete={mode==='login'?'current-password':'new-password'} minLength={12} maxLength={128} value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="Mínimo 12 caracteres"/>
        <button className="button primary" type="submit" disabled={account.busy}>{account.busy?'Conectando…':mode==='login'?'Entrar':'Crear mi cuenta'}</button>
      </form>
      {account.registrationOpen ?
        <button type="button" className="account-switch" onClick={()=>{setMode(mode==='login'?'register':'login');account.setError('');}}>
          {mode==='login'?'¿No tienes cuenta? Regístrate':'¿Ya tienes cuenta? Inicia sesión'}
        </button>
      : <p className="disclosure">Acceso privado: el administrador configura las cuentas, sin registro público.</p>}
    </div>}
    {account.error && <p className="account-error" role="alert">{account.error}</p>}
  </section>;
}
