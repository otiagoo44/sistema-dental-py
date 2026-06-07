const statusStyles = {
  'Lead Caliente': 'border-danger/50 bg-danger/10 text-red-100',
  'Lead Medio': 'border-gold/50 bg-gold/10 text-yellow-100',
  'Lead Frío': 'border-slate-500/50 bg-slate-500/10 text-slate-100',
  Nuevo: 'border-mint/50 bg-mint/10 text-mint',
  'Consulta Agendada': 'border-gold/60 bg-gold/10 text-yellow-100',
  Confirmado: 'border-mint/60 bg-mint/10 text-mint',
  Perdido: 'border-danger/60 bg-danger/10 text-red-100',
  Archivado: 'border-slate-500/60 bg-slate-500/10 text-slate-100',
  baja: 'border-slate-500/50 bg-slate-500/10 text-slate-100',
  media: 'border-gold/50 bg-gold/10 text-yellow-100',
  alta: 'border-danger/50 bg-danger/10 text-red-100',
  urgente: 'border-danger/70 bg-danger/20 text-red-100',
  pendiente: 'border-gold/50 bg-gold/10 text-yellow-100',
  vencido: 'border-danger/60 bg-danger/10 text-red-100',
  hecho: 'border-mint/60 bg-mint/10 text-mint',
  cancelado: 'border-slate-500/60 bg-slate-500/10 text-slate-100',
  Activo: 'border-mint/60 bg-mint/10 text-mint',
  Inactivo: 'border-slate-500/60 bg-slate-500/10 text-slate-100',
};

export default function StatusBadge({ value }) {
  if (!value) return null;

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[value] || 'border-white/10 bg-white/5 text-cream/80'}`}>
      {value}
    </span>
  );
}
