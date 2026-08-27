import { useMemo, useState } from 'react';
import { Ban, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { formatDate, formatTime, fromDatetimeLocalAsuncion, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { APPOINTMENT_STATUS, APPOINTMENT_ACTIVE_STATUSES, canTransitionAppointment, normalizeAppointmentStatus, startOfAsuncionDate } from '../lib/crmDomain';
import { Select } from '../components/crm/CrmPrimitives';
import WhatsAppButton from '../components/crm/WhatsAppButton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import FilterSheet, { ActiveFilterChips } from '../components/ui/FilterSheet';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';

function appointmentAt(appointment) {
  return fromDatetimeLocalAsuncion(`${appointment.appointment_date}T${String(appointment.appointment_time || '').slice(0, 5)}`);
}

export default function AgendaView({ appointments, quotes = [], actionId, onOutcome, onReschedule, onOpenLead, onNavigate, onRegisterQuote, onRegisterOutcome, onWhatsAppOpened, messageTemplates, clinicContext }) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [mode, setMode] = useState('day');
  const [status, setStatus] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const today = todayIsoDate();
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = startOfAsuncionDate(calendarOffset + index);
    return { iso: toLocalIsoDate(date), date };
  }), [calendarOffset]);
  const visibleAppointments = useMemo(() => appointments.filter((appointment) => {
    if (status && normalizeAppointmentStatus(appointment.status) !== status) return false;
    if (mode === 'day') return appointment.appointment_date === selectedDate;
    if (mode === 'upcoming') return appointment.appointment_date >= today;
    if (mode === 'week') {
      const first = calendarDays[0]?.iso;
      const last = calendarDays[calendarDays.length - 1]?.iso;
      return appointment.appointment_date >= first && appointment.appointment_date <= last;
    }
    return true;
  }), [appointments, status, mode, selectedDate, today, calendarDays]);
  const grouped = useMemo(() => Object.entries(visibleAppointments.reduce((acc, appointment) => {
    (acc[appointment.appointment_date] ||= []).push(appointment);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)), [visibleAppointments]);
  const normalizedVisible = visibleAppointments.map((item) => normalizeAppointmentStatus(item.status));

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Calendario operativo" title="Agenda" subtitle="Sólo aparecen acciones válidas para el momento y estado de cada cita." action={<Button type="button" onClick={() => onNavigate('leads')}><CalendarPlus className="h-4 w-4" />Agendar desde Pacientes</Button>} />
      <details className="hidden rounded-lg border border-slate-200 bg-card sm:block">
        <summary className="min-h-12 cursor-pointer px-5 py-4 text-sm font-bold text-textSoft">Resumen de la vista</summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Citas en la vista" value={visibleAppointments.length} icon={CalendarDays} />
          <StatCard label="Confirmadas" value={normalizedVisible.filter((value) => value === APPOINTMENT_STATUS.confirmed).length} tone="success" icon={CheckCircle2} />
          <StatCard label="No asistieron" value={normalizedVisible.filter((value) => value === APPOINTMENT_STATUS.noShow).length} tone="danger" icon={Ban} />
          <StatCard label="Reprogramadas" value={normalizedVisible.filter((value) => value === APPOINTMENT_STATUS.rescheduled).length} tone="purple" icon={RefreshCw} />
        </div>
      </details>

      <Card className="p-4">
        <div className="sm:hidden">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-textMuted">Día</span><input className="input-premium" type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setMode('day'); }} /></label>
          <div className="mt-3"><AgendaFilter status={status} draftStatus={draftStatus} setDraftStatus={setDraftStatus} setStatus={setStatus} /></div>
        </div>
        <div className="hidden flex-col gap-4 sm:flex xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <div><h3 className="font-bold text-cream">Semana visible</h3><p className="mt-1 text-sm text-textMuted">En móvil usá la lista del día; en pantallas grandes podés elegir la semana.</p></div>
              <div className="hidden gap-1 sm:flex">
                <button className="min-h-11 rounded-xl border border-slate-200 bg-card p-2 text-textSoft" type="button" onClick={() => setCalendarOffset((value) => value - 7)} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
                <button className="min-h-11 rounded-xl border border-slate-200 bg-card px-3 text-sm font-semibold text-textSoft" type="button" onClick={() => { setCalendarOffset(0); setSelectedDate(today); setMode('day'); }}>Hoy</button>
                <button className="min-h-11 rounded-xl border border-slate-200 bg-card p-2 text-textSoft" type="button" onClick={() => setCalendarOffset((value) => value + 7)} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map(({ iso, date }) => {
                const count = appointments.filter((appointment) => appointment.appointment_date === iso && APPOINTMENT_ACTIVE_STATUSES.includes(normalizeAppointmentStatus(appointment.status))).length;
                const selected = selectedDate === iso;
                return (
                  <button key={iso} className={`min-h-[78px] rounded-xl border px-1 py-2 text-center transition ${selected ? 'border-mint bg-mint text-inverse' : iso === today ? 'border-mint/45 bg-mint/10 text-mint' : 'border-slate-200 bg-card text-textSoft hover:border-mint/35'}`} type="button" onClick={() => { setSelectedDate(iso); setMode('day'); }}>
                    <span className="block text-xs font-bold uppercase">{new Intl.DateTimeFormat('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' }).format(date).replace('.', '')}</span>
                    <span className="mt-1 block text-lg font-bold">{new Intl.DateTimeFormat('es-PY', { day: '2-digit', timeZone: 'America/Asuncion' }).format(date)}</span>
                    <span className="mt-1 block text-xs font-semibold">{count} {count === 1 ? 'cita' : 'citas'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:w-[360px] xl:grid-cols-1">
            <Select label="Período" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Día seleccionado' }, { value: 'week', label: 'Semana visible' }, { value: 'upcoming', label: 'Próximas citas' }, { value: 'all', label: 'Historial completo' }]} />
            <AgendaFilter status={status} draftStatus={draftStatus} setDraftStatus={setDraftStatus} setStatus={setStatus} />
          </div>
        </div>
      </Card>

      <ActiveFilterChips items={status ? [{ key: 'status', label: status, onRemove: () => setStatus('') }] : []} />

      {grouped.length ? grouped.map(([date, dateAppointments]) => (
        <section key={date} className="space-y-3">
          <div className="flex items-center gap-3"><h3 className="font-bold text-cream">{date === today ? `Hoy · ${formatDate(date)}` : formatDate(date)}</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-sm font-bold text-slate-600">{dateAppointments.length}</span></div>
          <div className="grid gap-3">
            {dateAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} quotes={quotes} actionId={actionId} onOutcome={onOutcome} onReschedule={onReschedule} onOpenLead={onOpenLead} onRegisterQuote={onRegisterQuote} onRegisterOutcome={onRegisterOutcome} onWhatsAppOpened={onWhatsAppOpened} messageTemplates={messageTemplates} clinicContext={clinicContext} />)}
          </div>
        </section>
      )) : <EmptyState title="No hay citas en esta vista" text="Cambiá el día o los filtros. Para crear una cita, abrí Pacientes y elegí Agendar." />}
    </section>
  );
}

function AgendaFilter({ status, draftStatus, setDraftStatus, setStatus }) {
  return (
    <FilterSheet
      activeCount={status ? 1 : 0}
      onOpen={() => setDraftStatus(status)}
      onApply={() => setStatus(draftStatus)}
      onClear={() => { setDraftStatus(''); setStatus(''); }}
    >
      <Select label="Estado" value={draftStatus} onChange={setDraftStatus} options={['Agendado', 'Confirmado', 'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado']} placeholder="Todos" />
    </FilterSheet>
  );
}

function AppointmentCard({ appointment, quotes, actionId, onOutcome, onReschedule, onOpenLead, onRegisterQuote, onRegisterOutcome, onWhatsAppOpened, messageTemplates, clinicContext }) {
  const lead = appointment.leads || {};
  const status = normalizeAppointmentStatus(appointment.status);
  const dateTime = appointmentAt(appointment);
  const now = new Date();
  const isPast = dateTime ? new Date(dateTime) <= now : false;
  const isBusy = actionId.startsWith(`${appointment.id}:`);
  const canConfirm = canTransitionAppointment(status, APPOINTMENT_STATUS.confirmed, dateTime, now);
  const canAttend = canTransitionAppointment(status, APPOINTMENT_STATUS.attended, dateTime, now);
  const canNoShow = canTransitionAppointment(status, APPOINTMENT_STATUS.noShow, dateTime, now);
  const canReschedule = canTransitionAppointment(status, APPOINTMENT_STATUS.rescheduled, dateTime, now);
  const canCancel = canTransitionAppointment(status, APPOINTMENT_STATUS.cancelled, dateTime, now);
  const quote = quotes.find((item) => item.appointment_id === appointment.id) || null;
  const operationalLead = { ...lead, id: lead.id || appointment.lead_id };
  const showWhatsApp = status === APPOINTMENT_STATUS.noShow
    || (APPOINTMENT_ACTIVE_STATUSES.includes(status) && !isPast);

  return (
    <Card as="article" className="card-enter p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex items-center gap-4 xl:w-28"><div className="rounded-2xl border border-mint/20 bg-mint/10 px-4 py-3 text-center text-mint"><Clock3 className="mx-auto h-4 w-4" /><span className="mt-1 block text-xl font-bold">{formatTime(appointment.appointment_time)}</span></div></div>
        <div className="min-w-0 flex-1">
          <button className="text-left text-lg font-bold text-cream hover:text-mint" type="button" onClick={() => appointment.lead_id && onOpenLead(appointment.lead_id)}>{lead.name || 'Paciente asociado'}</button>
          <p className="mt-1 text-base text-textMuted">{appointment.treatment_scheduled || lead.treatment || 'Tratamiento sin definir'} · {appointment.doctor_assigned || 'Sin profesional asignado'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge value={status} />{quote ? <span className="text-sm font-semibold text-mint">Presupuesto registrado</span> : null}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showWhatsApp ? <WhatsAppButton lead={operationalLead} templates={messageTemplates} clinicContext={clinicContext} onOpened={onWhatsAppOpened} /> : null}
          {canConfirm ? <AgendaActionButton icon={Check} label="Confirmar" loading={actionId === `${appointment.id}:confirm`} disabled={isBusy} onClick={() => onOutcome(appointment, 'confirm')} /> : null}
          {canAttend ? <AgendaActionButton icon={UserCheck} label="Asistió" loading={actionId === `${appointment.id}:attended`} disabled={isBusy} onClick={() => onOutcome(appointment, 'attended')} /> : null}
          {canNoShow ? <AgendaActionButton icon={Ban} label="No asistió" loading={actionId === `${appointment.id}:noShow`} disabled={isBusy} onClick={() => onOutcome(appointment, 'noShow')} /> : null}
          {canReschedule ? <Button variant="secondary" type="button" onClick={() => onReschedule(appointment)} disabled={isBusy}><RefreshCw className="h-4 w-4" />Reprogramar</Button> : null}
          {canCancel && !isPast ? <details className="relative"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-card px-4 text-sm font-semibold text-textSoft">Más opciones</summary><div className="absolute right-0 z-10 mt-2 min-w-40 rounded-xl border border-slate-200 bg-card p-2 shadow-xl"><button className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-danger hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={() => onOutcome(appointment, 'cancel')} disabled={isBusy}>Cancelar cita</button></div></details> : null}
          {status === APPOINTMENT_STATUS.attended && !quote ? <Button type="button" onClick={() => onRegisterQuote(operationalLead, appointment)}><FileText className="h-4 w-4" />Registrar presupuesto</Button> : null}
          {status === APPOINTMENT_STATUS.noShow ? <Button variant="secondary" type="button" onClick={() => onRegisterOutcome({ lead: operationalLead, action: { actionType: 'no_show_recovery', appointmentId: appointment.id } })}>Registrar resultado</Button> : null}
        </div>
      </div>
      {isPast && APPOINTMENT_ACTIVE_STATUSES.includes(status) ? <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-sm text-amber-100">La hora ya pasó. Registrá si asistió, no asistió o reprogramá.</p> : null}
    </Card>
  );
}

function AgendaActionButton({ icon: Icon, label, loading, disabled, onClick }) {
  return <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2 text-sm font-semibold text-textSoft transition hover:border-mint/30 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={onClick} disabled={disabled || loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{label}</button>;
}
