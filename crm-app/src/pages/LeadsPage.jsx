import { useMemo, useState } from 'react';
import { Archive, ArrowDownUp, CalendarPlus, ChevronLeft, Edit3, FilePlus, Flame, History, Phone, Search } from 'lucide-react';
import { CLASSIFICATIONS, LEAD_STATUSES } from '../lib/constants';
import { formatDateTime, formatMoney, normalizeText, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { buildCommercialTimeline, getLeadPriority, PRIORITY_FILTERS } from '../lib/commercialInsights';
import { isArchivedLead, displayConsultationReason, uniqueStrings } from '../lib/crmDomain';
import { getEffectiveNextAction } from '../lib/nextActions';
import { Info, Select } from '../components/crm/CrmPrimitives';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import FilterPanel from '../components/ui/FilterPanel';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import WhatsAppButton from '../components/crm/WhatsAppButton';

export default function LeadsView({ leads, tasks, appointments, quotes = [], canAdmin, onCreateLead, onOpenLead, onRegisterOutcome, onWhatsAppOpened, messageTemplates, clinicContext, profiles }) {
  const [filters, setFilters] = useState({ status: '', classification: '', priority: '', treatment: '', source: '', assigned: '', date: '', q: '', uncontacted: false, hotOnly: false, unassignedOnly: false, showArchived: false, sort: 'recent' });
  const treatmentOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.treatment)).sort(), [leads]);
  const sourceOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.source)).sort(), [leads]);
  const profileNames = useMemo(() => Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])), [profiles]);
  const filteredLeads = useMemo(() => {
    const q = normalizeText(filters.q);
    const today = todayIsoDate();
    const now = Date.now();
    const rows = leads.filter((lead) => {
      if ((!canAdmin || !filters.showArchived) && isArchivedLead(lead)) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (canAdmin && filters.classification && lead.classification !== filters.classification) return false;
      if (canAdmin && filters.priority && getLeadPriority(lead, { tasks, appointments }).level !== filters.priority) return false;
      if (filters.treatment && lead.treatment !== filters.treatment) return false;
      if (filters.source && lead.source !== filters.source) return false;
      if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
      if (filters.uncontacted && (lead.last_contact_at || !['Nuevo', 'No Contactado'].includes(lead.status))) return false;
      if (canAdmin && filters.hotOnly && lead.classification !== 'Lead Caliente') return false;
      if (filters.unassignedOnly && lead.assigned_to) return false;
      if (filters.date === 'today' && toLocalIsoDate(lead.created_at) !== today) return false;
      if (filters.date === '7d' && new Date(lead.created_at).getTime() < now - 7 * 86400000) return false;
      if (filters.date === 'month' && toLocalIsoDate(lead.created_at).slice(0, 7) !== today.slice(0, 7)) return false;
      return !q || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus} ${lead.consultation_reason}`).includes(q);
    });

    return rows.sort((a, b) => {
      if (canAdmin && filters.sort === 'hot') return CLASSIFICATIONS.indexOf(a.classification) - CLASSIFICATIONS.indexOf(b.classification) || new Date(b.created_at) - new Date(a.created_at);
      if (filters.sort === 'followup') return new Date(a.next_followup_at || 8640000000000000) - new Date(b.next_followup_at || 8640000000000000);
      if (filters.sort === 'overdue') return Number(Boolean(b.next_followup_at && new Date(b.next_followup_at).getTime() < now)) - Number(Boolean(a.next_followup_at && new Date(a.next_followup_at).getTime() < now));
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [leads, filters, canAdmin, tasks, appointments]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Directorio" title="Pacientes" subtitle="Encontrá rápidamente qué necesita cada persona y cuál es el próximo paso." action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nueva consulta</Button>} />
      <FilterPanel
        title="Buscar pacientes"
        description="Búsqueda, estado y tratamiento quedan visibles. El resto está en Más filtros."
        alwaysContent={(
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-textMuted">Buscar paciente</span>
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-input px-3 transition focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
                <Search className="h-4 w-4 text-slate-400" />
                <input className="w-full bg-transparent text-base text-cream outline-none placeholder:text-slate-400" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Nombre o teléfono" />
              </span>
            </label>
            <Select label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES} placeholder="Todos" />
            <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
          </div>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canAdmin ? <Select label="Clasificación interna" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" /> : null}
          {canAdmin ? <Select label="Prioridad interna" value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value })} options={PRIORITY_FILTERS} placeholder="Todas" /> : null}
          <Select label="Fuente" value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={sourceOptions} placeholder="Todas" />
          <Select label="Encargado" value={filters.assigned} onChange={(value) => setFilters({ ...filters, assigned: value })} options={(profiles || []).map((profile) => ({ value: profile.id, label: profile.full_name }))} placeholder="Todos" />
          <Select label="Fecha de ingreso" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} options={[{ value: 'today', label: 'Hoy' }, { value: '7d', label: 'Últimos 7 días' }, { value: 'month', label: 'Este mes' }]} placeholder="Cualquier fecha" />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <QuickFilter active={filters.uncontacted} onClick={() => setFilters({ ...filters, uncontacted: !filters.uncontacted })}>Sólo sin contactar</QuickFilter>
            {canAdmin ? <QuickFilter active={filters.hotOnly} onClick={() => setFilters({ ...filters, hotOnly: !filters.hotOnly })}><Flame className="h-3.5 w-3.5" />Sólo calientes</QuickFilter> : null}
            <QuickFilter active={filters.unassignedOnly} onClick={() => setFilters({ ...filters, unassignedOnly: !filters.unassignedOnly })}>Sin encargado</QuickFilter>
            {canAdmin ? <QuickFilter active={filters.showArchived} onClick={() => setFilters({ ...filters, showArchived: !filters.showArchived })}><Archive className="h-3.5 w-3.5" />Archivados</QuickFilter> : null}
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-slate-400" />
            <select className="min-h-10 rounded-xl border border-slate-200 bg-input px-3 text-sm font-medium text-textSoft outline-none focus:border-mint" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
              <option value="recent">Más recientes</option>{canAdmin ? <option value="hot">Más calientes</option> : null}<option value="followup">Próxima acción</option><option value="overdue">Más atrasados</option>
            </select>
            <span className="text-xs font-semibold text-slate-500">{filteredLeads.length} resultados</span>
          </div>
        </div>
      </FilterPanel>

      {filteredLeads.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLeads.map((lead) => {
            const action = getEffectiveNextAction(lead, { tasks, appointments, quotes });
            const quote = quotes.filter((item) => item.lead_id === lead.id).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0] || null;
            const task = action?.taskId ? tasks.find((item) => item.id === action.taskId) : null;
            return (
            <Card key={lead.id} as="article" className="card-enter overflow-hidden">
              <button className="w-full p-5 text-left transition hover:bg-slate-50" type="button" onClick={() => onOpenLead(lead.id)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-cream">{lead.name}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4 text-mint" />{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
                  </div>
                  {quote ? <p className="text-base font-bold text-mint">{formatMoney(quote.amount)} · {displayQuoteStatus(quote.status)}</p> : null}
                </div>
                <p className="mt-4 text-base font-semibold text-textSoft">{lead.treatment || 'Tratamiento por definir'}</p>
                <div className="mt-4 rounded-xl border border-slate-200 bg-soft p-4">
                  <p className="text-sm font-semibold text-textMuted">Qué hay que hacer</p>
                  <p className="mt-1 text-base font-bold text-cream">{action?.title || 'Sin acciones pendientes'}</p>
                  <p className="mt-1 text-sm leading-6 text-textMuted">{action?.dueAt ? formatDateTime(action.dueAt) : 'Sin fecha'} · Encargado: {profileNames[lead.assigned_to] || 'Sin asignar'}</p>
                </div>
              </button>
              <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:justify-end">
                <WhatsAppButton lead={lead} task={task} action={action} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                {action ? <Button variant="secondary" type="button" onClick={() => onRegisterOutcome({ lead, action, task })}>Registrar resultado</Button> : null}
              </div>
            </Card>
            );
          })}
        </div>
      ) : <EmptyState title="No hay pacientes para estos filtros" text="Quitá uno o más filtros o registrá una nueva consulta." action={<Button type="button" onClick={onCreateLead}>Nueva consulta</Button>} />}
    </section>
  );
}

function QuickFilter({ active, onClick, children }) {
  return <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${active ? 'border-mint/45 bg-mint/10 text-mint' : 'border-slate-200 bg-card text-textSoft hover:border-mint/30 hover:bg-elevated hover:text-cream'}`} type="button" onClick={onClick}>{children}</button>;
}

function displayQuoteStatus(status) {
  return { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado', cancelled: 'Cancelado' }[status] || 'Sin estado';
}

export function LeadDetail({ lead, events, tasks, appointments, quotes = [], profiles, canAdmin, onBack, onEditLead, onArchiveLead, onScheduleAppointment, onRegisterOutcome, onRegisterQuote, onWhatsAppOpened, messageTemplates, clinicContext }) {
  if (!lead) {
    return <EmptyState title="Paciente no encontrado" text="Volvé a Pacientes y seleccioná un registro." />;
  }

  const priority = getLeadPriority(lead, { tasks, appointments });
  const timeline = buildCommercialTimeline({ lead, events, tasks, appointments, profiles });
  const leadQuotes = quotes.filter((quote) => quote.lead_id === lead.id).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
  const effectiveAction = getEffectiveNextAction(lead, { tasks, appointments, quotes });
  const actionTask = effectiveAction?.taskId ? tasks.find((task) => task.id === effectiveAction.taskId) : null;
  const latestAppointment = appointments.filter((appointment) => appointment.lead_id === lead.id).at(-1) || null;

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card className="p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-mint hover:text-goldHover" type="button" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />Volver a pacientes
            </button>
            <h2 className="text-2xl font-semibold">{lead.name}</h2>
            <p className="mt-1 text-slate-500">{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={lead.classification} />
            <StatusBadge value={lead.status} />
            <PriorityBadge priority={priority} />
            <Button size="sm" variant="secondary" type="button" onClick={() => onEditLead(lead)}>
              <Edit3 className="h-4 w-4" />
              Editar
            </Button>
            {canAdmin && !isArchivedLead(lead) ? (
              <Button size="sm" variant="danger" type="button" onClick={() => onArchiveLead(lead)}>
                <Archive className="h-4 w-4" />
                Archivar
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Info label="Tratamiento" value={lead.treatment || 'Sin dato'} />
          <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
          <Info label="Score" value={lead.score} />
          <Info label="Situacion" value={lead.situation || 'Sin dato'} />
          <Info label="Evaluacion previa" value={lead.evaluation_previous || 'Sin dato'} />
          <Info label="Motivo consulta" value={displayConsultationReason(lead)} />
          <Info label="Estimación por tratamiento (no es presupuesto)" value={formatMoney(lead.estimated_value)} />
          <Info label="Fuente" value={lead.source || 'Sin dato'} />
          <Info label="Pagina" value={lead.page || 'Sin dato'} />
          <Info label="Ultimo contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Sin registro'} />
          <Info label="Intentos" value={lead.contact_attempts} />
          <Info label="Creado" value={formatDateTime(lead.created_at)} />
          {lead.lost_reason ? <Info label="Motivo de pérdida" value={`${lead.lost_reason}${lead.lost_reason_note ? ` · ${lead.lost_reason_note}` : ''}`} /> : null}
        </div>

        {leadQuotes.length ? (
          <section className="mt-6 rounded-2xl border border-mint/20 bg-mint/[0.05] p-4">
            <h3 className="font-bold text-cream">Presupuestos reales</h3>
            <div className="mt-3 space-y-2">
              {leadQuotes.map((quote) => <div key={quote.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-card p-3 sm:flex-row sm:items-center"><span><strong className="text-cream">{quote.treatment}</strong><span className="mt-1 block text-sm text-textMuted">{formatDateTime(quote.issued_at)} · {quote.professional_name || 'Profesional no indicado'}</span></span><span className="flex flex-wrap items-center gap-2"><strong className="text-mint">{formatMoney(quote.amount)} · {quote.status === 'pending' ? 'Pendiente' : quote.status === 'accepted' ? 'Aceptado' : quote.status === 'rejected' ? 'Rechazado' : 'Cancelado'}</strong>{quote.status === 'pending' ? <Button size="sm" variant="secondary" type="button" onClick={() => onRegisterOutcome({ lead, quote, action: { actionType: 'quote_followup', quoteId: quote.id } })}>Registrar resultado</Button> : null}</span></div>)}
            </div>
          </section>
        ) : null}

        {effectiveAction ? <div className="mt-6 rounded-2xl border border-slate-200 bg-soft p-4"><p className="text-sm font-semibold text-textMuted">Qué hacer después</p><p className="mt-1 text-lg font-bold text-cream">{effectiveAction.title}</p><p className="mt-1 text-sm text-textMuted">{effectiveAction.dueAt ? formatDateTime(effectiveAction.dueAt) : 'Sin fecha'}</p></div> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <WhatsAppButton
            lead={lead}
            task={actionTask}
            action={effectiveAction}
            templates={messageTemplates}
            clinicContext={clinicContext}
            onOpened={onWhatsAppOpened}
            label="Abrir WhatsApp"
            className="min-h-11 px-4 py-2.5 text-sm"
          />
          {effectiveAction ? <Button variant="secondary" type="button" onClick={() => onRegisterOutcome({ lead, action: effectiveAction, task: actionTask })}>Registrar resultado</Button> : null}
          {['Asistió', 'Presupuesto Enviado'].includes(lead.status) ? <Button variant="secondary" type="button" onClick={() => onRegisterQuote(lead, latestAppointment)}><FilePlus className="h-4 w-4" />{leadQuotes.length ? 'Otro presupuesto' : 'Registrar presupuesto'}</Button> : null}
          {canAdmin ? <Button variant="ghost" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button> : null}
        </div>
      </Card>

      <aside className="rounded-2xl border border-slate-200 bg-card p-5 text-cream shadow-glow">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-mint" />
          <h3 className="text-lg font-semibold">Historial comercial</h3>
        </div>
        {timeline.length ? (
          <div className="relative space-y-3 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-slate-200">
            {timeline.map((item) => (
              <div key={item.id} className="relative pl-6">
                <span className="absolute left-0 top-4 h-3.5 w-3.5 rounded-full border-2 border-card bg-mint" />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-cream">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.at)} · {item.actor}</p>
                  {item.description ? <p className="mt-2 text-sm text-slate-500">{item.description}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin actividad comercial" text="Las acciones, citas y próximos pasos de este paciente aparecerán acá." />
        )}
      </aside>
    </section>
  );
}
