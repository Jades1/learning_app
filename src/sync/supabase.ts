// The Supabase client + thin auth helpers. Auth is email+password (confirm-email
// OFF on the project) — zero emails on sign-in, which sidesteps the entire
// magic-link/redirect/SMTP failure class documented in ../../../SUPABASE_NOTES.md.
import { createClient, type Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/** Subscribe to auth state; fires immediately with the current session. Returns an unsubscribe fn. */
export function onAuth(cb: (session: Session | null) => void): () => void {
  void supabase.auth.getSession().then(({ data }) => cb(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
