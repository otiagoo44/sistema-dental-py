import { formatDateTime, formatMoney, formatTime, normalizeText, todayIsoDate, toLocalIsoDate } from './formatters.js';
import { APPOINTMENT_ACTIVE_STATUSES, APPOINTMENT_STATUS, isArchivedLead, isOpenTask, terminalStatuses } from './crmDomain.js';

export const PRIORITY_FILTERS = [
  { value: 'urgent', label: 'Sólo urgentes' },
  { value: 'attention', label: 'Sólo atención' },
  { value: 'controlled', label: 'Sólo ordenados' },
  { value: 'closed', label: 'Sólo cerrados' },
];

export const LOST_REASONS = [
  'No responde',
  'Precio',
  'Eligió otra clínica',
  'Fuera de zona',
  'No era el tratamiento adecuado',
  'No tenía disponibilidad',
  'Sólo estaba consultando',
  'Duplicado',
  'Número inválido',
  'Reprogramó muchas veces',
  'Otro',
];

const CLOSED_STATUSES = new Set([...terminalStatuses, 'Duplicado']);
const UNCONTACTED_STATUSES = new Set(['Nuevo', 'No Contactado']);
const CONTACTED_WITHOUT_APPOINTMENT = new Set(['Contactado', 'Respondió', 'Presupuesto Enviado', 'No Respondió']);

function taskForLead(tasks, leadId) {
  return (tasks || []).filter((task) => task.lead_id === leadId && isOpenTask(task));
}

function appointmentForLead(appointments, leadId) {
  return (appointments || []).filter((appointment) => appointment.lead_id === leadId);
}

export function getLeadPriority(lead, { tasks = [], appointments = [], now = new Date() } = {}) {
  if (!lead) return { level: 'controlled', label: 'Ordenado', reason: 'Sin señales de riesgo', rank: 3 };
  if (isArchivedLead(lead) || CLOSED_STATUSES.has(lead.status)) {
    return { level: 'closed', label: 'Cerrado', reason: lead.lost_reason || 'Fuera del circuito activo', rank: 4 };
  }

  const nowMs = new Date(now).getTime();
  const today = toLocalIsoDate(now);
  const leadTasks = taskForLead(tasks, lead.id);
  const leadAppointments = appointmentForLead(appointments, lead.id);
  const overdueTask = leadTasks.find((task) => task.due_at && new Date(task.due_at).getTime() < nowMs);
  const overdueFollowup = lead.next_followup_at && new Date(lead.next_followup_at).getTime() < nowMs;
  const hotUncontacted = lead.classification === 'Lead Caliente' && UNCONTACTED_STATUSES.has(lead.status) && !lead.last_contact_at;
  const urgentNew = UNCONTACTED_STATUSES.has(lead.status)
    && /(hoy|urgencia|dolor)/.test(normalizeText(`${lead.urgency || ''} ${lead.situation || ''} ${lead.treatment || ''}`));
  const noShowWithoutRecovery = lead.status === APPOINTMENT_STATUS.noShow
    && !leadTasks.some((task) => task.type === 'no_show_recovery' || /reprogram|recuper/.test(normalizeText(task.title)));

  if (hotUncontacted) return { level: 'urgent', label: 'Urgente', reason: 'Lead caliente sin contactar', rank: 1 };
  if (overdueFollowup) return { level: 'urgent', label: 'Urgente', reason: 'Seguimiento vencido', rank: 1 };
  if (overdueTask) return { level: 'urgent', label: 'Urgente', reason: `Tarea vencida: ${overdueTask.title}`, rank: 1 };
  if (noShowWithoutRecovery) return { level: 'urgent', label: 'Urgente', reason: 'No-show sin recuperación activa', rank: 1 };
  if (urgentNew) return { level: 'urgent', label: 'Urgente', reason: 'Consulta nueva con urgencia o dolor', rank: 1 };
  if (!lead.assigned_to && lead.classification === 'Lead Caliente') return { level: 'urgent', label: 'Urgente', reason: 'Lead caliente sin responsable', rank: 1 };

  const dueToday = lead.next_followup_at && toLocalIsoDate(lead.next_followup_at) === today;
  const appointmentTodayUnconfirmed = leadAppointments.some((appointment) => (
    appointment.appointment_date === today
      && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)
      && appointment.status !== APPOINTMENT_STATUS.confirmed
  ));
  if (dueToday) return { level: 'attention', label: 'Atención', reason: 'Seguimiento programado para hoy', rank: 2 };
  if (lead.classification === 'Lead Medio' && UNCONTACTED_STATUSES.has(lead.status) && !lead.last_contact_at) return { level: 'attention', label: 'Atención', reason: 'Lead medio sin contactar', rank: 2 };
  if (CONTACTED_WITHOUT_APPOINTMENT.has(lead.status) && !leadAppointments.some((item) => APPOINTMENT_ACTIVE_STATUSES.includes(item.status))) return { level: 'attention', label: 'Atención', reason: 'Contactado sin cita activa', rank: 2 };
  if (appointmentTodayUnconfirmed) return { level: 'attention', label: 'Atención', reason: 'Cita de hoy sin confirmar', rank: 2 };
  if (Number(lead.contact_attempts || 0) === 1 && lead.status === 'No Respondió') return { level: 'attention', label: 'Atención', reason: 'Primer intento sin respuesta', rank: 2 };
  if (!lead.assigned_to) return { level: 'attention', label: 'Atención', reason: 'Sin responsable asignado', rank: 2 };

  return { level: 'controlled', label: 'Ordenado', reason: lead.next_followup_at ? 'Tiene próxima acción programada' : 'Flujo bajo control', rank: 3 };
}

export function getRiskAlerts(leads, tasks, appointments, now = new Date()) {
  const priorities = (leads || []).map((lead) => ({ lead, priority: getLeadPriority(lead, { tasks, appointments, now }) }));
  const hot = priorities.filter(({ lead, priority }) => priority.level === 'urgent' && lead.classification === 'Lead Caliente' && !lead.last_contact_at).length;
  const overdueFollowups = (leads || []).filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at) < now && !terminalStatuses.includes(lead.status)).length;
  const today = toLocalIsoDate(now);
  const unconfirmed = (appointments || []).filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status) && appointment.status !== APPOINTMENT_STATUS.confirmed).length;
  const noShowRisk = priorities.filter(({ lead, priority }) => lead.status === APPOINTMENT_STATUS.noShow && priority.reason.includes('sin recuperación')).length;
  const unassigned = (leads || []).filter((lead) => !lead.assigned_to && !terminalStatuses.includes(lead.status)).length;
  return [
    hot ? { id: 'hot', tone: 'danger', count: hot, message: `${hot} lead${hot === 1 ? '' : 's'} caliente${hot === 1 ? '' : 's'} todavía sin primer contacto.`, target: 'leads' } : null,
    overdueFollowups ? { id: 'followups', tone: 'warning', count: overdueFollowups, message: `${overdueFollowups} seguimiento${overdueFollowups === 1 ? '' : 's'} vencido${overdueFollowups === 1 ? '' : 's'} necesita${overdueFollowups === 1 ? '' : 'n'} acción.`, target: 'followups' } : null,
    unconfirmed ? { id: 'appointments', tone: 'warning', count: unconfirmed, message: `${unconfirmed} cita${unconfirmed === 1 ? '' : 's'} de hoy sin confirmar.`, target: 'agenda' } : null,
    noShowRisk ? { id: 'noshow', tone: 'danger', count: noShowRisk, message: `${noShowRisk} no-show necesita recuperación.`, target: 'followups' } : null,
    unassigned ? { id: 'unassigned', tone: 'neutral', count: unassigned, message: `${unassigned} oportunidad${unassigned === 1 ? '' : 'es'} sin responsable.`, target: 'leads' } : null,
  ].filter(Boolean);
}

const EVENT_COPY = {
  lead_created: 'Lead creado',
  lead_created_manual: 'Lead registrado manualmente',
  manual_lead_created: 'Lead registrado manualmente',
  whatsapp_opened: 'WhatsApp abierto con mensaje prearmado',
  message_copied: 'Mensaje copiado para contacto manual',
  lead_contacted: 'Lead marcado como Contactado',
  contact_attempted: 'Intento de contacto sin respuesta',
  note_added: 'Nota agregada',
  followup_postponed: 'Seguimiento pospuesto',
  task_created: 'Tarea creada',
  task_completed: 'Tarea completada',
  task_completed_auto: 'Tarea de contacto completada automáticamente',
  appointment_scheduled: 'Cita agendada',
  appointment_confirmed: 'Cita confirmada',
  appointment_attended: 'Asistencia registrada',
  appointment_no_show: 'No asistencia registrada',
  appointment_rescheduled: 'Cita reprogramada',
  lead_lost_reason_set: 'Motivo de pérdida registrado',
  lead_archived: 'Oportunidad archivada',
  lead_recovered: 'Oportunidad recuperada',
  status_changed: 'Estado comercial actualizado',
};

export function buildCommercialTimeline({ lead, events = [], tasks = [], appointments = [], profiles = [] }) {
  if (!lead?.id) return [];
  const actors = Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name || profile.email]));
  const eventRows = events.map((event) => ({
    id: `event-${event.id}`,
    at: event.created_at,
    type: event.event_type,
    title: EVENT_COPY[event.event_type] || event.title || 'Actividad comercial',
    description: event.description || '',
    actor: actors[event.created_by] || (event.created_by ? 'Usuario de la clínica' : 'Sistema'),
  }));
  const taskRows = tasks.filter((task) => task.lead_id === lead.id).map((task) => ({
    id: `task-${task.id}-${task.status}`,
    at: task.completed_at || task.created_at,
    type: task.status === 'hecho' ? 'task_completed' : 'task_created',
    title: task.status === 'hecho' ? `Tarea completada: ${task.title}` : `Tarea creada: ${task.title}`,
    description: task.due_at ? `Vencimiento: ${formatDateTime(task.due_at)}` : '',
    actor: actors[task.completed_by || task.created_by || task.assigned_to] || 'Sistema',
  }));
  const appointmentRows = appointments.filter((appointment) => appointment.lead_id === lead.id).map((appointment) => ({
    id: `appointment-${appointment.id}-${appointment.status}`,
    at: appointment.updated_at || appointment.created_at,
    type: 'appointment',
    title: `Cita: ${appointment.status}`,
    description: `${appointment.appointment_date} a las ${formatTime(appointment.appointment_time)} · ${appointment.doctor_assigned || 'Sin responsable'}`,
    actor: 'Clínica',
  }));
  return [...eventRows, ...taskRows, ...appointmentRows]
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function buildWeeklyReportText({ clinicName, label, data }) {
  const sourceLines = data.sourceRows.slice(0, 5).map((row) => `- ${row.label}: ${row.leads} leads, ${row.hot} calientes, ${row.scheduled} agendados`).join('\n') || '- Sin datos';
  const treatmentLines = data.treatmentRows.slice(0, 5).map((row) => `- ${row.label}: ${row.leads} consultas, ${row.hot} calientes`).join('\n') || '- Sin datos';
  const lossLines = data.lossReasonCounts.slice(0, 5).map(([reason, count]) => `- ${reason}: ${count}`).join('\n') || '- Sin pérdidas registradas';
  return `REPORTE COMERCIAL · ${clinicName || 'Clínica'}\n${label}\n\nCAPTACIÓN\n- Leads nuevos: ${data.periodLeads.length}\n- Leads calientes: ${data.hotLeads}\n- Sin contactar: ${data.uncontacted.length}\n- Tiempo promedio al primer contacto: ${data.averageResponseLabel}\n\nFUENTES\n${sourceLines}\n\nTRATAMIENTOS\n${treatmentLines}\n\nSEGUIMIENTO\n- Seguimientos completados: ${data.completedFollowups}\n- Seguimientos vencidos: ${data.overdueFollowups}\n- Tareas abiertas: ${data.openTasks}\n\nAGENDA\n- Citas agendadas: ${data.periodAppointments.length}\n- Confirmadas: ${data.confirmed}\n- Asistieron: ${data.attended.length}\n- No asistieron: ${data.noShows.length}\n- No-shows recuperados: ${data.noShowRecoveries}\n- Tasa de asistencia: ${data.attendanceRate}%\n\nPÉRDIDAS\n${lossLines}\n\nEQUIPO\n- Responsable con más tareas completadas: ${data.topResponsible || 'Sin datos suficientes'}\n\nVALOR BAJO SEGUIMIENTO\n- Oportunidades de alto ticket detectadas: ${data.highTicket}\n- Valor potencial estimado: ${data.hasPotentialConfig ? formatMoney(data.potential) : 'No configurado'}\n\nEste reporte muestra actividad comercial y oportunidades bajo seguimiento. No representa ingresos confirmados.`;
}

export function getReportPeriodLabel(period) {
  const labels = { week: 'Esta semana', previous_week: 'Semana pasada', month: 'Este mes', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días', year: 'Este año' };
  return labels[period] || labels.week;
}

export function isToday(value) {
  return Boolean(value && toLocalIsoDate(value) === todayIsoDate());
}
