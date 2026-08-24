import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, BarChart3 } from 'lucide-react';
import { buildNextActionQueue, PRIORITY_GROUP } from '../lib/nextActions';
import { formatMoney, toLocalIsoDate } from '../lib/formatters';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

function uniqueLeadCount(events, types) {
  return new Set(events.filter((event) => types.includes(event.event_type)).map((event) => event.lead_id).filter(Boolean)).size;
}

export default function OwnerSummaryPage({ leads, appointments, tasks, quotes = [], workspaceEvents = [], onNavigate }) {
  const summary = useMemo(() => {
    const now = new Date();
    const month = toLocalIsoDate(now).slice(0, 7);
    const periodEvents = workspaceEvents.filter((event) => toLocalIsoDate(event.created_at).slice(0, 7) === month);
    const periodQuotes = quotes.filter((quote) => toLocalIsoDate(quote.issued_at).slice(0, 7) === month);
    const queue = buildNextActionQueue({ leads, appointments, tasks, quotes, now });
    const actionByLead = new Map(queue.map((item) => [item.lead.id, item.action]));
    const riskyQuotes = quotes.filter((quote) => {
      if (quote.status !== 'pending') return false;
      const action = actionByLead.get(quote.lead_id);
      const lead = leads.find((item) => item.id === quote.lead_id);
      return !lead?.assigned_to || !action || action.priorityGroup === PRIORITY_GROUP.now;
    });
    const lossRows = [
      { label: 'No respondieron', count: uniqueLeadCount(periodEvents, ['contact_attempted']) },
      { label: 'No asistieron', count: uniqueLeadCount(periodEvents, ['appointment_no_show']) },
      { label: 'Rechazaron presupuesto', count: uniqueLeadCount(periodEvents, ['quote_rejected']) },
    ].sort((a, b) => b.count - a.count);

    return {
      monthLabel: new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric', timeZone: 'America/Asuncion' }).format(now),
      funnel: [
        { label: 'Consultas', value: leads.filter((lead) => toLocalIsoDate(lead.created_at).slice(0, 7) === month).length, source: 'Fecha de creación' },
        { label: 'Contactadas', value: uniqueLeadCount(periodEvents, ['lead_contacted', 'contact_responded']), source: 'Eventos de contacto' },
        { label: 'Agendaron', value: uniqueLeadCount(periodEvents, ['appointment_scheduled', 'appointment_rescheduled']), source: 'Eventos de agenda' },
        { label: 'Asistieron', value: uniqueLeadCount(periodEvents, ['appointment_attended']), source: 'Eventos de asistencia' },
        { label: 'Iniciaron tratamiento', value: uniqueLeadCount(periodEvents, ['treatment_started']), source: 'Eventos de tratamiento' },
      ],
      money: {
        quoted: periodQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
        pending: quotes.filter((quote) => quote.status === 'pending').reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
        accepted: quotes.filter((quote) => quote.status === 'accepted' && toLocalIsoDate(quote.accepted_at).slice(0, 7) === month).reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
        rejected: quotes.filter((quote) => quote.status === 'rejected' && toLocalIsoDate(quote.rejected_at).slice(0, 7) === month).reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
        risk: riskyQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
        riskCount: new Set(riskyQuotes.map((quote) => quote.lead_id)).size,
      },
      lossRows,
    };
  }, [leads, appointments, tasks, quotes, workspaceEvents]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Resumen del dueño" title="Salud comercial de la clínica" subtitle={`Resultados operativos de ${summary.monthLabel}. Los montos son presupuestos, no cobros.`} />
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-bold text-cream">Este mes</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {summary.funnel.map((item, index) => (
            <div key={item.label} className="relative rounded-2xl border border-slate-200 bg-soft p-4">
              <p className="text-3xl font-black text-cream">{item.value}</p>
              <p className="mt-1 text-base font-semibold text-textSoft">{item.label}</p>
              <p className="mt-2 text-xs text-textMuted">{item.source}</p>
              {index < summary.funnel.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 text-mint md:block" /> : null}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-textMuted">Cada etapa cuenta pacientes únicos por el evento ocurrido durante el período. “Consultas” usa la fecha de creación de la oportunidad.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard label="Presupuestado este mes" value={summary.money.quoted} />
        <MoneyCard label="Pendiente actualmente" value={summary.money.pending} />
        <MoneyCard label="Aceptado este mes" value={summary.money.accepted} note="Aceptado no significa cobrado" />
        <MoneyCard label="Rechazado este mes" value={summary.money.rejected} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-amber-400/30 bg-amber-400/[0.05] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-amber-200">Monto cotizado que necesita atención</p>
              <p className="mt-3 text-3xl font-black text-cream">{formatMoney(summary.money.risk)}</p>
              <p className="mt-1 text-base text-textSoft">{summary.money.riskCount} pacientes</p>
              <p className="mt-3 text-sm leading-6 text-textMuted">Presupuestos pendientes con seguimiento vencido, sin próxima acción o sin encargado. Cada presupuesto se cuenta una vez.</p>
              <Button className="mt-4" variant="secondary" type="button" onClick={() => onNavigate('leads')}>Ver pacientes</Button>
            </div>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-bold text-cream">Principal fuga este mes</h2>
          <div className="mt-4 space-y-3">
            {summary.lossRows.map((row) => (
              <div key={row.label} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-soft px-4 py-3">
                <span className="text-base text-textSoft">{row.label}</span><strong className="text-xl text-cream">{row.count}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" type="button" onClick={() => onNavigate('metrics')}><BarChart3 className="h-4 w-4" />Ver análisis detallado</Button>
      </div>
    </section>
  );
}

function MoneyCard({ label, value, note }) {
  return <Card className="p-5"><p className="text-sm font-semibold text-textMuted">{label}</p><p className="mt-3 text-2xl font-black text-cream">{formatMoney(value)}</p>{note ? <p className="mt-2 text-xs text-amber-200">{note}</p> : null}</Card>;
}
