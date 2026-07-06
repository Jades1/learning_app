// Supabase connection for cloud sync.
//
// This project is SHARED with budget_app — Supabase's free tier caps active
// projects, so learning_app reuses that project. All of this app's tables are
// `learning_`-prefixed (see supabase/setup.sql) so they can never collide with
// budget_app's tables, and RLS scopes every row to its owner.
//
// The PUBLISHABLE key below is SAFE to commit to this public repo: it is the
// client-side key, and Row-Level Security — not key secrecy — is the security
// boundary. New sign-ups are disabled on the project, so the exposed key cannot
// be used to create accounts. NEVER commit a `sb_secret_…` / service_role key:
// it bypasses RLS entirely and is for one-off local admin use only.
export const SUPABASE_URL = 'https://mzzdijjofzajbjmttcrl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mC6t3LMVt1vH40wHKSYFYA_hbI4CDYR';
