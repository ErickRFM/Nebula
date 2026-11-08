'use client';

import { useFocusTrap } from '../hooks/useFocusTrap';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: 'Espacio / K', description: 'Reproducir / Pausar' },
  { key: 'N', description: 'Siguiente canción' },
  { key: 'P', description: 'Canción anterior' },
  { key: 'M', description: 'Silenciar / Restaurar volumen' },
  { key: 'S', description: 'Activar / Desactivar modo aleatorio' },
  { key: 'R', description: 'Ciclar modo de repetición' },
  { key: 'Q', description: 'Abrir / Cerrar cola de reproducción' },
  { key: 'Esc', description: 'Cerrar ventanas o volver atrás' },
  { key: '?', description: 'Abrir esta ayuda de atajos' },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const containerRef = useFocusTrap();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        onClick={onClose}
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="modal-dialog glass"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          onClick={(e) => e.stopPropagation()}
          ref={containerRef}
          style={{ maxWidth: 520 }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="modal-close icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={18} />
          </button>

          <div className="modal-header">
            <div className="modal-icon-badge modal-primary">
              <Keyboard size={24} />
            </div>
            <div>
              <h3 id="shortcuts-title">Atajos de teclado</h3>
              <p>Controla NÉBULA rápidamente sin usar el ratón.</p>
            </div>
          </div>

          <div className="shortcuts-list">
            {shortcuts.map((sc) => (
              <div key={sc.key} className="shortcut-row">
                <span className="shortcut-desc">{sc.description}</span>
                <kbd className="shortcut-key">{sc.key}</kbd>
              </div>
            ))}
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="button primary small"
              onClick={onClose}
              style={{ width: '100%' }}
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
