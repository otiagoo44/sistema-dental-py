import { isTerminalLeadStatus } from './crmDomain.js';
import { toLocalIsoDate } from './formatters.js';
import { buildNextActionQueue, PRIORITY_GROUP } from './nextActions.js';

function uniqueLeadCount(events, types) {
  return new Set(events
    .filter((event) => types.includes(event.event_type))
    .map((event) => event.lead_id)
    .filter(Boolean)).size;
}

function inMonth(value, month) {
  return Boolean(value) && toLocalIsoDate(value).slice(0, 7) === month;
}

function uniqueById(rows) {
  return [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()];
}

export function buildOwnerSummary({
  leads = [],
  appointments = [],
  tasks = [],
  quotes = [],
  workspaceEvents = [],
  now = new Date(),
}) {
  const month = toLocalIsoDate(now).slice(0, 7);
  const periodEvents = workspaceEvents.filter((event) => inMonth(event.created_at, month));
  const uniqueQuotes = uniqueById(quotes);
  const periodQuotes = uniqueQuotes.filter((quote) => inMonth(quote.issued_at, month));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const queue = buildNextActionQueue({ leads, appointments, tasks, quotes: uniqueQuotes, now });
  const actionByLead = new Map(queue.map((item) => [item.lead.id, item.action]));
  const riskyQuotes = uniqueQuotes.filter((quote) => {
    if (quote.status !== 'pending') return false;
    const lead = leadById.get(quote.lead_id);
    if (!lead || lead.is_archived || isTerminalLeadStatus(lead.status)) return false;
    const action = actionByLead.get(quote.lead_id);
    return !lead.assigned_to || !action || action.priorityGroup === PRIORITY_GROUP.now;
  });

  const lossRows = [
    { label: 'No respondieron', count: uniqueLeadCount(periodEvents, ['contact_attempted']) },
    { label: 'No asistieron', count: uniqueLeadCount(periodEvents, ['appointment_no_show']) },
    { label: 'Rechazaron presupuesto', count: uniqueLeadCount(periodEvents, ['quote_rejected']) },
  ].sort((left, right) => right.count - left.count);

  return {
    month,
    monthLabel: new Intl.DateTimeFormat('es-PY', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Asuncion',
    }).format(now),
    funnel: [
      {
        label: 'Consultas',
        value: new Set(leads.filter((lead) => inMonth(lead.created_at, month)).map((lead) => lead.id)).size,
        source: 'Oportunidades creadas',
        definition: 'Oportunidades únicas creadas durante el mes visible.',
      },
      {
        label: 'Contactadas',
        value: uniqueLeadCount(periodEvents, ['lead_contacted', 'contact_responded', 'contact_attempted']),
        source: 'Eventos de contacto',
        definition: 'Oportunidades únicas con una respuesta o intento de contacto registrado durante el mes.',
      },
      {
        label: 'Agendaron',
        value: uniqueLeadCount(periodEvents, ['appointment_scheduled', 'appointment_rescheduled']),
        source: 'Eventos de agenda',
        definition: 'Oportunidades únicas que agendaron o reprogramaron una cita durante el mes.',
      },
      {
        label: 'Asistieron',
        value: uniqueLeadCount(periodEvents, ['appointment_attended']),
        source: 'Eventos de asistencia',
        definition: 'Oportunidades únicas con asistencia registrada durante el mes.',
      },
      {
        label: 'Iniciaron tratamiento',
        value: uniqueLeadCount(periodEvents, ['treatment_started']),
        source: 'Eventos de tratamiento',
        definition: 'Oportunidades únicas cuyo inicio de tratamiento fue registrado durante el mes.',
      },
    ],
    money: {
      quoted: periodQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      pending: uniqueQuotes.filter((quote) => quote.status === 'pending').reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      accepted: uniqueQuotes.filter((quote) => quote.status === 'accepted' && inMonth(quote.accepted_at, month)).reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      rejected: uniqueQuotes.filter((quote) => quote.status === 'rejected' && inMonth(quote.rejected_at, month)).reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      risk: riskyQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      riskCount: new Set(riskyQuotes.map((quote) => quote.lead_id)).size,
      riskyQuoteIds: riskyQuotes.map((quote) => quote.id),
    },
    lossRows,
  };
}
