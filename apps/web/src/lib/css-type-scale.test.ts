import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * El audit de UX midió 60 nodos de texto por debajo de 11px solo en Ajustes y 8.96px
 * en las etiquetas de los faders. Nada fijaba un suelo, así que la escala volvía a
 * hundirse en cada pantalla nueva. Aquí se fija el suelo y se miden también los
 * `clamp()`, cuyo mínimo es el que manda en móvil.
 */
const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const SUELO_PX = 11;
const REM = 16;

const bloques = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  .map((m: RegExpMatchArray) => ({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));

type Medida = { selector: string; declaracion: string; px: number; resuelto: 'rem' | 'px' | 'clamp' | 'em' };

const medidas: Medida[] = [];
for (const bloque of bloques) {
  for (const declaracion of bloque.body.split(';')) {
    const texto = declaracion.trim();
    if (!/^font-size\s*:/.test(texto)) continue;
    const rem = /font-size:\s*([0-9.]+)rem/.exec(texto);
    if (rem) { medidas.push({ selector: bloque.selector, declaracion: texto, px: parseFloat(rem[1]) * REM, resuelto: 'rem' }); continue; }
    const px = /font-size:\s*([0-9.]+)px/.exec(texto);
    if (px) { medidas.push({ selector: bloque.selector, declaracion: texto, px: parseFloat(px[1]), resuelto: 'px' }); continue; }
    const clamp = /font-size:\s*clamp\(\s*([0-9.]+)(rem|px)/.exec(texto);
    if (clamp) {
      const min = clamp[2] === 'rem' ? parseFloat(clamp[1]) * REM : parseFloat(clamp[1]);
      medidas.push({ selector: bloque.selector, declaracion: texto, px: min, resuelto: 'clamp' });
      continue;
    }
    const em = /font-size:\s*([0-9.]+)em/.exec(texto);
    if (em) medidas.push({ selector: bloque.selector, declaracion: texto, px: parseFloat(em[1]) * REM, resuelto: 'em' });
  }
}

describe('suelo de la escala tipográfica', () => {
  it('hay declaraciones de tamaño suficientes para que el barrido signifique algo', () => {
    expect(medidas.length).toBeGreaterThan(80);
  });

  it('ninguna declaración en rem o px queda por debajo del suelo', () => {
    const bajas = medidas.filter((m) => m.resuelto === 'rem' || m.resuelto === 'px')
      .filter((m) => m.px < SUELO_PX)
      .map((m) => `${m.selector} -> ${m.declaracion} (${m.px.toFixed(2)}px)`);
    expect(bajas, 'texto por debajo de ' + SUELO_PX + 'px: ' + bajas.join(' | ')).toEqual([]);
  });

  it('el mínimo de cada clamp respeta el suelo, que es el valor que manda en móvil', () => {
    const bajas = medidas.filter((m) => m.resuelto === 'clamp')
      .filter((m) => m.px < SUELO_PX)
      .map((m) => `${m.selector} -> ${m.declaracion} (min ${m.px.toFixed(2)}px)`);
    expect(bajas, 'clamp con mínimo bajo el suelo: ' + bajas.join(' | ')).toEqual([]);
  });

  it('el logotipo `.brand small` conserva un mínimo de 11px pase lo que pase en el padre', () => {
    // Es el único tamaño relativo del sistema: si `.brand` encoje en móvil, un
    // `.64em` a secas volvería a 9.3px, así que el suelo tiene que estar dentro
    // del propio clamp.
    const regla = bloques.find((b) => b.selector.split(',').map((s) => s.trim()).includes('.brand small'));
    expect(regla, 'no existe la regla de .brand small').toBeDefined();
    const declaracion = /font-size\s*:\s*([^;]+)/.exec(regla!.body)?.[1].trim();
    expect(declaracion, '.brand small sin font-size').toBeTruthy();
    const clamp = /^clamp\(\s*([0-9.]+)(px|rem)/.exec(declaracion!);
    if (clamp) {
      expect(clamp[2] === 'rem' ? parseFloat(clamp[1]) * REM : parseFloat(clamp[1])).toBeGreaterThanOrEqual(SUELO_PX);
      return;
    }
    const em = /([0-9.]+)em/.exec(declaracion!);
    expect(em, `formato de tamaño no reconocido en .brand small: ${declaracion}`).toBeTruthy();
    const marca = bloques.find((b) => b.selector.split(',').map((s) => s.trim()).includes('.brand'));
    expect(marca, '.brand debe declarar su tamaño en rem').toBeDefined();
    const base = /font-size:\s*([0-9.]+)rem/.exec(marca!.body);
    expect(base, '.brand sin font-size en rem').not.toBeNull();
    expect(parseFloat(em![1]) * parseFloat(base![1]) * REM).toBeGreaterThanOrEqual(SUELO_PX);
  });

  it('las etiquetas de fader y de banda conservan su suelo explícito', () => {
    const fader = medidas.filter((m) => /eq-fader-label/.test(m.selector));
    expect(fader.length, 'no hay tamaños declarados para .eq-fader-label').toBeGreaterThan(0);
    for (const m of fader) expect(m.px, `${m.declaracion} se fue por debajo`).toBeGreaterThanOrEqual(SUELO_PX);
  });
});
