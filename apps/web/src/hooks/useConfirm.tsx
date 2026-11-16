'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmModal, type ConfirmModalProps } from '../components/ConfirmModal';

export type ConfirmRequest = Pick<ConfirmModalProps, 'title' | 'message' | 'confirmLabel' | 'cancelLabel' | 'variant'>;
export type ConfirmAsk = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmAsk | null>(null);

/*
 * `window.confirm` está bloqueado en el WebView del APK cuando hay audio en curso y
 * no se puede estilizar: el aviso desaparecía y el borrado ocurría igual. Aquí la
 * petición vive en un estado y la promesa se resuelve con el diálogo.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);

  const ask = useCallback<ConfirmAsk>((next) => new Promise<boolean>((resolve) => {
    // Una segunda petición sin responder cancela la anterior; si no, su promesa
    // quedaría pendiente para siempre y el flujo que la esperaba no avanzaría.
    resolver.current?.(false);
    resolver.current = resolve;
    setRequest(next);
  }), []);

  const responder = useCallback((accepted: boolean) => {
    resolver.current?.(accepted);
    resolver.current = null;
    setRequest(null);
  }, []);

  const value = useMemo(() => ask, [ask]);

  return <>
    <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>
    <ConfirmModal
      isOpen={request !== null}
      {...(request ?? { title: '', message: '' })}
      onConfirm={() => responder(true)}
      onCancel={() => responder(false)}
    />
  </>;
}

export function useConfirm(): ConfirmAsk {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm necesita un ConfirmProvider sobre el árbol.');
  return ask;
}
