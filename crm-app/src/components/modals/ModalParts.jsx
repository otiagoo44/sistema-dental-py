import { Save, X } from 'lucide-react';
import Button from '../ui/Button';

export function ModalHeader({ title, subtitle, onClose, disabled }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">{subtitle}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-cream">{title}</h2>
      </div>
      <button className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={disabled} aria-label="Cerrar">
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
