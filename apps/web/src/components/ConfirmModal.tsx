'use client';

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

/*
 * El WebView del APK es Chrome 83 y este diálogo se abre encima de todo: sin
 * regla propia el foco se escapa al reproductor y el tap fuera no cierra nada.
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const containerRef = useFocusTrap();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => cancelBtnRef.current?.focus(), 50);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const IconComponent =
    variant === 'danger' ? Trash2 : variant === 'info' ? Info : AlertTriangle;

  return (
    <div className="confirm-backdrop" onClick={onCancel} role="presentation">
      <div
        className="confirm-dialog glass"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-desc"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        <button
          type="button"
          className="confirm-close icon-button"
          aria-label="Cerrar ventana"
          onClick={onCancel}
        >
          <X size={18} />
        </button>

        <div className="confirm-header">
          <div className={`confirm-icon confirm-${variant}`} aria-hidden="true">
            <IconComponent size={24} />
          </div>
          <div>
            <h3 id="modal-title">{title}</h3>
            <p id="modal-desc">{message}</p>
          </div>
        </div>

        <div className="confirm-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="button secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${variant === 'danger' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
