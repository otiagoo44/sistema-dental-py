import { MessageCircle } from 'lucide-react';
import { buildWhatsappUrl, normalizeWhatsAppPhone, selectWhatsAppTemplateKey } from '../../lib/messages';

export default function WhatsAppButton({
  lead,
  templates = [],
  clinicContext = {},
  templateKey = 'auto',
  task = null,
  action = null,
  onOpened,
  label = 'WhatsApp',
  className = '',
}) {
  if (!lead) return null;

  const selectedKey = selectWhatsAppTemplateKey(lead, templateKey);
  const hasPhone = Boolean(normalizeWhatsAppPhone(lead));
  const url = buildWhatsappUrl(lead, templates, clinicContext, selectedKey);

  if (!hasPhone) {
    return (
      <button
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2 text-sm font-bold text-textMuted opacity-70 ${className}`}
        type="button"
        disabled
        title="Este paciente no tiene un teléfono registrado."
        aria-label="WhatsApp no disponible: el paciente no tiene un teléfono registrado"
      >
        <MessageCircle className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <a
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2 text-sm font-bold text-textSoft transition hover:border-mint/40 hover:bg-elevated hover:text-cream ${className}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpened?.({ lead, task, action, templateKey: selectedKey })}
    >
      <MessageCircle className="h-4 w-4 text-mint" />
      {label}
    </a>
  );
}
