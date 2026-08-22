export default function StatCard({ label, value, tone = 'mint', detail, icon: Icon }) {
  const tones = {
    mint: 'text-blue-700 bg-blue-50',
    gold: 'text-amber-700 bg-amber-50',
    danger: 'text-red-700 bg-red-50',
    cream: 'text-cream',
    success: 'text-emerald-700 bg-emerald-50',
    purple: 'text-violet-700 bg-violet-50',
  };

  return (
    <div className="card-enter rounded-2xl border border-slate-200 bg-white p-5 shadow-glow transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon ? <span className={`rounded-xl p-2 ${tones[tone] || tones.mint}`}><Icon className="h-4 w-4" /></span> : null}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-[-0.03em] text-cream">{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}
