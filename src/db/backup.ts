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

/** Revive Date fields that JSON serialization flattened to strings. */
function reviveCard(card: Card): Card {
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
