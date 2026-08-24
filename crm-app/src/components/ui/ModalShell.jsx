import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';

export default function ModalShell({
  children,
  className = '',
  overlayClassName = '',
  onSubmit,
  onClose,
  titleId,
  descriptionId,
  closeDisabled = false,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusable = () => [...dialog.querySelectorAll(focusableSelector)];
    (dialog.querySelector('[data-autofocus]') || focusable()[0] || dialog).focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && onCloseRef.current && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <motion.div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6 ${overlayClassName}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
      role="presentation"
    >
      <motion.form
        ref={dialogRef}
        className={`modal-premium ui-dark-surface w-full ${className}`}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {children}
      </motion.form>
    </motion.div>,
    document.body,
  );
}
