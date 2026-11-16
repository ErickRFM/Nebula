import { describe, expect, it, vi } from 'vitest';
import { watchNetwork, type NetworkWindow } from './network-status';

/*
 * El suelo del APK es el WebView del sistema: si la escucha de red se monta mal, el
 * usuario se queda sin audio «por arte de magia» y sin ningún aviso en pantalla.
 * Aquí no se simula la app: se ejerce watchNetwork contra un objeto con la forma de
 * window y se comprueba qué ve el suscriptor, de principio a fin.
 */

type Registrado = { kind: string; handler: () => void };

function fakeWindow(onLine: boolean): { source: NetworkWindow; registrados: Registrado[]; removals: Registrado[] } {
  const registrados: Registrado[] = [];
  const removals: Registrado[] = [];
  return {
    registrados,
    removals,
    source: {
      navigator: { onLine },
      addEventListener(kind: 'online' | 'offline', handler: () => void) { registrados.push({ kind, handler }); },
      removeEventListener(kind: 'online' | 'offline', handler: () => void) { removals.push({ kind, handler }); },
    },
  };
}

const kinds = (lista: Registrado[]) => lista.map((entrada) => entrada.kind).sort();

describe('watchNetwork', () => {
  it('siembra el estado actual antes de escuchar, para no nacer con la red cortada en silencio', () => {
    const { source, registrados } = fakeWindow(false);
    const listener = vi.fn();
    watchNetwork(source, listener);
    expect(listener.mock.calls).toEqual([[false]]);
    expect(kinds(registrados)).toEqual(['offline', 'online']);
  });

  it('avisa con true al volver la conexión y con false al perderla', () => {
    const { source, registrados } = fakeWindow(true);
    const listener = vi.fn();
    watchNetwork(source, listener);
    expect(listener).toHaveBeenLastCalledWith(true);
    const dispara = (kind: 'online' | 'offline') => registrados.find((entrada) => entrada.kind === kind)?.handler();
    dispara('offline');
    expect(listener).toHaveBeenLastCalledWith(false);
    dispara('online');
    expect(listener).toHaveBeenLastCalledWith(true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('desmontar la escucha quita exactamente los handlers que se registraron', () => {
    const { source, registrados, removals } = fakeWindow(true);
    const detener = watchNetwork(source, () => {});
    detener();
    expect(kinds(removals)).toEqual(['offline', 'online']);
    expect(removals.every((remo, indice) => remo.handler === registrados[indice].handler)).toBe(true);
  });
});
