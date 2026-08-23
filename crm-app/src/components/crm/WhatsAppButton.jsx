import { MessageCircle } from 'lucide-react';
import { buildWhatsappUrl, selectWhatsAppTemplateKey } from '../../lib/messages';

export default function WhatsAppButton({
  lead,
  templates = [],
  clinicContext = {},
  templateKey = 'auto',
  task = null,
  onOpened,
  label = 'WhatsApp',
  className = '',
}) {
  if (!lead) return null;

  const selectedKey = selectWhatsAppTemplateKey(lead, templateKey);
  const url = buildWhatsappUrl(lead, templates, clinicContext, selectedKey);

  return (
    <a
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-card px-3 py-2 text-xs font-bold text-textSoft transition hover:border-mint/40 hover:bg-elevated hover:text-cream ${className}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpened?.({ lead, task, templateKey: selectedKey })}
    >
      <MessageCircle className="h-4 w-4 text-mint" />
      {label}
    </a>
  );
}
