import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const expectedRef = String(process.env.QA_STAGING_PROJECT_REF || '').trim();
assert.ok(expectedRef, 'Falta QA_STAGING_PROJECT_REF');

const linkedRef = readFileSync(resolve(repoRoot, 'supabase/.temp/project-ref'), 'utf8').trim();
assert.equal(linkedRef, expectedRef, 'El proyecto linked no coincide con staging');

const edgeUrl = `https://${linkedRef}.supabase.co/functions/v1/lead-intake`;
const allowedOrigin = process.env.QA_ALLOWED_ORIGIN || 'https://sistema-dental-py-preview.vercel.app';

function runSqlFile(file, sensitive = false) {
  const command = `npx.cmd supabase db query --linked --output csv --file ${file}`;
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status !== 0) {
    throw new Error(sensitive ? 'La consulta de configuración de staging falló' : output);
  }
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function csvRow(file, header, sensitive = false) {
  const lines = runSqlFile(file, sensitive);
  const headerIndex = lines.findIndex((line) => line === header);
  assert.ok(headerIndex >= 0 && lines[headerIndex + 1], `Respuesta SQL inesperada para ${header}`);
  const keys = header.split(',');
  const values = lines[headerIndex + 1].split(',');
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

const config = csvRow(
  'tests/staging-form-config.sql',
  'clinic_slug,public_token',
  true,
);
assert.ok(config.public_token, 'No existe formulario público QA activo');
const clinicSlug = config.clinic_slug;

let ipSeed = 31;
async function intake(body, origin = allowedOrigin) {
  ipSeed += 1;
  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': `203.0.113.${ipSeed}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const phone = process.env.QA_EXISTING_PHONE || `0981${Math.floor(100000 + Math.random() * 800000)}`;
const base = {
  clinic_slug: clinicSlug,
  landing_token: config.public_token,
  nombre: `QA RC HTTP ${new Date().toISOString()}`,
  telefono: phone,
  tratamiento: 'Implante dental',
  urgencia: 'Hoy',
  evaluacion_previa: 'Tengo estudios',
  situacion: 'Quiero agendar una consulta',
  consultation_reason: 'Smoke release candidate',
  origen: 'QA staging HTTP smoke',
  pagina: 'staging-smoke',
  consentimiento_contacto: true,
  website: '',
  company: '',
};

const valid = await intake(base);
assert.equal(valid.status, 200);
assert.equal(valid.data.success, true);
assert.ok(valid.data.lead_id);

const leadA = valid.data.lead_id;

if (process.env.QA_VALID_ONLY === '1') {
  process.stdout.write(JSON.stringify({ valid: 'PASS', phone, lead_id: leadA }) + '\n');
} else if (process.env.QA_PREVIOUS_LEAD_ID) {
  assert.notEqual(leadA, process.env.QA_PREVIOUS_LEAD_ID);
  process.stdout.write(JSON.stringify({ terminal_phone: 'PASS', phone, lead_id: leadA }) + '\n');
} else {
  const badToken = await intake({ ...base, telefono: `${phone.slice(0, -1)}1`, landing_token: 'lf_invalid_qa_token' });
  assert.equal(badToken.status, 403);

  const badOrigin = await intake({ ...base, telefono: `${phone.slice(0, -1)}2` }, 'https://invalid-origin.example');
  assert.equal(badOrigin.status, 403);

  const noConsent = await intake({ ...base, telefono: `${phone.slice(0, -1)}3`, consentimiento_contacto: false });
  assert.equal(noConsent.status, 400);

  const invalidPayload = await intake({ ...base, telefono: '123' });
  assert.equal(invalidPayload.status, 400);

  const spam = await intake({ ...base, telefono: `${phone.slice(0, -1)}4`, website: 'https://spam.example' });
  assert.equal(spam.status, 403);

  const duplicate = await intake(base);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.lead_id, leadA);

  process.stdout.write(JSON.stringify({
    valid: 'PASS',
    invalid_token: 'PASS',
    invalid_origin: 'PASS',
    consent: 'PASS',
    invalid_payload: 'PASS',
    spam: 'PASS',
    duplicate_open: 'PASS',
    phone,
    lead_id: leadA,
  }) + '\n');
}
