const statusStyles = {
  'Lead Caliente': 'border-red-200 bg-red-50 text-red-700',
  'Lead Medio': 'border-amber-200 bg-amber-50 text-amber-700',
  'Lead Frío': 'border-slate-200 bg-slate-100 text-slate-600',
  Nuevo: 'border-blue-200 bg-blue-50 text-blue-700',
  'No Contactado': 'border-amber-200 bg-amber-50 text-amber-700',
  Contactado: 'border-sky-200 bg-sky-50 text-sky-700',
  Respondió: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  'Consulta Agendada': 'border-violet-200 bg-violet-50 text-violet-700',
  Agendado: 'border-violet-200 bg-violet-50 text-violet-700',
  Reprogramado: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  Confirmado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Asistió: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'No Asistió': 'border-red-200 bg-red-50 text-red-700',
  Perdido: 'border-red-200 bg-red-50 text-red-700',
  Archivado: 'border-slate-200 bg-slate-100 text-slate-600',
  baja: 'border-slate-200 bg-slate-100 text-slate-600',
  media: 'border-amber-200 bg-amber-50 text-amber-700',
  alta: 'border-orange-200 bg-orange-50 text-orange-700',
  urgente: 'border-red-200 bg-red-50 text-red-700',
  pendiente: 'border-amber-200 bg-amber-50 text-amber-700',
  vencido: 'border-red-200 bg-red-50 text-red-700',
  hecho: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelado: 'border-slate-200 bg-slate-100 text-slate-600',
  Activo: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Inactivo: 'border-slate-200 bg-slate-100 text-slate-600',
};

export default function StatusBadge({ value }) {
  if (!value) return null;

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[value] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {value}
    </span>
  );
}
