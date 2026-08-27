import { useId, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { SlidersHorizontal, X } from 'lucide-react';
import Button from './Button';
import ModalShell from './ModalShell';

export default function FilterSheet({ activeCount = 0, onOpen, onApply, onClear, children }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  function openSheet() {
    onOpen?.();
    setOpen(true);
  }

  function apply(event) {
    event.preventDefault();
    onApply?.();
    setOpen(false);
  }

  return (
    <>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-card px-4 text-sm font-semibold text-textSoft transition hover:border-mint/35 hover:bg-elevated hover:text-cream"
        type="button"
        onClick={openSheet}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {activeCount ? <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-inverse">{activeCount}</span> : null}
      </button>

      <AnimatePresence>
        {open ? (
          <ModalShell
            key="filter-sheet"
            className="mt-auto max-w-2xl rounded-b-none p-5 sm:mt-0 sm:rounded-xl sm:p-6"
            overlayClassName="!items-end sm:!items-start"
            onClose={() => setOpen(false)}
            onSubmit={apply}
            titleId={titleId}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <h2 id={titleId} className="text-lg font-bold text-cream">Filtros</h2>
              <button className="rounded-lg p-2 text-textMuted hover:bg-elevated hover:text-cream" type="button" onClick={() => setOpen(false)} aria-label="Cerrar filtros">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-5">{children}</div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" type="button" onClick={onClear}>Limpiar</Button>
              <Button type="submit">Aplicar filtros</Button>
            </div>
          </ModalShell>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function ActiveFilterChips({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Filtros activos">
      {items.map((item) => (
        <button
          key={item.key}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-mint/25 bg-mint/[0.07] px-3 text-xs font-semibold text-mint"
          type="button"
          onClick={item.onRemove}
          aria-label={`Quitar filtro ${item.label}`}
        >
          {item.label}<X className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
