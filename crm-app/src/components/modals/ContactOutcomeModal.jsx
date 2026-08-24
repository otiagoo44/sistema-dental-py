import { useMemo, useState } from 'react';
import { Ban, CalendarPlus, Check, Clock3, FileText, MessageCircleOff, Stethoscope, UserCheck } from 'lucide-react';
import { addDaysAsuncion, toDatetimeLocalAsuncion, fromDatetimeLocalAsuncion } from '../../lib/formatters';
import { humanizeCrmError } from '../../lib/errors';
import ModalShell from '../ui/ModalShell';
import Button from '../ui/Button';
import { ModalHeader } from './ModalParts';
import { Field, TextArea } from '../crm/CrmPrimitives';

export default function ContactOutcomeModal({ context, saving, quotes = [], onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [followupPreset, setFollowupPreset] = useState('tomorrow');
  const [customFollowup, setCustomFollowup] = useState(toDatetimeLocalAsuncion(addDaysAsuncion(1, 9)));
  const [error, setError] = useState('');
  const lead = context?.lead;
  const pendingQuote = useMemo(() => context?.quote
    || quotes.find((quote) => quote.id === context?.action?.quoteId && quote.status === 'pending')
    || quotes.find((quote) => quote.lead_id === lead?.id && quote.status === 'pending')
    || null, [context?.quote, context?.action?.quoteId, quotes, lead?.id]);
  const acceptedQuote = useMemo(() => quotes.find((quote) => quote.lead_id === lead?.id && quote.status === 'accepted') || null, [quotes, lead?.id]);
  const actionType = context?.action?.actionType;
  const attendanceContext = actionType === 'attendance';
  const quoteContext = Boolean(pendingQuote) || actionType === 'quote_followup' || lead?.status === 'Presupuesto Enviado';
  const quoteRegistrationContext = !pendingQuote && (actionType === 'quote_registration' || lead?.status === 'Asistió');
  const noShowContext = actionType === 'no_show_recovery' || lead?.status === 'No Asistió';
  if (!lead) return null;

  function selectedFollowupAt() {
    if (followupPreset === 'tomorrow') return addDaysAsuncion(1, 9);
    if (followupPreset === '3d') return addDaysAsuncion(3, 9);
    return fromDatetimeLocalAsuncion(customFollowup);
  }

  async function submit(outcome, extra = {}) {
    const followupAt = selectedFollowupAt();
    if (outcome === 'quote_rejected' && !note.trim()) {
      setError('Escribí el motivo del rechazo antes de continuar.');
      return;
    }
    if (['no_response', 'follow_up', 'responded'].includes(outcome)
      && (!followupAt || new Date(followupAt) <= new Date())) {
      setError('Elegí una fecha futura para el próximo contacto.');
      return;
    }
    setError('');
    try {
      await onSubmit({ outcome, note, followupAt, quote: pendingQuote, ...extra });
    } catch (submitError) {
      setError(humanizeCrmError(submitError, 'No pudimos guardar el cambio. Intentá de nuevo.'));
    }
  }

  return (
    <ModalShell className="max-w-2xl p-5 sm:p-6" onClose={onClose} closeDisabled={saving} titleId="contact-outcome-title" descriptionId="contact-outcome-description" onSubmit={(event) => event.preventDefault()}>
      <ModalHeader title={`¿Qué pasó con ${lead.name}?`} subtitle="Elegí un resultado; el sistema actualizará el resto." onClose={onClose} disabled={saving} titleId="contact-outcome-title" />
      <p id="contact-outcome-description" className="text-base leading-7 text-textMuted">Registrá una sola vez lo que ocurrió; el sistema preparará el próximo paso.</p>
      {error ? <div role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {attendanceContext ? <OutcomeButton icon={UserCheck} label="Asistió" onClick={() => submit('attended')} disabled={saving} /> : null}
        {attendanceContext ? <OutcomeButton icon={Ban} label="No asistió" onClick={() => submit('no_show')} disabled={saving} /> : null}
        {!attendanceContext && !quoteContext && !quoteRegistrationContext && !noShowContext ? <OutcomeButton icon={Check} label="Respondió" onClick={() => submit('responded')} disabled={saving} /> : null}
        {!quoteContext && !quoteRegistrationContext ? <OutcomeButton icon={CalendarPlus} label={attendanceContext || noShowContext ? 'Reprogramar cita' : 'Agendó una cita'} onClick={() => submit('schedule')} disabled={saving} /> : null}
        {!attendanceContext && !quoteRegistrationContext ? <OutcomeButton icon={MessageCircleOff} label="No respondió" onClick={() => submit('no_response')} disabled={saving} /> : null}
        {!attendanceContext && !quoteRegistrationContext ? <OutcomeButton icon={Clock3} label="Volver a contactar después" onClick={() => submit('follow_up')} disabled={saving} /> : null}
        {quoteRegistrationContext ? <OutcomeButton icon={FileText} label="Registrar presupuesto" onClick={() => submit('quote_pending')} disabled={saving} /> : null}
        {pendingQuote ? <OutcomeButton icon={Check} label="Aceptó el presupuesto" onClick={() => submit('quote_accepted')} disabled={saving} /> : null}
        {pendingQuote ? <OutcomeButton icon={Ban} label="Rechazó el presupuesto" onClick={() => submit('quote_rejected')} disabled={saving} /> : null}
        {acceptedQuote ? <OutcomeButton icon={Stethoscope} label="Inició tratamiento" onClick={() => submit('treatment_started')} disabled={saving} /> : null}
        <OutcomeButton icon={Ban} label="No continuará" onClick={() => submit('no_continue')} disabled={saving} danger />
      </div>

      {!attendanceContext && !quoteRegistrationContext ? <div className="mt-5 rounded-2xl border border-slate-200 bg-soft p-4">
        <p className="text-sm font-bold text-cream">Si hay que volver a contactar, ¿cuándo?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[['tomorrow', 'Mañana'], ['3d', 'En 3 días'], ['custom', 'Elegir fecha']].map(([value, label]) => (
            <button key={value} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${followupPreset === value ? 'border-mint bg-mint/10 text-mint' : 'border-slate-200 bg-card text-textSoft'}`} type="button" onClick={() => setFollowupPreset(value)} disabled={saving}>{label}</button>
          ))}
        </div>
        {followupPreset === 'custom' ? <Field className="mt-4" label="Fecha y hora" type="datetime-local" value={customFollowup} onChange={setCustomFollowup} disabled={saving} /> : null}
      </div> : null}

      <TextArea label="Nota (opcional; obligatoria al rechazar presupuesto)" value={note} onChange={setNote} disabled={saving} className="mt-5" placeholder="Ej. pidió que volvamos a escribir por la tarde" />
      <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
        <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cerrar sin registrar</Button>
      </div>
    </ModalShell>
  );
}

function OutcomeButton({ icon: Icon, label, onClick, disabled, danger = false }) {
  return <Button className="min-h-12 justify-start" variant={danger ? 'danger' : 'secondary'} type="button" onClick={onClick} disabled={disabled} data-autofocus><Icon className="h-5 w-5" />{label}</Button>;
}
