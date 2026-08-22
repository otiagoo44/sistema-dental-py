import { useMemo, useState } from 'react';
import { AlarmClock, CalendarCheck2, CheckCircle2, CircleDollarSign, Clock3, Flame, TrendingUp, UsersRound } from 'lucide-react';
import { CONTACTED_STATUSES, SCHEDULED_STATUSES } from '../lib/constants';
import { formatMoney, normalizeText, todayIsoDate } from '../lib/formatters';
import { terminalStatuses, LEAD_STATUS, APPOINTMENT_STATUS, APPOINTMENT_ACTIVE_STATUSES, isOpenTask } from '../lib/crmDomain';
import { Select } from '../components/crm/CrmPrimitives';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

export default function MetricsView({ leads, appointments, tasks, treatmentPrices }) {
  const [period, setPeriod] = useState('30d');
  const data = useMemo(() => {
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
    const periodAppointments = appointments.filter((item) => new Date(`${item.appointment_date}T12:00:00`) >= start);
    const periodTasks = tasks.filter((task) => new Date(task.created_at || task.due_at || 0) >= start);
    const contacted = periodLeads.filter((lead) => lead.last_contact_at || CONTACTED_STATUSES.includes(lead.status));
    const uncontacted = periodLeads.filter((lead) => !lead.last_contact_at && ['Nuevo', 'No Contactado'].includes(lead.status));
    const responseTimes = periodLeads.filter((lead) => lead.created_at && lead.last_contact_at).map((lead) => Math.max(0, new Date(lead.last_contact_at) - new Date(lead.created_at)) / 60000);
    const avgResponse = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;
    const attended = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.attended);
    const noShows = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.noShow);
    const attendanceBase = attended.length + noShows.length;
    const scheduledLeadIds = new Set(periodAppointments.map((item) => item.lead_id));
    const attendedLeadIds = new Set(attended.map((item) => item.lead_id));
    const recoveredNoShows = new Set(noShows.filter((noShow) => appointments.some((item) => item.lead_id === noShow.lead_id && item.id !== noShow.id && item.appointment_date > noShow.appointment_date && APPOINTMENT_ACTIVE_STATUSES.includes(item.status))).map((item) => item.lead_id));
    const priceByTreatment = Object.fromEntries((treatmentPrices || []).map((item) => [normalizeText(item.treatment), Number(item.estimated_price || 0)]));
    const underFollowup = periodLeads.filter((lead) => !terminalStatuses.includes(lead.status));
    const potential = underFollowup.reduce((sum, lead) => sum + Number(lead.estimated_value || priceByTreatment[normalizeText(lead.treatment)] || 0), 0);
    const sourceCounts = countBy(periodLeads, (lead) => lead.source || 'Sin fuente');
    const treatmentCounts = countBy(periodLeads, (lead) => lead.treatment || 'Sin tratamiento');
    const classificationCounts = countBy(periodLeads, (lead) => lead.classification || 'Sin clasificación');
    const funnel = [
      ['Leads nuevos', periodLeads.length],
      ['Contactados', contacted.length],
      ['Agendados', periodLeads.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length],
      ['Asistieron', periodLeads.filter((lead) => attendedLeadIds.has(lead.id) || lead.status === LEAD_STATUS.attended).length],
      ['Tratamiento iniciado', periodLeads.filter((lead) => lead.status === 'Tratamiento Iniciado').length],
    ];

    return {
      periodLeads,
      contacted,
      uncontacted,
      avgResponse,
      hotUncontacted: uncontacted.filter((lead) => lead.classification === 'Lead Caliente').length,
      overdueTasks: periodTasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at) < now).length,
      periodAppointments,
      attended,
      noShows,
      confirmed: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length,
      rescheduled: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length,
      attendanceRate: attendanceBase ? Math.round((attended.length / attendanceBase) * 100) : 0,
      lost: periodLeads.filter((lead) => lead.status === 'Perdido').length,
      completedFollowups: periodTasks.filter((task) => task.status === 'hecho' && ['followup', 'contact', 'no_show_recovery'].includes(task.type)).length,
      overdueFollowups: periodTasks.filter((task) => isOpenTask(task) && ['followup', 'contact', 'no_show_recovery'].includes(task.type) && task.due_at && new Date(task.due_at) < now).length,
      recoveredNoShows: recoveredNoShows.size,
      reactivated: periodLeads.filter((lead) => lead.status === 'Reactivar 30d').length,
      protected: underFollowup.filter((lead) => lead.next_followup_at || tasks.some((task) => task.lead_id === lead.id && isOpenTask(task))).length,
      potential,
      sourceCounts,
      treatmentCounts,
      classificationCounts,
      funnel,
    };
  }, [leads, appointments, tasks, treatmentPrices, period]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Control comercial" title="Métricas" subtitle="Medí captación, velocidad y seguimiento. Las estimaciones no representan ingresos confirmados." action={<div className="min-w-48"><Select label="Período" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mes' }, { value: '30d', label: 'Últimos 30 días' }, { value: '90d', label: 'Últimos 90 días' }, { value: 'year', label: 'Este año' }]} /></div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads captados" value={data.periodLeads.length} icon={UsersRound} detail="Oportunidades nuevas del período" />
        <StatCard label="Leads contactados" value={data.contacted.length} tone="success" icon={CheckCircle2} />
        <StatCard label="Sin contactar" value={data.uncontacted.length} tone="gold" icon={AlarmClock} />
        <StatCard label="Respuesta promedio" value={data.avgResponse === null ? 'Sin datos' : data.avgResponse < 60 ? `${data.avgResponse} min` : `${Math.round(data.avgResponse / 60)} h`} icon={Clock3} />
        <StatCard label="Citas agendadas" value={data.periodAppointments.length} tone="purple" icon={CalendarCheck2} />
        <StatCard label="Tasa de asistencia" value={`${data.attendanceRate}%`} tone="success" icon={TrendingUp} detail={`${data.attended.length} asistencias · ${data.noShows.length} no-shows`} />
        <StatCard label="Tareas vencidas" value={data.overdueTasks} tone="danger" icon={CheckCircle2} />
        <StatCard label="Calientes sin contacto" value={data.hotUncontacted} tone="danger" icon={Flame} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5"><h3 className="font-bold text-cream">Embudo comercial</h3><p className="mt-1 text-sm text-slate-500">Conversión observada por etapa dentro del período.</p></div>
        <div className="grid gap-3 p-5 lg:grid-cols-5">
          {data.funnel.map(([label, value], index) => {
            const previous = index ? data.funnel[index - 1][1] : value;
            const rate = previous ? Math.round((value / previous) * 100) : 0;
            return <div key={label} className="relative rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-cream">{value}</p>{index ? <p className="mt-2 text-xs font-bold text-mint">{rate}% desde etapa anterior</p> : <p className="mt-2 text-xs text-slate-400">Base del período</p>}</div>;
          })}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <MetricBreakdown title="Leads por fuente" entries={data.sourceCounts} total={data.periodLeads.length} />
        <MetricBreakdown title="Leads por tratamiento" entries={data.treatmentCounts} total={data.periodLeads.length} />
        <MetricBreakdown title="Clasificación" entries={data.classificationCounts} total={data.periodLeads.length} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-cream">Valor comercial protegido</h3><p className="mt-1 text-sm text-slate-500">Señales operativas del sistema, sin prometer resultados.</p></div><CircleDollarSign className="h-6 w-6 text-violet-600" /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ValueSignal label="Oportunidades bajo seguimiento" value={data.protected} />
            <ValueSignal label="Leads calientes priorizados" value={data.periodLeads.filter((lead) => lead.classification === 'Lead Caliente').length} />
            <ValueSignal label="No-shows con recuperación" value={data.noShows.length} />
            <ValueSignal label="No-shows recuperados" value={data.recoveredNoShows} />
            <ValueSignal label="Seguimientos completados" value={data.completedFollowups} />
            <ValueSignal label="Seguimientos vencidos" value={data.overdueFollowups} />
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-violet-600 to-blue-700 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Estimación interna</p>
          <h3 className="mt-2 text-lg font-semibold text-white/90">Valor potencial estimado en seguimiento</h3>
          <p className="mt-4 text-4xl font-bold tracking-tight">{formatMoney(data.potential)}</p>
          <p className="mt-4 text-sm leading-6 text-white/75">Calculado con el valor del lead o el precio conservador configurado por tratamiento. No es ingreso confirmado.</p>
          <div className="mt-5 border-t border-white/20 pt-4 text-sm text-white/80">{data.lost} oportunidades marcadas como perdidas · {data.reactivated} en reactivación</div>
        </Card>
      </div>
    </section>
  );
}

function countBy(items, selector) {
  return Object.entries(items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 7);
}

function MetricBreakdown({ title, entries, total }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold text-cream">{title}</h3>
      <div className="mt-5 space-y-4">
        {entries.length ? entries.map(([label, value]) => <div key={label}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-600">{label}</span><span className="font-bold text-cream">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${total ? Math.max(4, Math.round((value / total) * 100)) : 0}%` }} /></div></div>) : <p className="text-sm text-slate-500">Sin datos en este período.</p>}
      </div>
    </Card>
  );
}

function ValueSignal({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-cream">{value}</p></div>;
}

