import { CheckCircle2 } from 'lucide-react';

export default function EmptyState({ title, text, action }) {
  return (
    <div className="ui-dark-surface rounded-2xl border border-dashed border-slate-300 bg-soft p-8 text-center text-cream">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></span>
      <p className="mt-4 font-semibold text-cream">{title}</p>
      {text ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
