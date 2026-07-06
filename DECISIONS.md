# Decision log — learning_app

Why this app is built the way it is. Captured during the planning conversation
(2026-07-04). The approved plan lives at
`~/.claude/plans/i-d-like-to-build-velvety-hamster.md`.

## The problem / vision

A learning tool where you build a **spatial graph** of ideas and study it with spaced
repetition, but where **the graph itself is the study surface**. You don't flip
context-free flashcards — you *reconstruct the graph from memory*, and the system adds
scaffolding only until you can recall, then schedules the next review. Designed
throughout as if by Robert Bjork, to maximize durable learning.

## Decisions

1. **Reuse Anki's *algorithm*, not the Anki *app*.** The valuable, hard part of Anki is
   its scheduler (FSRS). Anki-the-application is a poor host for a spatial graph and
   forces its own note/review model; driving it via AnkiConnect gives the worst of both
   worlds. → Use FSRS as a standalone library (`ts-fsrs`) and own the review loop. This
   is the only way "the graph is the study surface" works.

2. **Web app, not desktop.** Easier sharing later (a URL vs. per-OS installers +
   code-signing), faster iteration, and the graph + FSRS libraries are all JavaScript. A
   desktop version would just be an Electron/Tauri wrapper around the same code. →
   **Local-first web app**: runs in-browser with local storage, no account/server in the
   single-user phase; a backend is added only when others use it.

3. **Review mechanic = graph reconstruction with adaptive fading scaffolding**, not
   card-flipping. This is the core differentiator and the Bjork-grounded heart of the app.

4. **Personal tool for James first**, with a clean, user-agnostic data model so it can
   grow to multi-user later.

5. **Greenfield content.** No Anki import for MVP. First test graph: **"Learning Claude."**

6. **Recall input is hybrid / per-node.** Some nodes recalled by typing a key phrase
   (overt production), others by self-attempt-then-reveal — chosen per node.

7. **MVP includes both study units:** *node-cards* (recall a hidden body) AND
   *neighborhood reconstruction* (rebuild a node's connections). Build node-cards first
   as the working spine, reconstruction immediately after — both ship in v1.

8. **Content is human-authored; AI only suggests.** Manual node/edge authoring is the
   point (generation effect). AI suggestions (later) are accept/edit/reject nudges, never
   auto-building.

9. **Reconstruction scope is a bounded due-neighborhood** (James's catch): a due node +
   its 1-hop connections only, never the whole graph — otherwise it isn't spaced
   retrieval and it overloads the learner. FSRS drives which local regions come due.

10. **AI in the MVP has three non-authoring roles:** *tutor* (adaptive hints tuned to
    where the learner is stuck), *support-scorer* (help given → the grade — **SUPERSEDED, see Revisions: AI never grades**), *judge*
    (semantic-match the final recall/reconstruction). Guardrails: hints **cue, never
    reveal**; support is **hybrid** (instant mechanical cues as a free/offline baseline,
    AI layered on for richer help); use a fast/cheap Claude model, confirmed against the
    claude-api reference. AI *authoring suggestions* remain a later feature. **Hint discipline:** hints are *pull,
    not push* — shown only when the learner is stuck and asks, and always the least hint
    that elicits retrieval; the app never volunteers one.

11. **Each node carries up to two independently scheduled cards:** a `body` card and a
    `connections` card, each enabled per node with its own FSRS schedule.

## Deferred / defaultable (not blocking)

New-card daily introduction rate, multiple graphs/subjects, and export/portability —
sensible defaults at build time (one graph, a modest new-cards/day cap, JSON export),
overridable later.

## The core mechanic in one paragraph

A review targets a due card. You reconstruct from memory (free recall = hardest). When
stuck, "Need a hint" fades in scaffolding — instant mechanical cues first (slot,
first-letters, show neighbors), then AI-generated adaptive cues that *jog* retrieval
without revealing the answer. A **Support meter** tracks how much help you needed, and
**that meter is your grade** (no biased self-rating) — fed to FSRS to schedule the next
review. For reconstruction, the scaffolding fade is literally *draw-from-blank →
fill-the-blank → assemble-from-palette*, and an AI judge semantically checks the result.

## Revisions (2026-07-04, Fable review)

A top-tier review returned GO-WITH-CHANGES (full text: `FABLE-REVIEW.md`). These supersede
conflicting text above:

- **R1 (grading):** AI never emits the grade. The FSRS rating is a deterministic function
  of behavior — see `GRADING-CONTRACT.md`. "Again" ≡ reveal-or-fail; latency splits
  Good/Easy; log raw behavior separately from the derived grade.
- **R2 (data safety):** ship `storage.persist()` + JSON export + Dexie schema versioning
  in milestone 2 — the review log is the product; don't defer export.
- **R3 (judge):** AI judge is advisory + match-first (exact/fuzzy first, AI on mismatch,
  one-tap override, offline self-confirm). "No self-rating" holds only for the hint
  dimension — self-attempt still self-reports pass/fail; log input mode.
- **R4 (scope):** MVP reconstruction = **fill-the-blank only** (draw/palette → v1.1); the
  **AI tutor is deferred** (mechanical cues only ⇒ fully offline v1).
- **R5 (scheduler):** bury siblings same-day; pick Anki-compatible day-rollover + overdue
  defaults.

## Build log & next-phase review (2026-07-04)

Built in order: the **node-card spine** (editor → mechanical ladder → deterministic grade →
ts-fsrs → Dexie + export), then **Bundle A** (stats view, export nudge, storage readout,
new-cards/day cap), then **Bundle B** (neighborhood reconstruction, fill-the-blank). A second
top-tier (Fable) review of the A/B/C plan returned **GO-WITH-CHANGES**; its amendments are
folded in:

- **N1 (grade):** a reconstruction with `correctness < 1` is capped at **Hard** (never
  Good/Easy) — no long interval on a partly-wrong rebuild. Written into `GRADING-CONTRACT.md`.
- **N6 (grade):** latency is normalized by `blankCount` so multi-blank cards aren't judged
  "slow" for having more to fill.
- **N3 (scheduler):** sibling burying is now **same-day across sessions** (nodes reviewed
  today are excluded), not just per-queue.
- **N5 (data):** Bundle B ships via a **Dexie v2 upgrade** that backfills a `connections`
  card per node non-destructively; reconstruction eligibility is a **queue-time gate** (degree
  ≥ 2 labeled edges), so FSRS state is never deleted. Per-blank detail is logged (`blanks[]`)
  so history is re-gradable and to serve as calibration data.
- **New-cards/day cap:** machinery built + tested, but **uncapped by default** for now
  (James's call — don't impose a pacing default before dogfooding reveals the right one).
- **Bundle C (AI judge) remains held**, now *data-gated* on B's override-rate logs, not just
  sequencing.

