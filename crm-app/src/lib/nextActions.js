import {
  APPOINTMENT_STATUS,
  isOpenTask,
  isTerminalLeadStatus,
  normalizeAppointmentStatus,
  normalizeLeadStatus,
} from './crmDomain.js';
import { fromDatetimeLocalAsuncion, toLocalIsoDate } from './formatters.js';

export const PRIORITY_GROUP = { now: 'now', today: 'today', later: 'later' };

export const PRIORITY_GROUP_LABEL = {
  [PRIORITY_GROUP.now]: 'ATENDER AHORA',
  [PRIORITY_GROUP.today]: 'ATENDER HOY',
  [PRIORITY_GROUP.later]: 'PUEDE ESPERAR',
};

const openAppointmentStatuses = new Set([
  APPOINTMENT_STATUS.scheduled,
  APPOINTMENT_STATUS.confirmed,
  APPOINTMENT_STATUS.rescheduled,
  'Pendiente',
]);

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function appointmentDateTime(appointment) {
  if (!appointment?.appointment_date || !appointment?.appointment_time) return null;
  return safeDate(fromDatetimeLocalAsuncion(
    `${appointment.appointment_date}T${String(appointment.appointment_time).slice(0, 5)}`,
  ));
}

function temporalGroup(dueAt, now) {
  const due = safeDate(dueAt);
  if (!due || due.getTime() < now.getTime()) return PRIORITY_GROUP.now;
  return toLocalIsoDate(due) === toLocalIsoDate(now) ? PRIORITY_GROUP.today : PRIORITY_GROUP.later;
}

function temporalRank(group) {
  if (group === PRIORITY_GROUP.now) return 20;
  if (group === PRIORITY_GROUP.today) return 50;
  return 90;
}

function taskCandidate(task, now) {
  const group = temporalGroup(task.due_at, now);
  return {
    actionType: task.type || 'task',
    title: task.title || 'Resolver próxima acción',
    reason: group === PRIORITY_GROUP.now
      ? `${task.title || 'La próxima acción'} está vencida o necesita atención inmediata.`
      : group === PRIORITY_GROUP.today
        ? `${task.title || 'La próxima acción'} corresponde hoy.`
        : `${task.title || 'La próxima acción'} está programada.`,
    dueAt: task.due_at || null,
    priority: task.priority || 'media',
    priorityGroup: group,
    taskId: task.id,
    appointmentId: null,
    quoteId: task.quote_id || null,
    rank: temporalRank(group),
  };
}

function chooseCandidate(candidates) {
  return candidates.filter(Boolean).sort((left, right) => left.rank - right.rank
    || (safeDate(left.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER)
    - (safeDate(right.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER))[0];
}

export function getEffectiveNextAction(lead, context = {}) {
  if (!lead || isTerminalLeadStatus(lead.status) || lead.is_archived) return null;

  const now = safeDate(context.now) || new Date();
  const tasks = (context.tasks || []).filter((task) => task.lead_id === lead.id && isOpenTask(task));
  const appointments = (context.appointments || [])
    .filter((appointment) => appointment.lead_id === lead.id)
    .map((appointment) => ({ ...appointment, normalizedStatus: normalizeAppointmentStatus(appointment.status) }));
  const quotes = (context.quotes || []).filter((quote) => quote.lead_id === lead.id && quote.status === 'pending');
  const status = normalizeLeadStatus(lead.status);
  const candidates = tasks.map((task) => taskCandidate(task, now));

  if (!lead.assigned_to) {
    candidates.push({ actionType: 'assign_owner', title: 'Asignar encargado', reason: 'Esta oportunidad no tiene una persona encargada.', dueAt: now.toISOString(), priority: 'alta', priorityGroup: PRIORITY_GROUP.now, taskId: null, appointmentId: null, quoteId: null, rank: 0 });
  }

  if (['Nuevo', 'No Contactado'].includes(status) && !lead.first_contacted_at && !lead.last_contact_at) {
    candidates.push({ actionType: 'initial_contact', title: 'Responder nueva consulta', reason: 'Consultó y todavía no recibió una respuesta registrada.', dueAt: lead.next_followup_at || lead.created_at, priority: 'alta', priorityGroup: PRIORITY_GROUP.now, taskId: tasks.find((task) => task.type === 'contact')?.id || null, appointmentId: null, quoteId: null, rank: 5 });
  }

  if (status === APPOINTMENT_STATUS.noShow) {
    const lastNoShow = appointments.filter((item) => item.normalizedStatus === APPOINTMENT_STATUS.noShow)
      .sort((left, right) => (appointmentDateTime(right)?.getTime() || 0) - (appointmentDateTime(left)?.getTime() || 0))[0];
    candidates.push({ actionType: 'no_show_recovery', title: 'Recuperar paciente que no asistió', reason: 'No asistió y necesita un nuevo contacto para no perder la oportunidad.', dueAt: lead.next_followup_at || now.toISOString(), priority: 'alta', priorityGroup: PRIORITY_GROUP.now, taskId: tasks.find((task) => task.type === 'no_show_recovery')?.id || null, appointmentId: lastNoShow?.id || null, quoteId: null, rank: 7 });
  }

  appointments.forEach((appointment) => {
    if (!openAppointmentStatuses.has(appointment.normalizedStatus)) return;
    const appointmentAt = appointmentDateTime(appointment);
    if (!appointmentAt) return;

    if (appointmentAt.getTime() <= now.getTime()) {
      candidates.push({ actionType: 'attendance', title: 'Registrar asistencia', reason: 'La hora de la cita ya pasó y falta registrar qué ocurrió.', dueAt: appointmentAt.toISOString(), priority: 'alta', priorityGroup: PRIORITY_GROUP.now, taskId: tasks.find((task) => task.type === 'attendance')?.id || null, appointmentId: appointment.id, quoteId: null, rank: 8 });
      return;
    }

    if (appointment.normalizedStatus !== APPOINTMENT_STATUS.confirmed) {
      const hoursUntil = (appointmentAt.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntil <= 24) {
        candidates.push({ actionType: 'confirm_appointment', title: 'Confirmar cita', reason: 'La cita está próxima y todavía no fue confirmada.', dueAt: appointmentAt.toISOString(), priority: 'alta', priorityGroup: hoursUntil <= 4 ? PRIORITY_GROUP.now : PRIORITY_GROUP.today, taskId: tasks.find((task) => task.type === 'confirm')?.id || null, appointmentId: appointment.id, quoteId: null, rank: hoursUntil <= 4 ? 9 : 40 });
      }
    }
  });

  quotes.forEach((quote) => {
    const group = temporalGroup(quote.next_action_at, now);
    candidates.push({
      actionType: 'quote_followup',
      title: 'Dar seguimiento al presupuesto',
      reason: group === PRIORITY_GROUP.now ? 'El presupuesto está pendiente y su seguimiento está vencido.' : group === PRIORITY_GROUP.today ? 'El seguimiento del presupuesto corresponde hoy.' : 'El presupuesto tiene un próximo seguimiento programado.',
      dueAt: quote.next_action_at,
      priority: group === PRIORITY_GROUP.later ? 'media' : 'alta',
      priorityGroup: group,
      taskId: tasks.find((task) => task.quote_id === quote.id && task.type === 'quote_followup')?.id || null,
      appointmentId: quote.appointment_id || null,
      quoteId: quote.id,
      rank: temporalRank(group) - 1,
    });
  });

  if (!candidates.length) {
    const group = temporalGroup(lead.next_followup_at, now);
    candidates.push({ actionType: 'define_next_step', title: lead.next_action || 'Definir próximo paso', reason: lead.next_action ? 'Esta es la próxima acción registrada para el paciente.' : 'La oportunidad está abierta pero no tiene una próxima acción clara.', dueAt: lead.next_followup_at || now.toISOString(), priority: lead.next_action ? 'media' : 'alta', priorityGroup: lead.next_action ? group : PRIORITY_GROUP.now, taskId: null, appointmentId: null, quoteId: null, rank: lead.next_action ? temporalRank(group) : 1 });
  }

  const selected = chooseCandidate(candidates);
  return selected ? {
    leadId: lead.id,
    assignedTo: lead.assigned_to || null,
    actionType: selected.actionType,
    title: selected.title,
    reason: selected.reason,
    dueAt: selected.dueAt,
    priority: selected.priority,
    priorityGroup: selected.priorityGroup,
    taskId: selected.taskId,
    appointmentId: selected.appointmentId,
    quoteId: selected.quoteId,
  } : null;
}

export function buildNextActionQueue({ leads = [], tasks = [], appointments = [], quotes = [], now = new Date() }) {
  const groups = { now: 0, today: 1, later: 2 };
  return leads.map((lead) => ({ lead, action: getEffectiveNextAction(lead, { tasks, appointments, quotes, now }) }))
    .filter((item) => item.action)
    .sort((left, right) => groups[left.action.priorityGroup] - groups[right.action.priorityGroup]
      || (safeDate(left.action.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER)
      - (safeDate(right.action.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER));
}
