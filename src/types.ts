// Domain model. Mirrors the data model in DECISIONS.md / the approved plan.
// FSRS scheduling state is stored verbatim as a ts-fsrs Card on each Card row.
import type { Card as FsrsCard } from 'ts-fsrs';

/**
 * Sync metadata carried by every persisted row. Stamped by the Dexie hooks in
 * db.ts (local writes) or by a pulled cloud row's timestamp. Optional so it never
 * affects study/generation logic — the sync layer is the only reader.
 */
export interface Synced {
  /** ms epoch of the last local edit (or the cloud row's timestamp on pull). */
  updatedAt?: number;
}

export type InputMode = 'typed' | 'self-attempt';
export type CardType = 'body' | 'connections';
export type Outcome = 'success' | 'revealed' | 'fail';
export type Grade = 'Again' | 'Hard' | 'Good' | 'Easy';
/** User-chosen note fill (a category color the learner assigns). Stored as a token, not
 *  hex, so the palette can be retuned. Absent = default. NEVER encodes schedule/study state. */
export type NodeColor = 'straw' | 'sage' | 'sky' | 'lilac' | 'blush' | 'sand';

/** A study space. MVP: one graph, "Learning Claude". */
export interface Graph extends Synced {
  id: string;
  title: string;
  createdAt: number;
}

/** An idea. `label` is the always-visible prompt; `body` is what you recall. */
export interface GNode extends Synced {
  id: string;
  graphId: string;
  label: string;
  body: string;
  x: number;
  y: number;
  /** How the body is recalled (Decision 6, per-node hybrid). */
  inputMode: InputMode;
  /** Optional user-chosen fill color (category), absent = default white. */
  color?: NodeColor;
}

/** A labeled relationship between two nodes. */
export interface GEdge extends Synced {
  id: string;
  graphId: string;
  source: string;
  target: string;
  label: string;
}

/**
 * A schedulable unit. A node carries up to two independently scheduled cards:
 * `body` (recall the hidden body) and `connections` (reconstruct its 1-hop
 * neighborhood — DEFERRED in the spine but modeled here). Each enabled per node.
 */
export interface Card extends Synced {
  id: string;
  nodeId: string;
  graphId: string;
  type: CardType;
  enabled: boolean;
  fsrs: FsrsCard;
}

/** Per-blank outcome for a reconstruction review (Bundle B). Enables re-grading and is the
 *  calibration dataset for a future AI judge. */
export interface BlankResult {
  edgeId: string;
  expected: string;
  given: string;
  score: number; // fuzzy match score 0..1
  pass: boolean; // matched locally, or overridden
  overridden: boolean; // user tapped "I meant the same"
}

/**
 * One review event. Per GRADING-CONTRACT.md, RAW BEHAVIOR is logged separately
 * from the derived FSRS rating, so the grade() mapping can be revised and history
 * re-graded later without data loss.
 */
export interface ReviewLog extends Synced {
  id: string;
  cardId: string;
  nodeId: string;
  graphId: string;
  ts: number;
  // --- raw behavior (never lossy) ---
  outcome: Outcome;
  usedHint: boolean;
  hintCount: number;
  deepestRung: number;
  hintTimestamps: number[];
  latencyMs: number;
  inputMode: InputMode;
  correctness?: number | null; // reconstruction only; null for node-cards
  aiVerdictRaw?: string | null; // reserved for the (deferred) AI judge
  userOverride?: boolean; // self-confirm / one-tap override was used
  /** Was the card New (never reviewed) at review time? Powers the new-cards/day cap. */
  wasNew: boolean;
  /** Reconstruction only: number of blanks presented, and the per-blank detail. */
  blankCount?: number | null;
  blanks?: BlankResult[];
  // --- derived (recomputable from the above) ---
  derivedRating: Grade;
}
