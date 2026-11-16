import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nuevoId } from './uuid';

/*
 * El WebView del APK es Chrome 83 y no conoce `crypto.randomUUID`: llamarlo devolvía
 * `TypeError: crypto.randomUUID is not a function` y dejaba sin efecto crear playlists,
 * importar audio local o fijar la identidad del receptor de Salas. El fallback va por
 * `getRandomValues`, que sí existe en ese suelo.
 */
const fuenteSinNativo = (relleno: number) => ({
  getRandomValues: (bytes: Uint8Array) => {
    bytes.fill(relleno);
    return bytes;
  },
});

describe('nuevoId', () => {
  it('usa el generador nativo cuando el navegador lo tiene', () => {
    const esperado = '11111111-2222-3333-4444-555555555555';
    const fuente = { ...fuenteSinNativo(0), randomUUID: () => esperado };
    expect(nuevoId(fuente)).toBe(esperado);
  });

  it('construye un v4 con getRandomValues cuando el nativo falta', () => {
    // Bytes al 0x0f: la máscara de versión deja 4 en el nibble alto del byte 6 y 8 en el del byte 8.
    expect(nuevoId(fuenteSinNativo(0x0f))).toBe('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
  });

  it('el id generado sin nativo tiene forma UUID y variante correcta', () => {
    const id = nuevoId(fuenteSinNativo(0xa5));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('respeta el generador del entorno, que en Node trae UUIDs válidos', () => {
    expect(nuevoId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(Array.from({ length: 20 }, () => nuevoId())).size).toBe(20);
  });

  it('ningún archivo de la app vuelve a llamar crypto.randomUUID de frente', () => {
    const raiz = fileURLToPath(new URL('..', import.meta.url));
    const archivos = readdirSync(raiz, { recursive: true, encoding: 'utf8' })
      .filter((r: string) => /\.(ts|tsx)$/.test(r) && !r.endsWith('uuid.ts') && !r.endsWith('.test.ts'))
      .map((r: string) => `${raiz}${r}`);
    const culpables = archivos.filter((ruta) => /crypto\s*\.\s*randomUUID/.test(readFileSync(ruta, 'utf8')));
    expect(culpables.map((r) => r.slice(raiz.length)), 'el suelo Chrome 83 no tiene randomUUID').toEqual([]);
    expect(archivos.length).toBeGreaterThan(20);
  });
});
