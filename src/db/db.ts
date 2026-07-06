// Local-first persistence (Dexie / IndexedDB). Source of truth for the app.
// Schema is VERSIONED from day one (R2) — bump version() and add an upgrade()
// callback for any future migration; never mutate an existing version's stores,
// never drop data.
import Dexie, { type Table } from 'dexie';
import type { Graph, GNode, GEdge, Card, ReviewLog } from '../types';
import { newCardState } from '../scheduler/fsrs';
import { remote } from '../sync/remoteFlag';

export const SCHEMA_VERSION = 3;

const STORES = {
  graphs: 'id, createdAt',
  nodes: 'id, graphId',
  edges: 'id, graphId, source, target',
  cards: 'id, nodeId, graphId, type',
  reviewLogs: 'id, cardId, nodeId, graphId, ts',
};

/** A soft-delete record. Written in the same transaction as a local delete, then
 *  pushed to the cloud as a `deleted=true` row so the delete propagates (a pure-union
 *  pull must never infer a delete from a row's absence). key = `${table}:${id}`. */
export interface Tombstone {
  key: string;
  table: 'graphs' | 'nodes' | 'edges' | 'cards';
  id: string;
  deletedAt: number;
}

export class LearningDB extends Dexie {
  graphs!: Table<Graph, string>;
  nodes!: Table<GNode, string>;
  edges!: Table<GEdge, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super('learning_app');

    // v1 — the original spine (body cards only).
    this.version(1).stores(STORES);

    // v2 — Bundle B: every node gains a `connections` card. Backfill is idempotent
    // and additive (never deletes); reconstruction ELIGIBILITY is enforced at queue
    // time by edge degree, so a low-degree node simply won't surface its card (N5).
    this.version(2).stores(STORES).upgrade(async (tx) => {
      const [nodes, cards] = await Promise.all([
        tx.table('nodes').toArray() as Promise<GNode[]>,
        tx.table('cards').toArray() as Promise<Card[]>,
      ]);
      const haveConnections = new Set(
        cards.filter((c) => c.type === 'connections').map((c) => c.nodeId),
      );
      const now = new Date();
      const additions: Card[] = nodes
        .filter((n) => !haveConnections.has(n.id))
        .map((n) => ({
          id: crypto.randomUUID(),
          nodeId: n.id,
          graphId: n.graphId,
          type: 'connections',
          enabled: true,
          fsrs: newCardState(now),
        }));
      if (additions.length) await tx.table('cards').bulkAdd(additions);
    });

    // v3 — cloud sync. Adds a `tombstones` store for soft-deletes and backfills
    // `updatedAt` on every existing row so the whole graph pushes on first sync.
    this.version(3)
      .stores({ ...STORES, tombstones: 'key, deletedAt' })
      .upgrade(async (tx) => {
        const now = Date.now();
        for (const name of ['graphs', 'nodes', 'edges', 'cards', 'reviewLogs'] as const) {
          await tx
            .table(name)
            .toCollection()
            .modify((r: { updatedAt?: number }) => {
              if (r.updatedAt == null) r.updatedAt = now;
            });
        }
      });
  }
}

export const db = new LearningDB();

// --- sync hooks -------------------------------------------------------------
// Stamp `updatedAt` on every LOCAL write and nudge the debounced pusher — without
// touching any store/study code. During a PULL (`remote.applying`), do neither, so
// cloud timestamps are preserved and rows don't echo straight back to the server.
for (const table of [db.graphs, db.nodes, db.edges, db.cards, db.reviewLogs]) {
  table.hook('creating', function (_pk, obj: { updatedAt?: number }) {
    if (remote.applying) return;
    if (obj.updatedAt == null) obj.updatedAt = Date.now();
    remote.onLocalWrite();
  });
  table.hook('updating', function (mods) {
    if (remote.applying) return;
    remote.onLocalWrite();
    return { ...mods, updatedAt: Date.now() };
  });
}
// A new tombstone means a local delete happened — schedule a push to propagate it.
db.tombstones.hook('creating', function () {
  if (!remote.applying) remote.onLocalWrite();
});
