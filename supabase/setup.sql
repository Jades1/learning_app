-- learning_app — cloud sync schema.
--
-- Runs in a Supabase project SHARED with budget_app, so every table is
-- `learning_`-prefixed to avoid any collision. Idempotent: safe to re-run.
--
-- Plain explicit statements (no DO block / dynamic SQL) so the Supabase SQL editor
-- parses it cleanly. The only "destructive" verb is `drop policy if exists`, which
-- drops an ACCESS POLICY (not a table, not data) on these `learning_` tables only —
-- so it's safe to click through the editor's generic destructive-operations warning.
--
-- Uniform, drift-proof shape (one design for all five tables):
--   id         text    — the app's own UUID (client-generated)
--   user_id    uuid    — owner; filled automatically from the JWT (auth.uid())
--   updated_at bigint  — client ms timestamp; drives last-write-wins + watermarks
--   deleted    boolean — soft-delete tombstone flag
--   data       jsonb   — the entire domain object (jsonb ⇒ adding a client field
--                        never needs a migration; see ../SUPABASE_NOTES.md).
-- RLS is the security boundary; each policy restricts every row to its owner.

-- ---- graphs ----------------------------------------------------------------
create table if not exists public.learning_graphs (
  id         text    primary key,
  user_id    uuid    not null default auth.uid(),
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null
);
alter table public.learning_graphs enable row level security;
drop policy if exists learning_graphs_owner on public.learning_graphs;
create policy learning_graphs_owner on public.learning_graphs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- nodes -----------------------------------------------------------------
create table if not exists public.learning_nodes (
  id         text    primary key,
  user_id    uuid    not null default auth.uid(),
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null
);
alter table public.learning_nodes enable row level security;
drop policy if exists learning_nodes_owner on public.learning_nodes;
create policy learning_nodes_owner on public.learning_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- edges -----------------------------------------------------------------
create table if not exists public.learning_edges (
  id         text    primary key,
  user_id    uuid    not null default auth.uid(),
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null
);
alter table public.learning_edges enable row level security;
drop policy if exists learning_edges_owner on public.learning_edges;
create policy learning_edges_owner on public.learning_edges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- cards -----------------------------------------------------------------
create table if not exists public.learning_cards (
  id         text    primary key,
  user_id    uuid    not null default auth.uid(),
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null
);
alter table public.learning_cards enable row level security;
drop policy if exists learning_cards_owner on public.learning_cards;
create policy learning_cards_owner on public.learning_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- review_logs -----------------------------------------------------------
create table if not exists public.learning_review_logs (
  id         text    primary key,
  user_id    uuid    not null default auth.uid(),
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null
);
alter table public.learning_review_logs enable row level security;
drop policy if exists learning_review_logs_owner on public.learning_review_logs;
create policy learning_review_logs_owner on public.learning_review_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
