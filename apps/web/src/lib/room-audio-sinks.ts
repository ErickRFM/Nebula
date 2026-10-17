export type RoomAudioSink = { id: string; label: string };

/** Browser-only audio outputs. Never send device identifiers to the server. */
export function listRoomAudioSinks(
  devices: readonly Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[],
): RoomAudioSink[] {
  const seen = new Set<string>();
  return devices
    .filter(device => device.kind === 'audiooutput' && device.deviceId !== 'default' && Boolean(device.deviceId))
    .filter(device => {
      if (seen.has(device.deviceId)) return false;
      seen.add(device.deviceId);
      return true;
    })
    .map((device, index) => ({ id: device.deviceId, label: device.label || 'Salida de audio ' + (index + 1) }));
}
