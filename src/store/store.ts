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

const uid = () => crypto.randomUUID();

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
  graph: Graph | null;
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
      let graph = (await db.graphs.orderBy('createdAt').first()) ?? null;
      if (!graph) {
        graph = { id: uid(), title: SEED_TITLE, createdAt: Date.now() };
        await db.graphs.add(graph);
      }
      set({ graph }); // make graphId available before reloadFromDb / loadSeed
      await get().reloadFromDb();
      // Reconstruct today's counters from the log so caps/burying survive reloads.
      const dayStart = startOfAnkiDay(new Date(), ROLLOVER_HOUR).getTime();
      const todaysLogs = await db.reviewLogs.where('ts').aboveOrEqual(dayStart).toArray();
      const newIntroducedToday = todaysLogs.filter((l) => l.wasNew).length;
      const reviewedTodayNodeIds = new Set(todaysLogs.map((l) => l.nodeId));
      set({ graph, loaded: true, newIntroducedToday, reviewedTodayNodeIds });
    })();
    return initInFlight;
  },

  reloadFromDb: async () => {
    const graph = get().graph ?? (await db.graphs.orderBy('createdAt').first()) ?? null;
    if (!graph) {
      set({ nodes: [], edges: [], cards: [] });
      return;
    }
    const [nodes, edges, cards] = await Promise.all([
      db.nodes.where('graphId').equals(graph.id).toArray(),
      db.edges.where('graphId').equals(graph.id).toArray(),
      db.cards.where('graphId').equals(graph.id).toArray(),
    ]);
    set({ graph, nodes, edges, cards });
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
    await get().reloadFromDb();
  },

  addNode: async (x, y) => {
    const graph = get().graph;
    if (!graph) throw new Error('No graph loaded');
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
    await db.transaction('rw', db.nodes, db.edges, db.cards, async () => {
      await db.nodes.delete(id);
      await db.edges.bulkDelete(incidentEdges.map((e) => e.id));
      await db.cards.bulkDelete(cards.map((c) => c.id));
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
    await db.edges.delete(id);
    const edge = get().edges.find((e) => e.id === id);
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
      await db.transaction('rw', db.nodes, db.edges, db.cards, async () => {
        await db.nodes.add(snap.node!);
        if (snap.edges?.length) await db.edges.bulkAdd(snap.edges);
        if (snap.cards?.length) await db.cards.bulkAdd(snap.cards);
      });
    } else if (snap.kind === 'edge' && snap.edge) {
      await db.edges.add(snap.edge);
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
