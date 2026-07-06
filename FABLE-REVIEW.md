# Fable architecture review — learning_app

Top-tier (Fable) review of the approved plan + `DECISIONS.md`, run 2026-07-04 before any
code. Verbatim findings preserved below — **fold R1–R5 into the plan and `DECISIONS.md`
at reset.** This review caught a real design error (AI emitting the grade — R1) that was
baked in during Opus-tier planning; it's the reason the tier-check now matters.

## Verdict: GO-WITH-CHANGES

Foundation is right (ts-fsrs as a library, React Flow, Dexie, local-first). But the
grading contract between the novel mechanic and FSRS is underspecified in a way that will
silently corrupt scheduling; one stated AI role should be killed; and there's a real
data-loss trap not previously flagged.

## Risks (ranked)

### R1 (highest) — AI must NOT assign the grade
Deriving ratings from *behavior* does **not** fundamentally break FSRS: its dominant fork
is binary (Again/lapse vs. success); Hard/Good/Easy are secondary multipliers; FSRS was
fit on noisy self-ratings anyway, so a monotone behavioral proxy is plausibly *less*
biased (and you can re-fit FSRS weights on your own logs later). The idea survives — but
only under three conditions the plan doesn't guarantee:

1. **The mapping must be deterministic and stable.** Decision 10's "AI support-scorer
   quantifies how much help it gave → the grade" is an unauditable loop: a
   non-deterministic model grades its own hint's helpfulness, driving a months-long
   scheduler → same performance, different grade on different days → noise in
   stability/difficulty, undebuggable intervals. **Fix: AI never emits a grade.** Each AI
   hint is generated *at a declared rung* ("produce an L2-strength cue"); the ladder
   position is chosen mechanically; AI only fills in cue content. Grade = pure function of
   (deepest rung used, pass/fail, optionally latency).
2. **"Again" pinned to a hard fact:** answer revealed or judge-fail. That's the grade
   FSRS actually cares about and the one you can measure objectively.
3. **The missed confound:** hints change the *retrieval event*, not just the measurement.
   "Hard" here = retrieval under a *stronger cue* (weaker memory update than the grade
   implies). And hint-seeking is a *policy*, not a memory readout: a stubborn learner who
   struggles then succeeds unaided grades "Easy"; a quick hint-tapper with identical
   memory grades "Hard" — you're partly measuring temperament. **Fix: add latency to the
   mapping** (fast unaided → Easy, slow unaided → Good, cued success → Hard, reveal/fail →
   Again) and **log raw behavior (rung, timestamps, verdict) separately from the derived
   grade** so the mapping is revisable and history re-gradable. Expect to tune it after
   weeks of dogfooding — design for that, don't hard-code it.

### R2 — IndexedDB eviction can destroy months of review history (fatal for SRS)
Safari ITP caps script-writable storage at ~7 days of non-use; Chrome evicts under
pressure unless persistence is granted. For an SRS app the longitudinal review log **is**
the product — losing it resets every interval and destroys FSRS fitting data. **Fix
(milestone 2, not later):** `navigator.storage.persist()`; JSON export/auto-backup (File
System Access API or periodic download nudge) from the first persistent build; Dexie
schema versioning from day one. Export was marked "defaultable" — it's the data-safety
mechanism, pull it forward.

### R3 — AI judge in the hot review loop: latency, false verdicts, contradicts local-first
A network AI call (via a proxy holding a key) in the path of *every* reconstruction grade.
**False GO** (fluent-but-wrong paraphrase accepted → intervals too long → the exact
illusion-of-competence the design exists to kill); **false RECONSIDER** (correct
paraphrase rejected → spurious Again nukes a healthy interval); 1–3s latency breaking the
"glide to next node" feel; non-determinism; breaks offline. **Fix:** (a) judge is
*advisory* — verdict shown with one-tap override (doubles as labeled calibration data);
(b) exact/fuzzy string match first, AI only on mismatch (edge labels are short — most
resolve locally); (c) prefetch the judge call while the learner still types; (d) offline
fallback = self-confirm, honestly logged. Also: Decision 6's "self-attempt-then-reveal"
already reintroduces self-grading for pass/fail — the support meter only objectifies the
*hint* dimension. Acceptable for v1, but the plan **overclaims** "no subjective
self-rating." Log recall-input mode per review so those grades can be discounted later.

### R4 — MVP scope: "both study units" ≈ 60% of the build for unit #2
Neighborhood reconstruction as specced is *three* canvas interactions (draw-from-blank,
fill-the-blank, assemble-from-palette), each needing its own UI, grading rule, and
partial-credit policy. **Fix: keep reconstruction in MVP but ship exactly one mode —
fill-the-blank** (structure shown, labels hidden): cheapest to build, easiest to grade
(short-label matching), still genuine cued generation. Draw-from-blank → v1.1. Separately,
**the AI tutor (adaptive hints) is the most speculative, least load-bearing component —
defer it entirely.** Mechanical rungs are a complete ladder alone, and cutting the tutor
makes the whole v1 review loop offline-capable, restoring the local-first claim.

### R5 (minor, decide now) — sibling-card interference
A node's `body` and `connections` cards test the same underlying memory; reviewing one
refreshes the other, violating FSRS independence (Anki's sibling problem). **Fix:** bury
siblings same-day (never both cards of a node in one session) — one line of scheduler
logic, but record it. Also small-but-undecided: day-rollover/timezone for "due" and
overdue handling — pick Anki-compatible defaults and write them down.

## Cut / defer for a leaner MVP
- **Cut from v1:** AI tutor hints (mechanical rungs only); AI support-scorer (replaced by
  deterministic mapping — cut permanently); draw-from-blank + palette modes (fill-the-blank
  only); AI judge for node-cards where typed key-phrase + fuzzy match suffices.
- **Pull forward into v1:** JSON export + `storage.persist()`; raw behavioral logging
  (rung, latency, verdict, input-mode) alongside the derived grade.
- **True minimum spine:** graph editor → node-cards with mechanical ladder → deterministic
  grade mapping → ts-fsrs → Dexie + export. A novel, complete product on its own.

## The one thing to fix before writing code
**Write the grading contract as a spec:** a single deterministic function
`(deepest rung used, outcome, latency, input-mode) → {Again | Hard | Good | Easy}`, with
*Again ≡ reveal-or-fail* pinned, AI barred from ever emitting a grade, and raw behavior
logged separately so the mapping is revisable retroactively. Every component (ladder UI,
judge, scheduler, review-log schema) consumes this contract — it's the interface between
the novel mechanic and FSRS, and currently the vaguest part of an otherwise solid plan.

## FSRS foundation
ts-fsrs over Anki/AnkiConnect is **unambiguously right** — AnkiConnect would force Anki's
note/review model and a running desktop app under a custom canvas (worst of both worlds).
The only cost of owning the loop is owning Anki's solved edge cases (learning steps, fuzz,
sibling burying, day rollover) — small, but that's where R5 and the undecided defaults live.
