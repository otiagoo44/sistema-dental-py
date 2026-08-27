import assert from 'node:assert/strict';
import { humanizeCrmError } from '../crm-app/src/lib/errors.js';
import { buildOwnerSummary } from '../crm-app/src/lib/ownerMetrics.js';

const now = new Date('2026-08-27T15:00:00.000Z');
const leads = Array.from({ length: 100 }, (_, index) => ({
  id: `lead-${index + 1}`,
  name: `Paciente ${index + 1}`,
  status: index < 8 ? 'Tratamiento Iniciado' : 'Contactado',
  classification: index < 40 ? 'Lead Caliente' : index < 80 ? 'Lead Medio' : 'Lead Frío',
  score: index < 40 ? 85 : index < 80 ? 62 : 35,
  assigned_to: 'user-qa',
  created_at: '2026-08-01T12:00:00.000Z',
  first_contacted_at: index < 80 ? '2026-08-01T13:00:00.000Z' : null,
  updated_at: index < 8 ? '2026-08-18T12:00:00.000Z' : '2026-08-01T13:00:00.000Z',
}));

const appointments = Array.from({ length: 40 }, (_, index) => ({
  id: `appointment-${index + 1}`,
  lead_id: `lead-${index + 1}`,
  status: index < 30 ? 'Asistió' : 'No Asistió',
  appointment_date: '2026-08-15',
  appointment_time: '10:00:00',
  created_at: '2026-08-02T12:00:00.000Z',
  updated_at: '2026-08-15T15:00:00.000Z',
}));

const quotes = Array.from({ length: 20 }, (_, index) => ({
  id: `quote-${index + 1}`,
  lead_id: `lead-${index + 1}`,
  amount: 1_000_000,
  status: index < 10 ? 'accepted' : 'pending',
  issued_at: '2026-08-16T12:00:00.000Z',
  accepted_at: index < 10 ? '2026-08-17T12:00:00.000Z' : null,
  next_action_at: index >= 10 ? '2026-08-26T12:00:00.000Z' : null,
}));

const workspaceEvents = Array.from({ length: 8 }, (_, index) => ({
  id: `started-${index + 1}`,
  lead_id: `lead-${index + 1}`,
  event_type: 'treatment_started',
  created_at: '2026-08-18T12:00:00.000Z',
}));

const summary = buildOwnerSummary({ leads, appointments, quotes, workspaceEvents, now });
assert.deepEqual(summary.funnel.map((item) => item.value), [100, 80, 40, 30, 20, 10, 8]);
assert.equal(summary.metrics.contactRate, 80);
assert.equal(summary.metrics.bookingRate, 50);
assert.equal(summary.metrics.showRate, 75);
assert.equal(summary.metrics.quoteRate, 66.7);
assert.equal(summary.metrics.acceptanceRate, 50);
assert.equal(summary.metrics.startedRate, 80);
assert.equal(summary.bottleneck.stage, 'Citas agendadas');
assert.equal(summary.money.quoted, 20_000_000);
assert.equal(summary.money.accepted, 10_000_000);
assert.equal(summary.money.pending, 10_000_000);
assert.equal(summary.comparisons.contactRate, null);

assert.equal(
  humanizeCrmError({ message: 'PGRST202 function missing from schema cache' }),
  'No pudimos guardar el cambio. Intentá de nuevo.',
);
assert.equal(
  humanizeCrmError({ message: 'Failed to fetch' }),
  'No pudimos conectar con el sistema. Revisá internet e intentá de nuevo.',
);

console.log('PASS exact funnel denominators, operational rates, bottleneck and budget metrics');
