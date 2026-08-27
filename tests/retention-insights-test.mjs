import assert from 'node:assert/strict';
import { buildMessageFromTemplate, selectWhatsAppTemplateKey } from '../crm-app/src/lib/messages.js';
import { buildCommercialTimeline, buildWeeklyReportText, getLeadPriority, getRiskAlerts } from '../crm-app/src/lib/commercialInsights.js';

const now = new Date('2026-08-22T15:00:00.000Z');
const hotLead = { id: 'lead-1', name: 'Laura', classification: 'Lead Caliente', status: 'Nuevo', created_at: '2026-08-22T12:00:00.000Z', treatment: 'Implante dental', urgency: 'Hoy', source: 'WhatsApp directo' };
const urgent = getLeadPriority(hotLead, { now });
assert.equal(urgent.level, 'urgent');
assert.match(urgent.reason, /sin respuesta/i);

const controlled = getLeadPriority({ ...hotLead, status: 'Confirmado', last_contact_at: '2026-08-22T13:00:00.000Z', assigned_to: 'u1', next_action: 'Seguimiento', next_followup_at: '2026-08-25T13:00:00.000Z' }, { now });
assert.equal(controlled.level, 'controlled');

const alerts = getRiskAlerts([hotLead], [], [], now);
assert.equal(alerts[0].id, 'new');

const rendered = buildMessageFromTemplate(
  'Hola {{nombre}}. {{tratamiento}} · {{fuente}} · {{fecha_cita}} {{hora_cita}} · {{dato_inexistente}}',
  hotLead,
  { appointment_date: '2026-08-23', appointment_time: '10:00:00' },
  { name: 'DentalPro' },
);
assert.equal(rendered.includes('{{'), false);
assert.match(rendered, /Laura/);
assert.match(rendered, /WhatsApp directo/);
assert.equal(selectWhatsAppTemplateKey({ ...hotLead, situation: 'Quiere precio', urgency: '' }), 'price_inquiry');

const timeline = buildCommercialTimeline({
  lead: hotLead,
  events: [{ id: 'e1', event_type: 'whatsapp_opened', created_at: '2026-08-22T14:00:00.000Z', created_by: 'u1' }],
  tasks: [{ id: 't1', lead_id: 'lead-1', title: 'Contactar', status: 'hecho', created_at: '2026-08-22T13:00:00.000Z', completed_at: '2026-08-22T14:30:00.000Z', completed_by: 'u1' }],
  appointments: [],
  profiles: [{ id: 'u1', full_name: 'Recepción' }],
});
assert.equal(timeline.length, 2);
assert.equal(timeline[0].actor, 'Recepción');
assert.match(timeline[0].title, /Tarea completada/);

const report = buildWeeklyReportText({
  clinicName: 'DentalPro',
  label: 'Esta semana',
  data: {
    periodLeads: [hotLead], hotLeads: 1, uncontacted: [hotLead], averageResponseLabel: 'Sin datos',
    sourceRows: [{ label: 'WhatsApp directo', leads: 1, hot: 1, scheduled: 0 }], treatmentRows: [{ label: 'Implante dental', leads: 1, hot: 1 }],
    completedFollowups: 0, overdueFollowups: 1, openTasks: 1, periodAppointments: [], confirmed: 0, attended: [], noShows: [], noShowRecoveries: 0,
    attendanceRate: 0, lossReasonCounts: [], topResponsible: null, highTicket: 1, hasPotentialConfig: false, potential: 0,
  },
});
assert.match(report, /No representa ingresos confirmados/);
assert.match(report, /DentalPro/);

console.log('PASS retention insights frontend utilities');
