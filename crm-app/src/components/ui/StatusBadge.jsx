const statusStyles = {
  'Lead Caliente': 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  'Lead Medio': 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  'Lead Frío': 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  Nuevo: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  'No Contactado': 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  Contactado: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  Respondió: 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300',
  'Consulta Agendada': 'border-violet-400/25 bg-violet-400/10 text-violet-300',
  Agendado: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
  Reprogramado: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300',
  Confirmado: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  Asistió: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  'No Asistió': 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  Perdido: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  Archivado: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-400',
  baja: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-600',
  media: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  alta: 'border-orange-400/25 bg-orange-400/10 text-orange-300',
  urgente: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  pendiente: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  vencido: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  hecho: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  cancelado: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-400',
  Activo: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  Inactivo: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-400',
  Urgente: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  Atención: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Ordenado: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  Cerrado: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-300',
};

export default function StatusBadge({ value }) {
  if (!value) return null;

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${statusStyles[value] || 'border-slate-400/20 bg-slate-400/[0.08] text-slate-600'}`}>
      {value}
    </span>
  );
}
