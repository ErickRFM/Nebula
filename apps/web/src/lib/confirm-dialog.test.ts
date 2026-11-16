import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * `window.confirm` no aparece en el WebView del APK cuando hay audio en curso: el
 * aviso se traga y la acción destructiva se ejecuta igual. Este test fija que los
 * ocho puntos destructivos del historial siguen pasando por el diálogo propio.
 */
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

const llamadores = [
  ['../components/NebulaApp.tsx', 3],
  ['../components/CloudLibrary.tsx', 1],
  ['../components/AccountPanel.tsx', 1],
  ['../components/RoomsPanel.tsx', 3],
] as const;

describe('confirmaciones destructivas', () => {
  it('ningún archivo del flujo usa window.confirm', () => {
    const rutas = [...llamadores.map(([ruta]) => ruta), '../app/page.tsx', '../hooks/useConfirm.tsx'];
    const culpables = rutas.filter((ruta) => /window\.confirm\s*\(/.test(leer(ruta)));
    expect(culpables, 'window.confirm sigue en: ' + culpables.join(' | ')).toEqual([]);
  });

  it.each(llamadores)('%s pide sus %i acciones por el diálogo', (ruta: string, esperadas: number) => {
    const fuente = leer(ruta);
    const pedidas = fuente.match(/askConfirm\(/g)?.length ?? 0;
    expect(pedidas, `${ruta} pide confirmación ${pedidas} veces, se esperaban ${esperadas}`).toBe(esperadas);
    for (const bloque of fuente.split('askConfirm(').slice(1)) {
      expect(bloque.slice(0, 600), `una petición en ${ruta} no explica qué se pierde`).toMatch(/message:/);
    }
  });

  it('el proveedor monta el diálogo sobre toda la app', () => {
    expect(leer('../app/page.tsx')).toMatch(/<ConfirmProvider>/);
  });

  it('ConfirmModal no arrastra framer-motion ni clases inventadas', () => {
    const modal = leer('../components/ConfirmModal.tsx');
    expect(modal).not.toMatch(/framer-motion/);
    expect(modal).not.toMatch(/danger-button/);
    expect(modal).toMatch(/role="alertdialog"/);
    expect(modal).toMatch(/aria-modal="true"/);
  });

  it('el diálogo se pinta con reglas que Chrome 83 entiende y fondo casi opaco', () => {
    const css = leer('../app/globals.css');
    const bloque = css.match(/\.confirm-dialog\{([^}]*)\}/);
    expect(bloque, 'falta la regla de .confirm-dialog').not.toBeNull();
    expect(bloque?.[1]).toMatch(/background:rgba\(24,28,54,\.97\)/);
    expect(bloque?.[1]).not.toMatch(/inset:|padding-block|margin-block|:is\(/);
    const capa = css.match(/\.confirm-backdrop\{([^}]*)\}/);
    expect(capa?.[1]).toMatch(/position:fixed/);
    expect(capa?.[1]).toMatch(/z-index:40/);
  });
});
