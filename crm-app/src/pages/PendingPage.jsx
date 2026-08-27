import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { buildNextActionQueue, PRIORITY_GROUP, PRIORITY_GROUP_LABEL } from '../lib/nextActions';
import { normalizeText } from '../lib/formatters';
import { Select } from '../components/crm/CrmPrimitives';
import PendingActionCard from '../components/crm/PendingActionCard';
import EmptyState from '../components/ui/EmptyState';
import FilterSheet, { ActiveFilterChips } from '../components/ui/FilterSheet';
import PageHeader from '../components/ui/PageHeader';

const EMPTY_FILTERS = { classification: '', assigned: '', actionType: '' };
const GROUPS = [PRIORITY_GROUP.now, PRIORITY_GROUP.today, PRIORITY_GROUP.later];

export default function PendingPage({
  leads,
  tasks,
  appointments,
  quotes = [],
  profiles = [],
  onOpenLead,
  onRegisterOutcome,
  onConfirmAppointment,
  onCompleteTask,
  onWhatsAppOpened,
  messageTemplates,
  clinicContext,
}) {
  const [group, setGroup] = useState(PRIORITY_GROUP.now);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const profileNames = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name || profile.email])), [profiles]);
  const queue = useMemo(() => buildNextActionQueue({ leads, tasks, appointments, quotes }), [leads, tasks, appointments, quotes]);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((item) => [item, queue.filter(({ action }) => action.priorityGroup === item).length])), [queue]);
  const visible = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return queue.filter(({ lead, action }) => {
      if (action.priorityGroup !== group) return false;
      if (filters.classification && lead.classification !== filters.classification) return false;
      if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
      if (filters.actionType && action.actionType !== filters.actionType) return false;
      return !normalizedQuery || normalizeText(`${lead.name} ${lead.treatment} ${action.title}`).includes(normalizedQuery);
    });
  }, [queue, group, filters, query]);

  const activeFilters = [
    filters.classification ? { key: 'classification', label: filters.classification.replace('Lead ', ''), onRemove: () => setFilters((current) => ({ ...current, classification: '' })) } : null,
    filters.assigned ? { key: 'assigned', label: profileNames[filters.assigned] || 'Encargado', onRemove: () => setFilters((current) => ({ ...current, assigned: '' })) } : null,
    filters.actionType ? { key: 'actionType', label: actionLabel(filters.actionType), onRemove: () => setFilters((current) => ({ ...current, actionType: '' })) } : null,
  ].filter(Boolean);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Cola de trabajo" title="Pendientes" subtitle="Lo que necesita atención, ordenado automáticamente." />

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Prioridad operativa">
        {GROUPS.map((item) => (
          <button
            key={item}
            className={`min-h-[68px] rounded-lg border px-2 py-3 text-center transition ${group === item ? 'border-mint bg-mint/10 text-cream' : 'border-slate-200 bg-card text-textMuted hover:border-mint/30 hover:bg-elevated'}`}
            type="button"
            role="tab"
            aria-selected={group === item}
            onClick={() => setGroup(item)}
          >
            <span className="block text-[11px] font-bold uppercase leading-4 sm:text-xs">{PRIORITY_GROUP_LABEL[item]}</span>
            <span className="mt-1 block text-xl font-black">{counts[item]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="mb-2 block text-sm font-semibold text-textMuted">Buscar</span>
          <span className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-input px-3 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
            <Search className="h-4 w-4 text-textFaint" />
            <input className="w-full bg-transparent text-base text-cream outline-none placeholder:text-textFaint" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o tratamiento" />
          </span>
        </label>
        <FilterSheet
          activeCount={activeFilters.length}
          onOpen={() => setDraft(filters)}
          onApply={() => setFilters(draft)}
          onClear={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Temperatura" value={draft.classification} onChange={(value) => setDraft((current) => ({ ...current, classification: value }))} options={['Lead Caliente', 'Lead Medio', 'Lead Frío']} placeholder="Todas" />
            <Select label="Encargado" value={draft.assigned} onChange={(value) => setDraft((current) => ({ ...current, assigned: value }))} options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))} placeholder="Todos" />
            <Select label="Acción" value={draft.actionType} onChange={(value) => setDraft((current) => ({ ...current, actionType: value }))} options={actionTypeOptions(queue)} placeholder="Todas" />
          </div>
        </FilterSheet>
      </div>
      <ActiveFilterChips items={activeFilters} />

      <div className="space-y-3">
        {visible.length ? visible.map(({ lead, action }) => {
          const task = action.taskId ? tasks.find((item) => item.id === action.taskId) : null;
          return (
            <PendingActionCard
              key={lead.id}
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
        }) : <EmptyState title="Todo al día" text="No hay pacientes en este grupo con los filtros actuales." />}
      </div>
    </section>
  );
}

function actionLabel(value) {
  return {
    initial_contact: 'Nueva consulta',
    confirm_appointment: 'Confirmar cita',
    attendance: 'Registrar asistencia',
    no_show_recovery: 'Recuperar inasistencia',
    quote_followup: 'Seguir presupuesto',
    manual_reminder: 'Recordatorio adicional',
    assign_owner: 'Asignar encargado',
    followup: 'Seguimiento',
  }[value] || 'Próxima acción';
}

function actionTypeOptions(queue) {
  return [...new Set(queue.map(({ action }) => action.actionType))]
    .map((value) => ({ value, label: actionLabel(value) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
