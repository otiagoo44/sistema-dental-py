import { Circle, Flame, Snowflake } from 'lucide-react';

const temperature = {
  'Lead Caliente': { label: 'Caliente', Icon: Flame, className: 'border-rose-400/25 bg-rose-400/10 text-rose-200' },
  'Lead Medio': { label: 'Medio', Icon: Circle, className: 'border-amber-400/25 bg-amber-400/10 text-amber-200' },
  'Lead Frío': { label: 'Frío', Icon: Snowflake, className: 'border-sky-400/25 bg-sky-400/10 text-sky-200' },
};

export default function TemperatureBadge({ value }) {
  const item = temperature[value];
  if (!item) return null;
  const { Icon } = item;
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${item.className}`}>
      <Icon className="h-3.5 w-3.5" />{item.label}
    </span>
  );
}
