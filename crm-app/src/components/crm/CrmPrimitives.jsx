import { formatDateTime } from '../../lib/formatters';
import StatusBadge from '../ui/StatusBadge';

export function LeadMiniCard({ lead, onOpenLead }) {
  return (
    <button className="rounded-lg border border-white/10 bg-ink/60 p-4 text-left transition hover:border-mint/40" type="button" onClick={() => onOpenLead(lead.id)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{lead.name}</h3>
          <p className="mt-1 text-sm text-cream/55">{lead.treatment || 'Sin tratamiento'}</p>
        </div>
        <StatusBadge value={lead.status} />
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
        <Info label="Seguimiento" value={lead.next_followup_at ? formatDateTime(lead.next_followup_at) : 'Sin fecha'} />
      </div>
    </button>
  );
}

export function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-700">{value === null || value === undefined || value === '' ? 'Sin dato' : value}</p>
    </div>
  );
}

export function Select({ label, value, onChange, options, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <select className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-cream outline-none transition hover:border-slate-300 focus:border-mint focus:ring-4 focus:ring-mint/10 disabled:cursor-not-allowed disabled:border-slate-200/60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {(options || []).map((option) => {
          const optionValue = typeof option === 'object' ? option.value : option;
          const optionLabel = typeof option === 'object' ? option.label : option;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

export function Field({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <input className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-cream outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-mint focus:ring-4 focus:ring-mint/10 disabled:cursor-not-allowed disabled:border-slate-200/60" type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
    </label>
  );
}

export function TextArea({ label, value, onChange, disabled = false, className = '', placeholder = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-cream outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-mint focus:ring-4 focus:ring-mint/10 disabled:cursor-not-allowed disabled:border-slate-200/60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
    </label>
  );
}
