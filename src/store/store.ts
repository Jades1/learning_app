// Zustand store. Dexie is the source of truth; the store mirrors it in memory and
// writes THROUGH to Dexie on every mutation. UI reads from the store; nothing in
// here decides a grade (see review/grade.ts) or authors graph content.
import { create } from 'zustand';
import { db } from '../db/db';
import type { BlankResult, Card, GEdge, GNode, Graph, Grade, InputMode, ReviewLog } from '../types';
import {
  newCardState,
  applyGrade,
  buildDueQueue,
  isDue,
  isNew,
  startOfAnkiDay,
  type QueueContext,
} from '../scheduler/fsrs';
import { grade, type GradeSignals } from '../review/grade';
import {
  DEFAULT_GRADE_CONFIG,
  MIN_RECON_EDGES,
  NEW_CARDS_PER_DAY,
  ROLLOVER_HOUR,
} from '../review/config';
import { reconDegree } from '../review/reconstruction';
import { SEED_EDGES, SEED_NODES, SEED_TITLE, seedPosition } from '../seed';
import type { Tombstone } from '../db/db';
import { remote } from '../sync/remoteFlag';

const uid = () => crypto.randomUUID();

/** Build a soft-delete record (see db.ts Tombstone). */
const tomb = (table: Tombstone['table'], id: string): Tombstone => ({
  key: `${table}:${id}`,
  table,
  id,
  deletedAt: Date.now(),
});

// The active file (graph) id — per-device UI state, NEVER synced. Written ONLY by explicit
// user actions (create/switch/delete). reloadFromDb's *fallback* resolution must not persist,
// or a sync-triggered reload mid-pull could permanently hijack the selection.
const SELECTED_KEY = 'learning_app:selectedGraphId';
const readSelectedId = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
};
const writeSelectedId = (id: string): void => {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    /* localStorage unavailable — non-fatal */
  }
};

// The id of an auto-minted, never-used File 1 (created on first load when the DB was empty).
// If the user later signs in on this device and a real (content-bearing) file syncs down, this
// empty placeholder is discarded so we don't leave a duplicate empty file behind — the
// "sign-in-after-load" fork. Cleared the moment the file gets real content (or is adopted away).
const PROVISIONAL_KEY = 'learning_app:provisionalGraphId';
const readProvisionalId = (): string | null => {
  try {
    return localStorage.getItem(PROVISIONAL_KEY);
  } catch {
    return null;
  }
};
const writeProvisionalId = (id: string): void => {
  try {
    localStorage.setItem(PROVISIONAL_KEY, id);
  } catch {
    /* non-fatal */
  }
};
const clearProvisionalId = (): void => {
  try {
    localStorage.removeItem(PROVISIONAL_KEY);
  } catch {
    /* non-fatal */
  }
};

/** Default name for a new file: the lowest "File N" (N≥2) not already in use. File 1 keeps
 *  its own title (e.g. the seed's "Learning Claude"), so new files start numbering at 2. */
const nextFileName = (graphs: Graph[]): string => {
  const used = new Set(graphs.map((g) => g.title));
  let n = 2;
  while (used.has(`File ${n}`)) n++;
  return `File ${n}`;
};

/** Per-file today-counters (new-cards/day cap + same-day sibling bury), rebuilt from the log. */
async function todayCounters(
  graphId: string,
): Promise<{ newIntroducedToday: number; reviewedTodayNodeIds: Set<string> }> {
  const dayStart = startOfAnkiDay(new Date(), ROLLOVER_HOUR).getTime();
  const logs = await db.reviewLogs
    .where('graphId')
    .equals(graphId)
    .and((l) => l.ts >= dayStart)
    .toArray();
  return {
    newIntroducedToday: logs.filter((l) => l.wasNew).length,
    reviewedTodayNodeIds: new Set(logs.map((l) => l.nodeId)),
  };
}

// Dedupe concurrent init() calls (React StrictMode double-invokes effects in dev) so we
// never create two graphs and then load the wrong one after a reload.
let initInFlight: Promise<void> | null = null;

/** Selection state: the arrays drive multi-highlight; the singles (== sole selection, else
 *  null) drive the inspector and inline editing. */
const sel = (nodeIds: string[], edgeIds: string[]) => ({
  selectedNodeIds: nodeIds,
  selectedEdgeIds: edgeIds,
  selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
  selectedEdgeId: edgeIds.length === 1 ? edgeIds[0] : null,
});

export type Mode = 'build' | 'study';
export type DueState = 'due' | 'new' | 'resting';

/** A snapshot for one-step delete-undo (protects FSRS card state from an accidental delete). */
export interface DeletedSnapshot {
  kind: 'node' | 'edge';
  ts: number;
  label: string;
  node?: GNode;
  edges?: GEdge[];
  cards?: Card[];
  edge?: GEdge;
}

/** Everything a completed review needs to log — a superset of GradeSignals. */
export interface ReviewSignals extends GradeSignals {
  hintCount: number;
  hintTimestamps: number[];
  userOverride?: boolean;
  aiVerdictRaw?: string | null;
  /** Reconstruction only: per-blank detail (enables re-grading; C's calibration data). */
  blanks?: BlankResult[];
}

interface StoreState {
  loaded: boolean;
  graph: Graph | null; // the active file
  graphs: Graph[]; // all files, ordered by createdAt (for the switcher)
  nodes: GNode[];
  edges: GEdge[];
  cards: Card[];

  mode: Mode;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  selectedNodeId: string | null; // == sole selected node (else null): inspector
  selectedEdgeId: string | null;
  // Explicit edit state (single-click selects; double-click / typing edits).
  editingNodeId: string | null;
  editingEdgeId: string | null;
  editSelectAll: boolean; // select-all-on-focus when editing was entered to overwrite
  lastDeleted: DeletedSnapshot | null;

  // study session
  studyQueue: Card[];
  studyIndex: number;
  lastResult: { rating: Grade; due: Date } | null;
  /** New cards already introduced in the current Anki-day (for the cap). */
  newIntroducedToday: number;
  /** Nodes reviewed today (either sibling) — for same-day sibling burying (N3). */
  reviewedTodayNodeIds: Set<string>;

  // --- lifecycle ---
  init: () => Promise<void>;
  loadSeed: () => Promise<void>;
  reloadFromDb: () => Promise<void>;

  // --- files (each file = one graph = its own canvas + review queue) ---
  createFile: (title?: string) => Promise<void>;
  switchFile: (id: string) => Promise<void>;
  renameFile: (id: string, title: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  /** Discard an empty auto-minted File 1 if a real file has synced in. Returns true if it acted. */
  reconcileProvisional: () => Promise<boolean>;

  // --- build mutations (all persist) ---
  addNode: (x: number, y: number) => Promise<string>;
  updateNode: (id: string, patch: Partial<Pick<GNode, 'label' | 'body' | 'inputMode' | 'color'>>) => Promise<void>;
  setNodePosition: (id: string, x: number, y: number) => void; // memory only (drag frames)
  persistNodePosition: (id: string) => Promise<void>; // write on drag stop
  deleteNode: (id: string) => Promise<void>;
  addEdge: (source: string, target: string) => Promise<void>;
  updateEdge: (id: string, label: string) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;

  // --- selection / mode ---
  setMode: (m: Mode) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  applyNodeSelect: (changes: { id: string; selected: boolean }[]) => void;
  applyEdgeSelect: (changes: { id: string; selected: boolean }[]) => void;
  clearSelection: () => void;
  startEditNode: (id: string, selectAll?: boolean) => void;
  startEditEdge: (id: string) => void;
  stopEditing: () => void;
  undoLastDelete: () => Promise<void>;
  dismissDeleted: () => void;

  // --- study ---
  queueContext: () => QueueContext;
  dueState: (nodeId: string, now: Date) => DueState;
  dueCount: (now: Date) => number;
  startStudy: () => void;
  currentCard: () => Card | null;
  currentNode: () => GNode | null;
  submitReview: (signals: ReviewSignals) => Promise<void>;
  endStudy: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  graph: null,
  graphs: [],
  nodes: [],
  edges: [],
  cards: [],
  mode: 'build',
  selectedNodeIds: [],
  selectedEdgeIds: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  editingNodeId: null,
  editingEdgeId: null,
  editSelectAll: false,
  lastDeleted: null,
  studyQueue: [],
  studyIndex: 0,
  lastResult: null,
  newIntroducedToday: 0,
  reviewedTodayNodeIds: new Set(),

  init: async () => {
    if (initInFlight) return initInFlight;
    initInFlight = (async () => {
      let count = await db.graphs.count();
      if (count === 0) {
        // On a freshly signed-in device, wait for the first cloud pull so we adopt the
        // existing cloud file(s) instead of forking a new empty one. Resolves immediately
        // when signed out or sync is uninitialised.
        await remote.firstPull;
        count = await db.graphs.count();
      }
      if (count === 0) {
        // Genuinely first run (or signed-out with an empty DB): mint File 1. Flag it PROVISIONAL
        // so a later sign-in that pulls the user's real file can discard this empty placeholder
        // instead of leaving a duplicate (the sign-in-after-load fork).
        const graph = { id: uid(), title: SEED_TITLE, createdAt: Date.now() };
        await db.graphs.add(graph);
        writeSelectedId(graph.id);
        writeProvisionalId(graph.id);
      }
      await get().reloadFromDb(); // resolves graphs + active graph + rows
      const active = get().graph;
      const counters = active
        ? await todayCounters(active.id)
        : { newIntroducedToday: 0, reviewedTodayNodeIds: new Set<string>() };
      set({ loaded: true, ...counters });
    })();
    return initInFlight;
  },

  reloadFromDb: async () => {
    // Resolve the active file = the user-selected pointer, else the earliest-createdAt file.
    // Recomputed every reload (never sticky), so a sync pull that adds/removes files converges
    // this device onto the pointed-at file — WITHOUT persisting the fallback (that write
    // discipline is the fork-safety linchpin; see readSelectedId's note).
    const graphs = await db.graphs.orderBy('createdAt').toArray();
    const pointer = readSelectedId();
    const graph = graphs.find((g) => g.id === pointer) ?? graphs[0] ?? null;
    const prevId = get().graph?.id;
    if (!graph) {
      set({ graphs, graph: null, nodes: [], edges: [], cards: [] });
      return;
    }
    const [nodes, edges, cards] = await Promise.all([
      db.nodes.where('graphId').equals(graph.id).toArray(),
      db.edges.where('graphId').equals(graph.id).toArray(),
      db.cards.where('graphId').equals(graph.id).toArray(),
    ]);
    // If the active file changed out from under a study session (e.g. a pull deleted it),
    // drop back to build mode so we don't review a stale/foreign queue.
    const studyReset =
      prevId && prevId !== graph.id
        ? { mode: 'build' as Mode, studyQueue: [], studyIndex: 0, lastResult: null }
        : {};
    set({ graphs, graph, nodes, edges, cards, ...studyReset });
  },

  loadSeed: async () => {
    const graph = get().graph;
    if (!graph) return;
    const now = new Date();
    const keyToId = new Map<string, string>();
    const nodes: GNode[] = [];
    const cards: Card[] = [];

    SEED_NODES.forEach((sn, i) => {
      const id = uid();
      keyToId.set(sn.key, id);
      const pos = seedPosition(i);
      nodes.push({ id, graphId: graph.id, label: sn.label, body: sn.body, x: pos.x, y: pos.y, inputMode: 'self-attempt' });
      cards.push({ id: uid(), nodeId: id, graphId: graph.id, type: 'body', enabled: true, fsrs: newCardState(now) });
      cards.push({ id: uid(), nodeId: id, graphId: graph.id, type: 'connections', enabled: true, fsrs: newCardState(now) });
    });

    const edges: GEdge[] = SEED_EDGES.flatMap((se) => {
      const source = keyToId.get(se.source);
      const target = keyToId.get(se.target);
      if (!source || !target) return [];
      return [{ id: uid(), graphId: graph.id, source, target, label: se.label }];
    });

    await db.transaction('rw', db.nodes, db.edges, db.cards, async () => {
      await db.nodes.bulkAdd(nodes);
      await db.cards.bulkAdd(cards);
      await db.edges.bulkAdd(edges);
    });
    clearProvisionalId(); // this file now has real content
    await get().reloadFromDb();
  },

  createFile: async (title) => {
    const graph: Graph = {
      id: uid(),
      title: title?.trim() || nextFileName(get().graphs),
      createdAt: Date.now(),
    };
    await db.graphs.add(graph); // creating-hook stamps updatedAt -> syncs
    writeSelectedId(graph.id); // explicit user action -> persist the pointer
    set((s) => ({
      graph,
      graphs: [...s.graphs, graph],
      nodes: [],
      edges: [],
      cards: [],
      newIntroducedToday: 0,
      reviewedTodayNodeIds: new Set(),
      ...sel([], []),
      editingNodeId: null,
      editingEdgeId: null,
      editSelectAll: false,
      lastDeleted: null,
      mode: 'build',
      studyQueue: [],
      studyIndex: 0,
      lastResult: null,
    }));
  },

  switchFile: async (id) => {
    if (id === get().graph?.id) return;
    writeSelectedId(id); // explicit user action -> persist
    set({
      ...sel([], []),
      editingNodeId: null,
      editingEdgeId: null,
      editSelectAll: false,
      lastDeleted: null,
      mode: 'build',
      studyQueue: [],
      studyIndex: 0,
      lastResult: null,
    });
    await get().reloadFromDb();
    const active = get().graph;
    if (active) set(await todayCounters(active.id));
  },

  renameFile: async (id, title) => {
    const t = title.trim() || 'Untitled';
    await db.graphs.update(id, { title: t }); // updating-hook stamps updatedAt -> syncs
    set((s) => ({
      graphs: s.graphs.map((g) => (g.id === id ? { ...g, title: t } : g)),
      graph: s.graph?.id === id ? { ...s.graph, title: t } : s.graph,
    }));
  },

  deleteFile: async (id) => {
    if (get().graphs.length <= 1) return; // never delete the last file
    // Read the file's rows from Dexie — it may not be the active (in-memory) file.
    const [nodes, edges, cards] = await Promise.all([
      db.nodes.where('graphId').equals(id).toArray(),
      db.edges.where('graphId').equals(id).toArray(),
      db.cards.where('graphId').equals(id).toArray(),
    ]);
    // Tombstone the graph + all its content so the delete PROPAGATES across devices
    // (a pure-union pull never infers a delete from absence). ReviewLogs are KEPT.
    const tombs: Tombstone[] = [
      tomb('graphs', id),
      ...nodes.map((n) => tomb('nodes', n.id)),
      ...edges.map((e) => tomb('edges', e.id)),
      ...cards.map((c) => tomb('cards', c.id)),
    ];
    await db.transaction('rw', db.graphs, db.nodes, db.edges, db.cards, db.tombstones, async () => {
      await db.graphs.delete(id);
      await db.nodes.bulkDelete(nodes.map((n) => n.id));
      await db.edges.bulkDelete(edges.map((e) => e.id));
      await db.cards.bulkDelete(cards.map((c) => c.id));
      await db.tombstones.bulkPut(tombs);
    });
    // If the deleted file was active, point at the earliest survivor before reloading.
    if (get().graph?.id === id) {
      const survivor = get().graphs.find((g) => g.id !== id);
      if (survivor) writeSelectedId(survivor.id);
    }
    await get().reloadFromDb();
    const active = get().graph;
    if (active) set(await todayCounters(active.id));
  },

  reconcileProvisional: async () => {
    const provId = readProvisionalId();
    if (!provId) return false;
    // If the placeholder got real content, it's a genuine file now — keep it, stop tracking.
    if ((await db.nodes.where('graphId').equals(provId).count()) > 0) {
      clearProvisionalId();
      return false;
    }
    // Adopt only a CONTENT-BEARING alternative (guards against two empty devices tombstoning
    // each other's placeholders into oblivion). Nothing real to adopt → keep the placeholder.
    const graphs = await db.graphs.orderBy('createdAt').toArray();
    let adopt: Graph | null = null;
    for (const g of graphs) {
      if (g.id === provId) continue;
      if ((await db.nodes.where('graphId').equals(g.id).count()) > 0) {
        adopt = g;
        break;
      }
    }
    if (!adopt) return false;
    // Discard the empty placeholder (tombstone so it also leaves the cloud / other devices).
    await db.transaction('rw', db.graphs, db.tombstones, async () => {
      await db.graphs.delete(provId);
      await db.tombstones.put(tomb('graphs', provId));
    });
    clearProvisionalId();
    if (!readSelectedId() || readSelectedId() === provId) writeSelectedId(adopt.id);
    return true;
  },

  addNode: async (x, y) => {
    const graph = get().graph;
    if (!graph) throw new Error('No graph loaded');
    if (readProvisionalId() === graph.id) clearProvisionalId(); // real content now

    const node: GNode = {
      id: uid(),
      graphId: graph.id,
      label: 'New node',
      body: '',
      x,
      y,
      inputMode: 'self-attempt',
    };
    // Every node gets both cards (Decision 11): a body card and a connections card.
    // The connections card stays out of study until the node has enough labeled edges
    // (eligibility is a queue-time gate, so its FSRS state is never lost).
    const now = new Date();
    const mk = (type: Card['type']): Card => ({
      id: uid(),
      nodeId: node.id,
      graphId: graph.id,
      type,
      enabled: true,
      fsrs: newCardState(now),
    });
    const newCards = [mk('body'), mk('connections')];
    await db.transaction('rw', db.nodes, db.cards, async () => {
      await db.nodes.add(node);
      await db.cards.bulkAdd(newCards);
    });
    set((s) => ({
      nodes: [...s.nodes, node],
      cards: [...s.cards, ...newCards],
      ...sel([node.id], []),
      editingNodeId: node.id, // drop straight into typing the label
      editingEdgeId: null,
      editSelectAll: true,
    }));
    return node.id;
  },

  updateNode: async (id, patch) => {
    await db.nodes.update(id, patch);
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  },

  setNodePosition: (id, x, y) => {
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  },

  persistNodePosition: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) await db.nodes.update(id, { x: node.x, y: node.y });
  },

  deleteNode: async (id) => {
    const st = get();
    const node = st.nodes.find((n) => n.id === id);
    if (!node) return;
    const incidentEdges = st.edges.filter((e) => e.source === id || e.target === id);
    const cards = st.cards.filter((c) => c.nodeId === id);
    // Tombstones (same txn) so the delete propagates to other devices; a pure-union
    // pull must never infer a delete from a row's absence.
    const tombs = [
      tomb('nodes', id),
      ...incidentEdges.map((e) => tomb('edges', e.id)),
      ...cards.map((c) => tomb('cards', c.id)),
    ];
    await db.transaction('rw', db.nodes, db.edges, db.cards, db.tombstones, async () => {
      await db.nodes.delete(id);
      await db.edges.bulkDelete(incidentEdges.map((e) => e.id));
      await db.cards.bulkDelete(cards.map((c) => c.id));
      await db.tombstones.bulkPut(tombs);
      // ReviewLogs are intentionally KEPT — the log is the product (R2).
    });
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      cards: s.cards.filter((c) => c.nodeId !== id),
      // Snapshot for one-step undo so a slip doesn't destroy FSRS card state.
      lastDeleted: { kind: 'node', ts: Date.now(), label: node.label || 'node', node, edges: incidentEdges, cards },
      editingNodeId: s.editingNodeId === id ? null : s.editingNodeId,
      ...sel(
        s.selectedNodeIds.filter((x) => x !== id),
        s.selectedEdgeIds,
      ),
    }));
  },

  addEdge: async (source, target) => {
    const graph = get().graph;
    if (!graph || source === target) return;
    // No duplicate edge in the same direction.
    if (get().edges.some((e) => e.source === source && e.target === target)) return;
    const edge: GEdge = { id: uid(), graphId: graph.id, source, target, label: '' };
    await db.edges.add(edge);
    // Select AND drop into editing so you can type the relationship immediately.
    set((s) => ({ edges: [...s.edges, edge], ...sel([], [edge.id]), editingEdgeId: edge.id, editingNodeId: null }));
  },

  updateEdge: async (id, label) => {
    await db.edges.update(id, { label });
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, label } : e)) }));
  },

  deleteEdge: async (id) => {
    const edge = get().edges.find((e) => e.id === id);
    await db.transaction('rw', db.edges, db.tombstones, async () => {
      await db.edges.delete(id);
      await db.tombstones.put(tomb('edges', id));
    });
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      lastDeleted: edge
        ? { kind: 'edge', ts: Date.now(), label: edge.label || 'edge', edge }
        : s.lastDeleted,
      editingEdgeId: s.editingEdgeId === id ? null : s.editingEdgeId,
      ...sel(
        s.selectedNodeIds,
        s.selectedEdgeIds.filter((x) => x !== id),
      ),
    }));
  },

  setMode: (m) =>
    set({ mode: m, ...sel([], []), editingNodeId: null, editingEdgeId: null, editSelectAll: false }),
  selectNode: (id) => set({ ...sel(id ? [id] : [], []), editingNodeId: null, editingEdgeId: null }),
  selectEdge: (id) => set({ ...sel([], id ? [id] : []), editingNodeId: null, editingEdgeId: null }),
  applyNodeSelect: (changes) =>
    set((s) => {
      const next = new Set(s.selectedNodeIds);
      for (const c of changes) if (c.selected) next.add(c.id); else next.delete(c.id);
      return sel([...next], s.selectedEdgeIds);
    }),
  applyEdgeSelect: (changes) =>
    set((s) => {
      const next = new Set(s.selectedEdgeIds);
      for (const c of changes) if (c.selected) next.add(c.id); else next.delete(c.id);
      return sel(s.selectedNodeIds, [...next]);
    }),
  clearSelection: () => set({ ...sel([], []), editingNodeId: null, editingEdgeId: null }),
  startEditNode: (id, selectAll = false) =>
    set({ ...sel([id], []), editingNodeId: id, editingEdgeId: null, editSelectAll: selectAll }),
  startEditEdge: (id) =>
    set({ ...sel([], [id]), editingNodeId: null, editingEdgeId: id, editSelectAll: false }),
  stopEditing: () => set({ editingNodeId: null, editingEdgeId: null, editSelectAll: false }),
  undoLastDelete: async () => {
    const snap = get().lastDeleted;
    if (!snap) return;
    if (snap.kind === 'node' && snap.node) {
      const keys = [
        `nodes:${snap.node.id}`,
        ...(snap.edges ?? []).map((e) => `edges:${e.id}`),
        ...(snap.cards ?? []).map((c) => `cards:${c.id}`),
      ];
      await db.transaction('rw', db.nodes, db.edges, db.cards, db.tombstones, async () => {
        await db.nodes.add(snap.node!);
        if (snap.edges?.length) await db.edges.bulkAdd(snap.edges);
        if (snap.cards?.length) await db.cards.bulkAdd(snap.cards);
        // Clear the tombstones; the re-added rows get a fresh updatedAt (via the Dexie
        // hook) that outranks the tombstone, so LWW resurrects them on every device.
        await db.tombstones.bulkDelete(keys);
      });
    } else if (snap.kind === 'edge' && snap.edge) {
      await db.transaction('rw', db.edges, db.tombstones, async () => {
        await db.edges.add(snap.edge!);
        await db.tombstones.delete(`edges:${snap.edge!.id}`);
      });
    }
    set({ lastDeleted: null });
    await get().reloadFromDb();
  },
  dismissDeleted: () => set({ lastDeleted: null }),

  queueContext: () => {
    const { edges, newIntroducedToday, reviewedTodayNodeIds } = get();
    return {
      newCap: NEW_CARDS_PER_DAY,
      newIntroducedToday,
      reviewedNodeIdsToday: reviewedTodayNodeIds,
      // A connections card is only eligible once its node has enough labeled edges.
      isReconEligible: (card) => reconDegree(card.nodeId, edges) >= MIN_RECON_EDGES,
    };
  },

  dueState: (nodeId, now) => {
    const { edges } = get();
    // A connections card only counts toward due-state once it's reconstruction-eligible.
    const eligible = (c: Card) =>
      c.type !== 'connections' || reconDegree(c.nodeId, edges) >= MIN_RECON_EDGES;
    const cards = get().cards.filter((c) => c.nodeId === nodeId && c.enabled && eligible(c));
    if (cards.length === 0) return 'resting';
    if (cards.some((c) => isDue(c, now, ROLLOVER_HOUR) && isNew(c))) return 'new';
    if (cards.some((c) => isDue(c, now, ROLLOVER_HOUR))) return 'due';
    if (cards.every((c) => isNew(c))) return 'new';
    return 'resting';
  },

  dueCount: (now) => buildDueQueue(get().cards, now, ROLLOVER_HOUR, get().queueContext()).length,

  startStudy: () => {
    const queue = buildDueQueue(get().cards, new Date(), ROLLOVER_HOUR, get().queueContext());
    set({ mode: 'study', studyQueue: queue, studyIndex: 0, lastResult: null, ...sel([], []) });
  },

  currentCard: () => {
    const { studyQueue, studyIndex } = get();
    return studyQueue[studyIndex] ?? null;
  },

  currentNode: () => {
    const card = get().currentCard();
    if (!card) return null;
    return get().nodes.find((n) => n.id === card.nodeId) ?? null;
  },

  submitReview: async (signals) => {
    const card = get().currentCard();
    if (!card) return;
    const now = new Date();
    const wasNew = isNew(card); // captured BEFORE scheduling mutates state
    const rating = grade(signals, DEFAULT_GRADE_CONFIG);
    const nextFsrs = applyGrade(card.fsrs, rating, now);
    const updated: Card = { ...card, fsrs: nextFsrs };

    const log: ReviewLog = {
      id: uid(),
      cardId: card.id,
      nodeId: card.nodeId,
      graphId: card.graphId,
      ts: now.getTime(),
      outcome: signals.outcome,
      usedHint: signals.usedHint,
      hintCount: signals.hintCount,
      deepestRung: signals.deepestRung,
      hintTimestamps: signals.hintTimestamps,
      latencyMs: signals.latencyMs,
      inputMode: signals.inputMode,
      correctness: signals.correctness ?? null,
      aiVerdictRaw: signals.aiVerdictRaw ?? null,
      userOverride: signals.userOverride ?? false,
      wasNew,
      blankCount: signals.blankCount ?? null,
      blanks: signals.blanks,
      derivedRating: rating,
    };

    await db.transaction('rw', db.cards, db.reviewLogs, async () => {
      await db.cards.put(updated);
      await db.reviewLogs.add(log);
    });

    set((s) => {
      const reviewedTodayNodeIds = new Set(s.reviewedTodayNodeIds);
      reviewedTodayNodeIds.add(updated.nodeId);
      return {
        cards: s.cards.map((c) => (c.id === updated.id ? updated : c)),
        studyQueue: s.studyQueue.map((c, i) => (i === s.studyIndex ? updated : c)),
        studyIndex: s.studyIndex + 1,
        lastResult: { rating, due: nextFsrs.due },
        newIntroducedToday: wasNew ? s.newIntroducedToday + 1 : s.newIntroducedToday,
        reviewedTodayNodeIds,
      };
    });
  },

  endStudy: () => set({ mode: 'build', studyQueue: [], studyIndex: 0, lastResult: null }),
}));

// Convenience selector used by both the canvas and the review loop.
export function inputModeLabel(m: InputMode): string {
  return m === 'typed' ? 'Type answer' : 'Self-attempt';
}
