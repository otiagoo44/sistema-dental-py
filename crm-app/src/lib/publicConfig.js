const viteEnv = import.meta.env || {};
const environment = viteEnv.MODE || 'test';
const supabaseUrl = String(viteEnv.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(viteEnv.VITE_SUPABASE_ANON_KEY || '').trim();

function leadIntakeUrlFromSupabase(value) {
  try {
    return `${new URL(value).origin}/functions/v1/lead-intake`;
  } catch {
    return '';
  }
}

const publicLeadWebhookUrl = leadIntakeUrlFromSupabase(supabaseUrl);

function validatePublicConfig() {
  if (!['development', 'staging', 'production', 'test'].includes(environment)) {
    return 'El entorno público de la aplicación no es válido.';
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Falta configuración pública necesaria para conectar la CRM.';
  }
  if (/service[_-]?role|sb_secret_/i.test(supabaseAnonKey)) {
    return 'La configuración pública contiene una clave no permitida.';
  }

  try {
    const apiUrl = new URL(supabaseUrl);
    const webhookUrl = new URL(publicLeadWebhookUrl);
    const isLocal = ['localhost', '127.0.0.1'].includes(apiUrl.hostname);
    if (!isLocal && apiUrl.protocol !== 'https:') return 'La conexión de Supabase debe usar HTTPS.';
    if (apiUrl.origin !== webhookUrl.origin) return 'Supabase y lead-intake pertenecen a entornos distintos.';
    if (webhookUrl.pathname !== '/functions/v1/lead-intake') return 'La URL pública de lead-intake no es válida.';
  } catch {
    return 'La URL pública de Supabase o lead-intake no es válida.';
  }

  return '';
}

export const publicConfigError = validatePublicConfig();
export const hasPublicConfig = !publicConfigError;
export const publicConfig = Object.freeze({
  environment,
  supabaseUrl,
  supabaseAnonKey,
  publicLeadWebhookUrl,
});
