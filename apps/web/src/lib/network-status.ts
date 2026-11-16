/*
 * El WebView del APK no avisa cuando el dispositivo pierde la red: hay que escuchar
 * los dos eventos y sembrar el estado desde `onLine`, porque un `offline` ocurrido
 * antes de montar la app ya pasó de largo.
 */

export type NetworkWindow = {
  navigator: { onLine: boolean };
  addEventListener(kind: 'online' | 'offline', handler: () => void): void;
  removeEventListener(kind: 'online' | 'offline', handler: () => void): void;
};

export function watchNetwork(target: NetworkWindow, listener: (online: boolean) => void): () => void {
  listener(target.navigator.onLine);
  const alVolver = () => listener(true);
  const alPerder = () => listener(false);
  target.addEventListener('online', alVolver);
  target.addEventListener('offline', alPerder);
  return () => {
    target.removeEventListener('online', alVolver);
    target.removeEventListener('offline', alPerder);
  };
}
