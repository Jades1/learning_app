// Local-first persistence (Dexie / IndexedDB). Source of truth for the app.
// Schema is VERSIONED from day one (R2) — bump version() and add an upgrade()
// callback for any future migration; never mutate an existing version's stores,
// never drop data.
import Dexie, { type Table } from 'dexie';
import type { Graph, GNode, GEdge, Card, ReviewLog } from '../types';
import { newCardState } from '../scheduler/fsrs';

export const SCHEMA_VERSION = 2;

const STORES = {
  graphs: 'id, createdAt',
  nodes: 'id, graphId',
  edges: 'id, graphId, source, target',
  cards: 'id, nodeId, graphId, type',
  reviewLogs: 'id, cardId, nodeId, graphId, ts',
};

export class LearningDB extends Dexie {
  graphs!: Table<Graph, string>;
  nodes!: Table<GNode, string>;
  edges!: Table<GEdge, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;

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
  }
}

export const db = new LearningDB();
