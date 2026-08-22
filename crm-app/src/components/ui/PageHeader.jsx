export default function PageHeader({ eyebrow, title, subtitle, action, children }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">{eyebrow}</p> : null}
        <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em] text-cream md:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p> : null}
        {children}
      </div>
      {action ? <div className="w-full shrink-0 [&>*]:w-full sm:w-auto sm:[&>*]:w-auto">{action}</div> : null}
    </header>
  );
}
