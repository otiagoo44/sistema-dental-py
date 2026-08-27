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
  [PRIORITY_GROUP.later]: 'PRÓXIMOS',
};

const GROUP_RANK = { now: 0, today: 1, later: 2 };
const openAppointmentStatuses = new Set([
  APPOINTMENT_STATUS.scheduled,
  APPOINTMENT_STATUS.confirmed,
  APPOINTMENT_STATUS.rescheduled,
  'Pendiente',
]);

const TASK_CRITICALITY = {
  attendance: 15,
  confirm: 20,
  no_show_recovery: 25,
  quote_followup: 30,
  treatment_start: 40,
  contact: 45,
  contact_lead: 45,
  followup: 50,
  reminder: 75,
  manual_reminder: 75,
};

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

function urgencyForGroup(group, { critical = false, manual = false } = {}) {
  if (critical) return 0;
  if (group === PRIORITY_GROUP.now) return manual ? 3 : 1;
  if (group === PRIORITY_GROUP.today) return manual ? 4 : 2;
  return 5;
}

function taskCandidate(task, now) {
  const group = temporalGroup(task.due_at, now);
  const type = task.type || 'task';
  const manual = ['reminder', 'manual_reminder', 'manual'].includes(type);
  return {
    actionType: manual ? 'manual_reminder' : type,
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
    urgencyRank: urgencyForGroup(group, { manual }),
    criticality: TASK_CRITICALITY[type] || (manual ? 75 : 65),
  };
}

function compareCandidates(left, right) {
  return GROUP_RANK[left.priorityGroup] - GROUP_RANK[right.priorityGroup]
    || left.urgencyRank - right.urgencyRank
    || left.criticality - right.criticality
    || (safeDate(left.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER)
      - (safeDate(right.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER);
}

function chooseCandidate(candidates) {
  return candidates.filter(Boolean).sort(compareCandidates)[0];
}

function actionCandidate(fields) {
  return {
    taskId: null,
    appointmentId: null,
    quoteId: null,
    priority: 'media',
    urgencyRank: 2,
    criticality: 60,
    ...fields,
  };
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
    candidates.push(actionCandidate({
      actionType: 'assign_owner',
      title: 'Asignar encargado',
      reason: 'Esta oportunidad no tiene una persona encargada.',
      dueAt: now.toISOString(),
      priority: 'alta',
      priorityGroup: PRIORITY_GROUP.now,
      urgencyRank: 2,
      criticality: 60,
    }));
  }

  if (['Nuevo', 'No Contactado'].includes(status) && !lead.first_contacted_at && !lead.last_contact_at) {
    candidates.push(actionCandidate({
      actionType: 'initial_contact',
      title: 'Responder nueva consulta',
      reason: 'Nueva consulta todavía sin respuesta registrada.',
      dueAt: lead.created_at || now.toISOString(),
      priority: 'alta',
      priorityGroup: PRIORITY_GROUP.now,
      taskId: tasks.find((task) => task.type === 'contact')?.id || null,
      urgencyRank: 0,
      criticality: 10,
    }));
  }

  if (status === APPOINTMENT_STATUS.noShow) {
    const lastNoShow = appointments.filter((item) => item.normalizedStatus === APPOINTMENT_STATUS.noShow)
      .sort((left, right) => (appointmentDateTime(right)?.getTime() || 0) - (appointmentDateTime(left)?.getTime() || 0))[0];
    candidates.push(actionCandidate({
      actionType: 'no_show_recovery',
      title: 'Recuperar paciente que no asistió',
      reason: 'No asistió y todavía necesita un nuevo contacto.',
      dueAt: lead.next_followup_at || now.toISOString(),
      priority: 'alta',
      priorityGroup: PRIORITY_GROUP.now,
      taskId: tasks.find((task) => task.type === 'no_show_recovery')?.id || null,
      appointmentId: lastNoShow?.id || null,
      urgencyRank: 0,
      criticality: 25,
    }));
  }

  appointments.forEach((appointment) => {
    if (!openAppointmentStatuses.has(appointment.normalizedStatus)) return;
    const appointmentAt = appointmentDateTime(appointment);
    if (!appointmentAt) return;

    if (appointmentAt.getTime() <= now.getTime()) {
      candidates.push(actionCandidate({
        actionType: 'attendance',
        title: 'Registrar asistencia',
        reason: 'La hora de la cita ya pasó y falta registrar qué ocurrió.',
        dueAt: appointmentAt.toISOString(),
        priority: 'alta',
        priorityGroup: PRIORITY_GROUP.now,
        taskId: tasks.find((task) => task.type === 'attendance')?.id || null,
        appointmentId: appointment.id,
        urgencyRank: 0,
        criticality: 15,
      }));
      return;
    }

    if (appointment.normalizedStatus !== APPOINTMENT_STATUS.confirmed) {
      const hoursUntil = (appointmentAt.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntil <= 24) {
        const imminent = hoursUntil <= 4;
        candidates.push(actionCandidate({
          actionType: 'confirm_appointment',
          title: 'Confirmar cita',
          reason: `Cita próxima sin confirmar: ${appointment.appointment_date} ${String(appointment.appointment_time).slice(0, 5)}.`,
          dueAt: appointmentAt.toISOString(),
          priority: 'alta',
          priorityGroup: imminent ? PRIORITY_GROUP.now : PRIORITY_GROUP.today,
          taskId: tasks.find((task) => task.type === 'confirm')?.id || null,
          appointmentId: appointment.id,
          urgencyRank: imminent ? 0 : 1,
          criticality: 20,
        }));
      }
    }
  });

  quotes.forEach((quote) => {
    const group = temporalGroup(quote.next_action_at, now);
    candidates.push(actionCandidate({
      actionType: 'quote_followup',
      title: 'Dar seguimiento al presupuesto',
      reason: group === PRIORITY_GROUP.now
        ? 'Seguimiento de presupuesto vencido.'
        : group === PRIORITY_GROUP.today
          ? 'Seguimiento de presupuesto para hoy.'
          : 'Seguimiento de presupuesto programado.',
      dueAt: quote.next_action_at,
      priority: group === PRIORITY_GROUP.later ? 'media' : 'alta',
      priorityGroup: group,
      taskId: tasks.find((task) => task.quote_id === quote.id && task.type === 'quote_followup')?.id || null,
      appointmentId: quote.appointment_id || null,
      quoteId: quote.id,
      urgencyRank: urgencyForGroup(group),
      criticality: 29,
    }));
  });

  if (!candidates.length) {
    const group = temporalGroup(lead.next_followup_at, now);
    candidates.push(actionCandidate({
      actionType: 'define_next_step',
      title: lead.next_action || 'Definir próximo paso',
      reason: lead.next_action
        ? 'Próxima acción registrada para el paciente.'
        : 'La oportunidad está abierta pero no tiene una próxima acción clara.',
      dueAt: lead.next_followup_at || now.toISOString(),
      priority: lead.next_action ? 'media' : 'alta',
      priorityGroup: lead.next_action ? group : PRIORITY_GROUP.now,
      urgencyRank: lead.next_action ? urgencyForGroup(group) : 1,
      criticality: lead.next_action ? 60 : 55,
    }));
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
    urgencyRank: selected.urgencyRank,
    criticality: selected.criticality,
  } : null;
}

export function compareQueueItems(left, right) {
  return GROUP_RANK[left.action.priorityGroup] - GROUP_RANK[right.action.priorityGroup]
    || left.action.urgencyRank - right.action.urgencyRank
    || left.action.criticality - right.action.criticality
    || Number(right.lead.score || 0) - Number(left.lead.score || 0)
    || (safeDate(left.action.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER)
      - (safeDate(right.action.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER);
}

export function buildNextActionQueue({ leads = [], tasks = [], appointments = [], quotes = [], now = new Date() }) {
  const uniqueLeads = [...new Map(leads.filter((lead) => lead?.id).map((lead) => [lead.id, lead])).values()];
  return uniqueLeads
    .map((lead) => ({ lead, action: getEffectiveNextAction(lead, { tasks, appointments, quotes, now }) }))
    .filter((item) => item.action)
    .sort(compareQueueItems);
}
