// Cloud sync engine. Dexie stays the source of truth; this layer mirrors it to
// Supabase and back. It hooks in BELOW the store, so the study/generation/grading
// loop is never touched and the app is fully usable signed-out and offline.
//
// Correctness rules (from the Fable design brief + ../../../SUPABASE_NOTES.md):
//   • push-before-pull            — send local changes before reading remote, so
//                                    offline-created rows can never be lost.
//   • pull is a UNION, per-id LWW — never delete a local row just because a read
//                                    didn't return it; only a newer tombstone deletes.
//   • per-record resilient upserts— one bad row can't abort the whole push.
//   • remote-apply guard          — pulled writes don't re-stamp updatedAt or echo back.
//   • FSRS Date revival on pull    — cards cross the wire as ISO strings; revive them
//                                    or the scheduler silently breaks.
import { create } from 'zustand';
import { db, type Tombstone } from '../db/db';
import { reviveCard } from '../db/backup';
import { useStore } from '../store/store';
import { remote } from './remoteFlag';
import { supabase, signInWithPassword, signOut, onAuth } from './supabase';

// --- table descriptors: Dexie table <-> cloud table -------------------------
interface Desc {
  key: 'graphs' | 'nodes' | 'edges' | 'cards' | 'reviewLogs';
  cloud: string;
  table: () => import('dexie').Table<any, string>;
  // Append-only + potentially large ⇒ pull incrementally by an updated_at watermark.
  // Mutable but tiny ⇒ pull in full every time (bulletproof union).
  logLike: boolean;
}
const TABLES: Desc[] = [
  { key: 'graphs', cloud: 'learning_graphs', table: () => db.graphs, logLike: false },
  { key: 'nodes', cloud: 'learning_nodes', table: () => db.nodes, logLike: false },
  { key: 'edges', cloud: 'learning_edges', table: () => db.edges, logLike: false },
  { key: 'cards', cloud: 'learning_cards', table: () => db.cards, logLike: false },
  { key: 'reviewLogs', cloud: 'learning_review_logs', table: () => db.reviewLogs, logLike: true },
];
const cloudFor = (dexieKey: string) => TABLES.find((t) => t.key === dexieKey)?.cloud ?? null;

// --- watermarks (localStorage) ----------------------------------------------
// pushWM[key]  = greatest updatedAt already pushed for that table (don't re-push below it).
// logPullWM    = greatest updated_at pulled for review_logs (incremental pull).
// tombWM       = greatest deletedAt already pushed.
const WM_KEY = 'learning_app:sync:wm';
type WM = { push: Record<string, number>; logPull: number; tomb: number };
function loadWM(): WM {
  try {
    const v = localStorage.getItem(WM_KEY);
    if (v) return { push: {}, logPull: 0, tomb: 0, ...JSON.parse(v) };
  } catch {
    /* ignore */
  }
  return { push: {}, logPull: 0, tomb: 0 };
}
function saveWM(wm: WM) {
  try {
    localStorage.setItem(WM_KEY, JSON.stringify(wm));
  } catch {
    /* ignore */
  }
}

// --- row mapping ------------------------------------------------------------
const upAt = (r: any): number => (typeof r?.updatedAt === 'number' ? r.updatedAt : 0);
/** Local row -> cloud row. `user_id` is filled server-side (DEFAULT auth.uid()). */
function toCloud(r: any) {
  return { id: r.id, updated_at: upAt(r), deleted: false, data: r };
}
/** Cloud row -> local row. Trust the cloud updated_at; revive FSRS Dates on cards. */
function fromCloud(desc: Desc, row: any) {
  const obj = { ...row.data, updatedAt: row.updated_at };
  return desc.key === 'cards' ? reviveCard(obj) : obj;
}

// --- push -------------------------------------------------------------------
async function push(wm: WM): Promise<void> {
  for (const t of TABLES) {
    const rows = (await t.table().toArray()) as any[];
    let max = wm.push[t.key] ?? 0;
    for (const r of rows) {
      if (upAt(r) <= (wm.push[t.key] ?? 0)) continue; // not dirty since last push
      try {
        const { error } = await supabase.from(t.cloud).upsert(toCloud(r));
        if (error) throw error;
        max = Math.max(max, upAt(r)); // advance only past rows that actually landed
      } catch (e) {
        console.error(`[sync] push ${t.cloud} ${r.id} failed`, e); // resilient: keep going
      }
    }
    wm.push[t.key] = max;
  }

  // Tombstones: soft-delete rows, upserted as deleted=true with the delete time.
  // Process in ascending deletedAt order and advance the watermark ONLY while every prior
  // tombstone also succeeded — so a single failure (esp. in a bulk deleteFile) can't strand
  // an earlier tombstone below the watermark where it would never be retried.
  const tombs = ((await db.tombstones.toArray()) as Tombstone[])
    .filter((t) => t.deletedAt > wm.tomb)
    .sort((a, b) => a.deletedAt - b.deletedAt);
  let maxTomb = wm.tomb;
  let contiguousOk = true;
  for (const ts of tombs) {
    const cloud = cloudFor(ts.table);
    if (!cloud) continue;
    try {
      const { error } = await supabase
        .from(cloud)
        .upsert({ id: ts.id, updated_at: ts.deletedAt, deleted: true, data: {} });
      if (error) throw error;
      if (contiguousOk) maxTomb = ts.deletedAt;
    } catch (e) {
      console.error(`[sync] push tombstone ${ts.key} failed`, e);
      contiguousOk = false; // freeze the watermark so this (and later) tombstones retry next sync
    }
  }
  wm.tomb = maxTomb;
}

// --- pull -------------------------------------------------------------------
/** Returns true if any local row changed (so the UI should reload). */
async function pull(wm: WM): Promise<boolean> {
  let changed = false;
  remote.applying = true; // suppress hook re-stamping / echo while we write cloud rows
  try {
    for (const t of TABLES) {
      if (t.logLike) {
        // Incremental, append-only: only rows newer than our watermark; insert if absent.
        const { data, error } = await supabase
          .from(t.cloud)
          .select('*')
          .gt('updated_at', wm.logPull)
          .order('updated_at', { ascending: true });
        if (error) {
          console.error(`[sync] pull ${t.cloud} failed`, error);
          continue;
        }
        for (const row of data ?? []) {
          wm.logPull = Math.max(wm.logPull, row.updated_at);
          wm.push[t.key] = Math.max(wm.push[t.key] ?? 0, row.updated_at); // don't echo back
          if (row.deleted) continue; // logs are never deleted, but guard anyway
          if (!(await t.table().get(row.id))) {
            await t.table().put(fromCloud(t, row));
            changed = true;
          }
        }
      } else {
        // Mutable + tiny: pull in full, union by id, last-write-wins on updated_at.
        const { data, error } = await supabase.from(t.cloud).select('*');
        if (error) {
          console.error(`[sync] pull ${t.cloud} failed`, error);
          continue;
        }
        for (const row of data ?? []) {
          const local = (await t.table().get(row.id)) as any;
          if (row.deleted) {
            if (local && upAt(local) < row.updated_at) {
              await t.table().delete(row.id); // a newer tombstone wins
              changed = true;
            }
            continue;
          }
          if (!local || upAt(local) < row.updated_at) {
            await t.table().put(fromCloud(t, row));
            changed = true;
          }
          wm.push[t.key] = Math.max(wm.push[t.key] ?? 0, row.updated_at); // don't echo back
        }
      }
    }
  } finally {
    remote.applying = false;
  }
  return changed;
}

// --- orchestration ----------------------------------------------------------
export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'error';
interface SyncUI {
  email: string | null;
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: number | null;
  signIn: (email: string, password: string) => Promise<string | null>; // returns error msg or null
  signOutNow: () => Promise<void>;
}
export const useSyncStore = create<SyncUI>((set) => ({
  email: null,
  status: 'signedOut',
  error: null,
  lastSyncedAt: null,
  signIn: async (email, password) => {
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) {
      set({ error: error.message });
      return error.message;
    }
    return null; // onAuth listener will flip status + kick a sync
  },
  signOutNow: async () => {
    await signOut();
  },
}));

const isSignedIn = () => useSyncStore.getState().email != null;

// Serialize all syncs through one promise chain so pushes/pulls never interleave.
let chain: Promise<void> = Promise.resolve();
function syncNow(): Promise<void> {
  chain = chain.then(async () => {
    if (!isSignedIn()) return;
    useSyncStore.setState({ status: 'syncing', error: null });
    const wm = loadWM();
    try {
      await push(wm); // push-before-pull: protect local/offline data
      const changed = await pull(wm);
      saveWM(wm);
      if (changed) await useStore.getState().reloadFromDb();
      useSyncStore.setState({ status: 'idle', lastSyncedAt: Date.now() });
    } catch (e) {
      console.error('[sync] cycle failed', e);
      useSyncStore.setState({ status: 'error', error: (e as Error).message });
    }
  });
  return chain;
}

/** Manual "Sync now": clear the push watermark so EVERY local row re-uploads, then
 *  pull. Guarantees the cloud has a complete copy — the recovery for any row that a
 *  prior push skipped. Cheap at single-user scale (a few hundred tiny rows). */
export async function resyncAll(): Promise<void> {
  try {
    localStorage.removeItem(WM_KEY);
  } catch {
    /* ignore */
  }
  await syncNow();
}

// Debounced push after local writes (~4s of quiet), per the design cadence.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (!isSignedIn()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), 4000);
}

let initialised = false;
export function initSync() {
  if (initialised) return;
  initialised = true;
  remote.onLocalWrite = schedulePush;

  // firstPull resolves after the first post-sign-in pull (or immediately if signed
  // out) — store.init() awaits it before minting a fresh graph on an empty device.
  let resolveFirst!: () => void;
  remote.firstPull = new Promise<void>((r) => (resolveFirst = r));
  let firstResolved = false;

  onAuth(async (session) => {
    const email = session?.user?.email ?? null;
    useSyncStore.setState({ email, status: session ? 'idle' : 'signedOut' });
    if (session) {
      await syncNow();
    }
    if (!firstResolved) {
      firstResolved = true;
      resolveFirst();
    }
  });

  // Pull-and-drain when the tab regains focus / comes back online.
  const onWake = () => void syncNow();
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onWake();
  });
}
