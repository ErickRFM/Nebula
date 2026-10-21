'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RadioTower, RefreshCw, Users, X } from 'lucide-react';
import { ApiRequestError, type AccountApi } from '../hooks/useAccount';
import { clockSample, estimateClockOffset, expectedPositionMs, type ClockSample } from '@nebula/room-sync';
import { RoomDevicesPanel } from './RoomDevicesPanel';
import { buildRoomInviteLink, roomInviteFromHash } from '../lib/room-invite-link';

type Room = {
  id: string; name: string; mode: 'listening' | 'party'; status: string;
  ownerUserId: string; participantCount: number; revision: number;
  trackId: string | null; shareEnabled: boolean; playbackStatus: 'playing' | 'paused';
  positionMs: number; effectiveAt: string; createdAt: string;
};
type RoomList = { items: Room[] };
type QueueItem = { id: string; trackId: string; title: string; artist: string; position: number };
type RoomDetail = { room: Room; serverNowMs: number };
type RoomMember = { userId: string; role: 'host' | 'listener'; email: string | null; joinedAt: string };

export function RoomsPanel({ account, onAccount, onActivate }: { account: AccountApi; onAccount: () => void; onActivate: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Room | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'listening' | 'party'>('listening');
  const [code, setCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [clockMetrics, setClockMetrics] = useState<{ rttMs: number; samples: number } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [cloudItems, setCloudItems] = useState<{ id: string; title: string; artist: string }[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const fillInvite = () => {
      const token = roomInviteFromHash(window.location.hash);
      if (token) setCode(token);
    };
    fillInvite();
    window.addEventListener('hashchange', fillInvite);
    return () => window.removeEventListener('hashchange', fillInvite);
  }, []);

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
      const result = await account.cloudRequest<RoomDetail>('/v1/rooms/' + encodeURIComponent(selectedId));
      setSelected(result.room);
    } catch (cause) {
      // A temporary 429/503 or network failure must not eject participants
      // from the selected room. Only a confirmed membership loss clears it.
      if (cause instanceof ApiRequestError && (cause.status === 404 || cause.status === 403)) {
        setSelected(null);
        setSelectedId(null);
        void refresh();
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la sala. Reintentando.');
      }
    }
  }, [selectedId, account.user?.id, account.cloudRequest, refresh]);

  // Use multiple NTP-style probes rather than estimating clock skew from a
  // single room snapshot. The lowest-RTT half of recent probes limits jitter.
  useEffect(() => {
    if (!selectedId || !account.user) return;
    let cancelled = false;
    const samples: ClockSample[] = [];
    setClockMetrics(null);
    setClockOffsetMs(0);
    const probe = async () => {
      try {
        const clientSentMs = Date.now();
        const result = await account.cloudRequest<{serverReceivedMs:number;serverSentMs:number}>('/v1/rooms/clock');
        const clientReceivedMs = Date.now();
        if (cancelled) return;
        const sample = clockSample({ clientSentMs, clientReceivedMs, ...result });
        if (!sample) return;
        samples.push(sample);
        if (samples.length > 12) samples.shift();
        const offset = estimateClockOffset(samples);
        if (offset !== null) setClockOffsetMs(offset);
        setClockMetrics({ rttMs: Math.round(sample.roundTripMs), samples: samples.length });
      } catch { if (!cancelled) setClockMetrics(null); }
    };
    void probe();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void probe(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedId, account.user?.id, account.cloudRequest]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selectedId || !account.user) return;
    void refreshSelected();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshSelected(); }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshSelected]);

  const refreshQueue = useCallback(async () => {
    if (!selectedId || !account.user) { setQueue([]); return; }
    try {
      const result = await account.cloudRequest<{items:QueueItem[]}>('/v1/rooms/' + selectedId + '/queue');
      setQueue(result.items);
    } catch { /* retain the last confirmed queue during transient failures */ }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  useEffect(() => {
    if (!selectedId || !account.user) return;
    void refreshQueue();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshQueue(); }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshQueue]);

  const refreshMembers = useCallback(async () => {
    if (!selectedId || !account.user) { setMembers([]); return; }
    try {
      const result = await account.cloudRequest<{items:RoomMember[]}>('/v1/rooms/' + selectedId + '/members');
      setMembers(result.items);
    } catch { /* retain the last confirmed member list during transient failures */ }
  }, [selectedId, account.user?.id, account.cloudRequest]);

  useEffect(() => {
    if (!selectedId || !account.user) { setMembers([]); return; }
    void refreshMembers();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshMembers(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [selectedId, account.user?.id, refreshMembers]);

  function removeMember(member: RoomMember) {
    if (!selected || !window.confirm('¿Expulsar a esta persona de la sala?')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/members/' + member.userId, { method: 'DELETE' });
      await refreshMembers(); await refreshSelected();
      setNotice('Participante expulsado. Los enlaces de audio ya emitidos caducan como máximo en cinco minutos.');
    });
  }

  function transferHost(member: RoomMember) {
    if (!selected || !window.confirm('¿Transferir la administración de esta sala? Dejarás de ser anfitrión.')) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/transfer-host', {
        method: 'POST', body: JSON.stringify({ memberId: member.userId }),
      });
      await refreshSelected(); await refreshMembers();
      setNotice('Anfitrión transferido. Ahora eres participante.');
    });
  }

  function addToQueue() {
    if (!selected || !selectedCloudId || !rightsConfirmed) {
      setError('Confirma que tienes derecho a compartir esta canción antes de añadirla a la cola.');
      return;
    }
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/queue', {
        method: 'POST', body: JSON.stringify({ trackId: selectedCloudId, rightsConfirmed: true }),
      });
      await refreshQueue();
      setNotice('Canción agregada a la cola de la sala.');
    });
  }

  function moveQueueItem(index: number, direction: -1 | 1) {
    if (!selected || index + direction < 0 || index + direction >= queue.length) return;
    const ordered = [...queue];
    [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/queue/reorder', {
        method: 'PATCH', body: JSON.stringify({ itemIds: ordered.map(item => item.id) }),
      });
      await refreshQueue();
      setNotice('Orden de reproducción actualizado.');
    });
  }

  function nextFromQueue() {
    if (!selected) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/next', {
        method: 'POST', body: JSON.stringify({ expectedRevision: selected.revision }),
      });
      await refreshSelected(); await refreshQueue();
      setNotice('Reproducción de la siguiente canción programada.');
    });
  }

  function removeFromQueue(itemId: string) {
    if (!selected) return;
    void action(async () => {
      await account.cloudRequest('/v1/rooms/' + selected.id + '/queue/' + itemId, { method: 'DELETE' });
      await refreshQueue();
    });
  }

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
          rightsConfirmed: true,
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

  useEffect(() => {
    if (!selectedId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSelected(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [selectedId, refreshSelected]);

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
      if (roomInviteFromHash(window.location.hash)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setNotice('Te uniste a la sala.');
    });
  }

  async function shareRoomLink() {
    if (!issuedCode) return;
    const url = buildRoomInviteLink(window.location.href, issuedCode);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Sala privada NÉBULA', url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Enlace privado copiado. Compártelo únicamente con personas invitadas.');
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError('No se pudo compartir el enlace. Copia el código manualmente.');
    }
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
          <p>Reloj: {clockMetrics ? 'RTT de red ' + clockMetrics.rttMs + ' ms · ' + clockMetrics.samples + ' muestras · offset estimado ' + Math.round(clockOffsetMs) + ' ms' : 'midiendo conexión…'}. Estas cifras no miden el retardo acústico.</p>
          {selected.ownerUserId===account.user.id && <button type="button" className="button small" disabled={busy} onClick={rotateCode}>Generar nuevo código</button>}
          {issuedCode && <div>
            <p>Código privado (se muestra una sola vez):</p>
            <code style={{overflowWrap:'anywhere'}}>{issuedCode}</code>
            <button type="button" className="icon-button" aria-label="Copiar código" onClick={()=>{void navigator.clipboard.writeText(issuedCode).then(()=>setNotice('Código copiado.')).catch(()=>setError('No se pudo copiar. Selecciona el código manualmente.'));}}><Copy size={17}/></button>
            <button type="button" className="button small" onClick={()=>{void shareRoomLink();}}>Compartir enlace privado</button>
            <p>El enlace abre NÉBULA en Salas y rellena el código. La persona invitada necesita su propia cuenta.</p>
          </div>}
          {selected.ownerUserId===account.user.id && <div>
            <label htmlFor="room-cloud-track">Música propia en Cloudflare R2</label>
            <select id="room-cloud-track" value={selectedCloudId} onChange={e=>{setSelectedCloudId(e.target.value);setRightsConfirmed(false);}}>
              <option value="">Selecciona una canción</option>
              {cloudItems.map(item=><option key={item.id} value={item.id}>{item.title} — {item.artist}</option>)}
            </select>
            <label style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/>
              Confirmo que tengo derechos para compartir este audio con los participantes.
            </label>
            <button type="button" className="button primary small" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={startSharedAudio}>Compartir y empezar</button>
            <button type="button" className="button small" disabled={busy || !selectedCloudId || !rightsConfirmed} onClick={addToQueue}>Agregar a cola</button>
            {selected.shareEnabled && <button type="button" className="button small" disabled={busy || !queue.length} onClick={nextFromQueue}>Siguiente de la cola</button>}
            {selected.trackId && <>
              <button type="button" className="button small" disabled={busy} onClick={()=>changePlayback(selected.playbackStatus==='playing'?'paused':'playing')}>{selected.playbackStatus==='playing'?'Pausar para todos':'Reanudar para todos'}</button>
              {selected.shareEnabled && <button type="button" className="button small" disabled={busy} onClick={disableSharing}>Dejar de compartir</button>}
            </>}
          </div>}
          <p className="disclosure">Cada teléfono reproduce una URL privada temporal de R2. La sincronización usa sondeo periódico y corrección de desfase; no garantiza precisión acústica ni reproducción con pantalla bloqueada.</p>
        </div>
      </section>}
      {selected && selectedId===selected.id && <section className="content-section">
        <div className="section-heading"><h2>Participantes</h2><span>{members.length} en la sala</span></div>
        <div className="track-list glass">
          {members.map(member => <div className="track-row" key={member.userId}>
            <span className="track-descriptor">
              <strong>{member.userId === account.user?.id ? 'Tú' : member.email ?? 'Participante ' + member.userId.slice(0, 8)}</strong>
              <small>{member.role === 'host' ? 'Anfitrión' : 'Oyente'}</small>
            </span>
            {selected.ownerUserId === account.user?.id && member.userId !== account.user?.id && <>
              <button type="button" className="button small" disabled={busy} onClick={() => transferHost(member)}>Hacer anfitrión</button>
              <button type="button" className="button secondary small" disabled={busy} onClick={() => removeMember(member)}>Expulsar</button>
            </>}
          </div>)}
        </div>
      </section>}
      {selected && selectedId===selected.id && <section className="content-section">
        <div className="section-heading"><h2>Cola compartida</h2></div>
        <div className="track-list glass">
          {!queue.length ? <p className="empty-note">La cola está vacía.</p> :
            queue.map((item,index)=><div className="track-row" key={item.id}>
              <span className="track-index">{index+1}</span>
              <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist}</small></span>
              {selected.ownerUserId===account.user?.id && <>
                <button type="button" className="button small" aria-label={'Subir '+item.title} disabled={busy || index===0} onClick={()=>moveQueueItem(index,-1)}>↑</button>
                <button type="button" className="button small" aria-label={'Bajar '+item.title} disabled={busy || index===queue.length-1} onClick={()=>moveQueueItem(index,1)}>↓</button>
                <button type="button" className="icon-button" aria-label={'Quitar '+item.title} disabled={busy} onClick={()=>removeFromQueue(item.id)}><X size={17}/></button>
              </>}
            </div>)}
        </div>
      </section>}
      {selected && selectedId===selected.id && <RoomDevicesPanel room={selected} account={account} clockOffsetMs={clockOffsetMs} onActivate={onActivate}/>}
    </>}
  </section>;
}
