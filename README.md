# learning_app

**Scapple meets Anki** — a graph-based spaced-repetition learning tool where you build a
spatial graph of ideas and study it by *reconstructing it from memory*. The graph itself
is the study surface: due nodes light up, you recall or rebuild them, and the app gives
only as much scaffolding as you need before scheduling the next review (FSRS). Designed
around Robert Bjork's principles of durable learning.

> **Status: v1 running (offline).** Built: graph editor, node-card review with a mechanical
> scaffolding ladder, **neighborhood reconstruction** (fill-the-blank), deterministic
> grading, FSRS scheduling, a progress/stats view, and Dexie persistence with JSON export +
> backup nudges. Fully offline — no server, no account, no AI in the loop.
>
> **New here?** Read `USER-GUIDE.md` — it explains how to use the app *and why each feature
> is built the way it is* (the learning science). See also `DECISIONS.md` for rationale,
> `GRADING-CONTRACT.md` for the grade mapping, `CLAUDE.md` for the design charge, and the
> full plan at `~/.claude/plans/i-d-like-to-build-velvety-hamster.md`.

## Run it

```
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build
npm run test:e2e  # headless Playwright smoke test (boot → seed → reload → study)
```

## Stack

React + Vite + TypeScript · React Flow (`@xyflow/react`, canvas) · `ts-fsrs` (scheduler) ·
Dexie/IndexedDB (local-first storage) · Zustand (UI state). v1 is **fully offline** — no
server, no account, no AI in the loop.

## Features

- **Spatial graph editor (Scapple-like feel)** — double-click to add a node; **drag a node
  onto another to connect** (the target lights up); **single-click selects, double-click or
  just type to edit**; **background click-drag marquee-selects**; arrow-key nudge, ⌘/Ctrl+Return
  for a new node, Delete with an **undo** toast; per-node **category colors**. Inline label and
  relationship editing on the canvas. A calm, low-chrome dot-grid canvas; pan with two-finger
  scroll.
- **Local-first persistence** — your graph, cards, and full review history are stored in
  IndexedDB (Dexie) and survive refreshes. `navigator.storage.persist()` is requested on
  load to resist eviction; a status dot shows whether persistence was granted.
- **JSON export / import** — one-click backup of everything (the review log *is* the
  product), and restore from a backup file. Schema is versioned from day one. A backup
  reminder nudges you if it's been a while (or you've never exported).
- **Progress / stats view** — a read-only window on the review log: due count, reviews
  today and all-time, retention, the New/Learning/Review card breakdown, all-time rating
  mix, storage used, and last-backup age.
- **New-cards/day cap** — the pacing machinery (cap new-card introductions per day, review
  cards never capped) is built and tested, but **currently uncapped by default** during early
  dogfooding; a sensible default is set later once the flow is felt.
- **In-canvas study** — study happens *in place on the graph*: the due node glows, the view
  centers on it, the rest dims, and controls sit in a docked bar (no blocking modal). Study
  mode interleaves across the graph. Recall the hidden body by typing (auto-matched) or by
  self-attempt-then-check, chosen per node.
- **Neighborhood reconstruction** — a node's second card type: its 1-hop neighbors are shown
  with the **relationships blanked as inputs on the edges**, and you rebuild the edge labels
  from memory (fill-the-blank), right on the canvas. Scored locally on fraction-correct, with
  a one-tap **"I meant the same"** synonym override; eligible once a node has ≥2 labeled
  edges; bounded to a sampled neighborhood, never the whole graph.
- **Mechanical scaffolding ladder** — pull-only "Need a hint" steps down cues (slot shown →
  first letters → first half) with a Support meter tracking how much help you used. Fully
  offline; **no AI tutor** in v1.
- **Behavioral, deterministic grading** — the FSRS rating is computed by a pure `grade()`
  function from *behavior* (reveal/fail → Again; latency splits Good/Easy; a partly-correct
  reconstruction is capped at Hard), never by self-rating or AI. Raw behavior (rung, hint
  timestamps, latency, input mode, per-blank detail, override) is logged separately from the
  derived grade so the mapping can be revised and history re-graded.
- **FSRS scheduling** — `ts-fsrs` drives spacing; a node's two cards are buried so they never
  both review the same day (even across sessions); Anki-compatible 4am day rollover.

### Deferred (planned, not yet built)

- AI as advisory semantic judge (match-first, one-tap override) and AI authoring
  *suggestions* — never as author or grader.
