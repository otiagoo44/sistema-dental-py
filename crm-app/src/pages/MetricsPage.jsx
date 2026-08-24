import { useMemo, useState } from 'react';
import { AlarmClock, CalendarCheck2, CheckCircle2, CircleDollarSign, Clipboard, Clock3, Flame, ListChecks, MessageCircle, RefreshCw, ShieldCheck, TrendingUp, UserCheck, UserRoundX, UsersRound } from 'lucide-react';
import { CONTACTED_STATUSES, SCHEDULED_STATUSES } from '../lib/constants';
import { formatMoney, normalizeText, todayIsoDate } from '../lib/formatters';
import { buildWeeklyReportText, getReportPeriodLabel } from '../lib/commercialInsights';
import { terminalStatuses, LEAD_STATUS, APPOINTMENT_STATUS, isArchivedLead, isOpenTask } from '../lib/crmDomain';
import { Select } from '../components/crm/CrmPrimitives';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

const FOLLOWUP_TASK_TYPES = ['followup', 'contact', 'no_show_recovery'];
const HIGH_TICKET_TERMS = ['implante', 'ortodoncia', 'carilla', 'protesis', 'estetica'];
const METRIC_TABS = [['summary', 'Resumen'], ['sources', 'Fuentes'], ['treatments', 'Tratamientos'], ['responsibles', 'Responsables'], ['reports', 'Reportes']];

export default function MetricsView({ leads, appointments, tasks, treatmentPrices, profiles, clinic }) {
  const [period, setPeriod] = useState('30d');
  const [tab, setTab] = useState('summary');
  const [copied, setCopied] = useState(false);
  const data = useMemo(() => buildMetrics({ leads, appointments, tasks, treatmentPrices, profiles, period }), [leads, appointments, tasks, treatmentPrices, profiles, period]);
  const report = useMemo(() => buildWeeklyReportText({ clinicName: clinic?.name, label: getReportPeriodLabel(period), data }), [clinic?.name, data, period]);

  async function copyReport() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Control comercial" title="Métricas" subtitle="Medí cómo la clínica está captando, siguiendo y recuperando oportunidades." action={<div className="min-w-52"><Select label="Período" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Esta semana' }, { value: 'previous_week', label: 'Semana pasada' }, { value: 'month', label: 'Este mes' }, { value: '30d', label: 'Últimos 30 días' }, { value: '90d', label: 'Últimos 90 días' }, { value: 'year', label: 'Este año' }]} /></div>} />

      <div className="scrollbar-soft flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-card p-2" aria-label="Secciones de métricas">
        {METRIC_TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-mint text-inverse' : 'text-textSoft hover:bg-elevated hover:text-cream'}`}>{label}</button>)}
      </div>

      {tab === 'summary' ? <Summary data={data} /> : null}
      {tab === 'sources' ? <Sources data={data} /> : null}
      {tab === 'treatments' ? <Treatments data={data} /> : null}
      {tab === 'responsibles' ? <Responsibles data={data} /> : null}
      {tab === 'reports' ? <WeeklyReport report={report} copied={copied} onCopy={copyReport} data={data} /> : null}
    </section>
  );
}

function Summary({ data }) {
  return (
    <div className="space-y-8">
      <Card className={`overflow-hidden border-mint/30 bg-gradient-to-br from-card via-elevated to-hover p-5 sm:p-6 ${data.health.tone === 'critical' ? 'border-rose-400/30' : data.health.tone === 'attention' ? 'border-amber-400/30' : ''}`}>
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">Panel del dueño</p><h3 className="mt-2 text-xl font-semibold text-cream sm:text-2xl">Salud comercial: {data.health.label}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{data.health.reason}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><ExecutiveMini label="Entraron" value={data.periodLeads.length} /><ExecutiveMini label="Contactados" value={data.contacted.length} /><ExecutiveMini label="Agendados" value={data.scheduled} /><ExecutiveMini label="Asistieron" value={data.attended.length} /><ExecutiveMini label="Sin contacto" value={data.uncontacted.length} /><ExecutiveMini label="Urgentes vencidos" value={data.overdueFollowups} /></div>
        </div>
      </Card>

      <MetricSection title="Captación" description="Volumen y calidad de las oportunidades que ingresaron en el período."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"><StatCard label="Leads totales" value={data.activeLeadTotal} icon={UsersRound} detail="Base activa visible para la clínica" /><StatCard label="Nuevos del período" value={data.periodLeads.length} icon={TrendingUp} /><StatCard label="Leads calientes" value={data.hotLeads} tone="danger" icon={Flame} /><StatCard label="Leads medios" value={data.mediumLeads} tone="gold" icon={UsersRound} /><StatCard label="Leads fríos" value={data.coldLeads} tone="cyan" icon={UsersRound} /><StatCard label="Respuesta promedio" value={data.averageResponseLabel} tone="purple" icon={Clock3} /></div></MetricSection>

      <MetricSection title="Seguimiento" description="Estas son oportunidades que podrían perderse si no se atienden a tiempo."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Seguimientos pendientes" value={data.pendingFollowups} tone="gold" icon={ListChecks} /><StatCard label="Seguimientos vencidos" value={data.overdueFollowups} tone="danger" icon={AlarmClock} /><StatCard label="Seguimientos completados" value={data.completedFollowups} tone="success" icon={CheckCircle2} /><StatCard label="Leads sin contactar" value={data.uncontacted.length} tone="gold" icon={UserRoundX} /><StatCard label="Calientes sin contactar" value={data.hotUncontacted} tone="danger" icon={Flame} /><StatCard label="Tareas abiertas" value={data.openTasks} tone="cyan" icon={ListChecks} /><StatCard label="Tareas vencidas" value={data.overdueTasks} tone="danger" icon={Clock3} /></div></MetricSection>

      <MetricSection title="Agenda" description="Actividad de turnos y capacidad de recuperación de inasistencias."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"><StatCard label="Citas agendadas" value={data.periodAppointments.length} tone="purple" icon={CalendarCheck2} /><StatCard label="Confirmadas" value={data.confirmed} tone="cyan" icon={CheckCircle2} /><StatCard label="Asistieron" value={data.attended.length} tone="success" icon={CheckCircle2} /><StatCard label="No asistieron" value={data.noShows.length} tone="danger" icon={UserRoundX} /><StatCard label="Reprogramadas" value={data.rescheduled} tone="gold" icon={RefreshCw} /><StatCard label="Tasa de asistencia" value={`${data.attendanceRate}%`} tone="success" icon={TrendingUp} /></div></MetricSection>

      <MetricSection title="Conversión comercial" description="Embudo observado con los estados disponibles en la CRM."><Card className="overflow-hidden"><div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{data.funnel.map((step, index) => <div key={step.label} className="relative bg-panel p-5 transition hover:bg-elevated"><div className="flex items-center justify-between gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-mint/20 bg-mint/10 text-xs font-bold text-mint">{index + 1}</span><span className="text-xs font-bold text-slate-500">{step.rate}%</span></div><p className="mt-5 text-xs font-semibold text-slate-500">{step.label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-cream">{step.value}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">{step.detail}</p></div>)}</div></Card></MetricSection>

      <MetricSection title="Dónde se pierden oportunidades" description="Estos son los motivos que más están haciendo perder oportunidades."><div className="grid gap-5 xl:grid-cols-2"><MetricBreakdown title="Motivos de pérdida" entries={data.lossReasonCounts} total={data.periodLost.length} /><MetricBreakdown title="Tratamientos más perdidos" entries={data.lostTreatmentCounts} total={data.periodLost.length} /></div></MetricSection>

      <MetricSection title="Valor bajo seguimiento" description="Señales operativas que muestran oportunidades protegidas, sin prometer ingresos."><div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><Card className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-cream">Impacto comercial bajo seguimiento</h3><p className="mt-1 text-sm text-slate-500">Indicadores internos generados con actividad real.</p></div><ShieldCheck className="h-6 w-6 text-mint" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><ValueSignal label="Alto ticket detectado" value={data.highTicket} detail="Tratamientos de mayor valor potencial" /><ValueSignal label="Calientes priorizados" value={data.hotLeads} detail="Intención alta detectada" /><ValueSignal label="Recuperados por seguimiento" value={data.recoveredFollowups} detail="Tarea completada y avance comercial" /><ValueSignal label="No-shows recuperados" value={data.noShowRecoveries} detail="Con una cita posterior o tarea de recuperación" /><ValueSignal label="WhatsApp/manual registrados" value={data.manualTracked} detail="Consultas dentro del circuito" /><ValueSignal label="Oportunidades bajo seguimiento" value={data.protected} detail="Con tarea o próxima acción" /></div></Card><Card className="border-mint/30 bg-gradient-to-br from-card via-elevated to-hover p-6"><CircleDollarSign className="h-6 w-6 text-mint" /><p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-mint">Estimación interna</p><h3 className="mt-2 text-lg font-semibold text-cream">Valor potencial estimado</h3><p className="mt-5 text-4xl font-bold tracking-tight text-mint">{data.hasPotentialConfig ? formatMoney(data.potential) : 'No configurado'}</p><p className="mt-4 text-sm leading-6 text-slate-500">Basado en tratamientos configurados. Estimación interna, no ingreso confirmado.</p></Card></div></MetricSection>
    </div>
  );
}

function Sources({ data }) {
  return <div className="space-y-6"><MetricSection title="Fuentes que generan oportunidades" description="Compará volumen, calidad, pérdidas y conversión a agenda por canal."><MetricDataTable columns={['Fuente', 'Leads', 'Calientes', 'Agendados', 'Sin contacto', 'Conv. agenda']} rows={data.sourceRows.map((row) => [row.label, row.leads, row.hot, row.scheduled, row.uncontacted, `${row.conversion}%`])} /></MetricSection><div className="grid gap-5 xl:grid-cols-2"><MetricBreakdown title="Leads por fuente" entries={data.sourceCounts} total={data.periodLeads.length} /><MetricBreakdown title="Pérdidas por fuente" entries={data.lostSourceCounts} total={data.periodLost.length} /></div></div>;
}

function Treatments({ data }) {
  return <div className="space-y-6"><MetricSection title="Tratamientos más solicitados" description="El sistema muestra qué tratamientos concentran intención y valor potencial."><MetricDataTable columns={['Tratamiento', 'Leads', 'Calientes', 'Agendados', 'No-shows', 'Valor potencial']} rows={data.treatmentRows.map((row) => [row.label, row.leads, row.hot, row.scheduled, row.noShows, row.potential ? formatMoney(row.potential) : 'No configurado'])} /></MetricSection><div className="grid gap-5 xl:grid-cols-2"><MetricBreakdown title="Leads por tratamiento" entries={data.treatmentCounts} total={data.periodLeads.length} /><MetricBreakdown title="Tratamientos más perdidos" entries={data.lostTreatmentCounts} total={data.periodLost.length} /></div></div>;
}

function Responsibles({ data }) {
  return <MetricSection title="Desempeño operativo por responsable" description="Mide actividad registrada, no calidad clínica ni resultado comercial garantizado."><MetricDataTable columns={['Responsable', 'Tareas completadas', 'Tareas abiertas', 'Tareas vencidas', 'Leads asignados']} rows={data.responsibleRows.map((row) => [row.label, row.completed, row.open, row.overdue, row.leads])} /></MetricSection>;
}

function WeeklyReport({ report, copied, onCopy, data }) {
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Reporte semanal</p><h3 className="mt-1 text-lg font-semibold text-cream">Resumen listo para compartir</h3></div><Button type="button" onClick={onCopy}><Clipboard className="h-4 w-4" />{copied ? 'Reporte copiado' : 'Copiar reporte'}</Button></div><pre className="scrollbar-soft max-h-[680px] overflow-auto whitespace-pre-wrap p-5 font-sans text-sm leading-7 text-textSoft">{report}</pre></Card><Card className="h-fit p-5"><UserCheck className="h-6 w-6 text-mint" /><h3 className="mt-4 font-bold text-cream">Lectura rápida del dueño</h3><div className="mt-4 space-y-3"><OwnerAnswer label="¿Cuántas entraron?" value={data.periodLeads.length} /><OwnerAnswer label="¿Cuántas contactamos?" value={data.contacted.length} /><OwnerAnswer label="¿Cuántas agendamos?" value={data.scheduled} /><OwnerAnswer label="¿Cuántas asistieron?" value={data.attended.length} /><OwnerAnswer label="¿Dónde se pierden?" value={data.lossReasonCounts[0]?.[0] || 'Sin datos'} /><OwnerAnswer label="¿Quién completó más tareas?" value={data.topResponsible || 'Sin datos'} /></div><p className="mt-5 rounded-xl border border-mint/15 bg-mint/[0.06] p-3 text-xs leading-5 text-slate-500">El envío semanal automático por email queda preparado como fase futura; esta versión no crea automatizaciones externas ni envía mensajes.</p></Card></div>;
}

export function buildMetrics({ leads, appointments, tasks, treatmentPrices, profiles = [], period }) {
  const now = new Date();
  const today = todayIsoDate();
  const day = 86400000;
  const currentWeekStart = new Date(now.getTime() - 7 * day);
  const starts = { week: currentWeekStart, previous_week: new Date(now.getTime() - 14 * day), month: new Date(`${today.slice(0, 7)}-01T00:00:00`), '30d': new Date(now.getTime() - 30 * day), '90d': new Date(now.getTime() - 90 * day), year: new Date(`${today.slice(0, 4)}-01-01T00:00:00`) };
  const start = starts[period] || starts['30d'];
  const end = period === 'previous_week' ? currentWeekStart : null;
  const inPeriod = (value) => { const date = new Date(value); return date >= start && (!end || date < end); };
  const activeLeads = leads.filter((lead) => !isArchivedLead(lead));
  const periodLeads = activeLeads.filter((lead) => inPeriod(lead.created_at));
  const periodAppointments = appointments.filter((item) => inPeriod(item.created_at || `${item.appointment_date}T12:00:00`));
  const periodTasks = tasks.filter((task) => inPeriod(task.created_at || task.due_at || 0));
  const periodLost = leads.filter((lead) => lead.lost_at && inPeriod(lead.lost_at));
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
  periodLeads.forEach((lead) => { if (lead.next_followup_at && !terminalStatuses.includes(lead.status)) pendingFollowupLeadIds.add(lead.id); });
  const overdueFollowupLeadIds = new Set(openFollowupTasks.filter((task) => task.due_at && new Date(task.due_at) < now).map((task) => task.lead_id).filter(Boolean));
  periodLeads.forEach((lead) => { if (lead.next_followup_at && new Date(lead.next_followup_at) < now && !terminalStatuses.includes(lead.status)) overdueFollowupLeadIds.add(lead.id); });
  const priceByTreatment = Object.fromEntries((treatmentPrices || []).map((item) => [normalizeText(item.treatment), Number(item.estimated_price || 0)]));
  const leadPotential = (lead) => Number(lead.estimated_value || priceByTreatment[normalizeText(lead.treatment)] || 0);
  const underFollowup = periodLeads.filter((lead) => !terminalStatuses.includes(lead.status));
  const potential = underFollowup.reduce((sum, lead) => sum + leadPotential(lead), 0);
  const protectedLeads = underFollowup.filter((lead) => lead.next_followup_at || tasks.some((task) => task.lead_id === lead.id && isOpenTask(task)));
  const progressedStatuses = new Set([...CONTACTED_STATUSES, ...SCHEDULED_STATUSES, 'Tratamiento Iniciado']);
  const recoveredFollowups = new Set(completedFollowupTasks.filter((task) => progressedStatuses.has(leadById.get(task.lead_id)?.status)).map((task) => task.lead_id).filter(Boolean)).size;
  const laterActiveLeadIds = new Set(appointments.filter((item) => periodAppointments.some((noShow) => noShow.lead_id === item.lead_id && noShow.status === APPOINTMENT_STATUS.noShow && new Date(item.created_at) > new Date(noShow.updated_at || noShow.created_at)) && item.status !== APPOINTMENT_STATUS.noShow).map((item) => item.lead_id));
  const noShowRecoveryLeadIds = new Set(tasks.filter((task) => task.type === 'no_show_recovery').map((task) => task.lead_id).filter(Boolean));
  const sourceRows = buildRows(periodLeads, sourceGroup, { scheduledLeadIds, noShowLeadIds, leadPotential });
  const treatmentRows = buildRows(periodLeads, (lead) => lead.treatment || 'Sin tratamiento', { scheduledLeadIds, noShowLeadIds, leadPotential });
  const hotLeads = periodLeads.filter((lead) => lead.classification === 'Lead Caliente').length;
  const scheduled = periodLeads.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length;
  const attendedCount = periodLeads.filter((lead) => attendedLeadIds.has(lead.id) || lead.status === LEAD_STATUS.attended).length;
  const won = periodLeads.filter((lead) => lead.status === 'Tratamiento Iniciado').length;
  const lost = periodLost.length;
  const funnelValues = [periodLeads.length, contacted.length, scheduled, attendedCount, won, lost];
  const funnelLabels = ['Nuevo', 'Contactado', 'Agendado', 'Asistió', 'Tratamiento iniciado', 'Perdido'];
  const funnelDetails = ['Base de oportunidades', 'Con contacto registrado', 'Con cita o estado de agenda', 'Con asistencia registrada', 'Estado disponible más cercano a ganado', 'Con motivo de pérdida'];
  const funnel = funnelLabels.map((label, index) => { const denominator = index === funnelLabels.length - 1 ? funnelValues[0] : (index ? funnelValues[index - 1] : funnelValues[0]); return { label, value: funnelValues[index], rate: denominator ? Math.round((funnelValues[index] / denominator) * 100) : 0, detail: funnelDetails[index] }; });
  const responseTimes = periodLeads
    .map((lead) => ({ lead, firstContactAt: lead.first_contacted_at || lead.last_contact_at }))
    .filter(({ lead, firstContactAt }) => lead.created_at && firstContactAt)
    .map(({ lead, firstContactAt }) => Math.max(0, new Date(firstContactAt) - new Date(lead.created_at)) / 60000)
    .filter(Number.isFinite);
  const averageMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;
  const profileNames = Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name || profile.email]));
  const responsibleRows = profiles.map((profile) => { const ownTasks = periodTasks.filter((task) => task.assigned_to === profile.id || task.completed_by === profile.id); return { label: profile.full_name || profile.email, completed: ownTasks.filter((task) => task.status === 'hecho' && task.completed_by === profile.id).length, open: ownTasks.filter(isOpenTask).length, overdue: ownTasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at) < now).length, leads: leads.filter((lead) => lead.assigned_to === profile.id && !terminalStatuses.includes(lead.status)).length }; }).sort((a, b) => b.completed - a.completed || b.leads - a.leads);
  const health = hotLeads > 3 || overdueFollowupLeadIds.size > 5 ? { tone: 'critical', label: 'Crítica', reason: 'Hay demasiadas oportunidades calientes o seguimientos vencidos.' } : hotLeads || overdueFollowupLeadIds.size ? { tone: 'attention', label: 'Atención', reason: 'Hay oportunidades que requieren acción para no enfriarse.' } : { tone: 'good', label: 'Buena', reason: 'No hay señales urgentes dentro del período seleccionado.' };

  return {
    periodLeads, periodAppointments, periodLost, hotLeads, scheduled, contacted, health, activeLeadTotal: activeLeads.length,
    mediumLeads: periodLeads.filter((lead) => lead.classification === 'Lead Medio').length,
    coldLeads: periodLeads.filter((lead) => lead.classification === 'Lead Frío').length,
    uncontacted, hotUncontacted: uncontacted.filter((lead) => lead.classification === 'Lead Caliente').length,
    pendingFollowups: pendingFollowupLeadIds.size, overdueFollowups: overdueFollowupLeadIds.size, completedFollowups: completedFollowupTasks.length,
    openTasks: openTasks.length, overdueTasks: openTasks.filter((task) => task.due_at && new Date(task.due_at) < now).length,
    attended, noShows, confirmed: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length, rescheduled: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length,
    attendanceRate: attendanceBase ? Math.round((attended.length / attendanceBase) * 100) : 0,
    lost, recoveredFollowups, noShowRecoveries: [...noShowLeadIds].filter((leadId) => noShowRecoveryLeadIds.has(leadId) || laterActiveLeadIds.has(leadId)).length,
    manualTracked: periodLeads.filter((lead) => ['WhatsApp directo', 'Manual / Otro'].includes(sourceGroup(lead)) && !terminalStatuses.includes(lead.status)).length,
    highTicket: periodLeads.filter((lead) => HIGH_TICKET_TERMS.some((term) => normalizeText(lead.treatment).includes(term))).length,
    protected: protectedLeads.length, potential, hasPotentialConfig: potential > 0 || Object.values(priceByTreatment).some((value) => value > 0), sourceRows, treatmentRows,
    sourceCounts: sourceRows.map((row) => [row.label, row.leads]), treatmentCounts: treatmentRows.map((row) => [row.label, row.leads]),
    lossReasonCounts: countBy(periodLost, (lead) => lead.lost_reason || 'Sin motivo histórico'), lostTreatmentCounts: countBy(periodLost, (lead) => lead.treatment || 'Sin tratamiento'), lostSourceCounts: countBy(periodLost, sourceGroup),
    funnel, averageResponseLabel: averageMinutes === null ? 'Sin datos' : averageMinutes < 60 ? `${averageMinutes} min` : `${Math.round(averageMinutes / 60)} h`, responsibleRows, topResponsible: responsibleRows[0]?.completed ? responsibleRows[0].label : null, profileNames,
  };
}

function sourceGroup(lead) { const source = normalizeText(lead.source || ''); if (source.includes('formulario')) return 'Formulario web'; if (source.includes('whatsapp')) return 'WhatsApp directo'; if (source.includes('instagram')) return 'Instagram DM'; if (source.includes('llamada')) return 'Llamada'; if (source.includes('recomend')) return 'Recomendación'; return 'Manual / Otro'; }
function buildRows(items, selector, { scheduledLeadIds, noShowLeadIds, leadPotential }) { const groups = items.reduce((acc, lead) => { const label = selector(lead); if (!acc[label]) acc[label] = []; acc[label].push(lead); return acc; }, {}); return Object.entries(groups).map(([label, group]) => { const scheduled = group.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length; return { label, leads: group.length, hot: group.filter((lead) => lead.classification === 'Lead Caliente').length, scheduled, uncontacted: group.filter((lead) => !lead.last_contact_at && ['Nuevo', 'No Contactado'].includes(lead.status)).length, noShows: group.filter((lead) => noShowLeadIds.has(lead.id) || lead.status === LEAD_STATUS.noShow).length, conversion: group.length ? Math.round((scheduled / group.length) * 100) : 0, potential: group.reduce((sum, lead) => sum + leadPotential(lead), 0) }; }).sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label)); }
function countBy(items, selector) { return Object.entries(items.reduce((acc, item) => { const key = selector(item); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]); }
function MetricSection({ title, description, children }) { return <section><div className="mb-4"><h3 className="text-lg font-semibold tracking-[-0.015em] text-cream">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>{children}</section>; }
function MetricBreakdown({ title, entries, total }) { return <Card className="p-5"><h3 className="font-bold text-cream">{title}</h3><div className="mt-5 space-y-4">{entries.length ? entries.slice(0, 8).map(([label, value]) => <div key={label}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-600">{label}</span><span className="font-bold text-cream">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${total ? Math.max(4, Math.round((value / total) * 100)) : 0}%` }} /></div></div>) : <p className="text-sm text-slate-500">Sin datos en este período.</p>}</div></Card>; }
function MetricDataTable({ columns, rows }) { return <Card className="overflow-hidden">{rows.length ? <div className="scrollbar-soft overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-bold first:pl-5 last:pr-5">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{rows.map((row) => <tr key={row[0]} className="transition hover:bg-slate-50">{row.map((cell, index) => <td key={`${row[0]}-${columns[index]}`} className={`whitespace-nowrap px-4 py-3 first:pl-5 last:pr-5 ${index === 0 ? 'font-semibold text-cream' : index === row.length - 1 ? 'font-semibold text-mint' : 'text-slate-600'}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Sin datos para comparar en este período.</p>}</Card>; }
function ValueSignal({ label, value, detail }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-mint/20 hover:bg-elevated"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-cream">{value}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{detail}</p></div>; }
function ExecutiveMini({ label, value }) { return <div className="min-w-24 rounded-xl border border-slate-200 bg-app/45 p-3"><p className="text-xl font-bold text-cream">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>; }
function OwnerAnswer({ label, value }) { return <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 text-sm"><span className="text-slate-500">{label}</span><strong className="text-right text-cream">{value}</strong></div>; }
