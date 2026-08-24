import { useState } from 'react';
import { Select, TextArea } from '../crm/CrmPrimitives';
import { LOST_REASONS } from '../../lib/commercialInsights';
import { humanizeCrmError } from '../../lib/errors';
import { ModalHeader, ModalActions } from './ModalParts';
import ModalShell from '../ui/ModalShell';

export default function ArchiveLeadModal({ lead, archive = false, saving, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  async function handleSubmit() {
    if (!reason) {
      setFormError('Seleccioná un motivo de pérdida.');
      return;
    }
    if (reason === 'Otro' && !String(note || '').trim()) {
      setFormError('Escribí una nota cuando el motivo es Otro.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(lead, { reason, note, archive });
    } catch (submitError) {
      setFormError(humanizeCrmError(submitError, 'No se pudo cerrar la oportunidad. Intentá de nuevo.'));
    }
  }

  return (
    <ModalShell
      className="max-w-xl p-5"
      overlayClassName="sm:items-center"
      onClose={onClose}
      closeDisabled={saving}
      titleId="archive-lead-title"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
        <ModalHeader title={archive ? 'Archivar oportunidad' : 'Marcar como no continuó'} subtitle={lead?.name || 'Paciente'} onClose={onClose} disabled={saving} titleId="archive-lead-title" />
        {formError ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}
        <div className="grid gap-4">
          <Select label="Motivo obligatorio" value={reason} onChange={setReason} options={LOST_REASONS} placeholder="Seleccionar motivo" disabled={saving} />
          <TextArea label={reason === 'Otro' ? 'Nota obligatoria' : 'Nota opcional'} value={note} onChange={setNote} disabled={saving} placeholder="Contexto útil para entender por qué se perdió" />
          <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-3 text-xs leading-5 text-amber-100">
            El motivo quedará en el historial y alimentará las métricas comerciales. No se elimina ningún dato.
          </p>
        </div>
        <ModalActions saving={saving} onClose={onClose} submitLabel={archive ? 'Archivar oportunidad' : 'Marcar como perdida'} danger />
    </ModalShell>
  );
}
