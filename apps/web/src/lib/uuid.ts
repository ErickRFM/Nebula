/**
 * `crypto.randomUUID` no existe en el WebView del APK (Chrome 83); devolvería
 * `undefined` y reventaría crear listas, importar audio o la identidad del receptor
 * de Salas. `crypto.getRandomValues` sí está desde hace mucho, así que se construye
 * el v4 con él cuando falta el nativo.
 */
type FuenteId = {
  randomUUID?: () => string;
  getRandomValues: (bytes: Uint8Array) => Uint8Array;
};

export function nuevoId(fuente: FuenteId = globalThis.crypto as unknown as FuenteId): string {
  if (typeof fuente.randomUUID === 'function') return fuente.randomUUID();
  const bytes = new Uint8Array(16);
  fuente.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
