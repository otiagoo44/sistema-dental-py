import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { addDaysAsuncion, fromDatetimeLocalAsuncion, toDatetimeLocalAsuncion } from '../../lib/formatters';
import { humanizeCrmError } from '../../lib/errors';
import { TREATMENT_OPTIONS } from '../../lib/constants';
import { findTreatmentPrice, quoteTreatmentOptions } from '../../lib/quoteDefaults';
import { Field, Select, TextArea } from '../crm/CrmPrimitives';
import Button from '../ui/Button';
import ModalShell from '../ui/ModalShell';
import { ModalActions, ModalHeader } from './ModalParts';

function defaults(context, treatmentPrices = []) {
  const treatment = context?.quote?.treatment || context?.lead?.treatment || '';
  const referencePrice = findTreatmentPrice(treatment, treatmentPrices);
  return {
    treatment,
    amount: context?.quote?.amount || referencePrice || '',
    professional_name: context?.quote?.professional_name || context?.appointment?.doctor_assigned || '',
    next_action_at: toDatetimeLocalAsuncion(context?.quote?.next_action_at || addDaysAsuncion(1, 9)),
    notes: context?.quote?.notes || '',
  };
}

export default function QuoteModal({ context, treatmentPrices = [], saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => defaults(context, treatmentPrices));
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(defaults(context, treatmentPrices));
    setError('');
  }, [context?.lead?.id, context?.quote?.id, treatmentPrices]);

  async function submit() {
    if (!String(form.treatment).trim()) return setError('Ingresá el tratamiento presupuestado.');
    if (!Number(form.amount) || Number(form.amount) <= 0) return setError('El monto debe ser mayor que cero.');
    const nextActionAt = fromDatetimeLocalAsuncion(form.next_action_at);
    if (!nextActionAt || new Date(nextActionAt) <= new Date()) return setError('Elegí un seguimiento futuro.');
    setError('');
    try {
      await onSubmit({ ...form, amount: Number(form.amount), next_action_at: nextActionAt });
    } catch (submitError) {
      setError(humanizeCrmError(submitError, 'No se pudo guardar el presupuesto. Intentá de nuevo.'));
    }
  }

  function updateTreatment(treatment) {
    setForm((current) => {
      const nextReferencePrice = findTreatmentPrice(treatment, treatmentPrices);
      const currentReferencePrice = findTreatmentPrice(current.treatment, treatmentPrices);
      const shouldReplaceAmount = !current.amount || Number(current.amount) === currentReferencePrice;
      return { ...current, treatment, amount: shouldReplaceAmount ? (nextReferencePrice || '') : current.amount };
    });
  }

  const referencePrice = findTreatmentPrice(form.treatment, treatmentPrices);
  const treatmentOptions = quoteTreatmentOptions({
    leadTreatment: context?.lead?.treatment,
    quoteTreatment: context?.quote?.treatment,
    treatmentPrices,
    fallbackOptions: TREATMENT_OPTIONS,
  });

  return (
    <ModalShell className="max-w-xl p-5 sm:p-6" onClose={onClose} closeDisabled={saving} titleId="quote-title" descriptionId="quote-description" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <ModalHeader title={context?.quote ? 'Editar presupuesto' : 'Registrar presupuesto'} subtitle={context?.lead?.name} onClose={onClose} disabled={saving} titleId="quote-title" />
      <p id="quote-description" className="mb-5 text-base leading-6 text-textMuted">Este monto es una cotización real. No se contará como cobro ni ingreso.</p>
      {error ? <div aria-live="assertive" className="mb-4 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select className="sm:col-span-2" label="Tratamiento" value={form.treatment} onChange={updateTreatment} options={treatmentOptions} disabled={saving} data-autofocus />
        <div>
          <Field label="Monto (Gs.)" type="number" min="1" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} disabled={saving} />
          {referencePrice ? <p className="mt-2 text-xs text-textMuted">Precio de referencia: {new Intl.NumberFormat('es-PY').format(referencePrice)} Gs. · Podés ajustarlo para este paciente.</p> : <p className="mt-2 text-xs text-amber-200">No hay precio de referencia configurado. El monto sigue siendo editable.</p>}
        </div>
        <Field label="Odontólogo / profesional" value={form.professional_name} onChange={(value) => setForm({ ...form, professional_name: value })} disabled={saving} />
        <Field className="sm:col-span-2" label="Próximo seguimiento" type="datetime-local" value={form.next_action_at} onChange={(value) => setForm({ ...form, next_action_at: value })} disabled={saving} />
        <TextArea className="sm:col-span-2" label="Notas opcionales" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} disabled={saving} />
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-mint/20 bg-mint/[0.06] p-3 text-sm text-textSoft"><FileText className="h-4 w-4 text-mint" />Al guardar, se crea automáticamente el seguimiento.</div>
      <ModalActions saving={saving} onClose={onClose} submitLabel="Guardar presupuesto" />
    </ModalShell>
  );
}
