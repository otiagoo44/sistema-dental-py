import { useMemo, useState } from 'react';
import { Check, Edit3, ExternalLink, FilePlus } from 'lucide-react';
import { formatDateTime } from '../lib/formatters';
import { buildWhatsappUrl } from '../lib/messages';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';

export default function TasksView({ tasks, leads, canAdmin, onCreateTask, onEditTask, onComplete, onOpenLead }) {
  const [filter, setFilter] = useState('pendientes');
  const now = Date.now();
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isDone = task.status === 'hecho';
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
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${filter === id ? 'bg-mint text-[#080a0f]' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
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
          const isDone = task.status === 'hecho';
          const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < Date.now();
          const displayStatus = isOverdue ? 'vencido' : task.status;

          return (
            <Card key={task.id} as="article" className="card-enter flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <StatusBadge value={task.priority} />
                  <StatusBadge value={displayStatus} />
                </div>
                {task.description ? <p className="mt-2 text-sm text-slate-500">{task.description}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <span>Vence: {task.due_at ? formatDateTime(task.due_at) : 'Sin vencimiento'}</span>
                  <span>Paciente: {lead?.name || 'Sin lead asociado'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lead ? <Button size="sm" variant="ghost" type="button" onClick={() => onOpenLead(lead.id)}>Abrir lead</Button> : null}
                {lead ? (
                  <a className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    WhatsApp
                  </a>
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
                  onClick={() => onComplete(task.id)}
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
