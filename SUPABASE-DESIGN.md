# Supabase cloud-sync — design & implementation

> **Status: implemented (v1), pending live two-device verification.**
> Authored as a Fable design pass, approved 2026-07-06, then built. This doc is the
> durable spec; the code lives in `src/sync/`, the schema in `supabase/setup.sql`.

## Where it lives

- **Shared project** (Supabase free tier caps active projects, so we reuse budget_app's):
  `mzzdijjofzajbjmttcrl.supabase.co`. All tables are `learning_`-prefixed to avoid collision.
- **Client key** (`sb_publishable_…`) is committed in `src/sync/config.ts` — safe: it's the
  public client key and RLS is the security boundary. A secret/service_role key must NEVER
  be committed.
- **Code:** `src/sync/` — `config.ts` (keys), `supabase.ts` (client + auth), `sync.ts` (the
  push/pull engine + `useSyncStore`), `SyncChip.tsx` (toolbar UI), `remoteFlag.ts` (the
  hook↔engine bridge). Dexie hooks + the v3 migration live in `src/db/db.ts`; tombstone
  writes in `src/store/store.ts`.
- **One-time setup:** run `supabase/setup.sql` in the project's SQL editor; disable new
  sign-ups; a weekly keep-alive is `.github/workflows/keepalive.yml`.

---

## 1. Scope & non-goals

Sync is a **persistence/multi-device layer only**. Dexie/IndexedDB remains the source of
truth the app runs on; the study loop (`buildDueQueue`, `submitReview`, grading, FSRS) never
reads from or waits on the network. Sync hooks in *below* the store — at the Dexie write
layer — so no study/generation code changes. **Assumption: one account, one user (James), N
devices.** A `user_id` column makes future multi-user nearly free, but we build and test for
exactly one account now. Non-goals: sharing, collaboration, realtime co-editing, server-side
scheduling, any AI features. The app must remain fully functional signed-out and offline —
sync is opt-in.

## 2. Auth model

**Email + password, confirm-email OFF.** This is SUPABASE_NOTES' terminal lesson: magic
links die to redirect-allowlist slash mismatches, single-use links eaten by mail scanners,
template editing gated behind SMTP, and hourly email rate limits. Password sign-in sends zero
emails, so the entire failure class vanishes. Because the project is shared and James already
has an account there, learning_app just does `signInWithPassword` with his existing
credentials — no new signup. **Disable "Allow new users to sign up"** after confirming the
account exists — the public repo exposes the anon key, and open signups would let strangers
burn the project's quota (RLS still protects the *data*).

UI: a small **sync status chip** in the toolbar (signed-out / synced / syncing / error) opens
a modal with email+password fields and a sign-out button. No route changes, no gate — the app
never blocks on auth.

## 3. Sync model

**A dirty-row engine driven by Dexie hooks + watermarks (no separate outbox table).**

- **Stamping & capture.** Dexie `creating`/`updating` hooks stamp `updatedAt` (ms) on every
  local write and nudge a debounced pusher — zero changes to the ~10 store mutations, and
  `importBackup` / migrations are captured for free. A `remote.applying` guard makes pulled
  writes skip stamping so cloud timestamps survive and rows don't echo back.
- **Push (per-record resilient).** Each dirty row (updatedAt > last-pushed watermark) is
  upserted in its own try/catch; a failed row is logged and skipped, never blocking the rest.
  **No FK constraints** in Postgres, so push order can't deadlock parent/child rows.
- **Pull = pure union, per-id LWW.** Mutable tables (graphs/nodes/edges/cards — tiny) pull in
  full; each cloud row inserts if absent, or overwrites the local row only if its `updated_at`
  is greater. **A local row is never deleted because a read didn't return it** — only a
  `deleted=true` tombstone with a newer timestamp removes it.
- **Ordering.** **Push-before-pull** on every sync cycle — protects offline-created data.
- **Triggers.** (a) Sign-in: full sync. (b) Local writes: debounced push ~4s after the last
  mutation. (c) Window focus / visibilitychange / online: full sync. No polling.
- **Offline.** Nothing changes: Dexie serves everything; dirty rows accumulate; they drain on
  reconnect/focus. Sync errors are a chip state, never a blocking dialog.
- **FSRS Date gotcha.** `Card.fsrs` has `due`/`last_review` as `Date`s. They serialize to ISO
  strings on push (jsonb) and are revived via `reviveCard()` on pull — an unrevived card
  breaks the scheduler silently, so pull-side revival is mandatory.
- **Soft-delete via a local `tombstones` table.** `deleteNode`/`deleteEdge` keep their local
  hard-delete + undo, but also write a tombstone row *in the same transaction*. The pusher
  upserts tombstoned ids as `deleted=true`. Undo re-adds the row with a fresh `updatedAt` that
  outranks the tombstone, so LWW resurrects it on every device. This avoids threading
  `deleted` filters through the study queue (which would touch sacred code).
- **ReviewLog is different.** Append-only, immutable. Pull is **incremental by an `updated_at`
  watermark** (never re-downloads history); push is insert/upsert; no tombstones.

## 4. Schema (see `supabase/setup.sql`)

**Uniform, drift-proof shape for all five tables:** `id text`, `user_id uuid default
auth.uid()`, `updated_at bigint`, `deleted boolean`, `data jsonb`. The jsonb payload holds the
entire domain object, so a new client field never needs a migration and can never trigger the
"column does not exist → whole push silently aborts" failure. **RLS** is enabled on every
table with one owner-only policy (`auth.uid() = user_id`). No foreign keys (so per-record
upserts land in any order). Idempotent — safe to re-run.

## 5. Conflict handling

**Per-row last-write-wins on `updated_at` (client ms).** Safe here: one user, usually one
active device; rows are small and independent; union semantics mean a "lost" write is only
ever the *older* version of one row, never a vanished row. The only genuinely risky table is
`cards` (FSRS state) if the same card is reviewed offline on two devices — LWW keeps one
schedule, but **both devices' `review_logs` survive** (append-only union), so the raw history
is never lost and the schedule self-corrects at the next review. Node positions: last drag
wins, which is correct.

## 6. Decisions (approved 2026-07-06)

1. Debounced push (~4s) + full sync on sign-in/focus/reconnect; **no polling**. ✅
2. jsonb-payload schema (drift-immune). ✅
3. ReviewLog syncs in full, forever, via watermark pull. ✅
4. Weekly GitHub Actions keep-alive to prevent free-tier auto-pause. ✅
5. Disable new sign-ups after the account exists. ✅
6. Soft-delete via local tombstone table. ✅
7. Sync is opt-in and never gates on auth. ✅

## 7. Verification checklist (live, two-browser)

Pending James's dashboard setup, then:
- [ ] Sign in on browser A → local graph pushes to cloud (rows appear).
- [ ] Sign in on browser B (empty) → full graph pulls down; no duplicate/forked graph.
- [ ] Edit a node on A → appears on B after focus/sync.
- [ ] Delete a node on B → gone on A (tombstone propagates); Undo resurrects it on both.
- [ ] Review a card on A → schedule + review log appear on B.
- [ ] Offline edit on A, then sign-in/reconnect → edit survives (push-before-pull).
- [ ] Signed-out smoke test still green (`npm run test:e2e`). ✅ (already passing)
