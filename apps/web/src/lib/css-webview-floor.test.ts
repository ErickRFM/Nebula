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

  it('toda regla que usa :has() tiene su alternativa bajo @supports not selector', () => {
    const usaHas = blocks.filter((block) => /:has\(/.test(block.selector));
    if (usaHas.length === 0) return;
    expect(css, ':has() sin alternativa para WebViews antiguos').toMatch(/@supports not selector\(:has\(/);
  });
});
