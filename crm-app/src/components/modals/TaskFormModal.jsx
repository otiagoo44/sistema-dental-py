import { useEffect, useState } from 'react';
import { toDatetimeLocalAsuncion } from '../../lib/formatters';
import { humanizeCrmError } from '../../lib/errors';
import { Select, Field, TextArea } from '../crm/CrmPrimitives';
import { ModalHeader, ModalActions } from './ModalParts';
import ModalShell from '../ui/ModalShell';

function getTaskFormDefaults(task, initialLeadId = '') {
  return {
    lead_id: task?.lead_id || initialLeadId,
    title: task?.title || '',
    description: task?.description || '',
    due_at: toDatetimeLocalAsuncion(task?.due_at),
    priority: task?.priority || 'media',
    status: task?.status || 'pendiente',
  };
}

export default function TaskFormModal({ mode, task, initialLeadId, leads, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getTaskFormDefaults(task, initialLeadId));
  const [formError, setFormError] = useState('');
  const isCreate = mode === 'create';

  useEffect(() => {
    setForm(getTaskFormDefaults(task, initialLeadId));
    setFormError('');
  }, [task?.id, mode, initialLeadId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if (!String(form.title || '').trim()) {
      setFormError('El titulo de la tarea es obligatorio.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(form);
    } catch (submitError) {
      setFormError(humanizeCrmError(submitError, 'No se pudo guardar la tarea. Intentá de nuevo.'));
    }
  }

  return (
    <ModalShell
      className="max-w-2xl p-5"
      overlayClassName="sm:items-center"
      onClose={onClose}
      closeDisabled={saving}
      titleId="task-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
        <ModalHeader title={isCreate ? 'Crear tarea' : 'Editar tarea'} subtitle="Tareas CRM" onClose={onClose} disabled={saving} titleId="task-form-title" />
        {formError ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Titulo" value={form.title} onChange={(value) => updateField('title', value)} disabled={saving} />
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-textMuted">Paciente asociado</span>
            <select className="input-premium" value={form.lead_id} onChange={(event) => updateField('lead_id', event.target.value)} disabled={saving}>
              <option value="">Sin lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Vencimiento" type="datetime-local" value={form.due_at} onChange={(value) => updateField('due_at', value)} disabled={saving} />
          <Select label="Prioridad" value={form.priority} onChange={(value) => updateField('priority', value)} options={['baja', 'media', 'alta', 'urgente']} disabled={saving} />
          <Select label="Estado" value={form.status} onChange={(value) => updateField('status', value)} options={['pendiente', 'hecho', 'vencido', 'cancelado']} disabled={saving} />
          <TextArea label="Descripcion" value={form.description} onChange={(value) => updateField('description', value)} disabled={saving} className="md:col-span-2" />
        </div>

        <ModalActions saving={saving} onClose={onClose} submitLabel={isCreate ? 'Crear tarea' : 'Guardar tarea'} />
    </ModalShell>
  );
}
