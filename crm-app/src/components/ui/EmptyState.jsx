import { CheckCircle2 } from 'lucide-react';

export default function EmptyState({ title, text, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm"><CheckCircle2 className="h-5 w-5" /></span>
      <p className="mt-4 font-semibold text-cream">{title}</p>
      {text ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
