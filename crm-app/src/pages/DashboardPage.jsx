import { useMemo } from 'react';
import { AlarmClock, BarChart3, CalendarCheck2, CalendarDays, CheckCircle2, Clock3, FilePlus, Flame, RefreshCw, UserRound, UsersRound } from 'lucide-react';
import { formatDateTime, formatTime, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { terminalStatuses, APPOINTMENT_STATUS, APPOINTMENT_ACTIVE_STATUSES, isOpenTask } from '../lib/crmDomain';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

export default function Dashboard({ leads, appointments, tasks, canAdmin = false, onCreateLead, onOpenLead, onScheduleAppointment, onCompleteTask, onNavigate }) {
  const data = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const newToday = leads.filter((lead) => toLocalIsoDate(lead.created_at) === today).length;
    const hotPending = leads.filter((lead) => lead.classification === 'Lead Caliente' && ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at);
    const overdueFollowups = leads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() < now && !terminalStatuses.includes(lead.status));
    const todayAppointments = appointments.filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status));
    const overdueTasks = tasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at).getTime() < now);
    const noShows = appointments.filter((appointment) => appointment.status === APPOINTMENT_STATUS.noShow);
    const unassigned = leads.filter((lead) => !lead.assigned_to && !terminalStatuses.includes(lead.status));
    const responseTimes = leads
      .filter((lead) => lead.created_at && lead.last_contact_at)
      .map((lead) => Math.max(0, new Date(lead.last_contact_at) - new Date(lead.created_at)) / 60000)
      .filter((minutes) => Number.isFinite(minutes));
    const averageMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;

    const priority = [
      ...hotPending.map((lead) => ({ id: `hot-${lead.id}`, rank: 1, title: lead.name, detail: `Lead caliente sin contactar · ${lead.treatment || 'Tratamiento sin definir'}`, label: 'Ver lead', icon: Flame, tone: 'red', onClick: () => onOpenLead(lead.id) })),
      ...overdueFollowups.map((lead) => ({ id: `followup-${lead.id}`, rank: 2, title: lead.name, detail: `${lead.next_action || 'Seguimiento pendiente'} · ${formatDateTime(lead.next_followup_at)}`, label: 'Contactar', icon: AlarmClock, tone: 'amber', onClick: () => onOpenLead(lead.id) })),
      ...todayAppointments.map((appointment) => ({ id: `appointment-${appointment.id}`, rank: 3, title: appointment.leads?.name || 'Cita de hoy', detail: `${formatTime(appointment.appointment_time)} · ${appointment.doctor_assigned}`, label: 'Ver cita', icon: CalendarCheck2, tone: 'info', onClick: () => onNavigate('agenda') })),
      ...noShows.slice(0, 3).map((appointment) => ({ id: `noshow-${appointment.id}`, rank: 4, title: appointment.leads?.name || 'No-show', detail: 'No asistió. Recuperar y ofrecer reprogramación.', label: 'Reagendar', icon: RefreshCw, tone: 'red', onClick: () => onRescheduleSafe(appointment, onOpenLead) })),
      ...overdueTasks.map((task) => ({ id: `task-${task.id}`, rank: 5, title: task.title, detail: task.leads?.name || 'Tarea sin lead asociado', label: 'Completar tarea', icon: CheckCircle2, tone: 'slate', onClick: () => onCompleteTask(task.id) })),
    ].sort((a, b) => a.rank - b.rank).slice(0, 10);

    return { newToday, hotPending, overdueFollowups, todayAppointments, overdueTasks, noShows, unassigned, averageMinutes, priority };
  }, [leads, appointments, tasks, onCompleteTask, onNavigate, onOpenLead]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Prioridad de hoy"
        title="¿Qué necesita atención ahora?"
        subtitle="Estas son las oportunidades y tareas que conviene resolver primero."
        action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nuevo lead</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads nuevos hoy" value={data.newToday} icon={UsersRound} detail="Ingresados desde cualquier fuente" />
        <StatCard label="Calientes pendientes" value={data.hotPending.length} tone="danger" icon={Flame} detail="Sin primer contacto registrado" />
        <StatCard label="Seguimientos vencidos" value={data.overdueFollowups.length} tone="gold" icon={AlarmClock} detail="Requieren acción inmediata" />
        <StatCard label="Citas de hoy" value={data.todayAppointments.length} tone="purple" icon={CalendarCheck2} detail="Agendadas, confirmadas o reprogramadas" />
        <StatCard label="Tareas vencidas" value={data.overdueTasks.length} tone="danger" icon={CheckCircle2} />
        <StatCard label="No-shows a recuperar" value={data.noShows.length} tone="gold" icon={RefreshCw} />
        <StatCard label="Respuesta promedio" value={data.averageMinutes === null ? 'Sin datos' : data.averageMinutes < 60 ? `${data.averageMinutes} min` : `${Math.round(data.averageMinutes / 60)} h`} icon={Clock3} detail="Desde creación hasta primer contacto" />
        <StatCard label="Sin responsable" value={data.unassigned.length} tone="cream" icon={UserRound} />
      </div>

      {canAdmin ? (
        <Card className="overflow-hidden border-mint/30 bg-gradient-to-br from-card via-elevated to-hover p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-mint/20 bg-mint/10 text-mint"><BarChart3 className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">Impacto comercial</p>
                <h3 className="mt-1 text-lg font-semibold text-cream">Convertí oportunidades en decisiones de seguimiento.</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">Revisá captación, seguimiento, agenda, conversión y valor potencial estimado.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[340px]">
              <ImpactMini label="Nuevos hoy" value={data.newToday} />
              <ImpactMini label="Calientes" value={data.hotPending.length} />
              <ImpactMini label="Vencidos" value={data.overdueFollowups.length} />
            </div>
            <Button className="w-full lg:w-auto" type="button" onClick={() => onNavigate('metrics')}><BarChart3 className="h-4 w-4" />Ver impacto comercial</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-bold text-cream">Prioridad de hoy</h3>
              <p className="mt-1 text-sm text-slate-500">Resolvé la lista de arriba hacia abajo.</p>
            </div>
            <Button variant="ghost" size="sm" type="button" onClick={() => onNavigate('followups')}>Ver seguimientos</Button>
          </div>
          {data.priority.length ? (
            <div className="divide-y divide-slate-100">
              {data.priority.map((item) => {
                const Icon = item.icon;
                const tone = item.tone === 'red' ? 'bg-red-50 text-red-600' : item.tone === 'amber' ? 'bg-amber-50 text-amber-700' : item.tone === 'info' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600';
                return (
                  <div key={item.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-cream">{item.title}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{item.detail}</p>
                    </div>
                    <Button variant="secondary" size="sm" type="button" onClick={item.onClick}>{item.label}</Button>
                  </div>
                );
              })}
            </div>
          ) : <div className="p-5"><EmptyState title="Todo al día" text="No hay prioridades vencidas ni leads calientes esperando contacto." /></div>}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-cream">Acciones rápidas</h3>
          <p className="mt-1 text-sm text-slate-500">Los atajos más usados por recepción.</p>
          <div className="mt-5 grid gap-2">
            <Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Registrar nuevo lead</Button>
            <Button variant="secondary" type="button" onClick={() => onNavigate('followups')}><AlarmClock className="h-4 w-4" />Trabajar seguimientos</Button>
            <Button variant="secondary" type="button" onClick={() => onNavigate('agenda')}><CalendarDays className="h-4 w-4" />Revisar agenda</Button>
          </div>
          <div className="mt-5 rounded-2xl border border-mint/15 bg-mint/[0.06] p-4 text-sm leading-6 text-slate-600">
            <strong className="text-mint">Regla operativa:</strong> ningún lead caliente debería terminar el día sin contacto o próxima acción.
          </div>
          {!canAdmin ? <Button className="mt-3 w-full" variant="ghost" type="button" onClick={() => onNavigate('followups')}><AlarmClock className="h-4 w-4" />Ver seguimientos pendientes</Button> : null}
        </Card>
      </div>
    </section>
  );
}

function ImpactMini({ label, value }) {
  return (
    <div className="rounded-xl border border-mint/15 bg-app/45 p-3 text-center">
      <p className="text-xl font-bold text-cream">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function onRescheduleSafe(appointment, onOpenLead) {
  if (appointment?.lead_id) onOpenLead(appointment.lead_id);
}
