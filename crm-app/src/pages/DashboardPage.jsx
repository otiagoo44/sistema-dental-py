import { useMemo } from 'react';
import { CalendarDays, FilePlus, MessageCircle, RefreshCw } from 'lucide-react';
import { buildNextActionQueue, PRIORITY_GROUP, PRIORITY_GROUP_LABEL } from '../lib/nextActions';
import { APPOINTMENT_ACTIVE_STATUSES } from '../lib/crmDomain';
import { formatDateTime, formatMoney, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import WhatsAppButton from '../components/crm/WhatsAppButton';
import OwnerSummaryPage from './OwnerSummaryPage';

export default function Dashboard(props) {
  if (props.canAdmin) return <OwnerSummaryPage {...props} />;
  return <ReceptionHome {...props} />;
}

function ReceptionHome({
  leads,
  appointments,
  tasks,
  quotes = [],
  profiles = [],
  onCreateLead,
  onOpenLead,
  onRegisterOutcome,
  onConfirmAppointment,
  onWhatsAppOpened,
  messageTemplates,
  clinicContext,
  onRefresh,
}) {
  const today = todayIsoDate();
  const queue = useMemo(
    () => buildNextActionQueue({ leads, tasks, appointments, quotes }),
    [leads, tasks, appointments, quotes],
  );
  const groups = useMemo(() => ({
    [PRIORITY_GROUP.now]: queue.filter((item) => item.action.priorityGroup === PRIORITY_GROUP.now),
    [PRIORITY_GROUP.today]: queue.filter((item) => item.action.priorityGroup === PRIORITY_GROUP.today),
    [PRIORITY_GROUP.later]: queue.filter((item) => item.action.priorityGroup === PRIORITY_GROUP.later),
  }), [queue]);
  const profileNames = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name])),
    [profiles],
  );
  const newToday = leads.filter((lead) => toLocalIsoDate(lead.created_at) === today).length;
  const todayAppointments = appointments.filter((item) => item.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(item.status)).length;
  const pendingToday = groups.now.length + groups.today.length;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Inicio"
        title="¿Qué necesita atención ahora?"
        subtitle="Te mostramos primero lo que puede hacer que se pierda un paciente."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={onRefresh}><RefreshCw className="h-4 w-4" />Actualizar</Button>
            <Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nueva consulta</Button>
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Nuevas consultas" value={newToday} detail="Ingresadas hoy" />
        <StatCard label="Citas de hoy" value={todayAppointments} icon={CalendarDays} detail="Activas para hoy" />
        <StatCard label="Pendientes para hoy" value={pendingToday} tone={groups.now.length ? 'danger' : 'gold'} detail={`${groups.now.length} necesitan atención inmediata`} />
      </div>

      <div>
        <h2 className="text-xl font-bold text-cream">Qué hacer ahora</h2>
        <p className="mt-1 text-base text-textMuted">Una persona aparece una sola vez, con la acción más importante.</p>
      </div>

      {[PRIORITY_GROUP.now, PRIORITY_GROUP.today].map((group) => (
        <ActionGroup
          key={group}
          group={group}
          items={groups[group]}
          profileNames={profileNames}
          quotes={quotes}
          onOpenLead={onOpenLead}
          onRegisterOutcome={onRegisterOutcome}
          onConfirmAppointment={onConfirmAppointment}
          onWhatsAppOpened={onWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
        />
      ))}

      <details className="rounded-2xl border border-slate-200 bg-card">
        <summary className="min-h-12 cursor-pointer px-5 py-4 font-bold text-textSoft">Puede esperar ({groups.later.length})</summary>
        <div className="border-t border-slate-200 p-4">
          <ActionGroup
            group={PRIORITY_GROUP.later}
            items={groups.later}
            hideHeading
            profileNames={profileNames}
            quotes={quotes}
            onOpenLead={onOpenLead}
            onRegisterOutcome={onRegisterOutcome}
            onConfirmAppointment={onConfirmAppointment}
            onWhatsAppOpened={onWhatsAppOpened}
            messageTemplates={messageTemplates}
            clinicContext={clinicContext}
          />
        </div>
      </details>
    </section>
  );
}

function ActionGroup({ group, items, hideHeading = false, profileNames, quotes, onOpenLead, onRegisterOutcome, onConfirmAppointment, onWhatsAppOpened, messageTemplates, clinicContext }) {
  return (
    <section className="space-y-3" aria-label={PRIORITY_GROUP_LABEL[group]}>
      {!hideHeading ? <h3 className={`text-sm font-black tracking-[0.14em] ${group === PRIORITY_GROUP.now ? 'text-danger' : 'text-mint'}`}>{PRIORITY_GROUP_LABEL[group]} · {items.length}</h3> : null}
      {items.length ? items.map(({ lead, action }) => {
        const quote = action.quoteId ? quotes.find((item) => item.id === action.quoteId) : null;
        const task = action.taskId ? { id: action.taskId, lead_id: lead.id, quote_id: action.quoteId, type: action.actionType } : null;
        return (
          <Card key={lead.id} as="article" className="p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <button className="min-w-0 flex-1 text-left" type="button" onClick={() => onOpenLead(lead.id)}>
                <h4 className="text-lg font-bold text-cream hover:text-mint">{lead.name}</h4>
                <p className="mt-1 text-base text-textSoft">{lead.treatment || 'Tratamiento por definir'}{quote ? ` · ${formatMoney(quote.amount)}` : ''}</p>
                <p className="mt-3 text-base leading-6 text-cream">{action.reason}</p>
                <p className="mt-2 text-sm text-textMuted">
                  {action.dueAt ? formatDateTime(action.dueAt) : 'Sin fecha'} · Encargado: {profileNames[lead.assigned_to] || 'Sin asignar'}
                </p>
              </button>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <WhatsAppButton lead={lead} task={task} action={action} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                {action.actionType === 'confirm_appointment' ? (
                  <Button type="button" variant="secondary" onClick={() => onConfirmAppointment(action.appointmentId)}><MessageCircle className="h-4 w-4" />Confirmar</Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => onRegisterOutcome({ lead, action, task })}>Registrar resultado</Button>
                )}
              </div>
            </div>
          </Card>
        );
      }) : <EmptyState title="Todo al día" text="No hay pacientes esperando en este grupo." />}
    </section>
  );
}
