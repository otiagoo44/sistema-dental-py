import { useMemo, useState } from 'react';
import { Check, Edit3, FilePlus } from 'lucide-react';
import { formatDateTime } from '../lib/formatters';
import { getLeadPriority } from '../lib/commercialInsights';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import WhatsAppButton from '../components/crm/WhatsAppButton';

export default function TasksView({ tasks, leads, appointments, canAdmin, onCreateTask, onEditTask, onComplete, onOpenLead, onWhatsAppOpened, messageTemplates, clinicContext }) {
  const [filter, setFilter] = useState('pendientes');
  const now = Date.now();
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isDone = ['hecho', 'Completada'].includes(task.status);
      const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < now;

      if (filter === 'completadas') return isDone;
      if (filter === 'vencidas') return isOverdue || task.status === 'vencido';
      return !isDone && task.status !== 'cancelado' && !isOverdue;
    });
  }, [tasks, filter, now]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Trabajo operativo" title="Tareas" subtitle="Completá lo pendiente y resolvé primero lo vencido." action={canAdmin ? <Button type="button" onClick={() => onCreateTask()}><FilePlus className="h-4 w-4" />Nueva tarea</Button> : null} />
      <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['pendientes', 'Pendientes'],
            ['vencidas', 'Vencidas'],
            ['completadas', 'Completadas'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${filter === id ? 'bg-mint text-inverse' : 'border border-slate-200 bg-card text-textSoft hover:border-mint/30 hover:bg-elevated'}`}
              type="button"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-slate-500">{filteredTasks.length} tareas</span>
      </Card>

      {filteredTasks.length ? (
        filteredTasks.map((task) => {
          const lead = task.leads || leads.find((item) => item.id === task.lead_id) || null;
          const isDone = ['hecho', 'Completada'].includes(task.status);
          const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < Date.now();
          const displayStatus = isOverdue ? 'vencido' : task.status;
          const leadPriority = lead ? getLeadPriority(lead, { tasks, appointments }) : null;

          return (
            <Card key={task.id} as="article" className="card-enter flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <StatusBadge value={task.priority} />
                  <StatusBadge value={displayStatus} />
                  <PriorityBadge priority={leadPriority} />
                </div>
                {task.description ? <p className="mt-2 text-sm text-slate-500">{task.description}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <span>Vence: {task.due_at ? formatDateTime(task.due_at) : 'Sin vencimiento'}</span>
                  <span>Paciente: {lead?.name || 'Sin paciente asociado'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lead ? <Button size="sm" variant="ghost" type="button" onClick={() => onOpenLead(lead.id)}>Abrir lead</Button> : null}
                {lead ? (
                  <WhatsAppButton lead={lead} task={task} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                ) : null}
                {canAdmin ? (
                  <Button size="sm" variant="secondary" type="button" onClick={() => onEditTask(task)}>
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  type="button"
                  onClick={() => onComplete(task)}
                  disabled={isDone}
                >
                  <Check className="h-4 w-4" />
                  Marcar hecha
                </Button>
              </div>
            </Card>
          );
        })
      ) : (
        <EmptyState title="Sin tareas" text="Las tareas de la clinica apareceran aca." />
      )}
    </section>
  );
}
