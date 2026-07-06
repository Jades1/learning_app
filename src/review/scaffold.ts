// The MECHANICAL scaffolding ladder for node-cards. NO AI (the AI tutor is
// deferred per R4 — v1 is fully offline). Each "Need a hint" drops one rung down
// (hardest -> easiest); the deepest rung reached is logged. Hints are PULL, not
// push: shown only when the learner asks.
//
// Rung 0 is unaided free recall (no cue). Rungs 1..N render progressively
// stronger cues derived purely from the body text.

export interface Rung {
  level: number;
  name: string;
  /** Render the cue for this rung from the target body. */
  render: (body: string) => string;
}

const words = (body: string) => body.split(/\s+/).filter(Boolean);

/** Ladder for body-recall cards, hardest cue first. */
export const BODY_LADDER: Rung[] = [
  {
    level: 1,
    name: 'Slot shown',
    // Shape only: each word becomes underscores of its length.
    render: (body) => words(body).map((w) => '_'.repeat(w.length)).join(' '),
  },
  {
    level: 2,
    name: 'First letters',
    // First letter of every word, rest blanked.
    render: (body) =>
      words(body)
        .map((w) => (w.length <= 1 ? w : w[0] + '_'.repeat(w.length - 1)))
        .join(' '),
  },
  {
    level: 3,
    name: 'First half',
    // The opening ~half of the text, then an ellipsis.
    render: (body) => body.slice(0, Math.ceil(body.length / 2)).trimEnd() + ' …',
  },
];

/** Deepest usable rung (== a full reveal happens outside the ladder). */
export const MAX_RUNG = BODY_LADDER.length;

/** The cue to show at a given deepest rung (0 => no cue). */
export function cueForRung(body: string, rung: number): string {
  if (rung <= 0) return '';
  const r = BODY_LADDER[Math.min(rung, MAX_RUNG) - 1];
  return r.render(body);
}

/** Human name of the current rung, for the Support meter caption. */
export function rungName(rung: number): string {
  if (rung <= 0) return 'Free recall';
  return BODY_LADDER[Math.min(rung, MAX_RUNG) - 1].name;
}
