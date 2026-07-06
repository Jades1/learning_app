// The single deterministic interface between the review UI and FSRS.
// Implements GRADING-CONTRACT.md EXACTLY. AI is BARRED from emitting a grade —
// nothing here calls a model; same signals -> same rating, always.
import type { Grade, InputMode, Outcome } from '../types';
import type { GradeConfig } from './config';

/** The signals grade() consumes. A superset is logged (see ReviewLog). */
export interface GradeSignals {
  /** Did the learner produce an accepted answer *before* revealing? */
  outcome: Outcome;
  /** Did they request >= 1 cue (drop below the base/unaided rung)? */
  usedHint: boolean;
  /** Furthest scaffolding rung reached (0 = unaided). Logged; refines mapping later. */
  deepestRung: number;
  /** Time from prompt to unaided success, or to first hint request (ms). */
  latencyMs: number;
  /** Recall-input mode. `self-attempt` => pass/fail is self-reported. */
  inputMode: InputMode;
  /** Fraction of blanks/edges correct — reconstruction only; null/undefined otherwise. */
  correctness?: number | null;
  /** Number of blanks in a reconstruction (default 1). Latency is normalized by this so a
   *  multi-blank card isn't judged "slow" just for having more to fill (Fable N6). */
  blankCount?: number | null;
}

/**
 * grade(signals, cfg) -> FSRS rating. Pure, deterministic, side-effect-free.
 *
 * Canonical mapping (card-type agnostic), in order:
 *   1. revealed OR fail                                       -> Again  (the one hard, objective fact)
 *   2. reconstruction AND correctness < PASS_THRESHOLD        -> Again
 *   3. reconstruction AND correctness < 1 (partial)           -> Hard   (Fable N1: no "Easy" on a
 *                                                                         partly-wrong rebuild)
 *   4. success AND usedHint                                   -> Hard
 *   5. success AND !usedHint AND latency/blanks >= SLOW_MS    -> Good
 *   6. success AND !usedHint AND latency/blanks <  SLOW_MS    -> Easy
 */
export function grade(s: GradeSignals, cfg: GradeConfig): Grade {
  if (s.outcome === 'revealed' || s.outcome === 'fail') return 'Again';
  if (s.correctness != null && s.correctness < cfg.PASS_THRESHOLD) return 'Again';
  if (s.correctness != null && s.correctness < 1) return 'Hard';
  if (s.usedHint) return 'Hard';
  const perBlank = s.latencyMs / (s.blankCount || 1);
  return perBlank >= cfg.SLOW_MS ? 'Good' : 'Easy';
}
