import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface DrawerHeaderProps {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
}

/**
 * Shared header for drawer UI components.
 * Uses a small motion preset defined in `motionConfig`.
 */
export function DrawerHeader({ title, icon, onClose }: DrawerHeaderProps) {
  return (
    <div className="drawer-header flex items-center justify-between p-4">
      <div className="flex items-center gap-2">
        {icon && <span className="drawer-icon-badge">{icon}</span>}
        <h3 className="text-lg font-medium" id="drawer-title">
          {title}
        </h3>
      </div>
      <button
        type="button"
        className="drawer-close icon-button"
        aria-label="Cerrar cajón"
        onClick={onClose}
      >
        {/* X icon from lucide-react */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          stroke="currentColor"
          fill="none"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
