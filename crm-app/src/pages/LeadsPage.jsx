import { useMemo, useState } from 'react';
import { Archive, BellPlus, CalendarPlus, ChevronLeft, CircleX, Copy, Edit3, Ellipsis, FilePlus, History, Search } from 'lucide-react';
import { CLASSIFICATIONS, LEAD_STATUSES } from '../lib/constants';
import { formatDate, formatDateTime, formatMoney, formatTime, normalizeText, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { buildCommercialTimeline } from '../lib/commercialInsights';
import { displayConsultationReason, isArchivedLead, uniqueStrings } from '../lib/crmDomain';
import { getEffectiveNextAction, PRIORITY_GROUP, PRIORITY_GROUP_LABEL } from '../lib/nextActions';
import { Info, Select } from '../components/crm/CrmPrimitives';
import WhatsAppButton from '../components/crm/WhatsAppButton';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import FilterSheet, { ActiveFilterChips } from '../components/ui/FilterSheet';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import TemperatureBadge from '../components/ui/TemperatureBadge';

const EMPTY_FILTERS = {
  status: '', treatment: '', classification: '', priority: '', assigned: '', source: '', date: '', showArchived: false, sort: 'recent',
};

export default function LeadsView({ leads, tasks, appointments, quotes = [], canAdmin, onCreateLead, onOpenLead, profiles = [] }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const treatmentOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.treatment)).sort(), [leads]);
  const sourceOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.source_normalized || lead.source)).sort(), [leads]);
  const profileNames = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name || profile.email])), [profiles]);
  const rows = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const today = todayIsoDate();
    const now = new Date();
    return leads.filter((lead) => {
      const action = getEffectiveNextAction(lead, { tasks, appointments, quotes, now });
      if ((!canAdmin || !filters.showArchived) && isArchivedLead(lead)) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.treatment && lead.treatment !== filters.treatment) return false;
      if (filters.classification && lead.classification !== filters.classification) return false;
      if (filters.priority && action?.priorityGroup !== filters.priority) return false;
      if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
      if (filters.source && (lead.source_normalized || lead.source) !== filters.source) return false;
      if (filters.date === 'today' && toLocalIsoDate(lead.created_at) !== today) return false;
      if (filters.date === '7d' && new Date(lead.created_at).getTime() < now.getTime() - 7 * 86_400_000) return false;
      if (filters.date === '30d' && new Date(lead.created_at).getTime() < now.getTime() - 30 * 86_400_000) return false;
      return !normalizedQuery || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus} ${lead.treatment} ${lead.consultation_reason}`).includes(normalizedQuery);
    }).sort((left, right) => {
      if (filters.sort === 'name') return left.name.localeCompare(right.name);
      if (filters.sort === 'score') return Number(right.score || 0) - Number(left.score || 0);
      if (filters.sort === 'oldest') return new Date(left.created_at) - new Date(right.created_at);
      return new Date(right.created_at) - new Date(left.created_at);
    });
  }, [leads, tasks, appointments, quotes, canAdmin, filters, query]);

  const chips = buildFilterChips(filters, setFilters, profileNames);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Directorio" title="Pacientes" subtitle="Encontrá una persona y abrí su información completa." action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nueva consulta</Button>} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="mb-2 block text-sm font-semibold text-textMuted">Buscar</span>
          <span className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-input px-3 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
            <Search className="h-4 w-4 text-textFaint" />
            <input className="w-full bg-transparent text-base text-cream outline-none placeholder:text-textFaint" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" />
          </span>
        </label>
        <FilterSheet
          activeCount={chips.length}
          onOpen={() => setDraft(filters)}
          onApply={() => setFilters(draft)}
          onClear={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Estado" value={draft.status} onChange={(value) => setDraft((current) => ({ ...current, status: value }))} options={LEAD_STATUSES} placeholder="Todos" />
            <Select label="Tratamiento" value={draft.treatment} onChange={(value) => setDraft((current) => ({ ...current, treatment: value }))} options={treatmentOptions} placeholder="Todos" />
            <Select label="Temperatura" value={draft.classification} onChange={(value) => setDraft((current) => ({ ...current, classification: value }))} options={CLASSIFICATIONS} placeholder="Todas" />
            <Select label="Prioridad" value={draft.priority} onChange={(value) => setDraft((current) => ({ ...current, priority: value }))} options={Object.entries(PRIORITY_GROUP_LABEL).map(([value, label]) => ({ value, label }))} placeholder="Todas" />
            <Select label="Encargado" value={draft.assigned} onChange={(value) => setDraft((current) => ({ ...current, assigned: value }))} options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))} placeholder="Todos" />
            <Select label="Fuente" value={draft.source} onChange={(value) => setDraft((current) => ({ ...current, source: value }))} options={sourceOptions} placeholder="Todas" />
            <Select label="Fecha" value={draft.date} onChange={(value) => setDraft((current) => ({ ...current, date: value }))} options={[{ value: 'today', label: 'Hoy' }, { value: '7d', label: 'Últimos 7 días' }, { value: '30d', label: 'Últimos 30 días' }]} placeholder="Cualquier fecha" />
            <Select label="Orden" value={draft.sort} onChange={(value) => setDraft((current) => ({ ...current, sort: value }))} options={[{ value: 'recent', label: 'Más recientes' }, { value: 'oldest', label: 'Más antiguos' }, { value: 'name', label: 'Nombre' }, { value: 'score', label: 'Mayor score' }]} />
            {canAdmin ? <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-soft px-3 text-sm font-semibold text-textSoft sm:col-span-2"><input type="checkbox" checked={draft.showArchived} onChange={(event) => setDraft((current) => ({ ...current, showArchived: event.target.checked }))} />Mostrar archivados</label> : null}
          </div>
        </FilterSheet>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilterChips items={chips} />
        <p className="text-sm font-semibold text-textMuted">{rows.length} resultados</p>
      </div>

      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((lead) => {
            const action = getEffectiveNextAction(lead, { tasks, appointments, quotes });
            return (
              <Card key={lead.id} as="article" className="overflow-hidden">
                <button className="h-full w-full p-5 text-left transition hover:bg-elevated" type="button" onClick={() => onOpenLead(lead.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 truncate text-lg font-bold text-cream">{lead.name}</h2>
                    <TemperatureBadge value={lead.classification} />
                  </div>
                  <p className="mt-4 text-base font-semibold text-textSoft">{lead.treatment || 'Tratamiento por definir'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge value={lead.status} />
                    {action?.priorityGroup === PRIORITY_GROUP.now || action?.priorityGroup === PRIORITY_GROUP.today ? (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${action.priorityGroup === PRIORITY_GROUP.now ? 'border-rose-400/30 bg-rose-400/10 text-rose-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>{action.priorityGroup === PRIORITY_GROUP.now ? 'Atender ahora' : 'Atender hoy'}</span>
                    ) : null}
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState title="No hay pacientes para estos filtros" text="Quitá uno o más filtros o registrá una nueva consulta." action={<Button type="button" onClick={onCreateLead}>Nueva consulta</Button>} />}
    </section>
  );
}

function buildFilterChips(filters, setFilters, profileNames) {
  const labels = {
    status: filters.status,
    treatment: filters.treatment,
    classification: filters.classification?.replace('Lead ', ''),
    priority: PRIORITY_GROUP_LABEL[filters.priority],
    assigned: profileNames[filters.assigned],
    source: filters.source,
    date: { today: 'Hoy', '7d': '7 días', '30d': '30 días' }[filters.date],
    showArchived: filters.showArchived ? 'Archivados' : '',
  };
  return Object.entries(labels).filter(([, label]) => label).map(([key, label]) => ({
    key,
    label,
    onRemove: () => setFilters((current) => ({ ...current, [key]: key === 'showArchived' ? false : '' })),
  }));
}

export function LeadDetail({ lead, events, tasks, appointments, quotes = [], profiles, canAdmin, onBack, onEditLead, onArchiveLead, onMarkLost, onScheduleAppointment, onCreateTask, onRegisterOutcome, onRegisterQuote, onWhatsAppOpened, messageTemplates, clinicContext }) {
  if (!lead) return <EmptyState title="Paciente no encontrado" text="Volvé a Pacientes y seleccioná un registro." />;

  const timeline = buildCommercialTimeline({ lead, events, tasks, appointments, profiles });
  const leadAppointments = appointments.filter((item) => item.lead_id === lead.id).sort((a, b) => `${b.appointment_date}${b.appointment_time}`.localeCompare(`${a.appointment_date}${a.appointment_time}`));
  const leadQuotes = quotes.filter((quote) => quote.lead_id === lead.id).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
  const effectiveAction = getEffectiveNextAction(lead, { tasks, appointments, quotes });
  const actionTask = effectiveAction?.taskId ? tasks.find((task) => task.id === effectiveAction.taskId) : null;
  const latestAppointment = leadAppointments[0] || null;
  const assignee = profiles.find((profile) => profile.id === lead.assigned_to);

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <button className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-mint hover:text-goldHover" type="button" onClick={onBack}><ChevronLeft className="h-4 w-4" />Volver a pacientes</button>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-cream">{lead.name}</h1>
            <p className="mt-1 text-base text-textMuted">{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
            <div className="mt-3 flex flex-wrap gap-2"><TemperatureBadge value={lead.classification} /><StatusBadge value={lead.status} />{effectiveAction ? <span className="rounded-full border border-mint/25 bg-mint/[0.07] px-2.5 py-1 text-xs font-bold text-mint">{PRIORITY_GROUP_LABEL[effectiveAction.priorityGroup]}</span> : null}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <WhatsAppButton lead={lead} task={actionTask} action={effectiveAction} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} label="WhatsApp" />
            {effectiveAction ? <Button type="button" onClick={() => onRegisterOutcome({ lead, action: effectiveAction, task: actionTask })}>Registrar resultado</Button> : null}
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 text-sm font-semibold text-textSoft hover:bg-elevated"><Ellipsis className="h-5 w-5" />Más</summary>
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-card p-2 shadow-xl">
                {canAdmin ? <MenuAction icon={Edit3} label="Editar" onClick={() => onEditLead(lead)} /> : null}
                <MenuAction icon={CalendarPlus} label="Agendar cita" onClick={() => onScheduleAppointment(lead)} />
                {onCreateTask ? <MenuAction icon={BellPlus} label="Crear recordatorio" onClick={() => onCreateTask(lead)} /> : null}
                {lead.phone_plus || lead.phone ? <MenuAction icon={Copy} label="Copiar teléfono" onClick={() => navigator.clipboard.writeText(lead.phone_plus || lead.phone)} /> : null}
                {canAdmin && onMarkLost && !['Perdido', 'Tratamiento Iniciado', 'Archivado'].includes(lead.status) ? <MenuAction icon={CircleX} label="Marcar como perdido" onClick={() => onMarkLost(lead)} danger /> : null}
                {canAdmin && !isArchivedLead(lead) ? <MenuAction icon={Archive} label="Archivar" onClick={() => onArchiveLead(lead)} danger /> : null}
              </div>
            </details>
          </div>
        </div>
      </Card>

      <DetailSection title="Resumen" open>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Tratamiento" value={lead.treatment || 'Sin dato'} />
          <Info label="Estado" value={lead.status} />
          <Info label="Encargado" value={assignee?.full_name || assignee?.email || 'Sin asignar'} />
        </div>
        {effectiveAction ? <div className="mt-4 rounded-lg border border-mint/20 bg-mint/[0.05] p-4"><p className="text-sm font-semibold text-textMuted">Próxima acción</p><p className="mt-1 text-lg font-bold text-cream">{effectiveAction.title}</p><p className="mt-1 text-sm text-textMuted">{effectiveAction.dueAt ? formatDateTime(effectiveAction.dueAt) : 'Sin fecha'}</p></div> : null}
        {canAdmin ? <ScoreExplanation lead={lead} /> : null}
      </DetailSection>

      <DetailSection title="Actividad" icon={History}>
        {timeline.length ? <div className="space-y-3">{timeline.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-soft p-3"><p className="font-semibold text-cream">{item.title}</p><p className="mt-1 text-xs text-textMuted">{formatDateTime(item.at)} · {item.actor}</p>{item.description ? <p className="mt-2 text-sm text-textSoft">{item.description}</p> : null}</div>)}</div> : <EmptyState title="Sin actividad" text="Las acciones de este paciente aparecerán acá." />}
      </DetailSection>

      <DetailSection title={`Citas (${leadAppointments.length})`}>
        {leadAppointments.length ? <div className="space-y-2">{leadAppointments.map((appointment) => <div key={appointment.id} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-soft p-3 sm:flex-row sm:items-center"><span><strong className="text-cream">{formatDate(appointment.appointment_date)} · {formatTime(appointment.appointment_time)}</strong><span className="mt-1 block text-sm text-textMuted">{appointment.treatment_scheduled || lead.treatment || 'Tratamiento por definir'} · {appointment.doctor_assigned || 'Sin profesional'}</span></span><StatusBadge value={appointment.status} /></div>)}</div> : <EmptyState title="Sin citas" text="Todavía no hay citas registradas." />}
      </DetailSection>

      <DetailSection title={`Presupuestos (${leadQuotes.length})`}>
        {leadQuotes.length ? <div className="space-y-2">{leadQuotes.map((quote) => <div key={quote.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-soft p-3 sm:flex-row sm:items-center"><span><strong className="text-cream">{quote.treatment}</strong><span className="mt-1 block text-sm text-textMuted">{formatDateTime(quote.issued_at)} · {quote.professional_name || 'Profesional no indicado'}</span></span><span className="flex flex-wrap items-center gap-2"><strong className="text-mint">{formatMoney(quote.amount)} · {quoteStatus(quote.status)}</strong>{quote.status === 'pending' ? <Button size="sm" variant="secondary" type="button" onClick={() => onRegisterOutcome({ lead, quote, action: { actionType: 'quote_followup', quoteId: quote.id } })}>Registrar resultado</Button> : null}</span></div>)}</div> : <div><EmptyState title="Sin presupuestos" text="Todavía no hay presupuestos registrados." />{['Asistió', 'Presupuesto Enviado'].includes(lead.status) ? <Button className="mt-3" type="button" onClick={() => onRegisterQuote(lead, latestAppointment)}><FilePlus className="h-4 w-4" />Registrar presupuesto</Button> : null}</div>}
        {leadQuotes.length && ['Asistió', 'Presupuesto Enviado'].includes(lead.status) ? <Button className="mt-3" variant="secondary" type="button" onClick={() => onRegisterQuote(lead, latestAppointment)}><FilePlus className="h-4 w-4" />Otro presupuesto</Button> : null}
      </DetailSection>

      <DetailSection title="Notas">
        <p className="whitespace-pre-wrap text-sm leading-6 text-textSoft">{lead.notes || 'Sin notas internas.'}</p>
      </DetailSection>

      <DetailSection title="Más información">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Urgencia declarada" value={lead.urgency || 'Sin dato'} />
          <Info label="Situación" value={lead.situation || 'Sin dato'} />
          <Info label="Evaluación previa" value={lead.evaluation_previous || 'Sin dato'} />
          <Info label="Motivo de consulta" value={displayConsultationReason(lead)} />
          <Info label="Fuente registrada" value={lead.source || 'Sin dato'} />
          <Info label="Fuente normalizada" value={lead.source_normalized || 'Otros'} />
          <Info label="Página" value={lead.page || lead.landing_page || 'Sin dato'} />
          <Info label="Último contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Sin registro'} />
          <Info label="Intentos" value={lead.contact_attempts} />
          <Info label="Creado" value={formatDateTime(lead.created_at)} />
          {canAdmin && lead.utm_source ? <Info label="UTM source" value={lead.utm_source} /> : null}
          {canAdmin && lead.utm_campaign ? <Info label="UTM campaign" value={lead.utm_campaign} /> : null}
          {lead.lost_reason ? <Info label="Motivo de pérdida" value={`${lead.lost_reason}${lead.lost_reason_note ? ` · ${lead.lost_reason_note}` : ''}`} /> : null}
        </div>
      </DetailSection>
    </section>
  );
}

function DetailSection({ title, icon: Icon, open = false, children }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-card" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-4 font-bold text-cream">{Icon ? <Icon className="h-4 w-4 text-mint" /> : null}{title}</summary>
      <div className="border-t border-slate-200 p-5">{children}</div>
    </details>
  );
}

function ScoreExplanation({ lead }) {
  const reasons = Array.isArray(lead.score_breakdown) ? lead.score_breakdown : [];
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-soft">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-textSoft">Score: {lead.score} · {lead.classification.replace('Lead ', '')} · ¿Por qué?</summary>
      <div className="border-t border-slate-200 p-4">
        {reasons.length ? <div className="space-y-2">{reasons.map((reason) => <div key={`${reason.key}-${reason.label}`} className="flex items-start justify-between gap-4 text-sm"><span className="text-textSoft">{reason.label}</span><strong className={Number(reason.points) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{Number(reason.points) >= 0 ? '+' : ''}{reason.points}</strong></div>)}</div> : <p className="text-sm text-textMuted">El breakdown estará disponible después de aplicar la migración de scoring.</p>}
        <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-textMuted">El score mide potencial e intención. La prioridad operativa se calcula por tiempo y próxima acción.</p>
      </div>
    </details>
  );
}

function MenuAction({ icon: Icon, label, onClick, danger = false }) {
  return <button className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-elevated ${danger ? 'text-rose-300' : 'text-textSoft hover:text-cream'}`} type="button" onClick={onClick}><Icon className="h-4 w-4" />{label}</button>;
}

function quoteStatus(status) {
  return { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado', cancelled: 'Cancelado' }[status] || 'Sin estado';
}
