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
    key: 'price_inquiry',
    name: 'Consulta por precio',
    situation: 'Quiere precio',
    description: 'Orienta la conversación sin inventar precios ni prometer resultados.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Vimos tu consulta sobre {{tratamiento}}. Para orientarte correctamente, primero necesitamos entender tu caso y revisar qué opción te conviene.

¿Te queda mejor coordinar una evaluación hoy o mañana?`,
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

Te recordamos tu evaluación por {{tratamiento}} para el {{fecha_cita}} ({{hora_cita}}). Si necesitás ajustar el horario, respondé este mensaje y te ayudamos.

¡Te esperamos!`,
  },
  {
    key: 'post_consultation',
    name: 'Post consulta',
    situation: 'Seguimiento posterior',
    description: 'Aclara dudas y propone un próximo paso luego de la consulta.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Quería saber si te quedó alguna duda después de tu consulta sobre {{tratamiento}}. Podemos ayudarte a definir el próximo paso con claridad.

¿Preferís que lo revisemos hoy o mañana?`,
  },
  {
    key: 'cold_reactivation',
    name: 'Reactivación de lead frío',
    situation: 'Reactivar 30d',
    description: 'Retoma una oportunidad anterior con un tono simple y sin presión.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Hace un tiempo consultaste por {{tratamiento}} y quería confirmar si todavía te interesa revisarlo.

Si te sirve, podemos retomar tu caso y buscar un horario esta semana.`,
  },
  {
    key: 'attendance_confirmation',
    name: 'Confirmación de asistencia',
    situation: 'Cita próxima',
    description: 'Solicita confirmación explícita antes de una cita.',
    message: `Hola {{nombre}}, soy de {{clinica}}.

Queremos confirmar tu cita por {{tratamiento}} para el {{fecha_cita}} ({{hora_cita}}).

¿Podés confirmarnos tu asistencia?`,
  },
];

export const WHATSAPP_VARIABLES = [
  '{{nombre}}',
  '{{tratamiento}}',
  '{{urgencia}}',
  '{{situacion}}',
  '{{fuente}}',
  '{{evaluacion_previa}}',
  '{{clinica}}',
  '{{responsable}}',
  '{{fecha_cita}}',
  '{{hora_cita}}',
  '{{agenda_link}}',
  '{{telefono_clinica}}',
];

export function selectWhatsAppTemplateKey(lead, context = 'auto') {
  if (context && context !== 'auto') return context;
  const text = normalizeText(`${lead?.status || ''} ${lead?.urgency || ''} ${lead?.situation || ''} ${lead?.treatment || ''}`);
  if (text.includes('no asistio')) return 'no_show';
  if (text.includes('urgencia') || text.includes('dolor') || text.includes('hoy')) return 'urgency';
  if (text.includes('precio')) return 'price_inquiry';
  if (text.includes('no respondio')) return 'no_response';
  if (text.includes('reactivar') || lead?.classification === 'Lead Frío') return 'cold_reactivation';
  if (text.includes('asistio')) return 'post_consultation';
  if (text.includes('agendada') || text.includes('confirmado')) return 'appointment_reminder';
  return 'first_contact';
}

export function getWhatsAppTemplate(templates = [], templateKey = 'first_contact') {
  const stored = templates.find((template) => template.template_key === templateKey);
  const recommended = WHATSAPP_TEMPLATE_DEFINITIONS.find((template) => template.key === templateKey)
    || WHATSAPP_TEMPLATE_DEFINITIONS[0];
  return stored || recommended;
}

export function buildMessageFromTemplate(template, lead = {}, appointment = null, clinicContext = {}) {
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
    fuente: String(lead?.source || 'consulta directa').trim(),
    evaluacion_previa: String(lead?.evaluation_previous || '').trim(),
    clinica: String(clinicContext?.name || clinicContext?.clinic_name || 'la clínica').trim(),
    responsable: String(clinicContext?.responsible || clinicContext?.responsable || 'nuestro equipo').trim(),
    fecha_cita: String(appointment?.appointment_date || clinicContext?.appointment_date || 'día coordinado').trim(),
    hora_cita: String(appointment?.appointment_time || clinicContext?.appointment_time || 'horario acordado').slice(0, 24).trim(),
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

export function buildWhatsAppMessage(lead, template, clinicContext = {}, appointment = null) {
  return buildMessageFromTemplate(template, lead, appointment, clinicContext);
}

export function buildLeadMessage(lead, templates = [], clinicContext = {}, templateKey = 'auto', appointment = null) {
  const selectedKey = selectWhatsAppTemplateKey(lead, templateKey);
  return buildWhatsAppMessage(lead, getWhatsAppTemplate(templates, selectedKey), clinicContext, appointment);
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
