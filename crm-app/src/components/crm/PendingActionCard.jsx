import { Check, ClipboardCheck } from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import Button from '../ui/Button';
import Card from '../ui/Card';
import TemperatureBadge from '../ui/TemperatureBadge';
import WhatsAppButton from './WhatsAppButton';

export default function PendingActionCard({
  lead,
  action,
  task,
  onOpenLead,
  onRegisterOutcome,
  onConfirmAppointment,
  onCompleteTask,
  onWhatsAppOpened,
  messageTemplates,
  clinicContext,
  compact = false,
}) {
  return (
    <Card as="article" className={compact ? 'p-4' : 'p-5'}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <button className="min-w-0 flex-1 text-left" type="button" onClick={() => onOpenLead(lead.id)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-cream hover:text-mint">{lead.name}</h3>
              <p className="mt-1 text-sm text-textMuted">{lead.treatment || 'Tratamiento por definir'}</p>
            </div>
            <TemperatureBadge value={lead.classification} />
          </div>
          <p className="mt-4 text-base font-semibold text-cream">{action.title}</p>
          <p className="mt-1 text-sm leading-6 text-textMuted">{action.reason}</p>
          {action.dueAt ? <p className="mt-2 text-sm font-semibold text-textSoft">{formatActionMoment(action.dueAt)}</p> : null}
        </button>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <WhatsAppButton lead={lead} task={task} action={action} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
          {action.actionType === 'confirm_appointment' ? (
            <Button type="button" onClick={() => onConfirmAppointment(action.appointmentId)}><Check className="h-4 w-4" />Confirmar</Button>
          ) : action.actionType === 'assign_owner' ? (
            <Button type="button" variant="secondary" onClick={() => onOpenLead(lead.id)}>Ver paciente</Button>
          ) : action.actionType === 'manual_reminder' && task && onCompleteTask ? (
            <Button type="button" variant="secondary" onClick={() => onCompleteTask(task.id)}><Check className="h-4 w-4" />Completar</Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => onRegisterOutcome({ lead, action, task })}><ClipboardCheck className="h-4 w-4" />Registrar resultado</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function formatActionMoment(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return 'Ahora';
  if (Math.abs(minutes) < 60) return minutes < 0 ? `Hace ${Math.abs(minutes)} min` : `En ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours < 0 ? `Hace ${Math.abs(hours)} h` : `En ${hours} h`;
  return formatDateTime(value);
}
