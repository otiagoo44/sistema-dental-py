import assert from 'node:assert/strict';
import { humanizeCrmError } from '../crm-app/src/lib/errors.js';
import { buildOwnerSummary } from '../crm-app/src/lib/ownerMetrics.js';

const now = new Date('2026-08-24T15:00:00.000Z');
const leads = [
  { id: 'lead-open', status: 'Contactado', assigned_to: 'user-1', created_at: '2026-08-02T12:00:00.000Z' },
  { id: 'lead-unassigned', status: 'Nuevo', assigned_to: null, created_at: '2026-08-03T12:00:00.000Z' },
  { id: 'lead-terminal', status: 'Tratamiento Iniciado', assigned_to: 'user-1', created_at: '2026-08-04T12:00:00.000Z' },
];
const workspaceEvents = [
  { id: 'event-contact-1', lead_id: 'lead-open', event_type: 'contact_attempted', created_at: '2026-08-05T12:00:00.000Z' },
  { id: 'event-contact-2', lead_id: 'lead-open', event_type: 'lead_contacted', created_at: '2026-08-06T12:00:00.000Z' },
  { id: 'event-contact-3', lead_id: 'lead-unassigned', event_type: 'contact_responded', created_at: '2026-08-06T12:00:00.000Z' },
  { id: 'event-scheduled', lead_id: 'lead-open', event_type: 'appointment_scheduled', created_at: '2026-08-07T12:00:00.000Z' },
  { id: 'event-rescheduled', lead_id: 'lead-open', event_type: 'appointment_rescheduled', created_at: '2026-08-08T12:00:00.000Z' },
  { id: 'event-attended', lead_id: 'lead-open', event_type: 'appointment_attended', created_at: '2026-08-09T12:00:00.000Z' },
  { id: 'event-treatment', lead_id: 'lead-terminal', event_type: 'treatment_started', created_at: '2026-08-10T12:00:00.000Z' },
  { id: 'event-old', lead_id: 'lead-unassigned', event_type: 'appointment_attended', created_at: '2026-07-10T12:00:00.000Z' },
];
const tasks = [
  { id: 'task-overdue', lead_id: 'lead-open', title: 'Seguimiento vencido', status: 'pendiente', due_at: '2026-08-23T12:00:00.000Z' },
];
const quotes = [
  { id: 'quote-risk-a', lead_id: 'lead-open', amount: 100, status: 'pending', issued_at: '2026-08-11T12:00:00.000Z', next_action_at: '2026-08-23T12:00:00.000Z' },
  { id: 'quote-risk-a', lead_id: 'lead-open', amount: 100, status: 'pending', issued_at: '2026-08-11T12:00:00.000Z', next_action_at: '2026-08-23T12:00:00.000Z' },
  { id: 'quote-risk-b', lead_id: 'lead-open', amount: 200, status: 'pending', issued_at: '2026-08-12T12:00:00.000Z', next_action_at: '2026-08-25T12:00:00.000Z' },
  { id: 'quote-risk-c', lead_id: 'lead-unassigned', amount: 300, status: 'pending', issued_at: '2026-08-13T12:00:00.000Z', next_action_at: '2026-08-26T12:00:00.000Z' },
  { id: 'quote-terminal', lead_id: 'lead-terminal', amount: 400, status: 'pending', issued_at: '2026-08-14T12:00:00.000Z', next_action_at: '2026-08-23T12:00:00.000Z' },
  { id: 'quote-accepted', lead_id: 'lead-open', amount: 500, status: 'accepted', issued_at: '2026-07-14T12:00:00.000Z', accepted_at: '2026-08-15T12:00:00.000Z' },
  { id: 'quote-rejected', lead_id: 'lead-open', amount: 600, status: 'rejected', issued_at: '2026-08-16T12:00:00.000Z', rejected_at: '2026-08-17T12:00:00.000Z' },
];

const summary = buildOwnerSummary({ leads, tasks, quotes, workspaceEvents, now });
assert.deepEqual(summary.funnel.map((item) => item.value), [3, 2, 1, 1, 1]);
assert.equal(summary.money.quoted, 1600);
assert.equal(summary.money.accepted, 500);
assert.equal(summary.money.rejected, 600);
assert.equal(summary.money.risk, 600);
assert.equal(summary.money.riskCount, 2);
assert.deepEqual(summary.money.riskyQuoteIds.sort(), ['quote-risk-a', 'quote-risk-b', 'quote-risk-c']);
assert.equal(summary.money.riskyQuoteIds.includes('quote-terminal'), false);

assert.equal(
  humanizeCrmError({ message: 'PGRST202 function missing from schema cache' }),
  'No pudimos guardar el cambio. Intentá de nuevo.',
);
assert.equal(
  humanizeCrmError({ message: 'Failed to fetch' }),
  'No pudimos conectar con el sistema. Revisá internet e intentá de nuevo.',
);
assert.equal(humanizeCrmError({ message: 'La cita ya no puede confirmarse' }), 'La cita ya no puede confirmarse');

console.log('PASS owner metrics formulas, quote risk deduplication and human errors');
