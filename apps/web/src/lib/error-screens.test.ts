import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Next solo monta estos dos archivos si cumplen contratos muy concretos (client
 * component, `reset`, y en global-error el <html> propio). Romperlos en un refactor
 * no se nota hasta que algo revienta en producción, que es precisamente cuando
 * hacen falta.
 */
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

describe('pantallas de error', () => {
  it('error.tsx es client, re-monta con reset y ofrece reintento', () => {
    const fuente = leer('../app/error.tsx');
    expect(fuente.startsWith("'use client';")).toBe(true);
    expect(fuente).toMatch(/\breset\b/);
    expect(fuente).toMatch(/onClick=\{\(\) => reset\(\)\}/);
    expect(fuente).toMatch(/role="alert"/);
    expect(fuente).toMatch(/export default function/);
  });

  it('global-error.tsx se dibuja a sí mismo el <html> y el <body>', () => {
    const fuente = leer('../app/global-error.tsx');
    expect(fuente.startsWith("'use client';")).toBe(true);
    expect(fuente).toMatch(/return <html lang="es">/);
    expect(fuente).toMatch(/<body style=/);
    expect(fuente).toMatch(/reset\(\)/);
  });

  it('global-error.tsx no depende de globals.css: todo su estilo va en línea', () => {
    const fuente = leer('../app/global-error.tsx');
    expect(fuente).not.toMatch(/className=/);
    expect(fuente).toMatch(/minHeight: '100vh'/);
    expect(fuente, 'el suelo del WebView es Chrome 83 y no conoce dvh').not.toMatch(/dvh/);
  });

  it('el texto del error no se imprime entero: se recorta', () => {
    for (const ruta of ['../app/error.tsx', '../app/global-error.tsx']) {
      expect(leer(ruta)).toMatch(/error\.message\.slice\(0, 180\)/);
    }
  });
});
