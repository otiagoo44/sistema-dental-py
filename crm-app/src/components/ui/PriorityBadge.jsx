const styles = {
  urgent: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  attention: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  controlled: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  closed: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-300',
};

export default function PriorityBadge({ priority, showReason = false }) {
  if (!priority) return null;
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[priority.level] || styles.controlled}`} title={priority.reason}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {priority.label}{showReason && priority.reason ? ` · ${priority.reason}` : ''}
    </span>
  );
}
