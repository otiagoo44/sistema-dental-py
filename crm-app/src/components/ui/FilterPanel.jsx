import { useId, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Card from './Card';

export default function FilterPanel({
  title = 'Filtros',
  description,
  alwaysContent,
  children,
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 rounded-lg border border-mint/20 bg-mint/10 p-2 text-mint">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-cream">{title}</p>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-elevated px-3 text-xs font-bold text-slate-600 transition hover:border-mint/30 hover:bg-hover md:hidden"
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          {open ? 'Ocultar' : 'Mostrar'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {alwaysContent ? <div className="mt-4">{alwaysContent}</div> : null}

      <div id={panelId} className={`${open ? 'block' : 'hidden'} mt-4 border-t border-slate-200 pt-4 md:block`}>
        {children}
      </div>
    </Card>
  );
}
