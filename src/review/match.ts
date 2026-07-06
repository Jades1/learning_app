// Match-first recall check for TYPED input (R3): a local, offline string match
// decides pass/fail; no AI. Short key-phrases resolve cleanly; longer bodies are
// lenient, and a failed match falls back to reveal + one-tap self-confirm.

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over the two token sets (0..1). */
export function matchScore(input: string, target: string): number {
  const a = new Set(normalize(input).split(' ').filter(Boolean));
  const b = new Set(normalize(target).split(' ').filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

export interface MatchResult {
  pass: boolean;
  score: number;
}

export function checkMatch(input: string, target: string, threshold: number): MatchResult {
  const norm = normalize(input);
  const normTarget = normalize(target);
  // Exact match short-circuits to a perfect score.
  if (norm.length > 0 && norm === normTarget) return { pass: true, score: 1 };
  const score = matchScore(input, target);
  return { pass: score >= threshold, score };
}
