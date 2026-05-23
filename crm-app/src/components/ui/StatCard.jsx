export default function StatCard({ label, value, tone = 'mint', detail }) {
  const tones = {
    mint: 'text-mint',
    gold: 'text-gold',
    danger: 'text-danger',
    cream: 'text-cream',
  };

  return (
    <div className="rounded-lg border border-white/10 bg-panel/90 p-4 shadow-glow">
      <p className="text-sm text-cream/60">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${tones[tone] || tones.mint}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs text-cream/45">{detail}</p> : null}
    </div>
  );
}
