'use client';
import { useEffect, useState } from 'react';
import { watchNetwork } from '../lib/network-status';

/*
 * Se siembra dentro del efecto y no en el estado inicial: el HTML exportado se
 * prerrenderiza sin red real, y leer `navigator.onLine` antes de hidratar produce
 * un aviso de desconexión que la vista del servidor nunca mostró.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => watchNetwork(window, setOnline), []);
  return online;
}
