import {
  CONTACT_ATTEMPT_STATUSES,
  CONTACTED_STATUSES,
  NEXT_ACTION_OPTIONS,
  SCHEDULED_STATUSES,
  TREATMENT_OPTIONS,
} from './constants.js';
import {
  addDaysAsuncion,
  fromDatetimeLocalAsuncion,
  normalizeText,
  todayIsoDate,
  tomorrowFollowupAsuncion,
} from './formatters.js';
import { publicConfig } from './publicConfig.js';

export const ROLE = {
  admin: 'admin',
  owner: 'owner',
  receptionist: 'receptionist',
};
export const ARCHIVED_STATUS = 'Archivado';
export const terminalStatuses = ['Perdido', 'Tratamiento Iniciado', ARCHIVED_STATUS];
export const statusContactDates = [...CONTACTED_STATUSES, 'No Respondió'];
export const LEAD_STATUS = {
  scheduled: 'Consulta Agendada',
  confirmed: 'Confirmado',
  attended: 'Asistió',
  noShow: 'No Asistió',
};
export const APPOINTMENT_STATUS = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  attended: 'Asistió',
  noShow: 'No Asistió',
  rescheduled: 'Reprogramado',
  cancelled: 'Cancelado',
};
export const APPOINTMENT_ACTIVE_STATUSES = [APPOINTMENT_STATUS.scheduled, 'Consulta Agendada', 'Pendiente', APPOINTMENT_STATUS.confirmed, APPOINTMENT_STATUS.rescheduled];
export const APPOINTMENT_OUTCOME_LEAD_STATUSES = [LEAD_STATUS.confirmed, LEAD_STATUS.attended, LEAD_STATUS.noShow];
export const TASK_OPEN_STATUSES = ['pendiente', 'vencido', 'Pendiente', 'Vencida'];
export const TASK_PRIORITY_BY_CLASSIFICATION = {
  'Lead Caliente': 'alta',
  'Lead Medio': 'media',
  'Lead Frío': 'baja',
};
export const MANUAL_LEAD_SOURCES = [
  'WhatsApp directo',
  'Instagram DM',
  'Llamada',
  'Recomendación',
  'Formulario externo',
  'Meta Ads manual',
  'Formulario web',
  'Presencial',
  'Otro',
];
export const LEAD_ADMIN_EDIT_FIELDS = [
  'name',
  'phone',
  'phone_plus',
  'treatment',
  'urgency',
  'status',
  'situation',
  'evaluation_previous',
  'consultation_reason',
  'estimated_value',
  'next_action',
  'next_followup_at',
  'notes',
  'assigned_to',
];
export const LEAD_RECEPTIONIST_EDIT_FIELDS = ['status', 'next_action', 'next_followup_at', 'contact_attempts', 'notes'];
export const PUBLIC_LEAD_WEBHOOK_URL = publicConfig.publicLeadWebhookUrl;
export const DEFAULT_EMBED_BASE_URL = typeof window === 'undefined' ? 'https://TU-CRM-REAL.vercel.app' : window.location.origin;

export function cleanOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function normalizeRole(role) {
  return role === ROLE.admin || role === ROLE.owner ? ROLE.admin : ROLE.receptionist;
}

const normalizedLeadStatuses = new Map([
  ['nuevo', 'Nuevo'],
  ['no contactado', 'No Contactado'],
  ['contactado', 'Contactado'],
  ['respondio', 'Respondió'],
  ['consulta agendada', 'Consulta Agendada'],
  ['agendado', 'Consulta Agendada'],
  ['confirmado', 'Confirmado'],
  ['asistio', 'Asistió'],
  ['presupuesto enviado', 'Presupuesto Enviado'],
  ['tratamiento iniciado', 'Tratamiento Iniciado'],
  ['no respondio', 'No Respondió'],
  ['perdido', 'Perdido'],
  ['reactivar 30d', 'Reactivar 30d'],
  ['no asistio', 'No Asistió'],
  ['archivado', 'Archivado'],
]);

export function normalizeLeadStatus(status) {
  const key = normalizeText(String(status || '')
    .replace(/Ã³/g, 'o')
    .replace(/Ã­/g, 'i'));
  return normalizedLeadStatuses.get(key) || String(status || '').trim();
}

export function normalizeAppointmentStatus(status) {
  const normalized = normalizeLeadStatus(status);
  if (normalized === 'Consulta Agendada') return APPOINTMENT_STATUS.scheduled;
  return normalized;
}

export function normalizeTaskStatus(status) {
  const value = normalizeText(status);
  if (['hecho', 'completada', 'completado'].includes(value)) return 'done';
  if (['cancelado', 'cancelada'].includes(value)) return 'cancelled';
  if (['vencido', 'vencida'].includes(value)) return 'overdue';
  if (['pendiente', 'pending'].includes(value)) return 'open';
  return value || 'open';
}

export function isTerminalLeadStatus(status) {
  return terminalStatuses.includes(normalizeLeadStatus(status));
}

export function canTransitionAppointment(status, outcome, appointmentAt, now = new Date()) {
  const current = normalizeAppointmentStatus(status);
  const target = normalizeAppointmentStatus(outcome);
  const moment = appointmentAt ? new Date(appointmentAt) : null;
  const isPast = moment && !Number.isNaN(moment.getTime()) ? moment.getTime() <= now.getTime() : false;
  const activeUnconfirmed = [APPOINTMENT_STATUS.scheduled, 'Pendiente', APPOINTMENT_STATUS.rescheduled];
  const active = [...activeUnconfirmed, APPOINTMENT_STATUS.confirmed];

  if (current === target) return false;
  if (target === APPOINTMENT_STATUS.confirmed) return activeUnconfirmed.includes(current) && !isPast;
  if ([APPOINTMENT_STATUS.attended, APPOINTMENT_STATUS.noShow].includes(target)) return active.includes(current) && isPast;
  if (target === APPOINTMENT_STATUS.cancelled) return active.includes(current);
  if (target === APPOINTMENT_STATUS.rescheduled) return active.includes(current)
    || [APPOINTMENT_STATUS.noShow, APPOINTMENT_STATUS.cancelled].includes(current);
  return false;
}

export function isArchivedLead(lead) {
  return Boolean(lead?.is_archived || lead?.status === ARCHIVED_STATUS);
}

export function displayConsultationReason(lead) {
  return lead?.consultation_reason || 'Sin especificar';
}

export function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function getTreatmentOptions(clinicSettings, treatmentPrices = []) {
  const configured = Array.isArray(clinicSettings?.treatments)
    ? clinicSettings.treatments.map((item) => (typeof item === 'string' ? item : item?.name || item?.treatment))
    : [];
  return uniqueStrings([...configured, ...treatmentPrices.map((item) => item.treatment), ...TREATMENT_OPTIONS]);
}

export function isOpenTask(task) {
  return !['done', 'cancelled'].includes(normalizeTaskStatus(task?.status));
}

export function isContactTask(task) {
  const type = normalizeText(task?.type);
  if (['contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact'].includes(type)) return true;
  if (type) return false;
  return /(contactar|contacto|whatsapp|llamar)/.test(normalizeText(task?.title));
}

export function startOfAsuncionDate(daysOffset = 0) {
  const base = new Date(`${todayIsoDate()}T12:00:00`);
  base.setDate(base.getDate() + daysOffset);
  return base;
}

export function daysBetween(from, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000));
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHoursIso(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export function addDaysIso(days, hour = 9) {
  return addDaysAsuncion(days, hour);
}

export function appointmentDueIso(appointment, offsetHours = 0) {
  if (!appointment?.appointment_date || !appointment?.appointment_time) return null;
  const iso = fromDatetimeLocalAsuncion(`${appointment.appointment_date}T${String(appointment.appointment_time).slice(0, 5)}`);
  if (!iso) return null;
  const date = new Date(iso);
  date.setHours(date.getHours() + offsetHours);
  return date.toISOString();
}

export function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

export function slugify(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'clinica';
}

export function generatePublicToken() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `lf_${window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export function parseAllowedOrigins(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function formatAllowedOrigins(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

export function publicFormPayloadExample(config) {
  return {
    clinic_slug: config?.clinic_slug || 'dentalpro',
    landing_token: config?.public_token || 'lf_xxxxx',
    nombre: 'Laura',
    telefono: '+595981000000',
    tratamiento: 'Implante dental',
    urgencia: 'Hoy',
    evaluacion_previa: 'No',
    situacion: 'Quiero agendar una consulta',
    consultation_reason: 'Le falta una pieza',
    origen: 'Landing odontología',
    pagina: 'implantes',
    fecha_envio: 'auto',
    consentimiento_contacto: true,
  };
}

export function publicFormFetchSnippet(config) {
  const payload = publicFormPayloadExample(config);
  return `const WEBHOOK_URL = "${PUBLIC_LEAD_WEBHOOK_URL}";

const payload = ${JSON.stringify(payload, null, 2)};

const response = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const data = await response.json();`;
}

export function publicFormIframeSnippet(config) {
  const slug = config?.clinic_slug || 'CLINIC_SLUG';
  const token = config?.public_token || 'lf_xxxxx';
  return `<iframe
  src="${DEFAULT_EMBED_BASE_URL}/form/${slug}?landing_token=${encodeURIComponent(token)}"
  width="100%"
  height="720"
  style="border:0; border-radius:16px;"
></iframe>`;
}

export function priorityForClassification(classification) {
  return TASK_PRIORITY_BY_CLASSIFICATION[classification] || 'media';
}

export function taskConfigForLeadStatus(lead, newStatus, appointment) {
  const status = newStatus || lead?.status;

  if (['Nuevo', 'No Contactado'].includes(status)) {
    return {
      title: 'Contactar lead nuevo',
      type: 'contact',
      due_at: nowIso(),
      priority: priorityForClassification(lead?.classification),
    };
  }

  if (status === 'Contactado') {
    return {
      title: 'Hacer seguimiento',
      type: 'followup',
      due_at: lead?.next_followup_at || tomorrowFollowupAsuncion(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.scheduled) {
    return {
      title: 'Confirmar asistencia',
      type: 'confirm',
      due_at: appointmentDueIso(appointment, -24) || nowIso(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.confirmed) {
    return {
      title: 'Esperar asistencia',
      type: 'attendance',
      due_at: appointmentDueIso(appointment, 0) || nowIso(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.attended) {
    return {
      title: 'Enviar presupuesto o iniciar tratamiento',
      type: 'followup',
      due_at: addDaysIso(1),
      priority: 'media',
    };
  }

  if (status === 'Presupuesto Enviado') {
    return {
      title: 'Dar seguimiento al presupuesto',
      type: 'followup',
      due_at: addHoursIso(48),
      priority: 'media',
    };
  }

  if (status === 'No Respondió') {
    return {
      title: 'Intentar contacto nuevamente',
      type: 'contact',
      due_at: tomorrowFollowupAsuncion(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.noShow) {
    return {
      title: 'Reprogramar consulta',
      type: 'followup',
      due_at: tomorrowFollowupAsuncion(),
      priority: 'alta',
    };
  }

  if (status === 'Perdido') {
    return {
      title: 'Revisar motivo perdido',
      type: 'followup',
      due_at: nowIso(),
      priority: 'baja',
    };
  }

  if (status === 'Reactivar 30d') {
    return {
      title: 'Reactivar lead',
      type: 'followup',
      due_at: addDaysIso(30),
      priority: 'media',
    };
  }

  return null;
}

export function buildLeadFormPatch(form, fields) {
  const allowed = new Set(fields);
  const patch = {};

  if (allowed.has('name')) patch.name = String(form.name || '').trim();
  if (allowed.has('phone')) patch.phone = cleanOptionalText(form.phone);
  if (allowed.has('phone_plus')) patch.phone_plus = cleanOptionalText(form.phone_plus);
  if (allowed.has('treatment')) patch.treatment = cleanOptionalText(form.treatment);
  if (allowed.has('urgency')) patch.urgency = cleanOptionalText(form.urgency);
  if (allowed.has('status')) patch.status = form.status || 'Nuevo';
  if (allowed.has('situation')) patch.situation = cleanOptionalText(form.situation);
  if (allowed.has('evaluation_previous')) patch.evaluation_previous = cleanOptionalText(form.evaluation_previous);
  if (allowed.has('consultation_reason')) {
    patch.consultation_reason = cleanOptionalText(form.consultation_reason) || cleanOptionalText(form.situation) || cleanOptionalText(form.treatment);
  }
  if (allowed.has('estimated_value')) patch.estimated_value = numberOrNull(form.estimated_value);
  if (allowed.has('next_action')) patch.next_action = cleanOptionalText(form.next_action);
  if (allowed.has('next_followup_at')) patch.next_followup_at = fromDatetimeLocalAsuncion(form.next_followup_at);
  if (allowed.has('notes')) patch.notes = cleanOptionalText(form.notes);
  if (allowed.has('assigned_to')) patch.assigned_to = cleanOptionalText(form.assigned_to);

  return patch;
}

export function getPublicFormRoute() {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/form\/([a-z0-9-]+)\/?$/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    clinicSlug: match[1],
    landingToken: params.get('landing_token') || params.get('token') || '',
  };
}
