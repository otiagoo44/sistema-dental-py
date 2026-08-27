import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const crmRoot = new URL('../crm-app/', import.meta.url);
const [packageSource, envExample, viteConfig, publicConfig, vercelSource] = await Promise.all([
  readFile(new URL('package.json', crmRoot), 'utf8'),
  readFile(new URL('.env.example', crmRoot), 'utf8'),
  readFile(new URL('vite.config.js', crmRoot), 'utf8'),
  readFile(new URL('src/lib/publicConfig.js', crmRoot), 'utf8'),
  readFile(new URL('vercel.json', crmRoot), 'utf8'),
]);

const packageJson = JSON.parse(packageSource);
const vercelConfig = JSON.parse(vercelSource);
const envNames = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

assert.deepEqual(envNames, [
  'VITE_SUPABASE_URL=',
  'VITE_SUPABASE_ANON_KEY=',
]);
assert.equal(packageJson.scripts.build, 'vite build');
assert.match(viteConfig, /sourcemap:\s*false/);
assert.doesNotMatch(viteConfig, /VITE_PUBLIC_LEAD_WEBHOOK_URL|VITE_EXPECTED_SUPABASE_PROJECT_REF/);
assert.match(publicConfig, /origin}\/functions\/v1\/lead-intake/);
assert.doesNotMatch(publicConfig, /VITE_PUBLIC_LEAD_WEBHOOK_URL|VITE_EXPECTED_SUPABASE_PROJECT_REF/);
assert.equal(vercelConfig.framework, 'vite');
assert.equal(vercelConfig.installCommand, 'npm install');
assert.equal(vercelConfig.buildCommand, 'npm run build');
assert.equal(vercelConfig.outputDirectory, 'dist');
assert.deepEqual(vercelConfig.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);

console.log('PASS standalone Vite/Vercel deployment contract');
