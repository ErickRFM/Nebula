'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RadioTower, RefreshCw, Users, X } from 'lucide-react';
import type { AccountApi } from '../hooks/useAccount';
import { expectedPositionMs } from '@nebula/room-sync';
import { RoomAudioPlayer } from './RoomAudioPlayer';

type Room = {
  id: string; name: string; mode: 'listening' | 'party'; status: string;
  ownerUserId: string; participantCount: number; revision: number;
  trackId: string | null; shareEnabled: boolean; playbackStatus: 'playing' | 'paused';
  positionMs: number; effectiveAt: string; createdAt: string;
};
type RoomList = { items: Room[] };
type RoomDetail = { room: Room; serverNowMs: number };

export function RoomsPanel({ account, onAccount, onActivate }: { account: AccountApi; onAccount: () => void; onActivate: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Room | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'listening' | 'party'>('listening');
  const [code, setCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [cloudItems, setCloudItems] = useState<{ id: string; title: string; artist: string }[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!account.user) { setRooms([]); setSelected(null); return; }
    try {
      const result = await account.cloudRequest<RoomList>('/v1/rooms');
      setRooms(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las salas.');
    }
  }, [account.user?.id, account.cloudRequest]);

  const refreshSelected = useCallback(async () => {
    if (!selectedId || !account.user) return;
    try {
      const sentAt = Date.now();
      const result = await account.cloudRequest<RoomDetail>('/v1/rooms/' + encodeURIComponent(selectedId));
      setClockOffsetMs(result.serverNowMs - (sentAt + Date.now()) / 2);
      setSelected(result.room);
    } catch {
      setSelected(null);
      setSelectedId(null);
      void refresh();
    }
  }, [selectedId, account.user?.id, account.cloudRequest, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selectedId || !account.user) return;
    void refreshSelected();
    const timer = window.setInterval(() => { void refreshSelected(); }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshSelected]);

  useEffect(() => {
    if (!selectedId || !account.user) { setCloudItems([]); return; }
    let cancelled = false;
    void account.cloudRequest<{items:{id:string;title:string;artist:string}[]}>('/v1/library/cloud')
      .then(result => { if (!cancelled) setCloudItems(result.items); })
      .catch(() => { if (!cancelled) setCloudItems([]); });
    return () => { cancelled = true; };
  }, [selectedId, account.user?.id, account.cloudRequest]);

  function startSharedAudio() {
    if (!selected || !selectedCloudId || !rightsConfirmed) {
      setError('Selecciona una canción propia y confirma que tienes derecho a compartirla.');
      return;
    }
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/sharing', {
        method: 'POST', body: JSON.stringify({ enabled: true, rightsConfirmed: true }),
      });
      await account.cloudRequest('/v1/rooms/' + selected.id + '/timeline', {
        method: 'POST', body: JSON.stringify({
          expectedRevision: selected.revision, trackId: selectedCloudId, status: 'playing', positionMs: 0,
        }),
      });
      await refreshSelected();
      setNotice('Reproducción compartida programada. Cada participante debe activar su audio.');
    });
  }

  function changePlayback(status: 'playing' | 'paused') {
    if (!selected || !selected.trackId) return;
    const positionMs = selected.playbackStatus === 'paused' ? selected.positionMs :
      expectedPositionMs({
        revision: selected.revision, trackId: selected.trackId,
        status: selected.playbackStatus, positionMs: selected.positionMs,
        effectiveServerTimeMs: Date.parse(selected.effectiveAt),
      }, Date.now() + clockOffsetMs);
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/timeline', {
        method: 'POST', body: JSON.stringify({
          expectedRevision: selected.revision, trackId: selected.trackId, status, positionMs: Math.floor(positionMs),
        }),
      });
      await refreshSelected();
    });
  }

  function disableSharing() {
    if (!selected) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/sharing', {
        method: 'POST', body: JSON.stringify({ enabled: false }),
      });
      await refreshSelected();
    });
  }

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }

  function create() {
    if (!name.trim()) { setError('Escribe un nombre para tu sala.'); return; }
    void action(async () => {
      const result = await account.cloudRequest<{ room: { id: string }; inviteCode: string }>('/v1/rooms', {
        method: 'POST', body: JSON.stringify({ name: name.trim(), mode }),
      });
      setSelectedId(result.room.id); setIssuedCode(result.inviteCode); setName('');
      setNotice('Sala creada. Comparte el código con personas que tengan una cuenta NÉBULA.');
    });
  }

  function join() {
    void action(async () => {
      const result = await account.cloudRequest<{ roomId: string }>('/v1/rooms/join', {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      });
      setSelectedId(result.roomId); setIssuedCode(''); setCode('');
      setNotice('Te uniste a la sala.');
    });
  }

  function leaveOrClose(room: Room) {
    const isHost = room.ownerUserId === account.user?.id;
    if (!window.confirm(isHost ? '¿Cerrar la sala para todos?' : '¿Salir de la sala?')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + room.id + (isHost ? '/close' : '/leave'), { method: 'POST', body: '{}' });
      if (selectedId === room.id) { setSelectedId(null); setSelected(null); setIssuedCode(''); }
      setNotice(isHost ? 'Sala cerrada.' : 'Saliste de la sala.');
    });
  }

  function rotateCode() {
    if (!selected) return;
    void action(async () => {
      const result = await account.cloudRequest<{ inviteCode: string }>('/v1/rooms/' + selected.id + '/invite', {
        method: 'POST', body: '{}',
      });
      setIssuedCode(result.inviteCode);
      setNotice('Nuevo código generado. El anterior ya no funciona.');
    });
  }

  return <section className="content-section">
    <div className="heading-with-action">
      <div>
        <div className="eyebrow">ESCUCHA EN COMPAÑÍA</div>
        <h1 className="page-title">Salas NÉBULA</h1>
        <p className="page-description">Crea salas privadas, invita participantes y prepara una escucha compartida.</p>
      </div>
      <RadioTower size={28} aria-hidden="true"/>
    </div>

    {!account.user ? <div className="disclosure">
      Necesitas iniciar sesión para crear salas o unirte a ellas.
      <button type="button" className="button primary small" onClick={onAccount}>Ir a mi cuenta</button>
    </div> : <>
      {error && <p className="account-error" role="alert">{error}</p>}
      {notice && <p className="disclosure" role="status">{notice}</p>}
      <div className="room-grid">
        <div className="room-card glass">
          <Plus size={23}/><h3>Crear sala</h3>
          <label htmlFor="room-name">Nombre</label>
          <input id="room-name" value={name} maxLength={80} placeholder="Fiesta en casa" onChange={e=>setName(e.target.value)}/>
          <label htmlFor="room-mode">Modo</label>
          <select id="room-mode" value={mode} onChange={e=>setMode(e.target.value as 'listening' | 'party')}>
            <option value="listening">Escucha compartida</option>
            <option value="party">Party Sound (en desarrollo)</option>
          </select>
          <button type="button" className="button primary small" disabled={busy || !name.trim()} onClick={create}>Crear sala</button>
        </div>
        <div className="room-card glass">
          <Users size={23}/><h3>Unirse con invitación</h3>
          <label htmlFor="room-code">Código privado</label>
          <input id="room-code" value={code} autoComplete="off" placeholder="Pega el código de invitación" onChange={e=>setCode(e.target.value)}/>
          <button type="button" className="button primary small" disabled={busy || code.trim().length < 20} onClick={join}>Unirme</button>
        </div>
      </div>
      <section className="content-section">
        <div className="section-heading"><h2>Mis salas</h2>
          <button type="button" className="icon-button" aria-label="Actualizar salas" onClick={()=>{void refresh();}}><RefreshCw size={18}/></button>
        </div>
        <div className="track-list glass">
          {!rooms.length ? <p className="empty-note">Todavía no participas en ninguna sala.</p> :
            rooms.map(room=><div className="track-row" key={room.id}>
              <button className="track-main" type="button" onClick={()=>{setSelectedId(room.id);setIssuedCode('');}}>
                <span className="track-descriptor"><strong>{room.name}</strong>
                  <small>{room.mode==='party'?'Party Sound':'Escucha compartida'} · {room.participantCount} participante(s)</small>
                </span>
              </button>
              <button className="icon-button" type="button" aria-label={'Salir o cerrar '+room.name} onClick={()=>leaveOrClose(room)}><X size={17}/></button>
            </div>)}
        </div>
      </section>
      {selected && selectedId === selected.id && <section className="room-hero glass">
        <div>
          <h2>{selected.name}</h2>
          <p>{selected.participantCount} participante(s) · {selected.ownerUserId===account.user.id?'Eres anfitrión':'Eres invitado'}</p>
          <p>Estado de sala sincronizado con PostgreSQL · revisión {selected.revision}.</p>
          {selected.ownerUserId===account.user.id && <button type="button" className="button small" disabled={busy} onClick={rotateCode}>Generar nuevo código</button>}
          {issuedCode && <div>
            <p>Código privado (se muestra una sola vez):</p>
            <code style={{overflowWrap:'anywhere'}}>{issuedCode}</code>
            <button type="button" className="icon-button" aria-label="Copiar código" onClick={()=>{void navigator.clipboard.writeText(issuedCode).then(()=>setNotice('Código copiado.'));}}><Copy size={17}/></button>
          </div>}
          {selected.ownerUserId===account.user.id && <div>
            <label htmlFor="room-cloud-track">Música propia en Cloudflare R2</label>
            <select id="room-cloud-track" value={selectedCloudId} onChange={e=>setSelectedCloudId(e.target.value)}>
              <option value="">Selecciona una canción</option>
              {cloudItems.map(item=><option key={item.id} value={item.id}>{item.title} — {item.artist}</option>)}
            </select>
            <label style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/>
              Confirmo que tengo derechos para compartir este audio con los participantes.
            </label>
            <button type="button" className="button primary small" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={startSharedAudio}>Compartir y empezar</button>
            {selected.trackId && <>
              <button type="button" className="button small" disabled={busy} onClick={()=>changePlayback(selected.playbackStatus==='playing'?'paused':'playing')}>{selected.playbackStatus==='playing'?'Pausar para todos':'Reanudar para todos'}</button>
              {selected.shareEnabled && <button type="button" className="button small" disabled={busy} onClick={disableSharing}>Dejar de compartir</button>}
            </>}
          </div>}
          <p className="disclosure">Cada teléfono reproduce una URL privada temporal de R2. La sincronización usa sondeo periódico y corrección de desfase; no garantiza precisión acústica ni reproducción con pantalla bloqueada.</p>
        </div>
      </section>}
      {selected && selectedId===selected.id && <RoomAudioPlayer room={selected} account={account} clockOffsetMs={clockOffsetMs} onActivate={onActivate}/>}
    </>}
  </section>;
}
