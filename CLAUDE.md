# learning_app — project instructions

A graph-based spaced-repetition learning tool: **Scapple meets Anki**. You build a
spatial graph of ideas (nodes = concepts, edges = labeled relationships) and study it
with spaced repetition — but **the graph itself is the study surface**. Instead of
flipping flashcards, you *reconstruct the graph from memory*, and the system provides
only as much scaffolding as you need before scheduling the next review.

> Full rationale: see `DECISIONS.md`. Original approved plan:
> `~/.claude/plans/i-d-like-to-build-velvety-hamster.md`.

## The design charge — build as if you are Robert Bjork

Every mechanic in this app must be designed to maximize **durable human learning**, as
if authored by Robert Bjork. When making any product or UX decision, ask: *does this
serve long-term retention, or just short-term ease?* Favor the former. The research
principles this app is organized around:

- **Retrieval practice / testing effect** — the app *tests*, it does not *show*. Recall beats re-reading.
- **Generation effect** — reconstructing knowledge yourself encodes far more strongly than recognizing it.
- **Desirable difficulties** — retrieval should be effortful but successful: start hard, help only as needed.
- **Spacing effect** — handled by the FSRS scheduler.
- **Interleaving** — reviews mix nodes/topics rather than blocking one cluster.
- **Fading scaffolding** — cues are progressively withdrawn as mastery grows.
- **Illusions of competence** — never trust learner self-grading; derive difficulty from *behavior* (how much help was needed).
- **New theory of disuse** — letting retrieval strength drop before review is a feature; FSRS spacing exploits it.

### Generation is sacred (the hard rule)
**Recreating the knowledge is the learning.** The human always builds and rebuilds the
graph. AI may **judge**, **tutor** (give minimal cues), or later **suggest** — but AI
must **never author the graph** for the user. Any AI assist is a nudge, never a
substitute for the user's own generation.

### Parity never overrides the learning design (James, 2026-07-04)
When imitating another tool's *feel* — e.g. **Scapple** for the graph-editing interactions —
**learning-science wins over parity.** Match the external tool only where doing so doesn't
dull retrieval, generation, or desirable difficulty; drop or adapt any behavior that would
(e.g. auto-authoring content, revealing hidden bodies, or making recall easier than it should
be). Familiarity is a convenience, never the goal.

## Architectural constraints (do not drift from these without discussion)

- **Reuse Anki's algorithm, not the Anki app.** Use `ts-fsrs` as a library and own the
  review loop. Do NOT drive AnkiConnect or embed the Anki application.
- **Local-first web app.** React + Vite + TypeScript; React Flow (canvas); `ts-fsrs`
  (scheduler); Dexie/IndexedDB (local storage); Zustand (UI state). No account/server
  in the single-user phase. A desktop build, if ever, is just a Tauri/Electron wrapper.
- **AI roles are non-authoring only:** tutor (adaptive hints that *cue, never reveal*),
  support-scorer (help given → the grade), judge (semantic-match of reconstructions).
  Hints are **hybrid**: instant mechanical cues first (free, offline), AI layered on for
  richer help. Use a fast/cheap Claude model for grading — confirm against the claude-api
  reference before wiring it up.
- **Grading is objective**, derived from scaffolding used — not learner self-rating.
- **Reconstruction is scoped to a bounded due-neighborhood** (a due node + its 1-hop
  connections), never the whole graph — otherwise it isn't spaced retrieval.

## Hosting — GitHub Pages, public repo (James, 2026-07-05)

Hosted at **https://jades1.github.io/learning_app/** via GitHub Pages, built by a
GitHub Actions workflow (`.github/workflows/deploy.yml`) on every push to `main`.
Source lives in the repo; `dist/` stays gitignored (Actions builds it fresh).
`vite.config.ts` sets `base: '/learning_app/'` so assets resolve under the project-page URL.

**Why the repo is PUBLIC** (deliberate, not an oversight): GitHub Pages on a free
account only serves *public* repos — private would require paying for GitHub Pro.
Going public is safe here because the app is **local-first with no secrets**: no
Supabase/API keys, no server, all user data lives in each visitor's own browser
(Dexie/IndexedDB). A public repo exposes only the source code and the seed-content
markdown — nobody's *data* leaks. We chose Pages+public over Netlify (which hosts a
private repo free) because for this app privacy buys little and avoids a third-party
dashboard. Revisit only if secrets (e.g. an AI grading API key) ever land in the repo
— at that point move keys server-side or switch to a private host.

## Working style

- This folder ends in `_app`: keep `README.md`'s `## Features` section current as
  user-facing features land (per the Projects `RULES.md`), and say so when you do.
- Before Supabase auth/redirect work, read `../SUPABASE_NOTES.md` first.
- **Headless verification:** run `npm run test:e2e` to drive the real app in headless
  Chromium (boot → seed → persistence-across-reload → Study) instead of hand-verifying every
  UI change. Extend `tests/smoke.spec.ts` as flows land; keep it off flaky canvas-drag
  coordinate simulation.
- Status: **v1 running.** Built through the node-card spine, Bundle A (stats / backups /
  new-card cap), Bundle B (neighborhood reconstruction), in-canvas study, and a Scapple-feel
  editing pass. See `DECISIONS.md`, `GRADING-CONTRACT.md`, and `USER-GUIDE.md` for current state.
