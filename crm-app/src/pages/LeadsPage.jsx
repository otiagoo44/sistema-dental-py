import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDownUp, CalendarPlus, Check, ChevronLeft, Clipboard, Edit3, FilePlus, Flame, History, Phone, Plus, Save, Search } from 'lucide-react';
import { CLASSIFICATIONS, LEAD_STATUSES, NEXT_ACTION_OPTIONS } from '../lib/constants';
import { formatDateTime, formatMoney, fromDatetimeLocalAsuncion, normalizeText, todayIsoDate, toDatetimeLocalAsuncion, toLocalIsoDate } from '../lib/formatters';
import { buildLeadMessage, selectWhatsAppTemplateKey } from '../lib/messages';
import { buildCommercialTimeline, getLeadPriority, PRIORITY_FILTERS } from '../lib/commercialInsights';
import { ARCHIVED_STATUS, LEAD_STATUS, isArchivedLead, displayConsultationReason, uniqueStrings } from '../lib/crmDomain';
import { Info, Select, Field } from '../components/crm/CrmPrimitives';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import FilterPanel from '../components/ui/FilterPanel';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import WhatsAppButton from '../components/crm/WhatsAppButton';

export default function LeadsView({ leads, tasks, appointments, canAdmin, onCreateLead, onEditLead, onArchiveLead, onMarkLost, onOpenLead, onUpdateLead, onScheduleAppointment, onCreateTask, onMarkContacted, onWhatsAppOpened, onMessageCopied, messageTemplates, clinicContext, profiles, setNotice }) {
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
      if (filters.classification && lead.classification !== filters.classification) return false;
      if (filters.priority && getLeadPriority(lead, { tasks, appointments }).level !== filters.priority) return false;
      if (filters.treatment && lead.treatment !== filters.treatment) return false;
      if (filters.source && lead.source !== filters.source) return false;
      if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
      if (filters.uncontacted && (lead.last_contact_at || !['Nuevo', 'No Contactado'].includes(lead.status))) return false;
      if (filters.hotOnly && lead.classification !== 'Lead Caliente') return false;
      if (filters.unassignedOnly && lead.assigned_to) return false;
      if (filters.date === 'today' && toLocalIsoDate(lead.created_at) !== today) return false;
      if (filters.date === '7d' && new Date(lead.created_at).getTime() < now - 7 * 86400000) return false;
      if (filters.date === 'month' && toLocalIsoDate(lead.created_at).slice(0, 7) !== today.slice(0, 7)) return false;
      return !q || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus} ${lead.consultation_reason}`).includes(q);
    });

    return rows.sort((a, b) => {
      if (filters.sort === 'hot') return CLASSIFICATIONS.indexOf(a.classification) - CLASSIFICATIONS.indexOf(b.classification) || new Date(b.created_at) - new Date(a.created_at);
      if (filters.sort === 'followup') return new Date(a.next_followup_at || 8640000000000000) - new Date(b.next_followup_at || 8640000000000000);
      if (filters.sort === 'overdue') return Number(Boolean(b.next_followup_at && new Date(b.next_followup_at).getTime() < now)) - Number(Boolean(a.next_followup_at && new Date(a.next_followup_at).getTime() < now));
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [leads, filters, canAdmin, tasks, appointments]);

  async function copyMessage(lead) {
    await navigator.clipboard.writeText(buildLeadMessage(lead, messageTemplates, clinicContext));
    await onMessageCopied?.({ lead, templateKey: selectWhatsAppTemplateKey(lead) });
    if (!onMessageCopied) setNotice('Mensaje copiado.');
  }

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Oportunidades" title="Leads" subtitle="Buscá, filtrá y mové cada oportunidad hacia su próxima acción." action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nuevo lead</Button>} />
      <FilterPanel
        title="Encontrá la oportunidad correcta"
        description="La búsqueda queda siempre visible; abrí los filtros avanzados cuando los necesites."
        alwaysContent={(
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Buscar por nombre o teléfono</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-input px-3 transition focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-slate-400" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Ej. Laura o 0981…" />
            </span>
          </label>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Estado comercial" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES} placeholder="Todos" />
          <Select label="Clasificación" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" />
          <Select label="Semáforo" value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value })} options={PRIORITY_FILTERS} placeholder="Todos" />
          <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
          <Select label="Fuente" value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={sourceOptions} placeholder="Todas" />
          <Select label="Responsable" value={filters.assigned} onChange={(value) => setFilters({ ...filters, assigned: value })} options={(profiles || []).map((profile) => ({ value: profile.id, label: profile.full_name }))} placeholder="Todos" />
          <Select label="Fecha de ingreso" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} options={[{ value: 'today', label: 'Hoy' }, { value: '7d', label: 'Últimos 7 días' }, { value: 'month', label: 'Este mes' }]} placeholder="Cualquier fecha" />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <QuickFilter active={filters.uncontacted} onClick={() => setFilters({ ...filters, uncontacted: !filters.uncontacted })}>Sólo sin contactar</QuickFilter>
            <QuickFilter active={filters.hotOnly} onClick={() => setFilters({ ...filters, hotOnly: !filters.hotOnly })}><Flame className="h-3.5 w-3.5" />Sólo calientes</QuickFilter>
            <QuickFilter active={filters.unassignedOnly} onClick={() => setFilters({ ...filters, unassignedOnly: !filters.unassignedOnly })}>Sin responsable</QuickFilter>
            {canAdmin ? <QuickFilter active={filters.showArchived} onClick={() => setFilters({ ...filters, showArchived: !filters.showArchived })}><Archive className="h-3.5 w-3.5" />Archivados</QuickFilter> : null}
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-slate-400" />
            <select className="min-h-10 rounded-xl border border-slate-200 bg-input px-3 text-sm font-medium text-textSoft outline-none focus:border-mint" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
              <option value="recent">Más recientes</option><option value="hot">Más calientes</option><option value="followup">Seguimiento más próximo</option><option value="overdue">Más atrasados</option>
            </select>
            <span className="text-xs font-semibold text-slate-500">{filteredLeads.length} resultados</span>
          </div>
        </div>
      </FilterPanel>

      {filteredLeads.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLeads.map((lead) => {
            const priority = getLeadPriority(lead, { tasks, appointments });
            return (
            <Card key={lead.id} as="article" className="card-enter overflow-hidden">
              <button className="w-full p-5 text-left transition hover:bg-slate-50" type="button" onClick={() => onOpenLead(lead.id)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-cream">{lead.name}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4 text-mint" />{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><PriorityBadge priority={priority} /><StatusBadge value={lead.classification} /><StatusBadge value={lead.status} /></div>
                </div>
                <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Tratamiento" value={lead.treatment || 'Sin definir'} />
                  <Info label="Fuente" value={lead.source || 'Sin definir'} />
                  <Info label="Responsable" value={profileNames[lead.assigned_to] || 'Sin responsable'} />
                  <Info label="Próxima acción" value={lead.next_action || 'Definir acción'} />
                  <Info label="Próximo seguimiento" value={lead.next_followup_at ? formatDateTime(lead.next_followup_at) : 'Sin fecha'} />
                  <Info label="Último contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Todavía no contactado'} />
                </div>
              </button>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 p-4">
                <Button size="sm" type="button" onClick={() => onOpenLead(lead.id)}>Ver detalle</Button>
                {['Nuevo', 'No Contactado', 'No Respondió'].includes(lead.status) ? <Button size="sm" variant="secondary" type="button" onClick={() => onMarkContacted(lead)}><Check className="h-4 w-4" />Contactado</Button> : null}
                <Button size="sm" variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
                <WhatsAppButton lead={lead} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} />
                <Button size="sm" variant="ghost" type="button" onClick={() => copyMessage(lead)}><Clipboard className="h-4 w-4" />Copiar mensaje</Button>
                {canAdmin ? <Button size="sm" variant="ghost" type="button" onClick={() => onCreateTask(lead)}><Plus className="h-4 w-4" />Crear tarea</Button> : null}
                <Button size="sm" variant="ghost" type="button" onClick={() => onEditLead(lead)}><Edit3 className="h-4 w-4" />Editar</Button>
                <select className="min-h-9 rounded-xl border border-slate-200 bg-input px-3 py-2 text-xs font-semibold text-textSoft outline-none focus:border-mint" value={lead.status} aria-label={`Estado comercial de ${lead.name}`} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus === LEAD_STATUS.scheduled && nextStatus !== lead.status) onScheduleAppointment(lead); else if (nextStatus === 'Perdido' && nextStatus !== lead.status) onMarkLost(lead); else onUpdateLead(lead.id, { status: nextStatus }); }}>
                  {LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS).map((status) => <option key={status}>{status}</option>)}
                </select>
                {canAdmin && !isArchivedLead(lead) ? <Button size="sm" variant="danger" type="button" onClick={() => onArchiveLead(lead)}><Archive className="h-4 w-4" />Archivar</Button> : null}
              </div>
            </Card>
            );
          })}
        </div>
      ) : <EmptyState title="No hay leads para estos filtros" text="Quitá uno o más filtros o registrá una nueva oportunidad." action={<Button type="button" onClick={onCreateLead}>Nuevo lead</Button>} />}
    </section>
  );
}

function QuickFilter({ active, onClick, children }) {
  return <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${active ? 'border-mint/45 bg-mint/10 text-mint' : 'border-slate-200 bg-card text-textSoft hover:border-mint/30 hover:bg-elevated hover:text-cream'}`} type="button" onClick={onClick}>{children}</button>;
}

export function LeadDetail({ lead, events, tasks, appointments, profiles, canAdmin, onBack, onEditLead, onArchiveLead, onMarkLost, onSave, onMarkContacted, onScheduleAppointment, onWhatsAppOpened, onMessageCopied, messageTemplates, clinicContext, setNotice }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (lead) {
      setForm({
        status: lead.status || 'Nuevo',
        notes: lead.notes || '',
        next_action: lead.next_action || '',
        next_followup_at: toDatetimeLocalAsuncion(lead.next_followup_at),
      });
    }
  }, [lead]);

  if (!lead || !form) {
    return <EmptyState title="Lead no encontrado" text="Volver a Leads y seleccionar un registro." />;
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(buildLeadMessage(lead, messageTemplates, clinicContext));
    await onMessageCopied?.({ lead, templateKey: selectWhatsAppTemplateKey(lead) });
    if (!onMessageCopied) setNotice('Mensaje copiado.');
  }

  function saveForm() {
    onSave(lead.id, {
      status: form.status,
      notes: form.notes,
      next_action: form.next_action,
      next_followup_at: fromDatetimeLocalAsuncion(form.next_followup_at),
    });
  }

  function handleStatusChange(value) {
    if (value === LEAD_STATUS.scheduled && value !== lead.status) {
      onScheduleAppointment(lead);
      return;
    }

    if (value === 'Perdido' && value !== lead.status) {
      onMarkLost(lead);
      return;
    }

    setForm({ ...form, status: value });
  }

  const priority = getLeadPriority(lead, { tasks, appointments });
  const timeline = buildCommercialTimeline({ lead, events, tasks, appointments, profiles });

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card className="p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-mint hover:text-goldHover" type="button" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />Volver a leads
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
          <Info label="Valor estimado" value={formatMoney(lead.estimated_value)} />
          <Info label="Fuente" value={lead.source || 'Sin dato'} />
          <Info label="Pagina" value={lead.page || 'Sin dato'} />
          <Info label="Ultimo contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Sin registro'} />
          <Info label="Intentos" value={lead.contact_attempts} />
          <Info label="Creado" value={formatDateTime(lead.created_at)} />
          {lead.lost_reason ? <Info label="Motivo de pérdida" value={`${lead.lost_reason}${lead.lost_reason_note ? ` · ${lead.lost_reason_note}` : ''}`} /> : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Select label="Estado comercial" value={form.status} onChange={handleStatusChange} options={isArchivedLead(lead) ? LEAD_STATUSES : LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS)} />
          <Select label="Próxima acción" value={form.next_action} onChange={(value) => setForm({ ...form, next_action: value })} options={NEXT_ACTION_OPTIONS} />
          <Field label="Próximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => setForm({ ...form, next_followup_at: value })} />
          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Notas</span>
            <textarea className="input-premium min-h-32" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={saveForm}>
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
          <Button variant="secondary" type="button" onClick={() => onMarkContacted(lead)}>
            <Check className="h-4 w-4" />Registrar contacto
          </Button>
          <Button variant="secondary" type="button" onClick={() => onSave(lead.id, { contact_attempts: Number(lead.contact_attempts || 0) + 1 })}>
            <Plus className="h-4 w-4" />
            Aumentar intentos
          </Button>
          <Button variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
          <WhatsAppButton
            lead={lead}
            templates={messageTemplates}
            clinicContext={clinicContext}
            onOpened={onWhatsAppOpened}
            label="Abrir WhatsApp"
            className="min-h-11 px-4 py-2.5 text-sm"
          />
          <Button variant="ghost" type="button" onClick={copyMessage}>
            <Clipboard className="h-4 w-4" />
            Copiar mensaje
          </Button>
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
          <EmptyState title="Sin actividad comercial" text="Las acciones, tareas y citas de este lead aparecerán acá." />
        )}
      </aside>
    </section>
  );
}
