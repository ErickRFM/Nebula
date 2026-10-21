import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Discovery is only a proximity hint. Joining still requires a private invite. */
export type NearbyNebulaService = { id: string; name: string };
export type NearbyServicesEvent = { services: NearbyNebulaService[] };

export interface NebulaPartyPlugin {
  startScan(): Promise<{ started: boolean }>;
  stopScan(): Promise<void>;
  startBeacon(): Promise<{ started: boolean }>;
  stopBeacon(): Promise<void>;
  playAuthorizedAudio(options: { url: string }): Promise<void>;
  pauseAudio(): Promise<void>;
  stopAudio(): Promise<void>;
  addListener(
    eventName: 'servicesChanged',
    listener: (event: NearbyServicesEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const NebulaParty = registerPlugin<NebulaPartyPlugin>('NebulaParty');

export function supportsNativeParty(): boolean {
  return Capacitor.isNativePlatform();
}

/** Never trust a LAN discovery label as an authentication credential. */
export function sanitizeNearbyServices(event: unknown): NearbyNebulaService[] {
  if (!event || typeof event !== 'object' || !('services' in event)) return [];
  const raw = (event as NearbyServicesEvent).services;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(service => service && typeof service.id === 'string' &&
    service.id.length > 0 && service.id.length <= 128 &&
    typeof service.name === 'string' && service.name.length > 0 && service.name.length <= 80)
    .filter(service => {
      if (seen.has(service.id)) return false;
      seen.add(service.id);
      return true;
    }).slice(0, 24);
}
