'use client';

import { useEffect, useRef } from 'react';
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
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus cancel button for safe keyboard accessibility
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const IconComponent = variant === 'danger' ? Trash2 : variant === 'info' ? Info : AlertTriangle;

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="presentation"
      aria-hidden={!isOpen}
    >
      <div
        className="modal-dialog glass"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close icon-button"
          aria-label="Cerrar ventana"
          onClick={onCancel}
        >
          <X size={18} />
        </button>

        <div className="modal-header">
          <div className={`modal-icon-badge modal-${variant}`}>
            <IconComponent size={24} />
          </div>
          <div>
            <h3 id="modal-title">{title}</h3>
            <p id="modal-desc">{message}</p>
          </div>
        </div>

        <div className="modal-actions">
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
            className={`button ${variant === 'danger' ? 'danger-button' : 'primary'}`}
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
