import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function validateBuildEnvironment(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length) throw new Error(`Missing required public environment variables: ${missing.join(', ')}`);
  if (/service[_-]?role|sb_secret_/i.test(env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('VITE_SUPABASE_ANON_KEY must be a publishable/anon key, never a secret or service-role key.');
  }

  const apiUrl = new URL(env.VITE_SUPABASE_URL);
  const isLocal = ['localhost', '127.0.0.1'].includes(apiUrl.hostname);
  if (!isLocal && apiUrl.protocol !== 'https:') {
    throw new Error('VITE_SUPABASE_URL must use HTTPS outside local development.');
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
