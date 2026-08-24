import { useEffect } from 'react';
import { Ban, CheckCircle2, Loader2, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';

export function FullScreenLoader({ label }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink text-cream">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-card p-5 text-cream shadow-glow">
        <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-mint" /><span className="text-sm font-semibold">{label}</span></div>
        <div className="mt-5 space-y-3" aria-hidden="true"><div className="skeleton h-3 w-2/3 rounded-full" /><div className="skeleton h-16 w-full rounded-xl" /><div className="grid grid-cols-2 gap-3"><div className="skeleton h-14 rounded-xl" /><div className="skeleton h-14 rounded-xl" /></div></div>
      </div>
    </main>
  );
}

export function PageSkeleton() {
  return (
    <section className="space-y-6" aria-label="Cargando vista" aria-busy="true">
      <div className="space-y-3">
        <div className="skeleton h-3 w-28 rounded-full" />
        <div className="skeleton h-9 w-72 max-w-full rounded-xl" />
        <div className="skeleton h-4 w-[34rem] max-w-full rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-32 rounded-2xl" />)}
      </div>
      <div className="skeleton h-72 rounded-2xl" />
    </section>
  );
}

export function Banner({ text, tone, onClose }) {
  const reduceMotion = useReducedMotion();
  const styles = tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  useEffect(() => {
    if (tone === 'danger') return undefined;
    const timeout = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timeout);
  }, [text, tone, onClose]);

  return createPortal(
    <motion.div
      className={`fixed left-4 right-4 top-4 z-[70] flex max-w-md items-center justify-between gap-4 rounded-2xl border p-4 text-sm font-medium shadow-xl sm:left-auto ${styles}`}
      initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className="flex items-center gap-2">{tone === 'danger' ? <Ban className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}{text}</span>
      <button className="rounded-lg p-1 opacity-80 transition hover:bg-hover hover:opacity-100" type="button" onClick={onClose} aria-label="Cerrar mensaje"><X className="h-4 w-4" /></button>
    </motion.div>,
    document.body,
  );
}
