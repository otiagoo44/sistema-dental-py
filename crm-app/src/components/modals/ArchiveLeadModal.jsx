import { useState } from 'react';
import { TextArea } from '../crm/CrmPrimitives';
import { ModalHeader, ModalActions } from './ModalParts';
import ModalShell from '../ui/ModalShell';

export default function ArchiveLeadModal({ lead, saving, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  async function handleSubmit() {
    if (!String(reason || '').trim()) {
      setFormError('El motivo de archivado es obligatorio.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(lead, reason);
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo archivar el lead.');
    }
  }

  return (
    <ModalShell
      className="max-w-xl p-5"
      overlayClassName="sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
        <ModalHeader title="Archivar lead" subtitle={lead?.name || 'Lead'} onClose={onClose} disabled={saving} />
        {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}
        <TextArea label="Motivo obligatorio" value={reason} onChange={setReason} disabled={saving} />
        <ModalActions saving={saving} onClose={onClose} submitLabel="Archivar" danger />
    </ModalShell>
  );
}
