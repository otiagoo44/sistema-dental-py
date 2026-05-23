import { normalizeText } from './formatters';

export function buildLeadMessage(lead) {
  const name = lead?.name || 'te';
  const treatment = lead?.treatment || 'tu consulta';
  const text = `${lead?.treatment || ''} ${lead?.urgency || ''} ${lead?.situation || ''}`;
  const normalized = normalizeText(text);

  if (normalized.includes('implante')) {
    return `Hola ${name}, vimos que estás interesado/a en implantes dentales. Podemos ayudarte con una evaluación inicial para ver si sos candidato/a y explicarte las opciones. ¿Querés que coordinemos un horario esta semana?`;
  }

  if (normalized.includes('ortodoncia') || normalized.includes('bracket')) {
    return `Hola ${name}, vimos que consultaste por ortodoncia/brackets. Podemos agendarte una evaluación para ver tu caso y explicarte opciones de tratamiento. ¿Te queda mejor mañana o esta semana?`;
  }

  if (normalized.includes('dolor') || normalized.includes('urgencia') || normalized.includes('molestia')) {
    return `Hola ${name}, vimos que tenés dolor o molestia. En esos casos conviene revisar cuanto antes para evitar que avance. ¿Querés que te pasemos los horarios disponibles hoy?`;
  }

  return `Hola ${name}, vimos tu consulta por ${treatment}. ¿Querés que te pasemos horarios disponibles para una evaluación?`;
}

export function buildWhatsappUrl(lead) {
  if (lead?.whatsapp_link) return lead.whatsapp_link;

  const rawPhone = lead?.phone_plus || lead?.phone || '';
  const phone = rawPhone.replace(/\D/g, '');
  const message = encodeURIComponent(buildLeadMessage(lead));

  return phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
}
