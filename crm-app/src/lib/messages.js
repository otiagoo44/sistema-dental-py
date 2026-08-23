import { normalizeText } from './formatters.js';

export const WHATSAPP_TEMPLATE_DEFINITIONS = [
  {
    key: 'first_contact',
    name: 'Primer contacto',
    situation: 'Nuevo lead',
    description: 'Mensaje directo para orientar la conversación hacia una evaluación.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Vimos tu consulta sobre {{tratamiento}} y te escribo para ayudarte a avanzar sin perder tiempo.

Para orientarte bien, lo más práctico es agendar una evaluación breve y revisar tu caso con el odontólogo.

¿Te queda mejor coordinar para hoy o para mañana?`,
  },
  {
    key: 'urgency',
    name: 'Urgencia o dolor',
    situation: 'Urgencia/dolor',
    description: 'Prioriza una evaluación rápida sin hacer promesas clínicas.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Vimos que consultaste por {{tratamiento}} y que necesitás atención {{urgencia}}.

Para ayudarte rápido, podemos coordinar una evaluación y confirmar el mejor horario disponible.

¿Preferís que te agendemos hoy o mañana?`,
  },
  {
    key: 'no_response',
    name: 'Seguimiento sin respuesta',
    situation: 'Sin respuesta',
    description: 'Reabre la conversación con una elección simple de horario.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Te escribo nuevamente por tu consulta sobre {{tratamiento}}. Quiero asegurarme de que tengas una opción clara para avanzar.

¿Preferís que veamos un horario mañana de mañana o de tarde?`,
  },
  {
    key: 'no_show',
    name: 'No-show y reprogramación',
    situation: 'No Asistió',
    description: 'Invita a reprogramar sin culpar al paciente.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Vimos que no pudiste asistir a tu evaluación por {{tratamiento}}. Podemos ayudarte a reprogramarla sin complicaciones.

¿Te queda mejor mañana o esta semana?`,
  },
  {
    key: 'appointment_reminder',
    name: 'Recordatorio de cita',
    situation: 'Consulta Agendada',
    description: 'Recordatorio breve y humano para una consulta ya agendada.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Te recordamos tu evaluación por {{tratamiento}}. Si necesitás ajustar el horario, respondé este mensaje y te ayudamos.

¡Te esperamos!`,
  },
];

export const WHATSAPP_VARIABLES = [
  '{{nombre}}',
  '{{tratamiento}}',
  '{{urgencia}}',
  '{{situacion}}',
  '{{evaluacion_previa}}',
  '{{clinica}}',
  '{{responsable}}',
  '{{agenda_link}}',
  '{{telefono_clinica}}',
];

export function selectWhatsAppTemplateKey(lead, context = 'auto') {
  if (context && context !== 'auto') return context;
  const text = normalizeText(`${lead?.status || ''} ${lead?.urgency || ''} ${lead?.situation || ''} ${lead?.treatment || ''}`);
  if (text.includes('no asistio')) return 'no_show';
  if (text.includes('urgencia') || text.includes('dolor') || text.includes('hoy')) return 'urgency';
  if (text.includes('no respondio')) return 'no_response';
  if (text.includes('agendada') || text.includes('confirmado')) return 'appointment_reminder';
  return 'first_contact';
}

export function getWhatsAppTemplate(templates = [], templateKey = 'first_contact') {
  const stored = templates.find((template) => template.template_key === templateKey);
  const recommended = WHATSAPP_TEMPLATE_DEFINITIONS.find((template) => template.key === templateKey)
    || WHATSAPP_TEMPLATE_DEFINITIONS[0];
  return stored || recommended;
}

export function buildWhatsAppMessage(lead, template, clinicContext = {}) {
  const rawTemplate = typeof template === 'string'
    ? template
    : template?.message || WHATSAPP_TEMPLATE_DEFINITIONS[0].message;
  const variables = {
    nombre: String(lead?.name || '').trim(),
    name: String(lead?.name || '').trim(),
    tratamiento: String(lead?.treatment || 'tu consulta').trim(),
    treatment: String(lead?.treatment || 'tu consulta').trim(),
    urgencia: String(lead?.urgency || 'pronto').trim(),
    situacion: String(lead?.situation || '').trim(),
    evaluacion_previa: String(lead?.evaluation_previous || '').trim(),
    clinica: String(clinicContext?.name || clinicContext?.clinic_name || 'la clínica').trim(),
    responsable: String(clinicContext?.responsible || clinicContext?.responsable || 'nuestro equipo').trim(),
    agenda_link: String(clinicContext?.calendar_link || clinicContext?.agenda_link || '').trim(),
    telefono_clinica: String(clinicContext?.whatsapp || clinicContext?.phone || '').trim(),
  };

  return rawTemplate
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => variables[key.toLowerCase()] || '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildLeadMessage(lead, templates = [], clinicContext = {}, templateKey = 'auto') {
  const selectedKey = selectWhatsAppTemplateKey(lead, templateKey);
  return buildWhatsAppMessage(lead, getWhatsAppTemplate(templates, selectedKey), clinicContext);
}

export function normalizeWhatsAppPhone(lead) {
  const direct = String(lead?.phone_plus || lead?.phone || '').replace(/\D/g, '');
  if (direct) return direct;
  const linked = String(lead?.whatsapp_link || '').match(/wa\.me\/(\d+)/i)?.[1];
  return linked || '';
}

export function buildWhatsappUrl(lead, templates = [], clinicContext = {}, templateKey = 'auto') {
  const phone = normalizeWhatsAppPhone(lead);
  const message = encodeURIComponent(buildLeadMessage(lead, templates, clinicContext, templateKey));
  return phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
}
