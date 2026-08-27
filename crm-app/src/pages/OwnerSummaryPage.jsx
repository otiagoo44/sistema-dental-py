import { useMemo } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, BarChart3, CircleDollarSign } from 'lucide-react';
import { formatMoney } from '../lib/formatters';
import { buildOwnerSummary } from '../lib/ownerMetrics';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

export default function OwnerSummaryPage({ leads, appointments, tasks, quotes = [], workspaceEvents = [], profiles = [], onNavigate }) {
  const summary = useMemo(() => buildOwnerSummary({ leads, appointments, tasks, quotes, workspaceEvents, profiles }), [leads, appointments, tasks, quotes, workspaceEvents, profiles]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Resumen" title="Cómo está funcionando la clínica" subtitle="Últimos 30 días. Los montos son presupuestos, no cobros." action={<Button variant="secondary" type="button" onClick={() => onNavigate('metrics')}><BarChart3 className="h-4 w-4" />Abrir análisis</Button>} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-cream">Embudo comercial</h2>
          <p className="mt-1 text-sm text-textMuted">Cada tasa usa como denominador la etapa anterior.</p>
        </div>
        <div className="scrollbar-soft flex overflow-x-auto">
          {summary.funnel.map((step, index) => (
            <div key={step.label} className="relative min-w-[150px] flex-1 border-r border-slate-200 px-4 py-5 last:border-r-0">
              <p className="text-2xl font-black text-cream">{step.value}</p>
              <p className="mt-1 text-sm font-semibold text-textSoft">{step.label}</p>
              {index ? <p className="mt-3 flex items-center gap-1 text-xs font-bold text-mint"><ArrowDown className="h-3.5 w-3.5" />{step.rate}% avanzó</p> : <p className="mt-3 text-xs text-textMuted">Base del período</p>}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-amber-400/30 bg-amber-400/[0.05] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-amber-200">Principal punto a revisar</p>
              {summary.bottleneck ? (
                <>
                  <h2 className="mt-2 text-2xl font-black text-cream">{summary.bottleneck.stage}</h2>
                  <p className="mt-2 text-base leading-6 text-textSoft">{summary.bottleneck.message}</p>
                  <p className="mt-2 text-sm text-textMuted">Conversión: {summary.bottleneck.rate}% · caída de {summary.bottleneck.drop} pacientes.</p>
                  {summary.bottleneck.denominator < 10 ? <p className="mt-2 text-xs text-amber-200">Muestra pequeña; no representa todavía una tendencia definitiva.</p> : null}
                </>
              ) : <p className="mt-2 text-base text-textMuted">Todavía no hay suficiente volumen para calcular una caída.</p>}
              <Button className="mt-4" variant="secondary" type="button" onClick={() => onNavigate('metrics')}>Ver definición<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-mint">Presupuestos que necesitan atención</p>
              <p className="mt-2 text-2xl font-black text-cream">{formatMoney(summary.money.attention)}</p>
              <p className="mt-2 text-sm text-textMuted">{summary.money.attentionCount} pacientes con presupuesto pendiente y acción inmediata. Aceptado no significa cobrado.</p>
              <Button className="mt-4" variant="secondary" type="button" onClick={() => onNavigate('pending')}>Ver pendientes<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MoneySignal label="Monto presupuestado" value={summary.money.quoted} />
        <MoneySignal label="Monto pendiente actual" value={summary.money.pending} />
        <MoneySignal label="Monto aceptado" value={summary.money.accepted} note="No equivale a cobrado" />
      </div>
    </section>
  );
}

function MoneySignal({ label, value, note }) {
  return <Card className="p-4"><p className="text-sm font-semibold text-textMuted">{label}</p><p className="mt-2 text-xl font-black text-cream">{formatMoney(value)}</p>{note ? <p className="mt-1 text-xs text-amber-200">{note}</p> : null}</Card>;
}
