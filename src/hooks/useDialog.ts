import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

// Pila de diálogos abiertos: con modales anidados (p.ej. Facturar encima de la cita),
// Escape y el ciclo de Tab solo los atiende el de arriba.
const dialogStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = '';

/**
 * Comportamiento accesible de un modal: Escape cierra, Tab queda atrapado dentro,
 * se bloquea el scroll del fondo y al cerrar el foco vuelve a donde estaba.
 * El foco inicial va a un elemento con `data-autofocus` o, si no hay, al propio panel
 * (así en móvil no se abre el teclado de golpe).
 *
 * El panel debe llevar role="dialog", aria-modal="true", aria-labelledby y tabIndex={-1}.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    dialogStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (scrollLocks === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks++;

    const frame = requestAnimationFrame(() => {
      const node = ref.current as HTMLElement | null;
      if (!node) return;
      const target = (node.querySelector('[data-autofocus]') as HTMLElement | null) ?? node;
      target.focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      const node = ref.current as HTMLElement | null;
      if (!node) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = (Array.from(node.querySelectorAll(FOCUSABLE)) as HTMLElement[])
          .filter(el => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !node.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || active === node)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      const idx = dialogStack.indexOf(id);
      if (idx !== -1) dialogStack.splice(idx, 1);
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}
