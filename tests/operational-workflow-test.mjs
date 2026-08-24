import assert from 'node:assert/strict';
import {
  APPOINTMENT_STATUS,
  canTransitionAppointment,
  isTerminalLeadStatus,
  normalizeAppointmentStatus,
  normalizeLeadStatus,
  normalizeTaskStatus,
} from '../crm-app/src/lib/crmDomain.js';
import { buildNextActionQueue, getEffectiveNextAction, PRIORITY_GROUP } from '../crm-app/src/lib/nextActions.js';

const now = new Date('2026-08-24T15:00:00.000Z');
const baseLead = {
  id: 'lead-1',
  name: 'Laura',
  status: 'Contactado',
  assigned_to: 'user-1',
  created_at: '2026-08-24T13:00:00.000Z',
  next_action: 'Volver a contactar',
};

const newAction = getEffectiveNextAction({ ...baseLead, status: 'Nuevo', first_contacted_at: null, last_contact_at: null }, { now });
assert.equal(newAction.priorityGroup, PRIORITY_GROUP.now);
assert.equal(newAction.actionType, 'initial_contact');

const overdueAction = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'task-overdue', lead_id: baseLead.id, title: 'Llamar', type: 'followup', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
});
assert.equal(overdueAction.priorityGroup, PRIORITY_GROUP.now);
assert.equal(overdueAction.taskId, 'task-overdue');

const todayAction = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'task-today', lead_id: baseLead.id, title: 'Llamar hoy', status: 'pendiente', due_at: '2026-08-24T19:00:00.000Z' }],
});
assert.equal(todayAction.priorityGroup, PRIORITY_GROUP.today);

const futureAction = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'task-future', lead_id: baseLead.id, title: 'Llamar después', status: 'pendiente', due_at: '2026-08-26T13:00:00.000Z' }],
});
assert.equal(futureAction.priorityGroup, PRIORITY_GROUP.later);

const noShowAction = getEffectiveNextAction({ ...baseLead, status: 'No Asistió' }, {
  now,
  appointments: [{ id: 'appointment-no-show', lead_id: baseLead.id, status: 'No Asistió', appointment_date: '2026-08-24', appointment_time: '09:00:00' }],
});
assert.equal(noShowAction.actionType, 'no_show_recovery');
assert.equal(noShowAction.priorityGroup, PRIORITY_GROUP.now);

const confirmationAction = getEffectiveNextAction(baseLead, {
  now,
  appointments: [{ id: 'appointment-future', lead_id: baseLead.id, status: 'Agendado', appointment_date: '2026-08-24', appointment_time: '13:00:00' }],
});
assert.equal(confirmationAction.actionType, 'confirm_appointment');
assert.equal(confirmationAction.appointmentId, 'appointment-future');

const unassignedAction = getEffectiveNextAction({ ...baseLead, assigned_to: null }, { now });
assert.equal(unassignedAction.actionType, 'assign_owner');
assert.equal(unassignedAction.priorityGroup, PRIORITY_GROUP.now);

assert.equal(getEffectiveNextAction({ ...baseLead, status: 'Tratamiento Iniciado' }, { now }), null);
assert.equal(getEffectiveNextAction({ ...baseLead, status: 'Perdido' }, { now }), null);
assert.equal(isTerminalLeadStatus('Archivado'), true);

const oneCardQueue = buildNextActionQueue({
  now,
  leads: [{ ...baseLead, status: 'Nuevo', first_contacted_at: null, last_contact_at: null }],
  tasks: [
    { id: 'task-1', lead_id: baseLead.id, title: 'Primera señal', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' },
    { id: 'task-2', lead_id: baseLead.id, title: 'Segunda señal', status: 'vencido', due_at: '2026-08-24T13:00:00.000Z' },
  ],
});
assert.equal(oneCardQueue.length, 1);
assert.equal(oneCardQueue[0].lead.id, baseLead.id);

const overdueBeatsFutureAppointment = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'task-overdue-2', lead_id: baseLead.id, title: 'Seguimiento vencido', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
  appointments: [{ id: 'appointment-later', lead_id: baseLead.id, status: 'Agendado', appointment_date: '2026-08-27', appointment_time: '15:00:00' }],
});
assert.equal(overdueBeatsFutureAppointment.taskId, 'task-overdue-2');

const noShowBeatsQuote = getEffectiveNextAction({ ...baseLead, status: 'No Asistió' }, {
  now,
  appointments: [{ id: 'appointment-no-show-2', lead_id: baseLead.id, status: 'No Asistió', appointment_date: '2026-08-23', appointment_time: '10:00:00' }],
  quotes: [{ id: 'quote-pending', lead_id: baseLead.id, status: 'pending', next_action_at: '2026-08-24T14:00:00.000Z' }],
});
assert.equal(noShowBeatsQuote.actionType, 'no_show_recovery');
assert.equal(noShowBeatsQuote.quoteId, null);

const quoteAndTaskBecomeOneAction = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'quote-task', lead_id: baseLead.id, quote_id: 'quote-1', type: 'quote_followup', title: 'Dar seguimiento al presupuesto', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
  quotes: [{ id: 'quote-1', lead_id: baseLead.id, status: 'pending', next_action_at: '2026-08-24T14:00:00.000Z' }],
});
assert.equal(quoteAndTaskBecomeOneAction.actionType, 'quote_followup');
assert.equal(quoteAndTaskBecomeOneAction.taskId, 'quote-task');
assert.equal(quoteAndTaskBecomeOneAction.quoteId, 'quote-1');

const independentPendingQuoteStaysCritical = buildNextActionQueue({
  now,
  leads: [baseLead, { ...baseLead }],
  tasks: [{ id: 'start-accepted-treatment', lead_id: baseLead.id, quote_id: 'quote-a', type: 'treatment_start', title: 'Iniciar tratamiento', status: 'pendiente', due_at: '2026-08-26T13:00:00.000Z' }],
  quotes: [
    { id: 'quote-a', lead_id: baseLead.id, treatment: 'Implante', status: 'accepted', next_action_at: null },
    { id: 'quote-b', lead_id: baseLead.id, treatment: 'Blanqueamiento', status: 'pending', next_action_at: '2026-08-24T14:00:00.000Z' },
  ],
});
assert.equal(independentPendingQuoteStaysCritical.length, 1);
assert.equal(independentPendingQuoteStaysCritical[0].action.actionType, 'quote_followup');
assert.equal(independentPendingQuoteStaysCritical[0].action.quoteId, 'quote-b');

const todayAppointmentBeatsGenericOverdue = getEffectiveNextAction(baseLead, {
  now,
  tasks: [{ id: 'generic-overdue', lead_id: baseLead.id, title: 'Revisar nota', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
  appointments: [{ id: 'appointment-in-two-hours', lead_id: baseLead.id, status: 'Agendado', appointment_date: '2026-08-24', appointment_time: '13:00:00' }],
});
assert.equal(todayAppointmentBeatsGenericOverdue.actionType, 'confirm_appointment');

const unassignedBeatsAppointment = getEffectiveNextAction({ ...baseLead, assigned_to: null }, {
  now,
  appointments: [{ id: 'appointment-unassigned', lead_id: baseLead.id, status: 'Agendado', appointment_date: '2026-08-24', appointment_time: '13:00:00' }],
});
assert.equal(unassignedBeatsAppointment.actionType, 'assign_owner');

const earliestOpenTask = getEffectiveNextAction(baseLead, {
  now,
  tasks: [
    { id: 'task-later', lead_id: baseLead.id, title: 'Después', status: 'pendiente', due_at: '2026-08-26T15:00:00.000Z' },
    { id: 'task-earlier', lead_id: baseLead.id, title: 'Antes', status: 'vencido', due_at: '2026-08-23T15:00:00.000Z' },
    { id: 'task-cancelled', lead_id: baseLead.id, title: 'Cancelada', status: 'cancelado', due_at: '2026-08-20T15:00:00.000Z' },
    { id: 'task-completed', lead_id: baseLead.id, title: 'Hecha', status: 'hecho', due_at: '2026-08-19T15:00:00.000Z' },
  ],
});
assert.equal(earliestOpenTask.taskId, 'task-earlier');

const duplicateLeadRows = buildNextActionQueue({
  now,
  leads: [baseLead, { ...baseLead, name: 'Laura actualizada' }],
  tasks: [{ id: 'dedupe-task', lead_id: baseLead.id, title: 'Única acción', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
});
assert.equal(duplicateLeadRows.length, 1);
assert.equal(duplicateLeadRows[0].lead.name, 'Laura actualizada');

assert.equal(getEffectiveNextAction({ ...baseLead, status: 'Archivado', is_archived: true }, {
  now,
  tasks: [{ id: 'orphan-terminal-task', lead_id: baseLead.id, title: 'No mostrar', status: 'pendiente', due_at: '2026-08-24T14:00:00.000Z' }],
}), null);

assert.equal(normalizeLeadStatus('AsistiÃ³'), 'Asistió');
assert.equal(normalizeAppointmentStatus('Consulta Agendada'), APPOINTMENT_STATUS.scheduled);
assert.equal(normalizeTaskStatus('Vencida'), 'overdue');
assert.equal(normalizeTaskStatus('completada'), 'done');

const futureAppointment = '2026-08-24T16:00:00.000Z';
const pastAppointment = '2026-08-24T14:00:00.000Z';
assert.equal(canTransitionAppointment('Agendado', 'Confirmado', futureAppointment, now), true);
assert.equal(canTransitionAppointment('Agendado', 'Asistió', futureAppointment, now), false);
assert.equal(canTransitionAppointment('Confirmado', 'Asistió', pastAppointment, now), true);
assert.equal(canTransitionAppointment('Asistió', 'Confirmado', pastAppointment, now), false);
assert.equal(canTransitionAppointment('No Asistió', 'Reprogramado', pastAppointment, now), true);

console.log('PASS canonical next actions, priorities and state transitions');
