# Grading contract — learning_app

The single **deterministic** interface between the review UI and FSRS. Every component
(scaffolding-ladder UI, reconstruction judge, ts-fsrs wrapper, review-log schema) consumes
it. **AI is barred from emitting a grade.** This is Fable review R1 — the one thing to fix
before writing code.

## The function

`grade(signals, cfg) → FSRS rating ∈ {Again, Hard, Good, Easy}`

Pure, deterministic, side-effect-free. Same signals → same rating, always.

### Inputs (signals)

| field | type | meaning |
|-------|------|---------|
| `outcome` | `'success' \| 'revealed' \| 'fail'` | Did the learner produce an accepted answer *before* revealing? |
| `usedHint` | boolean | Did they request ≥1 cue (drop below the base rung)? |
| `deepestRung` | int (0 = unaided) | Furthest scaffolding rung reached — logged; refines the mapping later. |
| `latencyMs` | int | Time from prompt to unaided success, or to first hint request. |
| `inputMode` | `'typed' \| 'self-attempt'` | Recall-input mode. `self-attempt` ⇒ pass/fail is self-reported (flag for discounting). |
| `correctness` | float 0..1 (reconstruction only) | Fraction of blanks/edges correct. |

### Canonical mapping (card-type agnostic)

1. `outcome === 'revealed'` OR `outcome === 'fail'` → **Again** — the one hard, objective fact.
2. reconstruction AND `correctness < PASS_THRESHOLD` → **Again**
3. reconstruction AND `correctness < 1` (partial rebuild) → **Hard**
4. `success` AND `usedHint` → **Hard**
5. `success` AND `!usedHint` AND `latencyMs / blankCount ≥ SLOW_MS` → **Good**
6. `success` AND `!usedHint` AND `latencyMs / blankCount < SLOW_MS` → **Easy**

**Rationale.** "Again" is pinned to a measurable fact (reveal/fail) — the grade FSRS most
depends on. Hard/Good/Easy is a behavioral proxy for retrieval strength. Latency separates
effortful-but-unaided (**Good**) from fluent (**Easy**) so we reward *memory*, not
hint-taking temperament (Fable R1's confound).

**Amendments (2026-07-04, Fable next-phase review — required before Bundle B):**
- **N1 — no "Easy" on a partly-wrong rebuild.** Rule 3 caps any reconstruction with
  `correctness < 1` at **Hard** (never Good/Easy), even if fast and unaided. Without it, a
  60%-correct neighborhood could earn maximal interval growth — an R1-class illusion of
  competence. `< PASS_THRESHOLD` is still **Again**; `PASS_THRESHOLD..<1` is **Hard**; `= 1`
  flows to the unaided latency split. Monotone and re-gradable, so a higher "Good" bar (e.g.
  ≥0.85) can be introduced later if the logs justify it.
- **N6 — latency normalized by blank count.** For multi-blank cards, "slow" means slow
  *per blank* (`latencyMs / blankCount`), so a 6-blank card isn't judged fluent-vs-slow on
  the same 8s bar as a single recall. `blankCount` defaults to 1 (node-cards unaffected) and
  is logged raw.

### Tunable parameters — store in config, do NOT hard-code (revise after dogfooding)

- `SLOW_MS` — unaided latency cutoff between Good and Easy. Default **8000**.
- `PASS_THRESHOLD` — min reconstruction correctness to count as success. Default **0.6**.
- Later, only if data justifies: multi-tier latency bands, per-rung penalties.

## Hard rules

- **AI never emits or edits the rating.** AI may only (a) generate cue *content* at an
  **app-declared** rung, and (b) return an *advisory* pass/fail for reconstruction. The
  rating is computed by `grade()` from the resulting signals — never by a model.
- **Reconstruction judge is advisory + match-first.** Exact/fuzzy string match first
  (short labels resolve locally, offline); call the AI judge *only* on mismatch. Show its
  verdict with **one-tap override**; the possibly-overridden pass/fail feeds
  `outcome`/`correctness`. Offline or AI-unavailable ⇒ self-confirm, logged as such. (R3)
- **Log raw behavior separately from the derived grade.** Persist every signal above plus
  `hintCount`, per-hint timestamps, `aiVerdictRaw`, `userOverride`, and the derived rating
  — so the mapping can be revised and history **re-graded** later without data loss. (R1)

## Review-log schema addition

`ReviewLog` gains: `deepestRung`, `usedHint`, `hintCount`, `latencyMs`, `inputMode`,
`correctness?`, `aiVerdictRaw?`, `userOverride?`, `wasNew`, `derivedRating`. The older
`scaffoldLevelUsed` field is subsumed by `deepestRung`.

**Reconstruction (Bundle B) additions:** `blankCount?` and
`blanks?: Array<{ edgeId, expected, given, score, pass, overridden }>` — the per-blank detail
is mandatory, not optional: without it reconstruction history can't be **re-graded** (the R1
requirement), and it is exactly the labeled dataset that later decides whether the AI judge
(Bundle C) is worth building.

## Pseudocode

```js
function grade({ outcome, usedHint, latencyMs, correctness, blankCount }, cfg) {
  if (outcome === 'revealed' || outcome === 'fail') return 'Again';
  if (correctness != null && correctness < cfg.PASS_THRESHOLD) return 'Again';
  if (correctness != null && correctness < 1) return 'Hard';       // N1
  if (usedHint) return 'Hard';
  const perBlank = latencyMs / (blankCount || 1);                  // N6
  return perBlank >= cfg.SLOW_MS ? 'Good' : 'Easy';
}
```

## Calibration notes

- Once enough reviews accumulate, **re-fit FSRS weights on the logs** so the scheduler is
  self-consistent with these behavioral grades (Fable R1).
- `self-attempt` means pass/fail is self-reported — keep it flagged so those grades can be
  down-weighted or audited. The "no subjective self-rating" claim holds only for the
  *hint* dimension, not pass/fail (Fable R3).
