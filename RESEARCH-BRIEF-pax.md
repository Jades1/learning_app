# Research brief for Pax — learning_app

**Handoff packet.** Execute in a fresh window (full token budget), either by opening a
session in `myPKA-main/` and routing to Pax, or by spawning a Claude Code subagent seeded
with Pax's contract (`Team/Pax - Researcher/AGENTS.md`). Apply Pax's cross-source
verification protocol: every claim gets a real source; distinguish "exists" from "is
established." Save findings back into `learning_app/` (e.g. `research-findings.md`).

## Part A — Learning-science (Bjork) verification

Confirm each principle the app relies on, with a citation, and flag anything contested:

1. **Testing effect / retrieval practice** — Roediger & Karpicke (2006) and follow-ups.
2. **Generation effect** — Slamecka & Graf (1978); scope and limits.
3. **Desirable difficulties** — Bjork & Bjork (2011), "Making things hard on yourself,
   but in a good way." Get the precise definition.
4. **Spacing effect** — core evidence; and how FSRS operationalizes it.
5. **New theory of disuse** (storage vs. retrieval strength) — Bjork & Bjork (1992).
6. **Metacognitive illusions of competence** — Kornell & Bjork; supports our
   behavior-derived (not self-reported) grading.
7. **Fading scaffolding / expanding retrieval** — Landauer & Bjork (1978). **Important:**
   some later work questions whether *expanding* intervals beat uniform spacing — verify
   the current consensus before we lean on it.

### Design principle (RESOLVED by James — not for Pax)
Hints are **pull, not push**: shown only when the learner is stuck and *asks*, and always
the **least hint that elicits retrieval**. The app never volunteers a hint. Because cues
are opt-in and minimal by construction, retrieval stays effortful — so this is settled by
design and does **not** need empirical adjudication. Pax can skip it.

## Part B — Library / tech choices

For each, report: maintenance status, license, fit, and a recommendation.

1. **FSRS in JS** — `ts-fsrs` (aka the `open-spaced-repetition/ts-fsrs` project):
   maintained? license? parity with Anki's FSRS? Confirm it exposes the 4-point rating
   (Again/Hard/Good/Easy) and scheduling we need.
2. **Rating mapping** — how should "scaffolding used" map onto FSRS's 4-point rating? Is
   there precedent for behavior-derived ratings, or do we need a custom mapping?
3. **Graph canvas** — React Flow (`@xyflow/react`) vs Cytoscape.js vs Sigma.js, judged on:
   rich *custom React node* components (we need hide/reveal/scaffold states), edge labels,
   performance at a few hundred nodes, and license.
4. **Local-first storage** — Dexie.js (IndexedDB) for MVP; note a clean upgrade path to
   sync later (RxDB / PouchDB / Supabase) without a rewrite.
5. **AI grading model** — cheapest/fastest current Claude model for low-latency semantic
   match (candidate: Haiku 4.5). **Confirm against the `claude-api` skill reference** for
   the exact model id and pricing before wiring.

## Deliverable
A short `research-findings.md`: per item a verdict + source; and a clear GO / RECONSIDER
on the core "scaffolding-as-grade" mechanic based on Part A's design-critical question.
