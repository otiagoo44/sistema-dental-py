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
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <section className="modal-enter w-full max-w-md rounded-3xl border border-slate-200 bg-panel/95 p-8 shadow-premium backdrop-blur">
        <div className="mb-8">
          <div className="mb-6 h-0.5 w-12 rounded-full bg-mint" />
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-mint">Dental CRM</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-cream">Acceso a la clínica</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Sistema anti-pérdida de pacientes. Ingresá para ver las oportunidades que necesitan atención.</p>
        </div>

        {!hasSupabaseConfig ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Faltan variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition hover:border-slate-300 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
              <Mail className="h-4 w-4 text-mint" />
              <input
                className="w-full bg-transparent text-cream outline-none placeholder:text-slate-400"
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
            <span className="mb-2 block text-sm font-medium text-slate-700">Contraseña</span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition hover:border-slate-300 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/10">
              <LockKeyhole className="h-4 w-4 text-mint" />
              <input
                className="w-full bg-transparent text-cream outline-none placeholder:text-slate-400"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
            </span>
          </label>

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">No pudimos iniciar sesión. Revisá el email y la contraseña.</p> : null}

          <button
            className="w-full rounded-xl border border-mint/70 bg-mint px-4 py-3 font-semibold text-ink shadow-[0_12px_34px_rgba(200,169,106,0.18)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-elevated disabled:text-slate-500 disabled:shadow-none"
            type="submit"
            disabled={loading || !hasSupabaseConfig}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}
