import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Un `var(--inexistente)` sin fallback no pinta un error: la propiedad pasa a
 * `unset` y hereda el color del padre. Así un hint atenuado queda en color de
 * texto normal y el barrido de contraste lo da por bueno. Este test es el que
 * cazó `--text-muted`, un token que nunca existió (el real es `--muted`).
 */
const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');

describe('tokens de globals.css', () => {
  const definidos = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  const usos = [...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g)];

  it('la hoja define tokens y los usa, así que el control no es vacío', () => {
    expect(definidos.size).toBeGreaterThan(10);
    expect(usos.length).toBeGreaterThan(50);
  });

  it('todo var(--x) sin fallback está definido en la misma hoja', () => {
    const huerfanos = usos
      .filter((m) => !m[2] && !definidos.has(m[1]))
      .map((m) => m[1]);
    expect(huerfanos, `tokens usados sin definición: ${[...new Set(huerfanos)].join(', ')}`).toEqual([]);
  });

  it('los hints del Audio Studio usan el token atenuado real', () => {
    for (const clase of ['.eq-module-hint', '.eq-meter-note']) {
      const inicio = css.indexOf(`${clase}{`);
      expect(inicio, `${clase} perdió su regla`).toBeGreaterThanOrEqual(0);
      const regla = css.slice(inicio, css.indexOf('}', inicio) + 1);
      expect(regla).toMatch(/color:\s*var\(--muted\)/);
    }
  });
});
