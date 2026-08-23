import { useMemo } from 'react';
import { AlarmClock, AlertTriangle, BarChart3, CalendarCheck2, CalendarDays, Check, CheckCircle2, Clock3, FilePlus, Flame, UserRound, UsersRound } from 'lucide-react';
import { formatDateTime, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { terminalStatuses, APPOINTMENT_STATUS, APPOINTMENT_ACTIVE_STATUSES, isOpenTask } from '../lib/crmDomain';
import { getLeadPriority, getRiskAlerts } from '../lib/commercialInsights';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import PriorityBadge from '../components/ui/PriorityBadge';
import StatCard from '../components/ui/StatCard';
import WhatsAppButton from '../components/crm/WhatsAppButton';

export default function Dashboard({
  leads,
  appointments,
  tasks,
  profiles,
  canAdmin = false,
  onCreateLead,
  onOpenLead,
  onScheduleAppointment,
  onCompleteTask,
  onMarkContacted,
  onPostpone,
  onWhatsAppOpened,
  messageTemplates,
  clinicContext,
  onNavigate,
}) {
  const data = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const today = todayIsoDate();
    const newToday = leads.filter((lead) => toLocalIsoDate(lead.created_at) === today).length;
    const hotPending = leads.filter((lead) => lead.classification === 'Lead Caliente' && ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at);
    const overdueFollowups = leads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() < nowMs && !terminalStatuses.includes(lead.status));
    const todayAppointments = appointments.filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status));
    const overdueTasks = tasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at).getTime() < nowMs);
    const noShows = appointments.filter((appointment) => appointment.status === APPOINTMENT_STATUS.noShow);
    const unassigned = leads.filter((lead) => !lead.assigned_to && !terminalStatuses.includes(lead.status));
    const responseTimes = leads
      .filter((lead) => lead.created_at && lead.last_contact_at)
      .map((lead) => Math.max(0, new Date(lead.last_contact_at) - new Date(lead.created_at)) / 60000)
      .filter(Number.isFinite);
    const averageMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;
    const profileNames = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name]));
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));

    const todayItems = leads
      .map((lead) => {
        const priority = getLeadPriority(lead, { tasks, appointments, now });
        const linkedTasks = tasks.filter((task) => task.lead_id === lead.id && isOpenTask(task));
        const task = linkedTasks.sort((a, b) => new Date(a.due_at || 8640000000000000) - new Date(b.due_at || 8640000000000000))[0] || null;
        const appointment = todayAppointments.find((item) => item.lead_id === lead.id) || null;
        const attentionToday = (lead.next_followup_at && toLocalIsoDate(lead.next_followup_at) === today)
          || appointment
          || (task?.due_at && toLocalIsoDate(task.due_at) === today);
        if (priority.level !== 'urgent' && !(priority.level === 'attention' && attentionToday)) return null;
        const waitingMinutes = Math.max(0, Math.round((nowMs - new Date(lead.created_at).getTime()) / 60000));
        return {
          id: lead.id,
          lead,
          task,
          priority,
          reason: priority.reason,
          waiting: lead.last_contact_at ? `Último contacto ${formatDateTime(lead.last_contact_at)}` : waitingMinutes < 60 ? `Espera ${waitingMinutes} min` : `Espera ${Math.max(1, Math.round(waitingMinutes / 60))} h`,
          responsible: profileNames[lead.assigned_to] || 'Sin responsable',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.priority.rank - b.priority.rank || new Date(a.lead.next_followup_at || a.task?.due_at || a.lead.created_at) - new Date(b.lead.next_followup_at || b.task?.due_at || b.lead.created_at))
      .slice(0, 12);

    return {
      newToday,
      hotPending,
      overdueFollowups,
      todayAppointments,
      overdueTasks,
      noShows,
      unassigned,
      averageMinutes,
      todayItems,
      orphanOverdueTasks: overdueTasks.filter((task) => !task.lead_id || !leadById.has(task.lead_id)).slice(0, 3),
      alerts: getRiskAlerts(leads, tasks, appointments, now),
    };
  }, [leads, appointments, tasks, profiles]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Vista Hoy" title="¿Qué necesita atención ahora?" subtitle="Estas son las acciones que evitan que se pierdan oportunidades hoy." action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nuevo lead</Button>} />

      {data.alerts.length ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3" aria-label="Alertas de oportunidades en riesgo">
          {data.alerts.map((alert) => (
            <button key={alert.id} type="button" onClick={() => onNavigate(alert.target)} className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${alert.tone === 'danger' ? 'border-rose-400/25 bg-rose-400/[0.07] hover:bg-rose-400/10' : alert.tone === 'warning' ? 'border-amber-400/25 bg-amber-400/[0.07] hover:bg-amber-400/10' : 'border-slate-200 bg-card hover:bg-elevated'}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/20 text-amber-200"><AlertTriangle className="h-4 w-4" /></span>
              <span><strong className="block text-sm text-cream">{alert.message}</strong><span className="mt-1 block text-xs text-slate-500">Abrir lista y resolver</span></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads nuevos hoy" value={data.newToday} icon={UsersRound} detail="Ingresados desde cualquier fuente" />
        <StatCard label="Calientes pendientes" value={data.hotPending.length} tone="danger" icon={Flame} detail="Sin primer contacto registrado" />
        <StatCard label="Seguimientos vencidos" value={data.overdueFollowups.length} tone="gold" icon={AlarmClock} detail="Requieren acción inmediata" />
        <StatCard label="Citas de hoy" value={data.todayAppointments.length} tone="purple" icon={CalendarCheck2} detail="Agendadas, confirmadas o reprogramadas" />
        <StatCard label="Tareas vencidas" value={data.overdueTasks.length} tone="danger" icon={CheckCircle2} />
        <StatCard label="No-shows a recuperar" value={data.noShows.length} tone="gold" icon={UserRound} />
        <StatCard label="Respuesta promedio" value={data.averageMinutes === null ? 'Sin datos' : data.averageMinutes < 60 ? `${data.averageMinutes} min` : `${Math.round(data.averageMinutes / 60)} h`} icon={Clock3} detail="Desde creación hasta primer contacto" />
        <StatCard label="Sin responsable" value={data.unassigned.length} tone="cream" icon={UserRound} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-bold text-cream">Hoy · cola de acción</h3><p className="mt-1 text-sm text-slate-500">Trabajá de arriba hacia abajo: urgente primero, atención después.</p></div>
          <Button variant="ghost" size="sm" type="button" onClick={() => onNavigate('followups')}>Ver todos los seguimientos</Button>
        </div>
        {data.todayItems.length ? (
          <div className="divide-y divide-slate-100">
            {data.todayItems.map((item) => (
              <article key={item.id} className="p-5 transition hover:bg-slate-50">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onOpenLead(item.lead.id)} className="font-bold text-cream hover:text-mint">{item.lead.name}</button><PriorityBadge priority={item.priority} /></div>
                    <p className="mt-1 text-sm font-medium text-textSoft">{item.reason}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.lead.treatment || 'Tratamiento sin definir'} · {item.lead.source || 'Fuente sin definir'} · {item.responsible} · {item.waiting}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WhatsAppButton lead={item.lead} task={item.task} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                    {['Nuevo', 'No Contactado', 'No Respondió'].includes(item.lead.status) ? <Button size="sm" variant="secondary" type="button" onClick={() => onMarkContacted(item.lead)}><Check className="h-4 w-4" />Contactado</Button> : null}
                    <Button size="sm" variant="secondary" type="button" onClick={() => onScheduleAppointment(item.lead)}><CalendarCheck2 className="h-4 w-4" />Agendar</Button>
                    {item.task ? <Button size="sm" variant="secondary" type="button" onClick={() => onCompleteTask(item.task.id)}><CheckCircle2 className="h-4 w-4" />Completar</Button> : null}
                    <select className="min-h-9 rounded-xl border border-slate-200 bg-input px-3 py-2 text-xs font-semibold text-textSoft outline-none focus:border-mint" defaultValue="" aria-label={`Posponer seguimiento de ${item.lead.name}`} onChange={(event) => { if (event.target.value) onPostpone(item.lead, Number(event.target.value)); event.target.value = ''; }}><option value="" disabled>Posponer…</option><option value="1">Mañana</option><option value="3">En 3 días</option><option value="7">En 7 días</option></select>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="p-5"><EmptyState title="Todo al día" text="No hay acciones urgentes ni seguimientos de hoy esperando resolución." /></div>}
        {data.orphanOverdueTasks.length ? <div className="border-t border-slate-200 bg-soft p-4 text-xs text-slate-500">También hay {data.orphanOverdueTasks.length} tarea(s) vencida(s) sin lead asociado. <button className="font-bold text-mint" type="button" onClick={() => onNavigate('tasks')}>Revisar tareas</button></div> : null}
      </Card>

      {canAdmin ? (
        <Card className="overflow-hidden border-mint/30 bg-gradient-to-br from-card via-elevated to-hover p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-mint/20 bg-mint/10 text-mint"><BarChart3 className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">Panel del dueño</p><h3 className="mt-1 text-lg font-semibold text-cream">Convertí señales operativas en decisiones de seguimiento.</h3><p className="mt-1 text-sm leading-6 text-slate-500">Revisá fuentes, tratamientos, equipo, pérdidas y reporte semanal.</p></div></div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[340px]"><ImpactMini label="Nuevos hoy" value={data.newToday} /><ImpactMini label="Calientes" value={data.hotPending.length} /><ImpactMini label="Vencidos" value={data.overdueFollowups.length} /></div>
            <Button className="w-full lg:w-auto" type="button" onClick={() => onNavigate('metrics')}><BarChart3 className="h-4 w-4" />Ver Panel del dueño</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5"><h3 className="font-bold text-cream">Atajos de recepción</h3><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Registrar lead</Button><Button variant="secondary" type="button" onClick={() => onNavigate('followups')}><AlarmClock className="h-4 w-4" />Seguimientos</Button><Button variant="secondary" type="button" onClick={() => onNavigate('agenda')}><CalendarDays className="h-4 w-4" />Agenda</Button></div></Card>
      )}
    </section>
  );
}

function ImpactMini({ label, value }) {
  return <div className="rounded-xl border border-mint/15 bg-app/45 p-3 text-center"><p className="text-xl font-bold text-cream">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>;
}
