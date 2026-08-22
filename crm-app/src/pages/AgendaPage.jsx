import { useMemo, useState } from 'react';
import { Ban, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Loader2, MessageCircle, RefreshCw, UserCheck } from 'lucide-react';
import { formatDate, formatTime, todayIsoDate, toLocalIsoDate } from '../lib/formatters';
import { buildWhatsappUrl } from '../lib/messages';
import { APPOINTMENT_STATUS, APPOINTMENT_ACTIVE_STATUSES, startOfAsuncionDate } from '../lib/crmDomain';
import { Select } from '../components/crm/CrmPrimitives';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';

export default function AgendaView({ appointments, actionId, onOutcome, onReschedule, onOpenLead, onNavigate }) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [mode, setMode] = useState('week');
  const [status, setStatus] = useState('');
  const today = todayIsoDate();
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = startOfAsuncionDate(calendarOffset + index);
    return { iso: toLocalIsoDate(date), date };
  }), [calendarOffset]);
  const visibleAppointments = useMemo(() => appointments.filter((appointment) => {
    if (status && appointment.status !== status) return false;
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

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Calendario operativo" title="Agenda" subtitle="Revisá turnos, disponibilidad y asistencia sin escribir horarios manualmente." action={<Button type="button" onClick={() => onNavigate('leads')}><CalendarPlus className="h-4 w-4" />Agendar desde Leads</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Citas de hoy" value={appointments.filter((item) => item.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(item.status)).length} icon={CalendarDays} />
        <StatCard label="Confirmadas" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length} tone="success" icon={CheckCircle2} />
        <StatCard label="No-shows" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.noShow).length} tone="danger" icon={Ban} />
        <StatCard label="Reprogramaciones" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length} tone="purple" icon={RefreshCw} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-cream">Semana actual</h3>
                <p className="mt-1 text-xs text-slate-500">Elegí un día para enfocarte en sus turnos.</p>
              </div>
              <div className="flex gap-1">
                <button className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" type="button" onClick={() => setCalendarOffset((value) => value - 7)} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
                <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={() => { setCalendarOffset(0); setSelectedDate(today); }}>Hoy</button>
                <button className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" type="button" onClick={() => setCalendarOffset((value) => value + 7)} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map(({ iso, date }) => {
                const count = appointments.filter((appointment) => appointment.appointment_date === iso && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)).length;
                const selected = selectedDate === iso;
                return (
                  <button key={iso} className={`min-h-[76px] rounded-xl border px-1 py-2 text-center transition ${selected ? 'border-mint bg-mint text-[#080a0f] shadow-sm' : iso === today ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`} type="button" onClick={() => { setSelectedDate(iso); setMode('day'); }}>
                    <span className="block text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' }).format(date).replace('.', '')}</span>
                    <span className="mt-1 block text-lg font-bold">{new Intl.DateTimeFormat('es-PY', { day: '2-digit', timeZone: 'America/Asuncion' }).format(date)}</span>
                    <span className={`mt-1 block text-[10px] ${selected ? 'text-white/80' : 'text-slate-400'}`}>{count} {count === 1 ? 'cita' : 'citas'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:w-[360px]">
            <Select label="Vista" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Día seleccionado' }, { value: 'week', label: 'Semana visible' }, { value: 'upcoming', label: 'Próximas citas' }, { value: 'all', label: 'Todas' }]} />
            <Select label="Estado" value={status} onChange={setStatus} options={['Agendado', 'Confirmado', 'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado']} placeholder="Todos" />
          </div>
        </div>
      </Card>

      {grouped.length ? grouped.map(([date, dateAppointments]) => (
        <section key={date} className="space-y-3">
          <div className="flex items-center gap-3"><h3 className="font-bold text-cream">{formatDate(date)}</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{dateAppointments.length}</span></div>
          <div className="grid gap-3">
            {dateAppointments.map((appointment) => {
              const lead = appointment.leads || {};
              const isBusy = actionId.startsWith(`${appointment.id}:`);
              return (
                <Card key={appointment.id} as="article" className="card-enter p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex items-center gap-4 xl:w-28">
                      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-blue-700"><Clock3 className="mx-auto h-4 w-4" /><span className="mt-1 block text-lg font-bold">{formatTime(appointment.appointment_time)}</span></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <button className="text-left text-lg font-bold text-cream hover:text-mint" type="button" onClick={() => appointment.lead_id && onOpenLead(appointment.lead_id)}>{lead.name || 'Lead asociado'}</button>
                      <p className="mt-1 text-sm text-slate-500">{appointment.treatment_scheduled || lead.treatment || 'Tratamiento sin definir'} · {appointment.doctor_assigned || 'Sin profesional asignado'}</p>
                      <div className="mt-2"><StatusBadge value={appointment.status} /></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-mint px-3 py-2 text-xs font-semibold text-[#080a0f] transition hover:bg-blue-700" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                      <AgendaActionButton icon={Check} label="Confirmar" loading={actionId === `${appointment.id}:confirm`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.confirmed} onClick={() => onOutcome(appointment, 'confirm')} />
                      <AgendaActionButton icon={UserCheck} label="Asistió" loading={actionId === `${appointment.id}:attended`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.attended} onClick={() => onOutcome(appointment, 'attended')} />
                      <AgendaActionButton icon={Ban} label="No asistió" loading={actionId === `${appointment.id}:noShow`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.noShow} onClick={() => onOutcome(appointment, 'noShow')} />
                      <Button size="sm" variant="secondary" type="button" onClick={() => onReschedule(appointment)} disabled={isBusy}><RefreshCw className="h-4 w-4" />Reprogramar</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )) : <EmptyState title="No hay citas en esta vista" text="Cambiá el día o los filtros. Para crear un turno, abrí un lead y elegí Agendar." />}
    </section>
  );
}

function AgendaActionButton({ icon: Icon, label, loading, disabled, onClick }) {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
