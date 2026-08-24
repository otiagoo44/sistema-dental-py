import { useEffect, useState } from 'react';
import { humanizeCrmError } from '../lib/errors';
import { supabase } from '../lib/supabase';

export default function useSupabaseSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error('Error restoring Supabase session', sessionError);
        if (active) setError(humanizeCrmError(sessionError, 'No pudimos recuperar tu sesión. Volvé a ingresar.'));
      }

      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, error };
}
