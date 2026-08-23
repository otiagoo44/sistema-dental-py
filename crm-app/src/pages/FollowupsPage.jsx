import { useMemo, useState } from 'react';
import { CalendarPlus, Check, CheckCircle2, Clock3, Edit3 } from 'lucide-react';
import { CLASSIFICATIONS, LEAD_STATUSES } from '../lib/constants';
import { formatDateTime, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { ARCHIVED_STATUS, terminalStatuses, LEAD_STATUS, uniqueStrings, isOpenTask, startOfAsuncionDate, daysBetween } from '../lib/crmDomain';
import { getLeadPriority, PRIORITY_FILTERS } from '../lib/commercialInsights';
import { Select } from '../components/crm/CrmPrimitives';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import FilterPanel from '../components/ui/FilterPanel';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import WhatsAppButton from '../components/crm/WhatsAppButton';

export default function FollowupsView({ leads, tasks, appointments, profiles, onOpenLead, onEditLead, onMarkContacted, onScheduleAppointment, onCompleteTask, onPostpone, onWhatsAppOpened, messageTemplates, clinicContext }) {
  const [filters, setFilters] = useState({ assigned: '', priority: '', classification: '', source: '', treatment: '', status: '', window: 'all' });
  const profileNames = useMemo(() => Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])), [profiles]);
  const treatmentOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.treatment)).sort(), [leads]);
  const sourceOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.source)).sort(), [leads]);
  const items = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const inSevenDays = startOfAsuncionDate(7).getTime();

    return leads.flatMap((lead) => {
      if (terminalStatuses.includes(lead.status)) return [];
      const leadTasks = tasks.filter((task) => task.lead_id === lead.id && isOpenTask(task));
      const nextTask = leadTasks.sort((a, b) => new Date(a.due_at || 8640000000000000) - new Date(b.due_at || 8640000000000000))[0] || null;
      const due = lead.next_followup_at || nextTask?.due_at || null;
      const dueMs = due ? new Date(due).getTime() : null;
      const isHotUncontacted = lead.classification === 'Lead Caliente' && ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at;
      const isNewStale = ['Nuevo', 'No Contactado'].includes(lead.status) && new Date(lead.created_at).getTime() < now - 2 * 3600000;
      const isContactedUnscheduled = ['Contactado', 'Respondió', 'Presupuesto Enviado', 'No Respondió'].includes(lead.status);
      const isNoShow = lead.status === LEAD_STATUS.noShow;
      const isUnassigned = !lead.assigned_to;
      if (!due && !nextTask && !isHotUncontacted && !isNewStale && !isContactedUnscheduled && !isNoShow && !isUnassigned) return [];

      let bucket = 'Sin respuesta';
      if (isNoShow) bucket = 'No-shows';
      else if (dueMs && dueMs < now) bucket = 'Vencidos';
      else if (due && toLocalIsoDate(due) === today) bucket = 'Para hoy';
      else if (dueMs && dueMs <= inSevenDays) bucket = 'Próximos 7 días';

      let reason = lead.next_action || 'Definir próxima acción';
      if (isHotUncontacted) reason = `Lead caliente sin contactar desde hace ${Math.max(1, Math.round((now - new Date(lead.created_at).getTime()) / 3600000))} h.`;
      else if (isNoShow) reason = 'No asistió. Reagendar y recuperar hoy.';
      else if (dueMs && dueMs < now) reason = `${lead.next_action || nextTask?.title || 'Seguimiento'} · vencido hace ${daysBetween(due) ? `${daysBetween(due)} d` : 'menos de 1 día'}.`;
      else if (isContactedUnscheduled) reason = `${lead.status}: falta concretar el próximo paso.`;
      else if (isUnassigned) reason = 'Oportunidad sin responsable asignado.';

      return [{ lead, task: nextTask, due, bucket, reason, priority: getLeadPriority(lead, { tasks, appointments }), rank: bucket === 'Vencidos' ? 1 : bucket === 'Para hoy' ? 2 : bucket === 'Próximos 7 días' ? 3 : bucket === 'No-shows' ? 4 : 5 }];
    })
      .filter((item) => {
        const { lead, due } = item;
        if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
        if (filters.classification && lead.classification !== filters.classification) return false;
        if (filters.priority && item.priority.level !== filters.priority) return false;
        if (filters.source && lead.source !== filters.source) return false;
        if (filters.treatment && lead.treatment !== filters.treatment) return false;
        if (filters.status && lead.status !== filters.status) return false;
        if (filters.window === 'overdue' && item.bucket !== 'Vencidos') return false;
        if (filters.window === 'today' && item.bucket !== 'Para hoy') return false;
        if (filters.window === 'next7' && item.bucket !== 'Próximos 7 días') return false;
        if (filters.window === 'hot' && lead.classification !== 'Lead Caliente') return false;
        return Boolean(due || item.reason);
      })
      .sort((a, b) => a.rank - b.rank || new Date(a.due || 8640000000000000) - new Date(b.due || 8640000000000000));
  }, [leads, tasks, appointments, filters]);

  const groups = ['Vencidos', 'Para hoy', 'Próximos 7 días', 'No-shows', 'Sin respuesta'];

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Cola de acción" title="Seguimientos" subtitle="Contactá primero estos leads para evitar que se enfríen." />
      <FilterPanel title="Filtrar seguimientos" description="Reducí la cola por responsable, prioridad o momento de contacto.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <Select label="Responsable" value={filters.assigned} onChange={(value) => setFilters({ ...filters, assigned: value })} options={(profiles || []).map((profile) => ({ value: profile.id, label: profile.full_name }))} placeholder="Todos" />
          <Select label="Semáforo" value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value })} options={PRIORITY_FILTERS} placeholder="Todos" />
          <Select label="Clasificación" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" />
          <Select label="Fuente" value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={sourceOptions} placeholder="Todas" />
          <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
          <Select label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS)} placeholder="Todos" />
          <Select label="Cuándo" value={filters.window} onChange={(value) => setFilters({ ...filters, window: value })} options={[{ value: 'all', label: 'Todos' }, { value: 'overdue', label: 'Vencidos' }, { value: 'today', label: 'Para hoy' }, { value: 'next7', label: 'Próximos 7 días' }, { value: 'hot', label: 'Sólo calientes' }]} />
        </div>
      </FilterPanel>

      {items.length ? groups.map((group) => {
        const groupItems = items.filter((item) => item.bucket === group);
        if (!groupItems.length) return null;
        return (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-cream">{group}</h3>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{groupItems.length}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {groupItems.map(({ lead, task, reason, due, priority }) => (
                <Card key={`${group}-${lead.id}`} as="article" className="card-enter p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <button className="text-left text-lg font-bold text-cream hover:text-mint" type="button" onClick={() => onOpenLead(lead.id)}>{lead.name}</button>
                      <p className="mt-1 text-sm font-medium text-slate-600">{reason}</p>
                      <p className="mt-2 text-xs text-slate-500">{lead.treatment || 'Tratamiento sin definir'} · {lead.source || 'Fuente sin definir'} · {profileNames[lead.assigned_to] || 'Sin responsable'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2"><PriorityBadge priority={priority} /><StatusBadge value={lead.classification} /><StatusBadge value={lead.status} /></div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Clock3 className="h-4 w-4 text-mint" /> Próximo seguimiento: {due ? formatDateTime(due) : 'Definir ahora'}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button size="sm" type="button" onClick={() => onOpenLead(lead.id)}>Abrir lead</Button>
                    <WhatsAppButton lead={lead} task={task} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                    {['Nuevo', 'No Contactado', 'No Respondió'].includes(lead.status) ? <Button size="sm" variant="secondary" type="button" onClick={() => onMarkContacted(lead)}><Check className="h-4 w-4" />Marcar contactado</Button> : null}
                    <Button size="sm" variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
                    {task ? <Button size="sm" variant="secondary" type="button" onClick={() => onCompleteTask(task.id)}><CheckCircle2 className="h-4 w-4" />Completar tarea</Button> : null}
                    <select className="min-h-9 rounded-xl border border-slate-200 bg-input px-3 py-2 text-xs font-semibold text-textSoft outline-none focus:border-mint" defaultValue="" aria-label={`Posponer seguimiento de ${lead.name}`} onChange={(event) => { if (event.target.value) onPostpone(lead, Number(event.target.value)); event.target.value = ''; }}>
                      <option value="" disabled>Posponer…</option>
                      <option value="1">Mañana</option><option value="3">En 3 días</option><option value="7">En 7 días</option>
                    </select>
                    <Button size="sm" variant="ghost" type="button" onClick={() => onEditLead(lead)}><Edit3 className="h-4 w-4" />Crear nota</Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      }) : <EmptyState title="No hay seguimientos con estos filtros" text="Cuando un lead necesite una acción, aparecerá acá con su recomendación." />}
    </section>
  );
}
