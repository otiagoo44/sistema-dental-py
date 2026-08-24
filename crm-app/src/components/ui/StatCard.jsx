import { motion, useReducedMotion } from 'motion/react';

export default function StatCard({ label, value, tone = 'mint', detail, icon: Icon }) {
  const reduceMotion = useReducedMotion();
  const tones = {
    mint: 'border border-mint/20 bg-mint/10 text-mint',
    gold: 'border border-amber-400/20 bg-amber-400/10 text-amber-300',
    danger: 'border border-rose-400/20 bg-rose-400/10 text-rose-300',
    cream: 'text-cream',
    success: 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    purple: 'border border-violet-400/20 bg-violet-400/10 text-violet-300',
    cyan: 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
  };

  return (
    <motion.div
      className="metric-card ui-dark-surface"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon ? <span className={`rounded-xl p-2 ${tones[tone] || tones.mint}`}><Icon className="h-4 w-4" /></span> : null}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-[-0.03em] text-cream">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-5 text-slate-500">{detail}</p> : null}
    </motion.div>
  );
}
