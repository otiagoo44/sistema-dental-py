import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import { TREATMENT_OPTIONS } from '../../lib/constants';
import { normalizeText, todayIsoDate, toLocalIsoDate } from '../../lib/formatters';
import { humanizeCrmError } from '../../lib/errors';
import { ROLE, LEAD_STATUS, APPOINTMENT_ACTIVE_STATUSES, uniqueStrings, startOfAsuncionDate } from '../../lib/crmDomain';
import { Select } from '../crm/CrmPrimitives';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import ModalShell from '../ui/ModalShell';

function getAppointmentFormDefaults({ clinic, lead, appointment }) {
  return {
    appointment_date: appointment?.appointment_date || todayIsoDate(),
    appointment_time: appointment?.appointment_time ? appointment.appointment_time.slice(0, 5) : '',
    doctor_assigned: appointment?.doctor_assigned || clinic?.doctor_name || 'Sin asignar',
    treatment_scheduled: appointment?.treatment_scheduled || lead?.treatment || '',
    notes: appointment?.notes || '',
  };
}

function buildTimeSlots(openingHours, selectedDate) {
  const fallback = [[8 * 60, 12 * 60], [14 * 60, 18 * 60]];
  const day = selectedDate ? new Date(`${selectedDate}T12:00:00Z`).getUTCDay() : 1;
  const segments = String(openingHours || '').split(';').map((value) => value.trim()).filter(Boolean);
  const selectedSegment = day === 6
    ? segments.find((value) => /s[aá]bado/i.test(value))
    : day === 0
      ? segments.find((value) => /domingo/i.test(value))
      : segments.find((value) => /lunes|viernes|semana/i.test(value)) || segments[0];
  const ranges = [...String(selectedSegment || '').matchAll(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g)]
    .map((match) => [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])])
    .filter(([start, end]) => start >= 0 && end <= 24 * 60 && end > start);
  const periods = ranges.length ? ranges : fallback;
  return periods.flatMap(([start, end]) => {
    const slots = [];
    for (let minutes = start; minutes < end; minutes += 30) {
      slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
    return slots;
  });
}

export default function AppointmentModal({ clinic, lead, appointment, appointments, profiles, clinicSettings, mode, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getAppointmentFormDefaults({ clinic, lead, appointment }));
  const [formError, setFormError] = useState('');
  const isReschedule = mode === 'reschedule';
  const timeSlots = useMemo(() => buildTimeSlots(clinicSettings?.opening_hours, form.appointment_date), [clinicSettings?.opening_hours, form.appointment_date]);
  const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = startOfAsuncionDate(index);
    return { iso: toLocalIsoDate(date), date };
  }), []);
  const doctorOptions = useMemo(() => uniqueStrings([
    appointment?.doctor_assigned,
    clinic?.doctor_name,
    ...(appointments || []).map((item) => item.doctor_assigned),
    ...(profiles || []).filter((profile) => profile.role !== ROLE.receptionist).map((profile) => profile.full_name),
    'Sin asignar',
  ]), [appointment?.doctor_assigned, clinic?.doctor_name, appointments, profiles]);
  const treatmentOptions = useMemo(() => uniqueStrings([
    lead?.treatment,
    ...(Array.isArray(clinicSettings?.treatments) ? clinicSettings.treatments.map((item) => typeof item === 'string' ? item : item?.name || item?.treatment) : []),
    ...TREATMENT_OPTIONS,
  ]), [lead?.treatment, clinicSettings]);
  const occupiedTimes = useMemo(() => new Set((appointments || [])
    .filter((item) => item.id !== appointment?.id
      && item.appointment_date === form.appointment_date
      && normalizeText(item.doctor_assigned) === normalizeText(form.doctor_assigned)
      && APPOINTMENT_ACTIVE_STATUSES.includes(item.status))
    .map((item) => String(item.appointment_time).slice(0, 5))), [appointments, appointment?.id, form.appointment_date, form.doctor_assigned]);

  useEffect(() => {
    setForm(getAppointmentFormDefaults({ clinic, lead, appointment }));
    setFormError('');
  }, [appointment?.id, clinic?.doctor_name, lead?.id, mode]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.appointment_date) {
      setFormError('Selecciona la fecha de consulta.');
      return;
    }

    if (!form.appointment_time) {
      setFormError('Elegí un horario disponible.');
      return;
    }

    if (!form.doctor_assigned.trim()) {
      setFormError('Elegí el profesional de la cita.');
      return;
    }

    if (occupiedTimes.has(form.appointment_time)) {
      setFormError('Ese horario ya está ocupado. Elegí otro slot disponible.');
      return;
    }

    setFormError('');

    try {
      await onSubmit({
        appointment_date: form.appointment_date,
        appointment_time: form.appointment_time,
        doctor_assigned: form.doctor_assigned.trim(),
        treatment_scheduled: form.treatment_scheduled.trim(),
        notes: form.notes.trim(),
      });
    } catch (submitError) {
      setFormError(humanizeCrmError(submitError, 'No se pudo guardar la consulta. Intentá de nuevo.'));
    }
  }

  return (
    <ModalShell
      className="max-w-4xl p-4 sm:p-6"
      onClose={onClose}
      closeDisabled={saving}
      titleId="appointment-modal-title"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">{isReschedule ? 'Reprogramar' : 'Nuevo turno'}</p>
            <h2 id="appointment-modal-title" className="mt-1 text-2xl font-bold tracking-tight text-cream">{isReschedule ? 'Reprogramar consulta' : 'Agendar consulta'}</h2>
            <p className="mt-1 text-sm text-slate-500">{lead?.name || 'Paciente asociado'} · elegí día, profesional y horario.</p>
          </div>
          <StatusBadge value={LEAD_STATUS.scheduled} />
        </div>

        {formError ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-sm font-bold text-cream">1. Elegí el día</p><p className="mt-1 text-xs text-slate-500">Próximos 14 días</p></div>
                <label className="text-xs font-semibold text-slate-500">Otra fecha <input className="ml-2 rounded-lg border border-slate-200 bg-input px-2 py-1.5 text-textSoft outline-none focus:border-mint" type="date" min={todayIsoDate()} value={form.appointment_date} onChange={(event) => { updateField('appointment_date', event.target.value); updateField('appointment_time', ''); }} disabled={saving} /></label>
              </div>
              <div className="scrollbar-soft mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {dateOptions.map(({ iso, date }) => {
                  const selected = form.appointment_date === iso;
                  return (
                    <button key={iso} className={`min-h-[74px] rounded-xl border px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:border-slate-200/60 disabled:bg-soft disabled:text-slate-500 ${selected ? 'border-mint bg-mint text-inverse shadow-sm' : 'border-slate-200 bg-card text-textSoft hover:border-mint/35 hover:bg-elevated'}`} type="button" onClick={() => { updateField('appointment_date', iso); updateField('appointment_time', ''); }} disabled={saving} data-autofocus={selected || undefined}>
                      <span className="block text-xs font-bold uppercase">{new Intl.DateTimeFormat('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' }).format(date).replace('.', '')}</span>
                      <span className="mt-1 block text-lg font-bold">{new Intl.DateTimeFormat('es-PY', { day: '2-digit', timeZone: 'America/Asuncion' }).format(date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="2. Profesional" value={form.doctor_assigned} onChange={(value) => { updateField('doctor_assigned', value); updateField('appointment_time', ''); }} options={doctorOptions} disabled={saving} />
              <Select label="Tratamiento agendado" value={form.treatment_scheduled} onChange={(value) => updateField('treatment_scheduled', value)} options={treatmentOptions} placeholder="Seleccionar tratamiento" disabled={saving} />
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-500">Notas opcionales</span>
              <textarea className="input-premium min-h-24" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} disabled={saving} placeholder="Indicaciones comerciales o de coordinación (sin datos clínicos sensibles)." />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-cream">3. Elegí un horario</p>
            <p className="mt-1 text-xs text-slate-500">Slots de 30 minutos. Los ocupados están bloqueados.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {timeSlots.map((time) => {
                const occupied = occupiedTimes.has(time);
                const selected = form.appointment_time === time;
                return (
                  <button key={time} className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition disabled:cursor-not-allowed ${occupied ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-300/65 line-through' : selected ? 'border-mint bg-mint text-inverse shadow-sm disabled:border-slate-200/60 disabled:bg-soft disabled:text-slate-500' : 'border-slate-200 bg-card text-textSoft hover:border-mint/35 hover:bg-elevated disabled:border-slate-200/60 disabled:bg-soft disabled:text-slate-500'}`} type="button" onClick={() => !occupied && updateField('appointment_time', time)} disabled={saving || occupied} aria-label={`${time}${occupied ? ', ocupado' : ', disponible'}`}>
                    {time}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-mint" />Seleccionado</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-card ring-1 ring-slate-300" />Disponible</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-400/50" />Ocupado</span></div>
            {clinicSettings?.opening_hours ? <p className="mt-4 rounded-xl border border-slate-200 bg-soft p-3 text-sm leading-6 text-textMuted">Horario configurado: {clinicSettings.opening_hours}. Si el formato no puede interpretarse, se usa el horario compatible 08:00–12:00 y 14:00–18:00.</p> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving}>
            {!saving ? <CalendarCheck2 className="h-4 w-4" /> : null}
            {isReschedule ? 'Guardar reprogramación' : 'Agendar cita'}
          </Button>
        </div>
    </ModalShell>
  );
}
