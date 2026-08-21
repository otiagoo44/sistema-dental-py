export function formatMoney(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(amount);
}

const ASUNCION_TIME_ZONE = 'America/Asuncion';

function dateTimeParts(value, timeZone = ASUNCION_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function wallTimeToUtcIso(value, timeZone = ASUNCION_TIME_ZONE) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '00'] = match;
  const targetMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let candidateMs = targetMs;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = dateTimeParts(new Date(candidateMs), timeZone);
    if (!rendered) return null;
    const renderedMs = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
      Number(rendered.minute),
      Number(rendered.second),
    );
    const adjustment = targetMs - renderedMs;
    candidateMs += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(candidateMs).toISOString();
}

export function formatDateTimeAsuncion(value) {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: ASUNCION_TIME_ZONE,
  }).format(new Date(value));
}

export const formatDateTime = formatDateTimeAsuncion;

export function formatDate(value) {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeZone: ASUNCION_TIME_ZONE,
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatTime(value) {
  if (!value) return '--:--';
  return value.slice(0, 5);
}

export function todayIsoDate() {
  return toLocalIsoDate(new Date());
}

export function toLocalIsoDate(value) {
  if (!value) return '';
  const parts = dateTimeParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

export function toDatetimeLocalAsuncion(value) {
  if (!value) return '';
  const parts = dateTimeParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : '';
}

export function fromDatetimeLocalAsuncion(value) {
  return wallTimeToUtcIso(value);
}

export function tomorrowFollowupAsuncion(now = new Date(), hour = 9) {
  return addDaysAsuncion(1, hour, now);
}

export function addDaysAsuncion(days, hour = 9, now = new Date()) {
  const parts = dateTimeParts(now);
  if (!parts) return null;

  const nextDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + Number(days || 0)));
  const year = nextDay.getUTCFullYear();
  const month = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nextDay.getUTCDate()).padStart(2, '0');
  const safeHour = String(Math.max(0, Math.min(23, Number(hour) || 0))).padStart(2, '0');

  return fromDatetimeLocalAsuncion(`${year}-${month}-${day}T${safeHour}:00`);
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
