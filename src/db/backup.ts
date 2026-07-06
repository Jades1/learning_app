// JSON export / import (R2) — ships with the first persistent build, NOT deferred:
// the longitudinal review log is the product, and export is its data-safety net.
// A backup is a full, self-describing dump of every table; import restores it,
// reviving Date fields inside each card's FSRS state (JSON loses Date types).
import { db, SCHEMA_VERSION } from './db';
import type { Graph, GNode, GEdge, Card, ReviewLog } from '../types';

const LAST_EXPORT_KEY = 'learning_app:lastExport';

/** Timestamp (ms) of the last successful export, or null if never. */
export function getLastExport(): number | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function markExported(ts: number): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(ts));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

export interface Backup {
  app: 'learning_app';
  schema: number;
  exportedAt: number;
  data: {
    graphs: Graph[];
    nodes: GNode[];
    edges: GEdge[];
    cards: Card[];
    reviewLogs: ReviewLog[];
  };
}

export async function exportBackup(): Promise<Backup> {
  const [graphs, nodes, edges, cards, reviewLogs] = await Promise.all([
    db.graphs.toArray(),
    db.nodes.toArray(),
    db.edges.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ]);
  return {
    app: 'learning_app',
    schema: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: { graphs, nodes, edges, cards, reviewLogs },
  };
}

/** Trigger a browser download of the current backup. */
export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date(backup.exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `learning_app-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markExported(backup.exportedAt);
}

/** Revive Date fields that JSON serialization flattened to strings. Shared with the
 *  sync engine (cloud rows arrive as ISO strings just like a backup file does). */
export function reviveCard(card: Card): Card {
  const f = card.fsrs as unknown as Record<string, unknown>;
  return {
    ...card,
    fsrs: {
      ...card.fsrs,
      due: new Date(f.due as string),
      last_review: f.last_review ? new Date(f.last_review as string) : undefined,
    },
  };
}

/**
 * Replace ALL local data with the contents of a backup (destructive restore).
 * Validates the envelope first. Returns row counts imported.
 */
export async function importBackup(backup: Backup): Promise<Record<string, number>> {
  if (!backup || backup.app !== 'learning_app' || !backup.data) {
    throw new Error('Not a learning_app backup file.');
  }
  if (backup.schema > SCHEMA_VERSION) {
    throw new Error(
      `Backup schema v${backup.schema} is newer than this app (v${SCHEMA_VERSION}). Update the app first.`,
    );
  }
  const { graphs, nodes, edges, cards, reviewLogs } = backup.data;
  const revivedCards = cards.map(reviveCard);

  await db.transaction('rw', db.graphs, db.nodes, db.edges, db.cards, db.reviewLogs, async () => {
    await Promise.all([
      db.graphs.clear(),
      db.nodes.clear(),
      db.edges.clear(),
      db.cards.clear(),
      db.reviewLogs.clear(),
    ]);
    await db.graphs.bulkAdd(graphs);
    await db.nodes.bulkAdd(nodes);
    await db.edges.bulkAdd(edges);
    await db.cards.bulkAdd(revivedCards);
    await db.reviewLogs.bulkAdd(reviewLogs);
  });

  return {
    graphs: graphs.length,
    nodes: nodes.length,
    edges: edges.length,
    cards: cards.length,
    reviewLogs: reviewLogs.length,
  };
}

/**
 * Import a backup's contents as a NEW file, leaving existing files untouched. Every row gets a
 * FRESH id (with all cross-references remapped), so an import can never collide with existing
 * rows — and, crucially for sync, can never be silently re-killed by a cloud tombstone left
 * over from a previously-deleted file with the same ids. Returns the new (primary) graph id.
 */
export async function importIntoNewFile(backup: Backup): Promise<string> {
  if (!backup || backup.app !== 'learning_app' || !backup.data) {
    throw new Error('Not a learning_app backup file.');
  }
  if (backup.schema > SCHEMA_VERSION) {
    throw new Error(
      `Backup schema v${backup.schema} is newer than this app (v${SCHEMA_VERSION}). Update the app first.`,
    );
  }
  const { graphs, nodes, edges, cards, reviewLogs } = backup.data;

  const gmap = new Map<string, string>();
  const nmap = new Map<string, string>();
  const cmap = new Map<string, string>();
  const remap = (map: Map<string, string>, oldId: string): string => {
    let v = map.get(oldId);
    if (!v) {
      v = crypto.randomUUID();
      map.set(oldId, v);
    }
    return v;
  };

  // Order matters: graphs → nodes → cards populate the maps that edges/logs reference.
  const newGraphs: Graph[] = graphs.map((g) => ({ ...g, id: remap(gmap, g.id) }));
  const newNodes: GNode[] = nodes.map((n) => ({
    ...n,
    id: remap(nmap, n.id),
    graphId: remap(gmap, n.graphId),
  }));
  const newCards: Card[] = cards.map((c) =>
    reviveCard({ ...c, id: remap(cmap, c.id), nodeId: remap(nmap, c.nodeId), graphId: remap(gmap, c.graphId) }),
  );
  const newEdges: GEdge[] = edges.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    graphId: remap(gmap, e.graphId),
    source: remap(nmap, e.source),
    target: remap(nmap, e.target),
  }));
  const newLogs: ReviewLog[] = reviewLogs.map((l) => ({
    ...l,
    id: crypto.randomUUID(),
    cardId: remap(cmap, l.cardId),
    nodeId: remap(nmap, l.nodeId),
    graphId: remap(gmap, l.graphId),
  }));

  await db.transaction('rw', db.graphs, db.nodes, db.edges, db.cards, db.reviewLogs, async () => {
    await db.graphs.bulkAdd(newGraphs);
    await db.nodes.bulkAdd(newNodes);
    await db.cards.bulkAdd(newCards);
    await db.edges.bulkAdd(newEdges);
    await db.reviewLogs.bulkAdd(newLogs);
  });

  return newGraphs[0]?.id ?? '';
}
