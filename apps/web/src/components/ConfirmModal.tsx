'use client';

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { motion, AnimatePresence } from 'framer-motion';
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
  const containerRef = useFocusTrap();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus cancel button on open and esc handling
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
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        onClick={onCancel}
        role="presentation"
        aria-hidden={!isOpen}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="modal-dialog glass"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby="modal-desc"
          onClick={e => e.stopPropagation()}
          ref={containerRef}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
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
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
