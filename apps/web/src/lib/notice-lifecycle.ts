/**
 * A media "play"/"playing" event is not a user dismissal of import results.
 * Keep confirmed IndexedDB save feedback while clearing transient playback errors.
 */
export function clearTransientPlaybackNotice(previous: string): string {
  const saving = previous.startsWith('Guardando tus canciones en este dispositivo');
  const saved = (previous.includes(' guardadas') || previous.includes(' guardada')) &&
    (previous.includes('en este navegador') || previous.includes('esta sesión'));
  return saving || saved ? previous : '';
}
