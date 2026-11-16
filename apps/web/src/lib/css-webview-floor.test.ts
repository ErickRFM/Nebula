import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * El APK se sirve en el WebView del sistema, cuyo suelo de desarrollo es Chrome 83.
 * Ahí `dvh`, `inset:`, `padding-block`, `margin-block` y `:is()`/`:where()` no fallan:
 * se ignoran en silencio, así que una pantalla puede verse impecable en Chrome de
 * escritorio y estar rota en el teléfono sin ningún error. Este test fija la regla.
 */
const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const blocks = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  .map((match) => ({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] }));

const declarations = (body: string): string[] => body.split(';').map((part: string) => part.trim()).filter(Boolean);
const propertyOf = (declaration: string): string => declaration.split(':')[0].trim().toLowerCase();

// Cuerpos de los @media que preguntan por pantalla táctil, pareando llaves anidadas.
function bloquesTáctiles(): string[] {
  const cuerpos: string[] = [];
  const cabeceras = /@media([^{]*)\{/g;
  let cabecera: RegExpExecArray | null;
  while ((cabecera = cabeceras.exec(css)) !== null) {
    if (!/pointer:\s*coarse/.test(cabecera[1]) || !/hover:\s*none/.test(cabecera[1])) continue;
    let fondo = cabeceras.lastIndex, profundidad = 1;
    while (fondo < css.length && profundidad > 0) {
      if (css[fondo] === '{') profundidad++;
      else if (css[fondo] === '}') profundidad--;
      fondo++;
    }
    cuerpos.push(css.slice(cabeceras.lastIndex, fondo - 1));
  }
  return cuerpos;
}

describe('suelo de capacidades del WebView (Chrome 83)', () => {
  const prohibidos: [string, RegExp][] = [
    [':is(', /:is\(/],
    [':where(', /:where\(/],
    ['inset:', /\binset:/],
    ['padding-block', /\bpadding-block/],
    ['margin-block', /\bmargin-block/],
    ['padding-inline', /\bpadding-inline/],
    ['margin-inline', /\bmargin-inline/],
  ];

  it.each(prohibidos)('no usa %s, que el WebView ignora sin avisar', (token: string, pattern: RegExp) => {
    const hits = blocks
      .filter((block) => pattern.test(block.selector + '{' + block.body))
      .map((block) => block.selector);
    expect(hits, `${token} presente en: ${hits.join(' | ')}`).toEqual([]);
  });

  it('toda unidad dinámica de viewport trae su fallback en vh dentro del mismo bloque', () => {
    const huérfanas = [];
    for (const block of blocks) {
      const propias = declarations(block.body);
      for (const declaration of propias) {
        if (!/[\d.(]d[vwi]h\b/.test(declaration)) continue;
        const property = propertyOf(declaration);
        const tieneFallback = propias.some((otra: string) =>
          propertyOf(otra) === property && !/d[vwi]h\b/.test(otra) && /vh\b/.test(otra));
        if (!tieneFallback) huérfanas.push(`${block.selector} { ${declaration} }`);
      }
    }
    expect(huérfanas, 'dvh sin fallback vh: ' + huérfanas.join(' | ')).toEqual([]);
  });

  it('ningún @media táctil depende solo de pointer:coarse, que es falso en el emulador', () => {
    const media = [...css.matchAll(/@media([^{]*)\{/g)].map((match) => match[1].replace(/\s+/g, ' ').trim());
    const solas = media.filter((query) => /pointer:\s*coarse/.test(query) && !/hover:\s*none/.test(query));
    expect(solas, 'consultas que solo usan pointer:coarse: ' + solas.join(' | ')).toEqual([]);
  });

  it('cada selector táctico de Audio Studio declara su área con reglas que Chrome 83 entiende', () => {
    const selectores = ['\\.eq-master input\\[type=range\\]', '\\.eq-module input\\[type=range\\]', '\\.seek-range', '\\.eq-classic summary', '\\.eq-node-hit'];
    for (const source of selectores) {
      const matchers = new RegExp(source);
      const bloques = blocks.filter((block) => matchers.test(block.selector));
      expect(bloques.length, `no existe ninguna regla para ${source}`).toBeGreaterThan(0);
      const conÁrea = bloques.some((block) => /padding-top|padding-bottom|min-height|stroke-width/.test(block.body));
      expect(conÁrea, `${source} nunca declara área táctil útil (padding-top/bottom, min-height o stroke-width)`).toBe(true);
    }
  });

  /*
   * Medido con el dedo en el emulador (Chrome 83, 393x751): la fila de una playlist
   * creaba un objetivo de 39.1px y cada interruptor de ajuste de 27px. Ambos siguen
   * su diseño en escritorio, así que el arreglo vive dentro de la consulta táctil.
   */
  it('los controles medidos por debajo de 44px recuperan área dentro de la consulta táctil', () => {
    const táctil = bloquesTáctiles();
    expect(táctil.length, 'no hay ningún @media con pointer:coarse y hover:none').toBeGreaterThan(0);
    const cuerpo = táctil.join('\n');
    for (const [selector, px] of [['\\.playlist-entry-main', 'min-height:\\s*44px'], ['\\.toggle::after', 'height:\\s*44px'], ['\\.chip', 'min-height:\\s*44px']]) {
      expect(cuerpo, `${selector} no declara 44px dentro de la consulta táctil`).toMatch(new RegExp(selector + '\\s*\\{[^}]*' + px));
    }
  });

  it('toda regla que usa :has() tiene su alternativa bajo @supports not selector', () => {
    const usaHas = blocks.filter((block) => /:has\(/.test(block.selector));
    if (usaHas.length === 0) return;
    expect(css, ':has() sin alternativa para WebViews antiguos').toMatch(/@supports not selector\(:has\(/);
  });
});
