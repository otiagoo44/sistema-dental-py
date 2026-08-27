import { APPOINTMENT_STATUS, normalizeAppointmentStatus, normalizeLeadStatus } from './crmDomain.js';
import { fromDatetimeLocalAsuncion, normalizeText } from './formatters.js';
import { buildNextActionQueue, PRIORITY_GROUP } from './nextActions.js';

const DAY = 86_400_000;
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const CONTACT_EVENTS = ['lead_contacted', 'contact_responded'];
const BOOKING_EVENTS = ['appointment_scheduled', 'appointment_rescheduled'];
const ATTENDED_EVENTS = ['appointment_attended'];
const STARTED_EVENTS = ['treatment_started'];
const RECOVERY_START_EVENTS = ['appointment_no_show', 'contact_attempted'];
const RECOVERY_ADVANCE_EVENTS = ['contact_responded', 'appointment_scheduled', 'appointment_attended', 'quote_accepted', 'treatment_started'];

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueById(rows) {
  return [...new Map((rows || []).filter((row) => row?.id).map((row) => [row.id, row])).values()];
}

function inWindow(value, window) {
  const date = safeDate(value);
  return Boolean(date && date >= window.start && date < window.end);
}

function beforeEnd(value, end) {
  const date = safeDate(value);
  return Boolean(date && date < end);
}

function percent(numerator, denominator, precision = 1) {
  if (!denominator) return 0;
  const factor = 10 ** precision;
  return Math.round((numerator / denominator) * 100 * factor) / factor;
}

function percentile(values, value) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(value * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hasEvent(events, leadId, types, end) {
  return events.some((event) => event.lead_id === leadId && types.includes(event.event_type) && beforeEnd(event.created_at, end));
}

function eventSequenceRecovered(events, leadId, window) {
  const rows = events.filter((event) => event.lead_id === leadId && safeDate(event.created_at) && safeDate(event.created_at) < window.end)
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
  const recoveryStart = rows.find((event) => RECOVERY_START_EVENTS.includes(event.event_type));
  if (!recoveryStart) return false;
  return rows.some((event) => RECOVERY_ADVANCE_EVENTS.includes(event.event_type)
    && new Date(event.created_at) > new Date(recoveryStart.created_at)
    && inWindow(event.created_at, window));
}

export function getAnalyticsWindow(period = '30d', now = new Date()) {
  const days = PERIOD_DAYS[period] || PERIOD_DAYS['30d'];
  const end = safeDate(now) || new Date();
  const start = new Date(end.getTime() - days * DAY);
  return {
    period,
    days,
    start,
    end,
    previous: { start: new Date(start.getTime() - days * DAY), end: start },
  };
}

function buildCohortStages({ leads, appointments, quotes, events, window }) {
  const cohort = leads.filter((lead) => inWindow(lead.created_at, window));
  const cohortIds = new Set(cohort.map((lead) => lead.id));
  const contacted = new Set(cohort.filter((lead) => beforeEnd(lead.first_contacted_at || lead.last_contact_at, window.end)
    || hasEvent(events, lead.id, CONTACT_EVENTS, window.end)).map((lead) => lead.id));
  const booked = new Set(appointments.filter((appointment) => cohortIds.has(appointment.lead_id)
    && contacted.has(appointment.lead_id)
    && (beforeEnd(appointment.created_at, window.end) || hasEvent(events, appointment.lead_id, BOOKING_EVENTS, window.end))).map((appointment) => appointment.lead_id));
  const attended = new Set(appointments.filter((appointment) => booked.has(appointment.lead_id)
    && (hasEvent(events, appointment.lead_id, ATTENDED_EVENTS, window.end)
      || (normalizeAppointmentStatus(appointment.status) === APPOINTMENT_STATUS.attended && beforeEnd(appointment.updated_at || appointment.created_at, window.end)))).map((appointment) => appointment.lead_id));
  const quoted = new Set(quotes.filter((quote) => attended.has(quote.lead_id) && beforeEnd(quote.issued_at, window.end)).map((quote) => quote.lead_id));
  const accepted = new Set(quotes.filter((quote) => quoted.has(quote.lead_id)
    && quote.status === 'accepted' && beforeEnd(quote.accepted_at || quote.updated_at, window.end)).map((quote) => quote.lead_id));
  const started = new Set(cohort.filter((lead) => accepted.has(lead.id)
    && (hasEvent(events, lead.id, STARTED_EVENTS, window.end)
      || (normalizeLeadStatus(lead.status) === 'Tratamiento Iniciado' && beforeEnd(lead.updated_at, window.end)))).map((lead) => lead.id));
  return { cohort, cohortIds, contacted, booked, attended, quoted, accepted, started };
}

function appointmentMoment(appointment) {
  if (!appointment?.appointment_date || !appointment?.appointment_time) return null;
  return safeDate(fromDatetimeLocalAsuncion(`${appointment.appointment_date}T${String(appointment.appointment_time).slice(0, 5)}`));
}

function eligibleAppointments(appointments, window) {
  return appointments.filter((appointment) => {
    const moment = appointmentMoment(appointment);
    const status = normalizeAppointmentStatus(appointment.status);
    return moment && moment >= window.start && moment < window.end
      && ![APPOINTMENT_STATUS.cancelled, APPOINTMENT_STATUS.rescheduled].includes(status);
  });
}

function quoteFollowupMinutes(quotes, tasks, window) {
  return quotes.filter((quote) => inWindow(quote.issued_at, window)).map((quote) => {
    const completed = tasks.filter((task) => task.quote_id === quote.id && task.type === 'quote_followup' && task.completed_at)
      .sort((left, right) => new Date(left.completed_at) - new Date(right.completed_at))[0];
    if (!completed) return null;
    return Math.max(0, (new Date(completed.completed_at) - new Date(quote.issued_at)) / 60_000);
  }).filter(Number.isFinite);
}

function followupCompliance(tasks, window) {
  const eligible = tasks.filter((task) => task.due_at && inWindow(task.due_at, window)
    && new Date(task.due_at) < window.end
    && !['cancelado', 'cancelled'].includes(normalizeText(task.status)));
  const onTime = eligible.filter((task) => task.completed_at && new Date(task.completed_at) <= new Date(task.due_at));
  return { eligible: eligible.length, onTime: onTime.length, rate: percent(onTime.length, eligible.length) };
}

function responseMinutes(cohort, end) {
  return cohort.map((lead) => {
    const firstContact = safeDate(lead.first_contacted_at || lead.last_contact_at);
    const created = safeDate(lead.created_at);
    if (!firstContact || !created || firstContact >= end) return null;
    return Math.max(0, (firstContact - created) / 60_000);
  }).filter(Number.isFinite);
}

function buildFunnel(stages) {
  const values = [
    ['Consultas', stages.cohort.length, 'Oportunidades válidas creadas en el período.'],
    ['Contactadas', stages.contacted.size, 'Consultas con primer contacto real registrado.'],
    ['Citas agendadas', stages.booked.size, 'Personas contactadas que agendaron.'],
    ['Asistieron', stages.attended.size, 'Personas agendadas con asistencia registrada.'],
    ['Presupuestos', stages.quoted.size, 'Personas que asistieron y recibieron presupuesto.'],
    ['Aceptaron', stages.accepted.size, 'Personas con presupuesto elegible aceptado.'],
    ['Iniciaron tratamiento', stages.started.size, 'Personas con aceptación e inicio registrado.'],
  ];
  return values.map(([label, value, definition], index) => {
    const previous = index ? values[index - 1][1] : null;
    return { label, value, denominator: previous, rate: index ? percent(value, previous) : null, definition };
  });
}

function buildBottleneck(funnel) {
  const candidates = funnel.slice(1).filter((step) => step.denominator > 0);
  if (!candidates.length) return null;
  const step = [...candidates].sort((left, right) => left.rate - right.rate || right.denominator - left.denominator)[0];
  return {
    stage: step.label,
    rate: step.rate,
    numerator: step.value,
    denominator: step.denominator,
    drop: step.denominator - step.value,
    message: `${step.value} de ${step.denominator} avanzaron a ${step.label.toLowerCase()}.`,
  };
}

export function normalizeLeadSource(lead) {
  if (lead?.source_normalized) return lead.source_normalized;
  const source = normalizeText(`${lead?.utm_source || ''} ${lead?.source || ''}`);
  if (source.includes('instagram') || /(^|\s)ig(\s|$)/.test(source)) return 'Instagram';
  if (source.includes('meta') || source.includes('facebook')) return 'Meta Ads';
  if (source.includes('google') || source.includes('adwords')) return 'Google';
  if (source.includes('refer') || source.includes('recomend')) return 'Referido';
  if (source.includes('landing') || source.includes('formulario') || source.includes('web')) return 'Landing';
  if (source.includes('whatsapp')) return 'WhatsApp';
  return 'Otros';
}

function groupRows({ cohort, selector, stages, appointments, quotes, window }) {
  const groups = cohort.reduce((result, lead) => {
    const label = selector(lead) || 'Sin dato';
    (result[label] ||= []).push(lead);
    return result;
  }, {});
  return Object.entries(groups).map(([label, group]) => {
    const ids = new Set(group.map((lead) => lead.id));
    const groupAppointments = eligibleAppointments(appointments.filter((item) => ids.has(item.lead_id)), window);
    const attendedAppointments = groupAppointments.filter((item) => normalizeAppointmentStatus(item.status) === APPOINTMENT_STATUS.attended);
    const eligibleQuotes = quotes.filter((quote) => ids.has(quote.lead_id) && inWindow(quote.issued_at, window) && quote.status !== 'cancelled');
    const acceptedQuotes = eligibleQuotes.filter((quote) => quote.status === 'accepted');
    const scoreTotal = group.reduce((sum, lead) => sum + Number(lead.score || 0), 0);
    return {
      label,
      consultations: group.length,
      averageScore: group.length ? Math.round(scoreTotal / group.length) : 0,
      hotRate: percent(group.filter((lead) => lead.classification === 'Lead Caliente').length, group.length),
      bookingRate: percent(group.filter((lead) => stages.booked.has(lead.id)).length, group.length),
      showRate: percent(attendedAppointments.length, groupAppointments.length),
      quoteRate: percent(group.filter((lead) => stages.quoted.has(lead.id)).length, group.length),
      acceptanceRate: percent(acceptedQuotes.length, eligibleQuotes.length),
      quoteCount: eligibleQuotes.length,
      quotedAmount: eligibleQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      startedRate: percent(group.filter((lead) => stages.started.has(lead.id)).length, group.length),
    };
  }).sort((left, right) => right.consultations - left.consultations || left.label.localeCompare(right.label));
}

function buildTeamRows({ profiles, cohort, stages, appointments, tasks, window }) {
  return profiles.map((profile) => {
    const assigned = cohort.filter((lead) => lead.assigned_to === profile.id);
    const ids = new Set(assigned.map((lead) => lead.id));
    const ownTimes = responseMinutes(assigned, window.end);
    const ownTasks = tasks.filter((task) => task.assigned_to === profile.id || ids.has(task.lead_id));
    const compliance = followupCompliance(ownTasks, window);
    const occurred = eligibleAppointments(appointments.filter((appointment) => ids.has(appointment.lead_id)), window);
    const attended = occurred.filter((appointment) => normalizeAppointmentStatus(appointment.status) === APPOINTMENT_STATUS.attended);
    return {
      id: profile.id,
      label: profile.full_name || profile.email,
      consultations: assigned.length,
      medianResponseMinutes: median(ownTimes),
      contactRate: percent(assigned.filter((lead) => stages.contacted.has(lead.id)).length, assigned.length),
      followupRate: compliance.rate,
      booked: assigned.filter((lead) => stages.booked.has(lead.id)).length,
      showRate: percent(attended.length, occurred.length),
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function buildLossRows(leads, window) {
  const lost = leads.filter((lead) => inWindow(lead.lost_at, window));
  const counts = lost.reduce((result, lead) => {
    const reason = lead.lost_reason || 'Sin motivo histórico';
    result[reason] = (result[reason] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).map(([label, count]) => ({ label, count, rate: percent(count, lost.length) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildPeriodCore({ leads, appointments, tasks, quotes, events, window }) {
  const stages = buildCohortStages({ leads, appointments, quotes, events, window });
  const occurredAppointments = eligibleAppointments(appointments, window);
  const attendedAppointments = occurredAppointments.filter((item) => normalizeAppointmentStatus(item.status) === APPOINTMENT_STATUS.attended);
  const noShows = occurredAppointments.filter((item) => normalizeAppointmentStatus(item.status) === APPOINTMENT_STATUS.noShow);
  const eligibleQuotes = quotes.filter((quote) => inWindow(quote.issued_at, window) && quote.status !== 'cancelled');
  const acceptedQuotes = eligibleQuotes.filter((quote) => quote.status === 'accepted');
  const times = responseMinutes(stages.cohort, window.end);
  const followups = followupCompliance(tasks, window);
  const quoteTimes = quoteFollowupMinutes(quotes, tasks, window);
  const funnel = buildFunnel(stages);
  return {
    stages,
    funnel,
    bottleneck: buildBottleneck(funnel),
    metrics: {
      contactRate: percent(stages.contacted.size, stages.cohort.length),
      bookingRate: percent(stages.booked.size, stages.contacted.size),
      showRate: percent(attendedAppointments.length, occurredAppointments.length),
      noShowRate: percent(noShows.length, occurredAppointments.length),
      quoteRate: percent(stages.quoted.size, stages.attended.size),
      acceptanceRate: percent(acceptedQuotes.length, eligibleQuotes.length),
      startedRate: percent(stages.started.size, stages.accepted.size),
      followupRate: followups.rate,
      speedToLeadMedian: median(times),
      speedToLeadP90: percentile(times, 0.9),
      quoteFollowupMedian: median(quoteTimes),
    },
    denominators: {
      contactRate: stages.cohort.length,
      bookingRate: stages.contacted.size,
      showRate: occurredAppointments.length,
      noShowRate: occurredAppointments.length,
      quoteRate: stages.attended.size,
      acceptanceRate: eligibleQuotes.length,
      startedRate: stages.accepted.size,
      followupRate: followups.eligible,
      speedToLeadMedian: times.length,
      speedToLeadP90: times.length,
      quoteFollowupMedian: quoteTimes.length,
    },
    counts: {
      consultations: stages.cohort.length,
      occurredAppointments: occurredAppointments.length,
      attendedAppointments: attendedAppointments.length,
      noShows: noShows.length,
      eligibleQuotes: eligibleQuotes.length,
      acceptedQuotes: acceptedQuotes.length,
      followupsDue: followups.eligible,
      followupsOnTime: followups.onTime,
    },
  };
}

export function buildAnalytics({
  leads = [], appointments = [], tasks = [], quotes = [], events = [], profiles = [], period = '30d', now = new Date(),
}) {
  const window = getAnalyticsWindow(period, now);
  const safeLeads = uniqueById(leads);
  const safeAppointments = uniqueById(appointments);
  const safeTasks = uniqueById(tasks);
  const safeQuotes = uniqueById(quotes);
  const safeEvents = uniqueById(events);
  const current = buildPeriodCore({ leads: safeLeads, appointments: safeAppointments, tasks: safeTasks, quotes: safeQuotes, events: safeEvents, window });
  const previous = buildPeriodCore({ leads: safeLeads, appointments: safeAppointments, tasks: safeTasks, quotes: safeQuotes, events: safeEvents, window: window.previous });
  const queue = buildNextActionQueue({ leads: safeLeads, appointments: safeAppointments, tasks: safeTasks, quotes: safeQuotes, now });
  const actionByLead = new Map(queue.map((item) => [item.lead.id, item.action]));
  const pendingQuotes = safeQuotes.filter((quote) => quote.status === 'pending');
  const periodQuotes = safeQuotes.filter((quote) => inWindow(quote.issued_at, window) && quote.status !== 'cancelled');
  const acceptedPeriod = periodQuotes.filter((quote) => quote.status === 'accepted');
  const rejectedPeriod = periodQuotes.filter((quote) => quote.status === 'rejected');
  const attentionQuotes = pendingQuotes.filter((quote) => actionByLead.get(quote.lead_id)?.priorityGroup === PRIORITY_GROUP.now);
  const stages = current.stages;
  const sourceRows = groupRows({ cohort: stages.cohort, selector: normalizeLeadSource, stages, appointments: safeAppointments, quotes: safeQuotes, window });
  const treatmentRows = groupRows({ cohort: stages.cohort, selector: (lead) => lead.treatment || 'Sin tratamiento', stages, appointments: safeAppointments, quotes: safeQuotes, window });
  const qualityRows = groupRows({ cohort: stages.cohort, selector: (lead) => lead.classification?.replace('Lead ', '') || 'Sin dato', stages, appointments: safeAppointments, quotes: safeQuotes, window });
  const utmRows = groupRows({ cohort: stages.cohort.filter((lead) => lead.utm_campaign), selector: (lead) => lead.utm_campaign, stages, appointments: safeAppointments, quotes: safeQuotes, window });

  return {
    period,
    window,
    funnel: current.funnel,
    bottleneck: current.bottleneck,
    metrics: current.metrics,
    counts: current.counts,
    comparisons: Object.fromEntries(Object.keys(current.metrics).map((key) => [
      key,
      current.denominators[key] > 0 && previous.denominators[key] > 0
        && Number.isFinite(current.metrics[key]) && Number.isFinite(previous.metrics[key])
        ? Math.round((current.metrics[key] - previous.metrics[key]) * 10) / 10
        : null,
    ])),
    sourceRows,
    treatmentRows,
    qualityRows,
    teamRows: buildTeamRows({ profiles, cohort: stages.cohort, stages, appointments: safeAppointments, tasks: safeTasks, window }),
    lossRows: buildLossRows(safeLeads, window),
    utmRows,
    recoveredAfterFollowup: new Set(safeEvents.map((event) => event.lead_id).filter((leadId) => leadId && eventSequenceRecovered(safeEvents, leadId, window))).size,
    money: {
      quoted: periodQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      pending: pendingQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      accepted: acceptedPeriod.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      rejected: rejectedPeriod.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      attention: attentionQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
      attentionCount: new Set(attentionQuotes.map((quote) => quote.lead_id)).size,
    },
  };
}

export function formatDurationMinutes(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Sin datos';
  const minutes = Math.round(Number(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} h`;
}
