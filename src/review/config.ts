// Tunable grading parameters. Per GRADING-CONTRACT.md these are stored in config
// and NOT hard-coded, so they can be revised after dogfooding without touching
// the deterministic grade() mapping.

export interface GradeConfig {
  /** Unaided-latency cutoff between Good and Easy (ms). */
  SLOW_MS: number;
  /** Min reconstruction correctness to count as success (reconstruction only). */
  PASS_THRESHOLD: number;
}

export const DEFAULT_GRADE_CONFIG: GradeConfig = {
  SLOW_MS: 8000,
  PASS_THRESHOLD: 0.6,
};

/**
 * Anki-compatible day rollover (R5). A card due before this hour still belongs to
 * the previous "day"; default 4am. Also governs which cards count as due "today".
 */
export const ROLLOVER_HOUR = 4;

/**
 * Match threshold for typed recall (match-first per R3). Above this, a typed answer
 * auto-passes; below, the learner reveals and may one-tap self-confirm.
 */
export const TYPED_MATCH_THRESHOLD = 0.6;

/**
 * Max brand-new cards introduced per Anki-day. The cap MACHINERY is built and tested, but
 * during early dogfooding it is intentionally UNCAPPED (Infinity) — James's call: don't
 * impose a pacing default before we've felt the flow and found the weaknesses. Revisit and
 * set a real default (Fable suggested ~5) once dogfooding informs it. Review/learning cards
 * are never capped regardless.
 */
export const NEW_CARDS_PER_DAY = Infinity;

/** Nudge to export a backup if the last export was more than this many days ago. */
export const EXPORT_NUDGE_DAYS = 7;

// --- Bundle B: neighborhood reconstruction ---

/** A node's `connections` card is only studied once the node has at least this many edges
 *  (at degree 1 it degenerates into a single-edge flashcard with maximal sibling overlap). */
export const MIN_RECON_EDGES = 2;

/** Cap on incident edges surfaced as blanks in one reconstruction review (bounded
 *  due-neighborhood — Decision 9). Beyond this we sample, rotating coverage across reviews. */
export const MAX_BLANKS = 8;

/** Per-blank fuzzy-match pass threshold for edge labels. Separate from TYPED_MATCH_THRESHOLD
 *  so the two tune independently. */
export const LABEL_MATCH_THRESHOLD = 0.6;
