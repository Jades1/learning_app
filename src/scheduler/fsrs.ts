// ts-fsrs wrapper — we own the review loop (Decision 1). FSRS is used purely as a
// library. This module also owns the Anki-solved edge cases we now own: day
// rollover (R5) and sibling-burying (R5).
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from 'ts-fsrs';
import type { Card, Grade } from '../types';

const scheduler = fsrs(
  generatorParameters({ enable_fuzz: true, enable_short_term: true }),
);

// ts-fsrs's Grade excludes Rating.Manual; map our string grades onto it.
const RATING: Record<Grade, FsrsGrade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

/** Fresh, never-studied scheduling state (due == now => immediately introducible). */
export function newCardState(now: Date = new Date()): FsrsCard {
  return createEmptyCard(now);
}

/** Apply a grade and return the next scheduling state. */
export function applyGrade(state: FsrsCard, g: Grade, now: Date = new Date()): FsrsCard {
  return scheduler.next(state, now, RATING[g]).card;
}

/** True if the card has never been reviewed (New state). */
export function isNew(card: Card): boolean {
  return card.fsrs.state === State.New;
}

/**
 * Boundary marking the end of the current Anki "day". A card due at or before this
 * instant counts as due today. Rollover default 4am (config.ROLLOVER_HOUR).
 */
export function endOfAnkiDay(now: Date, rolloverHour: number): Date {
  const boundary = new Date(now);
  boundary.setHours(rolloverHour, 0, 0, 0);
  // If we're already past today's rollover, the day ends at the NEXT rollover.
  if (now.getHours() >= rolloverHour) boundary.setDate(boundary.getDate() + 1);
  return boundary;
}

/** Start of the current Anki "day" (the most recent rollover boundary). */
export function startOfAnkiDay(now: Date, rolloverHour: number): Date {
  const start = new Date(now);
  start.setHours(rolloverHour, 0, 0, 0);
  // Before today's rollover, the current day began at YESTERDAY's rollover.
  if (now.getHours() < rolloverHour) start.setDate(start.getDate() - 1);
  return start;
}

/** Is this enabled card due by the end of the current Anki day? */
export function isDue(card: Card, now: Date, rolloverHour: number): boolean {
  if (!card.enabled) return false;
  const due = new Date(card.fsrs.due).getTime();
  return due <= endOfAnkiDay(now, rolloverHour).getTime();
}

/** Inputs that shape the study queue; every field is optional. */
export interface QueueContext {
  /** Max new cards per Anki-day (Infinity = uncapped). */
  newCap?: number;
  /** New cards already introduced earlier today (from the review log). */
  newIntroducedToday?: number;
  /** Nodes already reviewed today (either sibling). Excluded so a node's `body` and
   *  `connections` cards never both review in one Anki-day, even across sessions (R5/N3). */
  reviewedNodeIdsToday?: Set<string>;
  /** Reconstruction eligibility gate: a `connections` card is only studyable when its node
   *  has enough labeled edges. Returns true if the card may be queued. */
  isReconEligible?: (card: Card) => boolean;
}

const byDue = (a: Card, b: Card) =>
  new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime();

/**
 * Build the study queue from all cards.
 *  - Only enabled cards that are due today.
 *  - RECONSTRUCTION GATE: `connections` cards below the edge-degree threshold are excluded
 *    (their FSRS state is preserved — gate, don't delete).
 *  - SAME-DAY SIBLING BURYING (R5/N3): nodes already reviewed today are excluded, AND at
 *    most one card per node per queue is kept — so the two cards of a node never both
 *    review in one day (FSRS independence), even across repeated sessions.
 *  - NEW-CARDS/DAY CAP (defaultable, currently uncapped): review/learning cards are never
 *    capped; new cards are limited to `newCap - newIntroducedToday`.
 *  - Ordered by due time, which naturally interleaves across the graph.
 */
export function buildDueQueue(
  cards: Card[],
  now: Date,
  rolloverHour: number,
  ctx: QueueContext = {},
): Card[] {
  let due = cards.filter((c) => isDue(c, now, rolloverHour));

  if (ctx.isReconEligible) {
    due = due.filter((c) => c.type !== 'connections' || ctx.isReconEligible!(c));
  }
  if (ctx.reviewedNodeIdsToday) {
    due = due.filter((c) => !ctx.reviewedNodeIdsToday!.has(c.nodeId));
  }

  // Keep only the more-due card per node this queue (in-session sibling bury).
  const perNode = new Map<string, Card>();
  for (const c of due) {
    const held = perNode.get(c.nodeId);
    if (!held || new Date(c.fsrs.due) < new Date(held.fsrs.due)) {
      perNode.set(c.nodeId, c);
    }
  }
  let queue = [...perNode.values()];

  if (ctx.newCap != null && ctx.newIntroducedToday != null) {
    const remaining = Math.max(0, ctx.newCap - ctx.newIntroducedToday);
    const news = queue.filter(isNew).sort(byDue).slice(0, remaining);
    const reviews = queue.filter((c) => !isNew(c));
    queue = [...reviews, ...news];
  }

  return queue.sort(byDue);
}
