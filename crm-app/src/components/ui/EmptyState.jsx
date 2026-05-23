export default function EmptyState({ title, text }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
      <p className="font-semibold text-cream">{title}</p>
      {text ? <p className="mt-2 text-sm text-cream/55">{text}</p> : null}
    </div>
  );
}
