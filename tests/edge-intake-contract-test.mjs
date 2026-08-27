import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/lead-intake/index.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const rpcMarker = '"create_public_lead_intake_v2"';
const rpcPosition = source.indexOf(rpcMarker);

assert.ok(rpcPosition > 0, 'lead-intake must call the transactional intake RPC');
assert.equal(source.split(rpcMarker).length - 1, 1, 'lead-intake must have one domain write entry point');

for (const marker of [
  'isHoneypotFilled(body)',
  'consentimiento_contacto',
  'normalizeParaguayPhone(body.telefono)',
  'MAX_IP_SUBMISSIONS',
  'MAX_PHONE_SUBMISSIONS',
  'allowedOrigins.includes(origin)',
  '.eq("clinic_slug", clinicSlug)',
  '.eq("public_token", landingToken)',
]) {
  const position = source.indexOf(marker);
  assert.ok(position > 0 && position < rpcPosition, `${marker} must be enforced before the domain RPC`);
}

assert.equal(/\.from\(["']leads["']\)\s*\.(insert|update|upsert)/s.test(source), false, 'Edge Function must not write leads outside the transaction RPC');
assert.equal(/\.from\(["']tasks["']\)\s*\.(insert|update|upsert)/s.test(source), false, 'Edge Function must not write tasks outside the transaction RPC');
assert.equal(/body\.clinic_id|body\[\s*["']clinic_id["']\s*\]/.test(source), false, 'Edge Function must never trust clinic_id from a landing');
assert.equal(/serviceRoleKey[^\n]*(message|payload|response)/i.test(source), false, 'service role must not be exposed in a response');
assert.match(config, /\[functions\.lead-intake\][\s\S]*verify_jwt\s*=\s*false/, 'public intake auth mode must remain explicit in Supabase config');

console.log('PASS lead-intake HTTP/security contract and single transactional domain entry point');
