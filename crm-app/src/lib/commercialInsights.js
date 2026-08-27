import { formatDateTime, formatMoney, formatTime, todayIsoDate } from './formatters.js';
import { isArchivedLead } from './crmDomain.js';
import { buildNextActionQueue, getEffectiveNextAction, PRIORITY_GROUP } from './nextActions.js';

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

export function getLeadPriority(lead, { tasks = [], appointments = [], quotes = [], now = new Date() } = {}) {
  if (!lead || isArchivedLead(lead)) return { level: 'closed', label: 'Cerrado', reason: 'Fuera del circuito activo', rank: 4 };
  const action = getEffectiveNextAction(lead, { tasks, appointments, quotes, now });
  if (!action) return { level: 'closed', label: 'Cerrado', reason: lead.lost_reason || 'Sin acción comercial pendiente', rank: 4 };
  if (action.priorityGroup === PRIORITY_GROUP.now) return { level: 'urgent', label: 'Atender ahora', reason: action.reason, rank: 1 };
  if (action.priorityGroup === PRIORITY_GROUP.today) return { level: 'attention', label: 'Atender hoy', reason: action.reason, rank: 2 };
  return { level: 'controlled', label: 'Próximos', reason: action.reason, rank: 3 };
}

export function getRiskAlerts(leads, tasks, appointments, now = new Date(), quotes = []) {
  const queue = buildNextActionQueue({ leads, tasks, appointments, quotes, now });
  const urgent = queue.filter(({ action }) => action.priorityGroup === PRIORITY_GROUP.now);
  const newConsultations = urgent.filter(({ action }) => action.actionType === 'initial_contact').length;
  const overdueFollowups = urgent.filter(({ action }) => ['followup', 'quote_followup', 'no_show_recovery'].includes(action.actionType)).length;
  const appointmentsDue = urgent.filter(({ action }) => ['confirm_appointment', 'attendance'].includes(action.actionType)).length;
  return [
    newConsultations ? { id: 'new', tone: 'danger', count: newConsultations, message: `${newConsultations} consulta${newConsultations === 1 ? '' : 's'} nueva${newConsultations === 1 ? '' : 's'} sin respuesta.`, target: 'pending' } : null,
    overdueFollowups ? { id: 'followups', tone: 'warning', count: overdueFollowups, message: `${overdueFollowups} seguimiento${overdueFollowups === 1 ? '' : 's'} necesita${overdueFollowups === 1 ? '' : 'n'} atención.`, target: 'pending' } : null,
    appointmentsDue ? { id: 'appointments', tone: 'warning', count: appointmentsDue, message: `${appointmentsDue} cita${appointmentsDue === 1 ? '' : 's'} requiere${appointmentsDue === 1 ? '' : 'n'} acción.`, target: 'agenda' } : null,
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
