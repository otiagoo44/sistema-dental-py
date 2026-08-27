import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, Clock3, Info } from 'lucide-react';
import { buildAnalytics, formatDurationMinutes } from '../lib/analytics';
import { formatMoney } from '../lib/formatters';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

const TABS = [
  ['funnel', 'Embudo'],
  ['sources', 'Fuentes'],
  ['treatments', 'Tratamientos'],
  ['team', 'Equipo'],
  ['losses', 'Pérdidas'],
];

export default function MetricsView({ leads, appointments, tasks, quotes = [], workspaceEvents = [], profiles = [], onNavigate }) {
  const [period, setPeriod] = useState('30d');
  const [tab, setTab] = useState('funnel');
  const data = useMemo(() => buildAnalytics({ leads, appointments, tasks, quotes, events: workspaceEvents, profiles, period }), [leads, appointments, tasks, quotes, workspaceEvents, profiles, period]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Análisis"
        title="Dónde se está frenando el proceso"
        subtitle="Métricas comerciales con denominadores explícitos. Los montos son presupuestos, no cobros."
        action={<PeriodControl value={period} onChange={setPeriod} />}
      />

      <div className="scrollbar-soft flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Secciones de análisis">
        {TABS.map(([id, label]) => (
          <button key={id} className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === id ? 'border-mint text-cream' : 'border-transparent text-textMuted hover:text-cream'}`} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'funnel' ? <FunnelAnalysis data={data} onNavigate={onNavigate} /> : null}
      {tab === 'sources' ? <SourcesAnalysis data={data} /> : null}
      {tab === 'treatments' ? <TreatmentsAnalysis data={data} /> : null}
      {tab === 'team' ? <TeamAnalysis data={data} /> : null}
      {tab === 'losses' ? <LossAnalysis data={data} onNavigate={onNavigate} /> : null}
    </section>
  );
}

function PeriodControl({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-card p-1" aria-label="Período">
      {[['7d', '7 días'], ['30d', '30 días'], ['90d', '90 días']].map(([id, label]) => <button key={id} className={`min-h-9 rounded-md px-3 text-sm font-semibold ${value === id ? 'bg-mint text-inverse' : 'text-textMuted hover:bg-elevated hover:text-cream'}`} type="button" onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

function FunnelAnalysis({ data, onNavigate }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-cream">Embudo</h2><p className="mt-1 text-sm text-textMuted">Cohorte de consultas creadas dentro del período.</p></div>
          <div>
            {data.funnel.map((step, index) => (
              <details key={step.label} className="border-b border-slate-200 last:border-b-0">
                <summary className="grid min-h-[72px] cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-4 px-5 py-3">
                  <span><strong className="block text-base text-cream">{step.label}</strong>{index ? <span className="mt-1 flex items-center gap-1 text-sm text-mint"><ArrowDown className="h-3.5 w-3.5" />{step.rate}% de la etapa anterior</span> : <span className="mt-1 block text-sm text-textMuted">Base del período</span>}</span>
                  <strong className="text-2xl text-cream">{step.value}</strong>
                </summary>
                <p className="border-t border-slate-200 bg-soft px-5 py-3 text-sm leading-6 text-textMuted">{step.definition}{index ? ` ${step.value} de ${step.denominator}.` : ''}</p>
              </details>
            ))}
          </div>
        </Card>

        <Card className="h-fit border-amber-400/30 bg-amber-400/[0.05] p-5">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
          <p className="mt-3 text-xs font-bold uppercase text-amber-200">Mayor caída del embudo</p>
          {data.bottleneck ? <><h2 className="mt-2 text-2xl font-black text-cream">{data.bottleneck.stage}</h2><p className="mt-2 text-base leading-6 text-textSoft">{data.bottleneck.message}</p><p className="mt-2 text-sm text-textMuted">{data.bottleneck.rate}% avanzó; {data.bottleneck.drop} no avanzaron dentro del período observado.</p>{data.bottleneck.denominator < 10 ? <p className="mt-2 text-xs text-amber-200">Muestra pequeña; revisar sin asumir una tendencia definitiva.</p> : null}</> : <p className="mt-2 text-sm text-textMuted">Todavía no hay suficiente volumen para calcularla.</p>}
          <Button className="mt-4" variant="secondary" type="button" onClick={() => onNavigate('pending')}>Ver pendientes<ArrowRight className="h-4 w-4" /></Button>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-bold text-cream">Métricas operativas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricDetail label="Contact rate" value={`${data.metrics.contactRate}%`} comparison={data.comparisons.contactRate} detail={`${data.funnel[1].value} de ${data.funnel[0].value} consultas válidas tuvieron contacto real.`} />
          <MetricDetail label="Booking rate" value={`${data.metrics.bookingRate}%`} comparison={data.comparisons.bookingRate} detail={`${data.funnel[2].value} de ${data.funnel[1].value} personas contactadas agendaron.`} />
          <MetricDetail label="Show rate" value={`${data.metrics.showRate}%`} comparison={data.comparisons.showRate} detail={`${data.counts.attendedAppointments} de ${data.counts.occurredAppointments} citas que ya debían ocurrir terminaron en asistencia.`} />
          <MetricDetail label="Aceptación de presupuestos" value={`${data.metrics.acceptanceRate}%`} comparison={data.comparisons.acceptanceRate} detail={`${data.counts.acceptedQuotes} de ${data.counts.eligibleQuotes} presupuestos emitidos elegibles fueron aceptados.`} />
        </div>
        <details className="mt-3 rounded-lg border border-slate-200 bg-card">
          <summary className="min-h-12 cursor-pointer px-5 py-4 text-sm font-bold text-textSoft">Más métricas operativas</summary>
          <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricDetail label="Speed to lead" value={formatDurationMinutes(data.metrics.speedToLeadMedian)} detail={`Mediana desde consulta hasta primer contacto. P90: ${formatDurationMinutes(data.metrics.speedToLeadP90)}.`} />
            <MetricDetail label="Quote rate" value={`${data.metrics.quoteRate}%`} detail={`${data.funnel[4].value} de ${data.funnel[3].value} pacientes que asistieron recibieron presupuesto.`} />
            <MetricDetail label="Tratamiento iniciado" value={`${data.metrics.startedRate}%`} detail={`${data.funnel[6].value} de ${data.funnel[5].value} pacientes con aceptación iniciaron tratamiento.`} />
            <MetricDetail label="Seguimientos a tiempo" value={`${data.metrics.followupRate}%`} detail={`${data.counts.followupsOnTime} de ${data.counts.followupsDue} acciones vencidas en el período se completaron a tiempo.`} />
            <MetricDetail label="No-show rate" value={`${data.metrics.noShowRate}%`} detail={`${data.counts.noShows} de ${data.counts.occurredAppointments} citas ocurridas quedaron como no asistencia.`} />
            <MetricDetail label="Seguimiento de presupuesto" value={formatDurationMinutes(data.metrics.quoteFollowupMedian)} detail="Mediana desde emisión del presupuesto hasta completar su primer seguimiento registrado." />
            <MetricDetail label="Pacientes recuperados después de seguimiento" value={data.recoveredAfterFollowup} detail="Secuencia demostrable: no-show o intento sin respuesta, seguido por un avance comercial posterior." />
          </div>
        </details>
      </section>

      <section>
        <h2 className="text-lg font-bold text-cream">Calidad del lead</h2>
        <p className="mt-1 text-sm text-textMuted">Sirve para comprobar si la temperatura realmente predice avance.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{data.qualityRows.map((row) => <Card key={row.label} className="p-4"><p className="text-base font-bold text-cream">{row.label}</p><p className="mt-1 text-2xl font-black text-cream">{row.consultations}</p><p className="mt-3 text-sm text-textMuted">{row.bookingRate}% agenda · {row.startedRate}% inicia tratamiento</p>{row.consultations < 10 ? <p className="mt-2 text-xs text-amber-200">Muestra pequeña; no sacar conclusiones todavía.</p> : null}</Card>)}</div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-cream">Presupuestos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MoneyMetric label="Monto presupuestado" value={data.money.quoted} />
          <MoneyMetric label="Monto pendiente" value={data.money.pending} />
          <MoneyMetric label="Monto aceptado" value={data.money.accepted} note="Aceptado ≠ cobrado" />
          <MoneyMetric label="Monto rechazado" value={data.money.rejected} />
          <MoneyMetric label="Necesita atención" value={data.money.attention} />
        </div>
      </section>
    </div>
  );
}

function SourcesAnalysis({ data }) {
  return (
    <div className="space-y-5">
      <AnalysisList title="Fuentes registradas" description="La fuente agrupa variantes históricas sin reescribir los datos originales." rows={data.sourceRows} fields={[
        ['Consultas', 'consultations'], ['Score promedio', 'averageScore'], ['Calientes', 'hotRate', '%'], ['Agendamiento', 'bookingRate', '%'], ['Asistencia', 'showRate', '%'], ['Presupuesto', 'quoteRate', '%'], ['Aceptación', 'acceptanceRate', '%'],
      ]} />
      <details className="rounded-lg border border-slate-200 bg-card">
        <summary className="min-h-12 cursor-pointer px-5 py-4 font-bold text-cream">Campañas UTM registradas ({data.utmRows.length})</summary>
        <div className="border-t border-slate-200 p-4">
          <p className="mb-4 text-sm leading-6 text-textMuted">Esto muestra atribución básica registrada en la URL. No demuestra por sí sola qué anuncio causó una venta.</p>
          {data.utmRows.length ? <AnalysisCards rows={data.utmRows} fields={[["Consultas", 'consultations'], ['Agendamiento', 'bookingRate', '%'], ['Iniciaron', 'startedRate', '%']]} /> : <EmptyState title="Sin UTMs en el período" text="Las nuevas consultas capturarán UTMs automáticamente cuando existan en la URL." />}
        </div>
      </details>
    </div>
  );
}

function TreatmentsAnalysis({ data }) {
  return <AnalysisList title="Tratamientos" description="Interés y avance comercial por tratamiento, sin inferir rentabilidad." rows={data.treatmentRows} fields={[
    ['Consultas', 'consultations'], ['Score promedio', 'averageScore'], ['Agendamiento', 'bookingRate', '%'], ['Asistencia', 'showRate', '%'], ['Presupuestos', 'quoteCount'], ['Aceptación', 'acceptanceRate', '%'], ['Monto cotizado', 'quotedAmount', 'money'],
  ]} />;
}

function TeamAnalysis({ data }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-cream">Proceso por encargado</h2>
      <p className="mt-1 text-sm text-textMuted">Datos operativos para detectar problemas de proceso, sin ranking ni puntuación pública.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.teamRows.map((row) => <Card key={row.id} className="p-4"><h3 className="font-bold text-cream">{row.label}</h3><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><SmallMetric label="Consultas" value={row.consultations} /><SmallMetric label="Respuesta mediana" value={formatDurationMinutes(row.medianResponseMinutes)} /><SmallMetric label="Contact rate" value={`${row.contactRate}%`} /><SmallMetric label="Seguimientos al día" value={`${row.followupRate}%`} /><SmallMetric label="Citas agendadas" value={row.booked} /><SmallMetric label="Show rate" value={`${row.showRate}%`} /></div></Card>)}
      </div>
    </section>
  );
}

function LossAnalysis({ data, onNavigate }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-bold text-cream">Motivos de pérdida</h2><p className="mt-1 text-sm text-textMuted">Distribución de pacientes marcados como perdidos dentro del período.</p></div><Button variant="secondary" type="button" onClick={() => onNavigate('leads')}>Ver pacientes<ArrowRight className="h-4 w-4" /></Button></div>
      {data.lossRows.length ? <div className="mt-4 space-y-2">{data.lossRows.map((row) => <Card key={row.label} className="flex items-center justify-between gap-4 p-4"><span><strong className="text-cream">{row.label}</strong><span className="mt-1 block text-sm text-textMuted">{row.rate}% de las pérdidas</span></span><strong className="text-2xl text-cream">{row.count}</strong></Card>)}</div> : <EmptyState title="Sin pérdidas registradas" text="No hay motivos de pérdida dentro de este período." />}
    </section>
  );
}

function MetricDetail({ label, value, comparison, detail }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-card">
      <summary className="min-h-[112px] cursor-pointer list-none p-4"><span className="flex items-center gap-1.5 text-sm font-semibold text-textMuted">{label}<Info className="h-3.5 w-3.5" /></span><strong className="mt-2 block text-2xl text-cream">{value}</strong>{comparison !== null && comparison !== undefined ? <span className="mt-2 block text-xs text-mint">{comparison > 0 ? '+' : ''}{comparison} puntos vs período anterior</span> : null}</summary>
      <p className="border-t border-slate-200 bg-soft p-4 text-sm leading-6 text-textMuted">{detail}</p>
    </details>
  );
}

function MoneyMetric({ label, value, note }) {
  return <Card className="p-4"><p className="text-sm font-semibold text-textMuted">{label}</p><p className="mt-2 text-xl font-black text-cream">{formatMoney(value)}</p>{note ? <p className="mt-1 text-xs text-amber-200">{note}</p> : null}</Card>;
}

function AnalysisList({ title, description, rows, fields }) {
  return <section><h2 className="text-lg font-bold text-cream">{title}</h2><p className="mt-1 text-sm text-textMuted">{description}</p>{rows.length ? <div className="mt-4"><AnalysisCards rows={rows} fields={fields} /></div> : <EmptyState title="Sin datos en este período" text="Elegí otro período o esperá nuevas consultas." />}</section>;
}

function AnalysisCards({ rows, fields }) {
  return <div className="grid gap-3 lg:grid-cols-2">{rows.map((row) => <details key={row.label} className="rounded-lg border border-slate-200 bg-card"><summary className="flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 p-4"><span><strong className="text-base text-cream">{row.label}</strong><span className="mt-1 block text-sm text-textMuted">{row.consultations} consultas</span></span><ArrowRight className="h-4 w-4 text-mint" /></summary><div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-4 sm:grid-cols-3">{fields.map(([label, key, suffix]) => <SmallMetric key={key} label={label} value={suffix === 'money' ? formatMoney(row[key]) : `${row[key]}${suffix || ''}`} />)}</div></details>)}</div>;
}

function SmallMetric({ label, value }) {
  return <div><p className="text-xs font-semibold text-textMuted">{label}</p><p className="mt-1 text-base font-bold text-cream">{value}</p></div>;
}
