import { useEffect, useRef } from 'react';

/**
 * Hook that traps focus inside a container while it is mounted.
 * It moves focus to the first focusable element on mount and
 * restores focus to the previously active element on unmount.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousActive = useRef<Element | null>(null);

  useEffect(() => {
    previousActive.current = document.activeElement;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ) ?? []
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      // restore focus
      if (previousActive.current instanceof HTMLElement) {
        previousActive.current.focus();
      }
    };
  }, []);

  return containerRef;
}
