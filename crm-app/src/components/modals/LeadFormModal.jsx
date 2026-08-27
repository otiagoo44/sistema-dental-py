import { useEffect, useState } from 'react';
import { CalendarPlus, Save } from 'lucide-react';
import { EVALUATION_OPTIONS, NEXT_ACTION_OPTIONS, SITUATION_OPTIONS, TREATMENT_OPTIONS, URGENCY_OPTIONS } from '../../lib/constants';
import { addDaysAsuncion, formatDateTime, fromDatetimeLocalAsuncion, toDatetimeLocalAsuncion } from '../../lib/formatters';
import { humanizeCrmError } from '../../lib/errors';
import { MANUAL_LEAD_SOURCES, addHoursIso } from '../../lib/crmDomain';
import { Select, Field, TextArea } from '../crm/CrmPrimitives';
import { ModalHeader, ModalActions } from './ModalParts';
import Button from '../ui/Button';
import ModalShell from '../ui/ModalShell';

function getLeadFormDefaults(lead, currentUserId = '') {
  return {
    name: lead?.name || '',
    phone: lead?.phone || '',
    phone_plus: lead?.phone_plus || '',
    treatment: lead?.treatment || 'Consulta general',
    urgency: lead?.urgency || 'Esta semana',
    status: lead?.status || 'Nuevo',
    situation: lead?.situation || 'Quiere agendar una consulta',
    evaluation_previous: lead?.evaluation_previous || 'No sabe',
    consultation_reason: lead?.consultation_reason || '',
    estimated_value: lead?.estimated_value ?? '',
    next_action: lead?.next_action || 'Enviar WhatsApp',
    next_followup_at: toDatetimeLocalAsuncion(lead?.next_followup_at || addHoursIso(1)),
    notes: lead?.notes || '',
    source: lead?.source || 'WhatsApp directo',
    consent_contact: Boolean(lead?.consent_contact),
    assigned_to: lead?.assigned_to || currentUserId,
  };
}

function followupPresetValue(preset) {
  if (preset === 'today') return toDatetimeLocalAsuncion(new Date(Date.now() + 60 * 60 * 1000));
  if (preset === 'tomorrow') return toDatetimeLocalAsuncion(addDaysAsuncion(1, 9));
  if (preset === '3d') return toDatetimeLocalAsuncion(addDaysAsuncion(3, 9));
  if (preset === '7d') return toDatetimeLocalAsuncion(addDaysAsuncion(7, 9));
  return '';
}

export default function LeadFormModal({ mode, lead, canAdmin, profiles, currentUserId, treatmentOptions, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getLeadFormDefaults(lead, currentUserId));
  const [formError, setFormError] = useState('');
  const [followupPreset, setFollowupPreset] = useState(lead ? 'custom' : 'today');
  const isCreate = mode === 'create';
  const fullEdit = isCreate || canAdmin;
  useEffect(() => {
    setForm(getLeadFormDefaults(lead, currentUserId));
    setFormError('');
    setFollowupPreset(lead ? 'custom' : 'today');
  }, [lead?.id, mode, currentUserId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(scheduleAfterSave = false) {
    if ((isCreate || fullEdit) && !String(form.name || '').trim()) {
      setFormError('El nombre del paciente es obligatorio.');
      return;
    }

    if (isCreate && !String(form.phone || '').trim() && !String(form.phone_plus || '').trim()) {
      setFormError('El teléfono del paciente es obligatorio.');
      return;
    }

    if (isCreate && !form.source) {
      setFormError('Elegí cómo llegó la consulta.');
      return;
    }

    if (isCreate && !form.treatment) {
      setFormError('Elegí el tratamiento de interés.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(form, { scheduleAfterSave });
    } catch (submitError) {
      setFormError(humanizeCrmError(submitError, 'No se pudo guardar la consulta. Intentá de nuevo.'));
    }
  }

  return (
    <ModalShell
      className="max-w-4xl p-4 sm:p-6"
      onClose={onClose}
      closeDisabled={saving}
      titleId="lead-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit(false);
      }}
    >
        <ModalHeader title={isCreate ? 'Nueva consulta' : 'Editar paciente'} subtitle={isCreate ? 'Carga rápida · menos de 45 segundos' : lead?.name || 'Paciente'} onClose={onClose} disabled={saving} titleId="lead-form-title" />

        {formError ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        {fullEdit ? (
          <div className="space-y-5">
            <FormSection number="1" title="Datos básicos" description="Sólo nombre y teléfono requieren escritura.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Nombre *" value={form.name} onChange={(value) => updateField('name', value)} disabled={saving} placeholder="Nombre y apellido" data-autofocus />
                <Field label="Teléfono *" value={form.phone} onChange={(value) => updateField('phone', value)} disabled={saving} placeholder="0981 000 000" />
                {isCreate ? <Select label="Fuente *" value={form.source} onChange={(value) => updateField('source', value)} options={MANUAL_LEAD_SOURCES} disabled={saving} /> : <Field label="Teléfono internacional" value={form.phone_plus} onChange={(value) => updateField('phone_plus', value)} disabled={saving} />}
              </div>
            </FormSection>

            <FormSection number="2" title="Interés" description="Elegí opciones para mantener datos comparables.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Select label="Tratamiento *" value={form.treatment} onChange={(value) => updateField('treatment', value)} options={treatmentOptions || TREATMENT_OPTIONS} disabled={saving} />
                <Select label="Urgencia" value={form.urgency} onChange={(value) => updateField('urgency', value)} options={URGENCY_OPTIONS} disabled={saving} />
                <Select label="Evaluación previa" value={form.evaluation_previous} onChange={(value) => updateField('evaluation_previous', value)} options={EVALUATION_OPTIONS} disabled={saving} />
                <Select label="Situación" value={form.situation} onChange={(value) => updateField('situation', value)} options={SITUATION_OPTIONS} disabled={saving} />
                {!isCreate ? <div className="rounded-xl border border-slate-200 bg-soft p-3"><p className="text-sm font-semibold text-textMuted">Estado actual</p><p className="mt-1 font-bold text-cream">{form.status}</p></div> : null}
                <TextArea label="Motivo o nota breve (opcional)" value={form.consultation_reason} onChange={(value) => updateField('consultation_reason', value)} disabled={saving} className="md:col-span-2 xl:col-span-3" placeholder="Contexto comercial mínimo, sin información clínica sensible." />
              </div>
            </FormSection>

            <FormSection number="3" title="Próximo paso" description="Al guardar, el sistema prepara la primera acción sin duplicados.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {canAdmin ? <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-textMuted">Encargado</span>
                  <select className="input-premium" value={form.assigned_to} onChange={(event) => updateField('assigned_to', event.target.value)} disabled={saving || (!isCreate && !canAdmin)}>
                    {(profiles || []).map((clinicProfile) => <option key={clinicProfile.id} value={clinicProfile.id}>{clinicProfile.full_name} · {clinicProfile.role}</option>)}
                  </select>
                </label> : isCreate ? <div className="rounded-xl border border-mint/20 bg-mint/[0.06] p-3 md:col-span-2"><p className="text-sm text-textSoft">El sistema asignará esta consulta y creará automáticamente la primera acción.</p></div> : null}
                {isCreate && canAdmin ? <Select label="Qué hacer después" value={form.next_action} onChange={(value) => updateField('next_action', value)} options={NEXT_ACTION_OPTIONS} disabled={saving} /> : !isCreate ? <div className="rounded-xl border border-slate-200 bg-soft p-3 md:col-span-2"><p className="text-sm font-semibold text-textMuted">Próxima acción actual</p><p className="mt-1 font-bold text-cream">{form.next_action || 'Sin definir'}</p><p className="mt-1 text-sm text-textMuted">Usá “Registrar resultado” para cambiar el flujo.</p></div> : null}
                {isCreate && canAdmin ? <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-textMuted">Próximo seguimiento</span>
                  <select className="input-premium" value={followupPreset} onChange={(event) => { const preset = event.target.value; setFollowupPreset(preset); const value = followupPresetValue(preset); if (value) updateField('next_followup_at', value); }} disabled={saving}>
                    <option value="today">Hoy</option><option value="tomorrow">Mañana</option><option value="3d">En 3 días</option><option value="7d">En 7 días</option><option value="custom">Fecha personalizada</option>
                  </select>
                </label> : null}
                {isCreate && canAdmin ? followupPreset === 'custom' ? <Field label="Fecha y hora personalizada" type="datetime-local" value={form.next_followup_at} onChange={(value) => updateField('next_followup_at', value)} disabled={saving} /> : <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-sm text-sky-300 md:col-span-2 xl:col-span-3">Seguimiento programado para {formatDateTime(fromDatetimeLocalAsuncion(form.next_followup_at))}.</div> : null}
                <TextArea label={isCreate ? 'Nota interna (opcional)' : 'Notas'} value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} className="md:col-span-2 xl:col-span-3" />
                {canAdmin && !isCreate ? <Field label="Valor potencial estimado" type="number" value={form.estimated_value} onChange={(value) => updateField('estimated_value', value)} disabled={saving} /> : null}
              </div>
              {isCreate ? <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><input className="mt-0.5 h-4 w-4 accent-mint" type="checkbox" checked={form.consent_contact} onChange={(event) => updateField('consent_contact', event.target.checked)} disabled={saving} /><span>La persona autorizó a la clínica a contactarla por estos datos.</span></label> : null}
            </FormSection>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-xl border border-slate-200 bg-soft p-4"><p className="text-sm font-semibold text-textMuted">Qué hacer después</p><p className="mt-1 font-bold text-cream">{form.next_action || 'Sin definir'}</p><p className="mt-1 text-sm text-textMuted">Los cambios operativos se realizan con “Registrar resultado”.</p></div>
            <TextArea label="Notas" value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} />
          </div>
        )}

        {isCreate ? (
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button variant="secondary" type="button" onClick={() => handleSubmit(true)} disabled={saving}><CalendarPlus className="h-4 w-4" />Guardar y agendar</Button>
            <Button type="submit" loading={saving}>{!saving ? <Save className="h-4 w-4" /> : null}Guardar consulta</Button>
          </div>
        ) : <ModalActions saving={saving} onClose={onClose} submitLabel="Guardar cambios" />}
    </ModalShell>
  );
}

function FormSection({ number, title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-mint/25 bg-mint/10 text-xs font-bold text-mint">{number}</span>
        <div><h3 className="font-bold text-cream">{title}</h3><p className="mt-1 text-sm text-textMuted">{description}</p></div>
      </div>
      {children}
    </section>
  );
}
