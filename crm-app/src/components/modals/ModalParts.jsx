import { Save, X } from 'lucide-react';
import Button from '../ui/Button';

export function ModalHeader({ title, subtitle, onClose, disabled, titleId }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">{subtitle}</p>
        <h2 id={titleId} className="mt-1 text-2xl font-bold tracking-tight text-cream">{title}</h2>
      </div>
      <button className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-card p-2 text-slate-500 transition hover:border-mint/30 hover:bg-elevated hover:text-cream disabled:cursor-not-allowed disabled:border-slate-200/60 disabled:text-slate-400" type="button" onClick={onClose} disabled={disabled} aria-label="Cerrar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ModalActions({ saving, onClose, submitLabel, danger = false }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant={danger ? 'danger' : 'primary'} type="submit" loading={saving}>{!saving ? <Save className="h-4 w-4" /> : null}{submitLabel}</Button>
    </div>
  );
}
