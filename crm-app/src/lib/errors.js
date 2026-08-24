const TECHNICAL_ERROR_PATTERN = /PGRST|PostgREST|schema cache|relation .+ does not exist|function .+ does not exist|RPC|JWT|duplicate key|violates .+ constraint|permission denied|row-level security|networkerror|failed to fetch|fetch failed/i;
const CONNECTION_ERROR_PATTERN = /networkerror|failed to fetch|fetch failed|timeout|connection|offline/i;

export function humanizeCrmError(error, fallback = 'No pudimos guardar el cambio. Intentá de nuevo.') {
  const code = String(error?.code || '').trim();
  const message = typeof error === 'string'
    ? error.trim()
    : String(error?.message || '').trim();

  if (!message) return fallback;
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return 'No tenés permiso para realizar esta acción.';
  }
  if (/JWT|token.*expir|session.*expir|refresh token/i.test(message)) {
    return 'La sesión venció. Volvé a iniciar sesión.';
  }
  if (code === '23505' && /appointment|cita|horario|reserva/i.test(message)) {
    return 'Esa cita ya existe.';
  }
  if (CONNECTION_ERROR_PATTERN.test(message)) {
    return 'No pudimos conectar con el sistema. Revisá internet e intentá de nuevo.';
  }
  if (TECHNICAL_ERROR_PATTERN.test(message)) return fallback;
  return message;
}
