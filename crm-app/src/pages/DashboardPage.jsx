import { useMemo } from 'react';
import { ArrowRight, CalendarDays, CircleDollarSign, FilePlus } from 'lucide-react';
import { buildNextActionQueue, PRIORITY_GROUP } from '../lib/nextActions';
import { APPOINTMENT_ACTIVE_STATUSES } from '../lib/crmDomain';
import { formatMoney, todayIsoDate } from '../lib/formatters';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import PendingActionCard from '../components/crm/PendingActionCard';
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
  onCreateLead,
  onOpenLead,
  onRegisterOutcome,
  onConfirmAppointment,
  onCompleteTask,
  onWhatsAppOpened,
  messageTemplates,
  clinicContext,
  onNavigate,
}) {
  const today = todayIsoDate();
  const queue = useMemo(() => buildNextActionQueue({ leads, tasks, appointments, quotes }), [leads, tasks, appointments, quotes]);
  const urgent = queue.filter(({ action }) => action.priorityGroup === PRIORITY_GROUP.now);
  const todayAppointments = appointments.filter((item) => item.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(item.status)).length;
  const pendingQuoteAmount = quotes.filter((quote) => quote.status === 'pending').reduce((sum, quote) => sum + Number(quote.amount || 0), 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Inicio"
        title={greeting()}
        subtitle="Tu resumen de hoy."
        action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nueva consulta</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummarySignal value={urgent.length} label="necesitan atención ahora" tone={urgent.length ? 'danger' : 'mint'} />
        <SummarySignal value={todayAppointments} label="citas hoy" icon={CalendarDays} />
        <SummarySignal value={formatMoney(pendingQuoteAmount)} label="en presupuestos pendientes" icon={CircleDollarSign} />
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-cream">Lo más urgente</h2>
          <p className="mt-1 text-sm text-textMuted">Máximo tres pacientes.</p>
        </div>
        <Button variant="ghost" type="button" onClick={() => onNavigate('pending')}>Ver todos los pendientes<ArrowRight className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-3">
        {urgent.length ? urgent.slice(0, 3).map(({ lead, action }) => {
          const task = action.taskId ? tasks.find((item) => item.id === action.taskId) : null;
          return (
            <PendingActionCard
              key={lead.id}
              compact
              lead={lead}
              action={action}
              task={task}
              onOpenLead={onOpenLead}
              onRegisterOutcome={onRegisterOutcome}
              onConfirmAppointment={onConfirmAppointment}
              onCompleteTask={onCompleteTask}
              onWhatsAppOpened={onWhatsAppOpened}
              messageTemplates={messageTemplates}
              clinicContext={clinicContext}
            />
          );
        }) : <EmptyState title="Todo al día" text="No hay pacientes que necesiten atención inmediata." />}
      </div>
    </section>
  );
}

function SummarySignal({ value, label, icon: Icon, tone = 'default' }) {
  return (
    <Card className={`p-4 ${tone === 'danger' ? 'border-rose-400/30 bg-rose-400/[0.05]' : ''}`}>
      <div className="flex items-center gap-3">
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-mint" /> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone === 'danger' ? 'bg-rose-300' : 'bg-mint'}`} />}
        <div className="min-w-0">
          <p className="text-xl font-black text-cream">{value}</p>
          <p className="text-sm text-textMuted">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Asuncion' }).format(now));
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
