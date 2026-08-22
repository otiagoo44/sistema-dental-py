import { motion } from 'motion/react';
import { createPortal } from 'react-dom';

export default function ModalShell({
  children,
  className = '',
  overlayClassName = '',
  onSubmit,
}) {
  return createPortal(
    <motion.div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6 ${overlayClassName}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      role="presentation"
    >
      <motion.form
        className={`modal-premium ui-dark-surface w-full ${className}`}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </motion.form>
    </motion.div>,
    document.body,
  );
}
