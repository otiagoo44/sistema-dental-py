import { useState } from 'react';
import { Ban, Check, Clock3, MessageCircleOff } from 'lucide-react';
import ModalShell from '../ui/ModalShell';
import Button from '../ui/Button';
import { ModalHeader } from './ModalParts';
import { TextArea } from '../crm/CrmPrimitives';

export default function ContactOutcomeModal({ context, saving, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const lead = context?.lead;
  if (!lead) return null;

  return (
    <ModalShell className="max-w-xl p-5 sm:p-6" onSubmit={(event) => event.preventDefault()}>
      <ModalHeader
        title={`Resultado del contacto con ${lead.name}`}
        subtitle={context.source === 'whatsapp' ? 'WhatsApp abierto' : 'Tarea de contacto'}
        onClose={onClose}
        disabled={saving}
      />
      <p className="text-sm leading-6 text-textMuted">
        Abrir WhatsApp no cambia el estado del lead. Elegí qué ocurrió para mantener el seguimiento y las tareas sincronizados.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button type="button" onClick={() => onSubmit('respondio', note)} disabled={saving}>
          <Check className="h-4 w-4" />
          Sí, respondió
        </Button>
        <Button variant="secondary" type="button" onClick={() => onSubmit('no_respondio', note)} disabled={saving}>
          <MessageCircleOff className="h-4 w-4" />
          No respondió
        </Button>
        <Button variant="secondary" type="button" onClick={() => onSubmit('numero_invalido', note)} disabled={saving}>
          <Ban className="h-4 w-4" />
          Número inválido
        </Button>
        <Button variant="ghost" type="button" onClick={() => onSubmit('posponer', note)} disabled={saving}>
          <Clock3 className="h-4 w-4" />
          Posponer a mañana
        </Button>
      </div>

      <TextArea
        label="Nota del contacto (opcional)"
        value={note}
        onChange={setNote}
        disabled={saving}
        className="mt-5"
        placeholder="Ej. pidió que volvamos a escribir por la tarde"
      />
      <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
        <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cerrar sin registrar</Button>
      </div>
    </ModalShell>
  );
}
