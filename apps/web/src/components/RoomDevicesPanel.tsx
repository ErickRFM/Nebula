'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountApi } from '../hooks/useAccount';
import { RoomAudioPlayer, type SharedRoom } from './RoomAudioPlayer';
import { NebulaParty, sanitizeNearbyServices, supportsNativeParty, type NearbyNebulaService } from '../lib/party-native';

type PlaybackState = 'idle' | 'ready' | 'buffering' | 'playing' | 'error';
type Device = {
  deviceId: string;
  userId: string;
  label: string;
  platform: 'web' | 'android' | 'ios' | 'desktop';
  outputEnabled: boolean;
  playbackState: PlaybackState;
  online: boolean;
  lastSeenAt: string;
};
type Registered = { device: Device };
type Roster = { items: Device[] };

function localReceiverId(userId: string): string {
  const key = 'nebula:receiver-id:' + userId;
  try {
    const current = localStorage.getItem(key);
    if (current && /^[0-9a-f-]{36}$/i.test(current)) return current;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    // Local storage can be disabled. The receiver remains session-scoped.
    return crypto.randomUUID();
  }
}

function receiverLabel(): string {
  if (/Android/i.test(navigator.userAgent)) return 'NÉBULA · Android (web)';
  if (/iPhone|iPad/i.test(navigator.userAgent)) return 'NÉBULA · iOS (web)';
  return 'NÉBULA · Navegador';
}

/**
 * Displays only registered NÉBULA participants. Does not scan other clients
 * on the LAN, pair Bluetooth accessories, or remotely activate audio.
 */
export function RoomDevicesPanel({ room, account, clockOffsetMs, onActivate }: {
  room: SharedRoom;
  account: AccountApi;
  clockOffsetMs: number;
  onActivate: () => void;
}) {
  const [deviceId, setDeviceId] = useState('');
  const [registered, setRegistered] = useState(false);
  const [outputEnabled, setOutputEnabled] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nearby, setNearby] = useState<NearbyNebulaService[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [beaconBusy, setBeaconBusy] = useState(false);
  const nativeAvailable = supportsNativeParty();


  const refresh = useCallback(async () => {
    try {
      const result = await account.cloudRequest<Roster>('/v1/rooms/' + room.id + '/devices');
      setDevices(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los dispositivos.');
    }
  }, [account.cloudRequest, room.id]);

  useEffect(() => {
    if (!account.user) return;
    let cancelled = false;
    const id = localReceiverId(account.user.id);
    setRegistered(false);
    setOutputEnabled(false);
    setDeviceId(id);
    setDevices([]);
    setError('');
    void account.cloudRequest<Registered>('/v1/rooms/' + room.id + '/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceId: id, label: receiverLabel(), platform: 'web' }),
    }).then(result => {
      if (cancelled) return;
      setRegistered(true);
      setOutputEnabled(result.device.outputEnabled);
      void refresh();
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo registrar este dispositivo.');
    });
    return () => { cancelled = true; };
  }, [account.user?.id, account.cloudRequest, room.id, refresh]);

  useEffect(() => {
    if (!registered) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [registered, refresh]);

  useEffect(() => {
    if (!registered || !deviceId) return;
    let cancelled = false;
    const pulse = () => {
      void account.cloudRequest('/v1/rooms/' + room.id + '/devices/' + deviceId + '/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ playbackState: outputEnabled ? playbackState : 'idle' }),
      }).catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Se perdió la conexión con la sala.');
      });
    };
    pulse();
    const timer = window.setInterval(pulse, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [account.cloudRequest, room.id, deviceId, registered, outputEnabled, playbackState]);

  useEffect(() => {
    if (!nativeAvailable || !scanning) return;
    let closed = false;
    const handle = NebulaParty.addListener('servicesChanged', event => {
      if (!closed) setNearby(sanitizeNearbyServices(event));
    });
    return () => {
      closed = true;
      void handle.then(listener => listener.remove()).catch(() => {});
      void NebulaParty.stopScan().catch(() => {});
    };
  }, [nativeAvailable, scanning]);

  useEffect(() => {
    return () => { void NebulaParty.stopBeacon().catch(() => {}); };
  }, []);

  async function toggleBeacon() {
    if (!nativeAvailable || beaconBusy) return;
    setBeaconBusy(true); setError('');
    try {
      if (discoverable) {
        await NebulaParty.stopBeacon();
        setDiscoverable(false);
      } else {
        await NebulaParty.startBeacon();
        setDiscoverable(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo anunciar este dispositivo.');
    } finally { setBeaconBusy(false); }
  }

  async function toggleScan() {
    if (!nativeAvailable || scanBusy) return;
    setScanBusy(true);
    setError('');
    try {
      if (scanning) {
        await NebulaParty.stopScan();
        setScanning(false);
        setNearby([]);
      } else {
        await NebulaParty.startScan();
        setScanning(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo buscar en la red local.');
    } finally {
      setScanBusy(false);
    }
  }

  async function toggleOutput() {
    if (!registered || !deviceId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await account.cloudRequest<{ outputEnabled: boolean }>(
        '/v1/rooms/' + room.id + '/devices/' + deviceId + '/output',
        { method: 'PATCH', body: JSON.stringify({ outputEnabled: !outputEnabled }) },
      );
      setOutputEnabled(result.outputEnabled);
      if (!result.outputEnabled) setPlaybackState('idle');
      setNotice(result.outputEnabled
        ? 'Salida autorizada. Pulsa Play aquí para comenzar a escuchar.'
        : 'Salida desactivada en este dispositivo.');
      void refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar esta salida.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="room-card glass" aria-label="Dispositivos NÉBULA de esta sala">
      <div className="section-heading">
        <h3>Dispositivos de la sala</h3>
        <button type="button" className="icon-button" onClick={() => { void refresh(); }} aria-label="Actualizar dispositivos">↻</button>
      </div>
      <p>Los dispositivos que participan en NÉBULA aparecen aquí. Las bocinas Bluetooth se configuran desde el dispositivo al que están conectadas.</p>
      <div className="room-card">
        <strong>Esta salida</strong>
        <p>{registered ? 'Registrada en la sala' : 'Conectando el dispositivo…'}</p>
        <button type="button" className="button small" onClick={() => { void toggleOutput(); }}
          disabled={!registered || busy} aria-pressed={outputEnabled}>
          {outputEnabled ? 'Desactivar sonido en este dispositivo' : 'Activar este dispositivo como bocina'}
        </button>
        <p><small>Solo tú puedes activar el audio aquí. El navegador también te pedirá pulsar Play.</small></p>
      </div>
      {nativeAvailable && <div className="room-card">
        <h4>Buscar NÉBULA en mi Wi-Fi</h4>
        <button type="button" className="button small" disabled={beaconBusy} aria-pressed={discoverable}
          onClick={() => { void toggleBeacon(); }}>
          {discoverable ? 'Dejar de anunciarme en Wi-Fi' : 'Hacer visible esta app en Wi-Fi'}
        </button>
        <p><small>La visibilidad es voluntaria y no habilita acceso remoto a tu música. Puedes desactivarla cuando quieras.</small></p>
        <p>Solo se muestran aplicaciones que anuncien NÉBULA voluntariamente. Para unirte, sigue usando una invitación privada.</p>
        <button type="button" className="button small" disabled={scanBusy} onClick={() => { void toggleScan(); }}>
          {scanning ? 'Detener búsqueda local' : 'Buscar dispositivos en Wi-Fi'}
        </button>
        {scanning && nearby.length === 0 && <p>No se han detectado receptores anunciados en esta red.</p>}
        {nearby.length > 0 && <ul aria-label="Dispositivos anunciados en la red">
          {nearby.map(item => <li key={item.id}>{item.name}</li>)}
        </ul>}
      </div>}
      {devices.length > 0 ? <ul aria-label="Receptores participantes">
        {devices.map(device => <li key={device.deviceId}>
          <strong>{device.label}{device.deviceId === deviceId ? ' · Este dispositivo' : ''}</strong>
          {' · '}{device.online ? 'Conectado' : 'Sin conexión'}
          {' · '}{device.outputEnabled ? 'Salida activa' : 'Salida desactivada'}
          {device.outputEnabled && device.online ? ' · ' + device.playbackState : ''}
        </li>)}
      </ul> : <p>No se han registrado otros dispositivos en la sala.</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="account-error">{error}</p>}
    </section>
    <RoomAudioPlayer room={room} account={account} clockOffsetMs={clockOffsetMs}
      onActivate={onActivate} enabled={registered && outputEnabled}
      onPlaybackStateChange={setPlaybackState}/>
  </>;
}
