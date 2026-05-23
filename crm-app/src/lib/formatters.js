export function formatMoney(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value) {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value) {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
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

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
