import { useState } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!supabase) {
      setError('Faltan variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      console.error('Supabase login error', signInError);
      setError(signInError.message);
    }

    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-panel/95 p-8 shadow-glow">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-mint">CRM Dental</p>
          <h1 className="mt-3 text-3xl font-semibold text-cream">Acceso clinico</h1>
          <p className="mt-2 text-sm text-cream/60">Ingresa con Supabase Auth para operar tu clinica.</p>
        </div>

        {!hasSupabaseConfig ? (
          <div className="mb-5 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">
            Faltan variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm text-cream/70">Email</span>
            <span className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink px-3 py-3">
              <Mail className="h-4 w-4 text-mint" />
              <input
                className="w-full bg-transparent text-cream outline-none placeholder:text-cream/35"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="usuario@clinica.com"
                autoComplete="email"
                required
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-cream/70">Password</span>
            <span className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink px-3 py-3">
              <LockKeyhole className="h-4 w-4 text-mint" />
              <input
                className="w-full bg-transparent text-cream outline-none placeholder:text-cream/35"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
            </span>
          </label>

          {error ? <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}

          <button
            className="w-full rounded-lg bg-mint px-4 py-3 font-semibold text-ink transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={loading || !hasSupabaseConfig}
          >
            {loading ? 'Ingresando...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  );
}
