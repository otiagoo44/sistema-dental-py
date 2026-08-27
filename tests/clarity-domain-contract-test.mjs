import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureUrlAttribution } from '../crm-app/src/lib/attribution.js';

const [migration, edge, app, leadForm, workspaceHook] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260827162541_clarity_priority_upgrade.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/lead-intake/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../crm-app/src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../crm-app/src/components/modals/LeadFormModal.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../crm-app/src/hooks/useClinicWorkspace.js', import.meta.url), 'utf8'),
]);

assert.match(migration, /create or replace function app_private\.calculate_lead_score\(/i);
assert.match(migration, /new\.score := \(score_details ->> 'score'\)::integer/i);
assert.match(migration, /new\.classification := score_details ->> 'classification'/i);
assert.match(migration, /'thresholds', jsonb_build_object\('hot', hot_threshold, 'medium', 50\)/i);
assert.match(migration, /'reasons', reasons/i);
assert.match(migration, /grant execute on function public\.create_manual_lead_v2[\s\S]+to authenticated/i);
assert.match(migration, /grant execute on function public\.create_public_lead_intake_v2[\s\S]+to service_role/i);
assert.match(app, /rpc\('create_manual_lead_v2'/);
assert.equal(/p_score\s*:|p_classification\s*:/.test(app), false, 'CRM must not submit manual score overrides');
assert.equal(/name="score"|label="Score"|name="classification"/.test(leadForm), false, 'Reception form must not edit automatic score or temperature');
assert.match(edge, /"create_public_lead_intake_v2"/);
assert.equal(/function calculateScore|function classifyLead|hotLeadThreshold/i.test(edge), false, 'Edge must not contain a second scoring formula');

for (const table of ['leads', 'appointments', 'tasks', 'quotes']) {
  assert.match(workspaceHook, new RegExp(`table: '${table}'`), `Realtime must refresh pending actions when ${table} changes`);
}

const attribution = captureUrlAttribution(
  new URL('https://clinica.test/consulta?utm_source=instagram&utm_medium=cpc&utm_campaign=implantes&utm_content=video&utm_term=precio'),
  'https://google.com/search?q=implantes',
);
assert.deepEqual(attribution, {
  utm_source: 'instagram',
  utm_medium: 'cpc',
  utm_campaign: 'implantes',
  utm_content: 'video',
  utm_term: 'precio',
  landing_page: 'https://clinica.test/consulta',
  referrer: 'https://google.com/search?q=implantes',
});

console.log('PASS canonical scoring contracts, automatic attribution and pending Realtime sources');
