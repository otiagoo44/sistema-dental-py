import { useMemo, useState } from 'react';
import {
  AlarmClock,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flame,
  ListChecks,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  UserRoundX,
  UsersRound,
} from 'lucide-react';
import { CONTACTED_STATUSES, SCHEDULED_STATUSES } from '../lib/constants';
import { formatMoney, normalizeText, todayIsoDate } from '../lib/formatters';
import { terminalStatuses, LEAD_STATUS, APPOINTMENT_STATUS, isOpenTask } from '../lib/crmDomain';
import { Select } from '../components/crm/CrmPrimitives';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

const FOLLOWUP_TASK_TYPES = ['followup', 'contact', 'no_show_recovery'];
const HIGH_TICKET_TERMS = ['implante', 'ortodoncia', 'carilla', 'protesis', 'estetica'];

export default function MetricsView({ leads, appointments, tasks, treatmentPrices }) {
  const [period, setPeriod] = useState('30d');
  const data = useMemo(() => buildMetrics({ leads, appointments, tasks, treatmentPrices, period }), [leads, appointments, tasks, treatmentPrices, period]);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Control comercial"
        title="Métricas"
        subtitle="Medí cómo la clínica está captando, siguiendo y recuperando oportunidades."
        action={(
          <div className="min-w-52">
            <Select
              label="Período"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'week', label: 'Esta semana' },
                { value: 'month', label: 'Este mes' },
                { value: '30d', label: 'Últimos 30 días' },
                { value: '90d', label: 'Últimos 90 días' },
                { value: 'year', label: 'Este año' },
              ]}
            />
          </div>
        )}
      />

      <Card className="overflow-hidden border-mint/20 bg-gradient-to-r from-[#1c1913] via-panel to-[#14151d] p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">Vista ejecutiva</p>
            <h3 className="mt-2 text-xl font-semibold text-cream sm:text-2xl">El sistema no sólo guarda leads: muestra dónde se protege valor comercial.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Usá estas señales para priorizar contactos, ajustar fuentes y detectar tratamientos con mayor oportunidad.</p>
          </div>
          <div className="rounded-2xl border border-mint/20 bg-mint/[0.07] px-5 py-4 md:text-right">
            <p className="text-xs font-semibold text-slate-500">Oportunidades bajo seguimiento</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-mint">{data.protected}</p>
          </div>
        </div>
      </Card>

      <MetricSection title="Captación" description="Volumen y calidad de las oportunidades que ingresaron en el período.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Leads totales" value={leads.length} icon={UsersRound} detail="Base activa visible para la clínica" />
          <StatCard label="Nuevos del período" value={data.periodLeads.length} icon={TrendingUp} detail="Ingresados desde cualquier fuente" />
          <StatCard label="Leads calientes" value={data.hotLeads} tone="danger" icon={Flame} detail="Intención comercial alta" />
          <StatCard label="Leads medios" value={data.mediumLeads} tone="gold" icon={UsersRound} />
          <StatCard label="Leads fríos" value={data.coldLeads} tone="cyan" icon={UsersRound} />
          <StatCard label="Fuentes activas" value={data.sourceRows.length} tone="purple" icon={MessageCircle} detail="Canales que generaron oportunidades" />
        </div>
      </MetricSection>

      <MetricSection title="Seguimiento" description="Estas son oportunidades que podrían perderse si no se atienden a tiempo.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Seguimientos pendientes" value={data.pendingFollowups} tone="gold" icon={ListChecks} detail="Con próxima acción o tarea abierta" />
          <StatCard label="Seguimientos vencidos" value={data.overdueFollowups} tone="danger" icon={AlarmClock} detail="Necesitan acción para no enfriarse" />
          <StatCard label="Seguimientos completados" value={data.completedFollowups} tone="success" icon={CheckCircle2} />
          <StatCard label="Leads sin contactar" value={data.uncontacted.length} tone="gold" icon={UserRoundX} />
          <StatCard label="Calientes sin contactar" value={data.hotUncontacted} tone="danger" icon={Flame} detail="Atender primero" />
          <StatCard label="Tareas abiertas" value={data.openTasks} tone="cyan" icon={ListChecks} />
          <StatCard label="Tareas vencidas" value={data.overdueTasks} tone="danger" icon={Clock3} />
        </div>
      </MetricSection>

      <MetricSection title="Agenda" description="Actividad de turnos y capacidad de recuperación de inasistencias.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Citas agendadas" value={data.periodAppointments.length} tone="purple" icon={CalendarCheck2} />
          <StatCard label="Confirmadas" value={data.confirmed} tone="cyan" icon={CheckCircle2} />
          <StatCard label="Asistieron" value={data.attended.length} tone="success" icon={CheckCircle2} />
          <StatCard label="No asistieron" value={data.noShows.length} tone="danger" icon={UserRoundX} />
          <StatCard label="Reprogramadas" value={data.rescheduled} tone="gold" icon={RefreshCw} />
          <StatCard label="Tasa de asistencia" value={`${data.attendanceRate}%`} tone="success" icon={TrendingUp} detail="Asistencias sobre citas con resultado" />
        </div>
      </MetricSection>

      <MetricSection title="Conversión comercial" description="Embudo observado con los estados disponibles en la CRM.">
        <Card className="overflow-hidden">
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {data.funnel.map((step, index) => (
              <div key={step.label} className="relative bg-panel p-5 transition hover:bg-elevated">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-mint/20 bg-mint/10 text-xs font-bold text-mint">{index + 1}</span>
                  <span className="text-xs font-bold text-slate-500">{step.rate}%</span>
                </div>
                <p className="mt-5 text-xs font-semibold text-slate-500">{step.label}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-cream">{step.value}</p>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">{step.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </MetricSection>

      <MetricSection title="Fuentes y tratamientos" description="Qué canales y servicios generan oportunidades y avance hacia agenda.">
        <div className="grid gap-5 2xl:grid-cols-2">
          <MetricDataTable
            title="Fuentes que generan oportunidades"
            description="Compará volumen, calidad y conversión a agenda por canal."
            columns={['Fuente', 'Leads', 'Calientes', 'Agendados', 'Sin contacto', 'Conv. agenda']}
            rows={data.sourceRows.map((row) => [row.label, row.leads, row.hot, row.scheduled, row.uncontacted, `${row.conversion}%`])}
          />
          <MetricDataTable
            title="Tratamientos más solicitados"
            description="Identificá qué tratamientos concentran intención y valor potencial."
            columns={['Tratamiento', 'Leads', 'Calientes', 'Agendados', 'No-shows', 'Valor potencial']}
            rows={data.treatmentRows.map((row) => [row.label, row.leads, row.hot, row.scheduled, row.noShows, row.potential ? formatMoney(row.potential) : 'No configurado'])}
          />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <MetricBreakdown title="Leads por fuente" entries={data.sourceCounts} total={data.periodLeads.length} />
          <MetricBreakdown title="Leads por tratamiento" entries={data.treatmentCounts} total={data.periodLeads.length} />
          <MetricBreakdown title="Clasificación" entries={data.classificationCounts} total={data.periodLeads.length} />
        </div>
      </MetricSection>

      <MetricSection title="Valor percibido" description="Señales operativas que muestran oportunidades protegidas, sin prometer ingresos.">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-cream">Impacto comercial bajo seguimiento</h3>
                <p className="mt-1 text-sm text-slate-500">Indicadores internos generados con actividad real de la CRM.</p>
              </div>
              <CircleDollarSign className="h-6 w-6 text-mint" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <ValueSignal label="Alto ticket detectado" value={data.highTicket} detail="Tratamientos de mayor valor potencial" />
              <ValueSignal label="Calientes priorizados" value={data.hotLeads} detail="Intención alta detectada" />
              <ValueSignal label="Recuperados por seguimiento" value={data.recoveredFollowups} detail="Señal operativa por tarea completada y avance" />
              <ValueSignal label="No-shows con recuperación" value={data.noShowRecoveries} detail="Con tarea de recuperación creada" />
              <ValueSignal label="WhatsApp/manual registrados" value={data.manualTracked} detail="Consultas dentro del circuito comercial" />
              <ValueSignal label="Oportunidades bajo seguimiento" value={data.protected} detail="Con tarea o próxima acción" />
            </div>
          </Card>

          <Card className="border-mint/25 bg-gradient-to-br from-[#211c13] via-[#161923] to-[#17131f] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">Estimación interna</p>
            <h3 className="mt-2 text-lg font-semibold text-cream">Valor potencial estimado bajo seguimiento</h3>
            <p className="mt-5 text-4xl font-bold tracking-tight text-mint">{data.hasPotentialConfig ? formatMoney(data.potential) : 'No configurado'}</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">Basado en el valor del lead o precios conservadores configurados por tratamiento. No representa ingreso confirmado.</p>
            <div className="mt-5 border-t border-mint/15 pt-4 text-sm text-slate-600">{data.lost} oportunidades perdidas · {data.reactivated} en reactivación</div>
          </Card>
        </div>
      </MetricSection>
    </section>
  );
}

function buildMetrics({ leads, appointments, tasks, treatmentPrices, period }) {
  const now = new Date();
  const today = todayIsoDate();
  const starts = {
    week: new Date(now.getTime() - 7 * 86400000),
    month: new Date(`${today.slice(0, 7)}-01T00:00:00`),
    '30d': new Date(now.getTime() - 30 * 86400000),
    '90d': new Date(now.getTime() - 90 * 86400000),
    year: new Date(`${today.slice(0, 4)}-01-01T00:00:00`),
  };
  const start = starts[period] || starts['30d'];
  const periodLeads = leads.filter((lead) => new Date(lead.created_at) >= start);
  const periodAppointments = appointments.filter((item) => new Date(item.created_at || `${item.appointment_date}T12:00:00`) >= start);
  const periodTasks = tasks.filter((task) => new Date(task.created_at || task.due_at || 0) >= start);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const contacted = periodLeads.filter((lead) => lead.last_contact_at || CONTACTED_STATUSES.includes(lead.status));
  const uncontacted = periodLeads.filter((lead) => !lead.last_contact_at && ['Nuevo', 'No Contactado'].includes(lead.status));
  const attended = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.attended);
  const noShows = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.noShow);
  const attendanceBase = attended.length + noShows.length;
  const scheduledLeadIds = new Set(periodAppointments.map((item) => item.lead_id));
  const attendedLeadIds = new Set(attended.map((item) => item.lead_id));
  const noShowLeadIds = new Set(noShows.map((item) => item.lead_id));
  const openTasks = periodTasks.filter(isOpenTask);
  const completedFollowupTasks = periodTasks.filter((task) => task.status === 'hecho' && FOLLOWUP_TASK_TYPES.includes(task.type));
  const openFollowupTasks = periodTasks.filter((task) => isOpenTask(task) && FOLLOWUP_TASK_TYPES.includes(task.type));
  const pendingFollowupLeadIds = new Set(openFollowupTasks.map((task) => task.lead_id).filter(Boolean));
  periodLeads.forEach((lead) => {
    if (lead.next_followup_at && !terminalStatuses.includes(lead.status)) pendingFollowupLeadIds.add(lead.id);
  });
  const overdueFollowupLeadIds = new Set(openFollowupTasks.filter((task) => task.due_at && new Date(task.due_at) < now).map((task) => task.lead_id).filter(Boolean));
  periodLeads.forEach((lead) => {
    if (lead.next_followup_at && new Date(lead.next_followup_at) < now && !terminalStatuses.includes(lead.status)) overdueFollowupLeadIds.add(lead.id);
  });
  const priceByTreatment = Object.fromEntries((treatmentPrices || []).map((item) => [normalizeText(item.treatment), Number(item.estimated_price || 0)]));
  const leadPotential = (lead) => Number(lead.estimated_value || priceByTreatment[normalizeText(lead.treatment)] || 0);
  const underFollowup = periodLeads.filter((lead) => !terminalStatuses.includes(lead.status));
  const potential = underFollowup.reduce((sum, lead) => sum + leadPotential(lead), 0);
  const protectedLeads = underFollowup.filter((lead) => lead.next_followup_at || tasks.some((task) => task.lead_id === lead.id && isOpenTask(task)));
  const progressedStatuses = new Set([...CONTACTED_STATUSES, ...SCHEDULED_STATUSES, 'Tratamiento Iniciado']);
  const recoveredFollowups = new Set(completedFollowupTasks.filter((task) => progressedStatuses.has(leadById.get(task.lead_id)?.status)).map((task) => task.lead_id).filter(Boolean)).size;
  const noShowRecoveryLeadIds = new Set(tasks.filter((task) => task.type === 'no_show_recovery').map((task) => task.lead_id).filter(Boolean));
  const sourceRows = buildRows(periodLeads, sourceGroup, { scheduledLeadIds, noShowLeadIds, leadPotential });
  const treatmentRows = buildRows(periodLeads, (lead) => lead.treatment || 'Sin tratamiento', { scheduledLeadIds, noShowLeadIds, leadPotential });
  const hotLeads = periodLeads.filter((lead) => lead.classification === 'Lead Caliente').length;
  const scheduled = periodLeads.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length;
  const attendedCount = periodLeads.filter((lead) => attendedLeadIds.has(lead.id) || lead.status === LEAD_STATUS.attended).length;
  const won = periodLeads.filter((lead) => lead.status === 'Tratamiento Iniciado').length;
  const lost = periodLeads.filter((lead) => lead.status === 'Perdido').length;
  const funnelValues = [periodLeads.length, contacted.length, scheduled, attendedCount, won, lost];
  const funnelLabels = ['Nuevo', 'Contactado', 'Agendado', 'Asistió', 'Tratamiento iniciado', 'Perdido'];
  const funnelDetails = ['Base de oportunidades', 'Con contacto registrado', 'Con cita o estado de agenda', 'Con asistencia registrada', 'Estado disponible más cercano a ganado', 'Fuera del circuito comercial'];
  const funnel = funnelLabels.map((label, index) => {
    const denominator = index === funnelLabels.length - 1 ? funnelValues[0] : (index ? funnelValues[index - 1] : funnelValues[0]);
    return { label, value: funnelValues[index], rate: denominator ? Math.round((funnelValues[index] / denominator) * 100) : 0, detail: funnelDetails[index] };
  });

  return {
    periodLeads,
    periodAppointments,
    hotLeads,
    mediumLeads: periodLeads.filter((lead) => lead.classification === 'Lead Medio').length,
    coldLeads: periodLeads.filter((lead) => lead.classification === 'Lead Frío').length,
    contacted,
    uncontacted,
    hotUncontacted: uncontacted.filter((lead) => lead.classification === 'Lead Caliente').length,
    pendingFollowups: pendingFollowupLeadIds.size,
    overdueFollowups: overdueFollowupLeadIds.size,
    completedFollowups: completedFollowupTasks.length,
    openTasks: openTasks.length,
    overdueTasks: openTasks.filter((task) => task.due_at && new Date(task.due_at) < now).length,
    attended,
    noShows,
    confirmed: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length,
    rescheduled: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length,
    attendanceRate: attendanceBase ? Math.round((attended.length / attendanceBase) * 100) : 0,
    lost,
    reactivated: periodLeads.filter((lead) => lead.status === 'Reactivar 30d').length,
    recoveredFollowups,
    noShowRecoveries: [...noShowLeadIds].filter((leadId) => noShowRecoveryLeadIds.has(leadId)).length,
    manualTracked: periodLeads.filter((lead) => ['WhatsApp directo', 'Manual / Otro'].includes(sourceGroup(lead)) && !terminalStatuses.includes(lead.status)).length,
    highTicket: periodLeads.filter((lead) => HIGH_TICKET_TERMS.some((term) => normalizeText(lead.treatment).includes(term))).length,
    protected: protectedLeads.length,
    potential,
    hasPotentialConfig: potential > 0 || Object.values(priceByTreatment).some((value) => value > 0),
    sourceRows,
    treatmentRows,
    sourceCounts: sourceRows.map((row) => [row.label, row.leads]),
    treatmentCounts: treatmentRows.map((row) => [row.label, row.leads]),
    classificationCounts: countBy(periodLeads, (lead) => lead.classification || 'Sin clasificación'),
    funnel,
  };
}

function sourceGroup(lead) {
  const source = normalizeText(lead.source || '');
  if (source.includes('formulario')) return 'Formulario web';
  if (source.includes('whatsapp')) return 'WhatsApp directo';
  if (source.includes('instagram')) return 'Instagram DM';
  if (source.includes('llamada')) return 'Llamada';
  if (source.includes('recomend')) return 'Recomendación';
  return 'Manual / Otro';
}

function buildRows(items, selector, { scheduledLeadIds, noShowLeadIds, leadPotential }) {
  const groups = items.reduce((acc, lead) => {
    const label = selector(lead);
    if (!acc[label]) acc[label] = [];
    acc[label].push(lead);
    return acc;
  }, {});
  return Object.entries(groups).map(([label, group]) => {
    const scheduled = group.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length;
    return {
      label,
      leads: group.length,
      hot: group.filter((lead) => lead.classification === 'Lead Caliente').length,
      scheduled,
      uncontacted: group.filter((lead) => !lead.last_contact_at && ['Nuevo', 'No Contactado'].includes(lead.status)).length,
      noShows: group.filter((lead) => noShowLeadIds.has(lead.id) || lead.status === LEAD_STATUS.noShow).length,
      conversion: group.length ? Math.round((scheduled / group.length) * 100) : 0,
      potential: group.reduce((sum, lead) => sum + leadPotential(lead), 0),
    };
  }).sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
}

function countBy(items, selector) {
  return Object.entries(items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
}

function MetricSection({ title, description, children }) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-lg font-semibold tracking-[-0.015em] text-cream">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetricBreakdown({ title, entries, total }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold text-cream">{title}</h3>
      <div className="mt-5 space-y-4">
        {entries.length ? entries.slice(0, 8).map(([label, value]) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-600">{label}</span><span className="font-bold text-cream">{value}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${total ? Math.max(4, Math.round((value / total) * 100)) : 0}%` }} /></div>
          </div>
        )) : <p className="text-sm text-slate-500">Sin datos en este período.</p>}
      </div>
    </Card>
  );
}

function MetricDataTable({ title, description, columns, rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h3 className="font-bold text-cream">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {rows.length ? (
        <div className="scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500">
              <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-bold first:pl-5 last:pr-5">{column}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => (
                <tr key={row[0]} className="transition hover:bg-slate-50">
                  {row.map((cell, index) => <td key={`${row[0]}-${columns[index]}`} className={`whitespace-nowrap px-4 py-3 first:pl-5 last:pr-5 ${index === 0 ? 'font-semibold text-cream' : index === row.length - 1 ? 'font-semibold text-mint' : 'text-slate-600'}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-5 text-sm text-slate-500">Sin datos para comparar en este período.</p>}
    </Card>
  );
}

function ValueSignal({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-mint/20 hover:bg-elevated">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-cream">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}
