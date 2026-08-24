import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { PUBLIC_ENVIRONMENTS } from './src/config/publicEnvironments.js';

function validateBuildEnvironment(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_LEAD_WEBHOOK_URL'];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length) throw new Error(`Missing required public environment variables: ${missing.join(', ')}`);
  if (/service[_-]?role|sb_secret_/i.test(env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('VITE_SUPABASE_ANON_KEY must be a publishable/anon key, never a secret or service-role key.');
  }

  const apiUrl = new URL(env.VITE_SUPABASE_URL);
  const webhookUrl = new URL(env.VITE_PUBLIC_LEAD_WEBHOOK_URL);
  if (apiUrl.origin !== webhookUrl.origin || webhookUrl.pathname !== '/functions/v1/lead-intake') {
    throw new Error('VITE_SUPABASE_URL and VITE_PUBLIC_LEAD_WEBHOOK_URL must target the same Supabase project.');
  }

  if (['staging', 'production'].includes(mode)) {
    const expectedRef = String(
      env.VITE_EXPECTED_SUPABASE_PROJECT_REF
        || PUBLIC_ENVIRONMENTS[mode]?.expectedProjectRef
        || '',
    ).trim();
    const actualRef = apiUrl.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
    if (!expectedRef || actualRef !== expectedRef) {
      throw new Error(`Supabase project reference does not match the ${mode} environment.`);
    }
  }
}

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    {
      name: 'validate-public-environment',
      configResolved() {
        if (command === 'build') validateBuildEnvironment(mode);
      },
    },
  ],
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['motion/react'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}));
