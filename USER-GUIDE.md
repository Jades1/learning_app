# learning_app — User Guide

*A graph you study by rebuilding it from memory.* This guide has two layers:
**How to use it**, and — in the ﹥ callouts — **Why it's built this way**, the learning
science behind each choice. The "why" matters: this app deliberately makes recall
*effortful*, and you'll stick with a difficulty far better once you know it's the point.

> **Status:** the guide tracks what's actually built. Today that's the **node-card spine**
> plus the **daily-use bundle** (stats, backups, new-card pacing). Sections marked
> **⟶ coming** describe designed-but-not-yet-built features so the picture is honest.

---

## 1. The one big idea

Most study tools *show* you things. This one *tests* you. You build a spatial graph of
ideas — **nodes** (concepts) connected by **labeled edges** (relationships) — and then you
study by **reconstructing it from memory**, with the app giving only as much help as you
actually need before scheduling the next review.

> **Why.** Two of the most robust findings in the science of learning:
> - **Retrieval practice (the testing effect).** *Pulling* knowledge out of memory
>   strengthens it far more than *putting it back in* by re-reading. So the app never shows
>   you the answer until you've tried — and tries to make you try.
> - **The generation effect.** Knowledge you *produce yourself* is encoded much more durably
>   than knowledge you merely recognize. That's why **you** always build and rebuild the
>   graph. The app (and, later, AI) may *judge* or *nudge* — but it will **never author the
>   graph for you.** Generation is the learning; handing it off would delete the benefit.

---

## 2. Two modes: Build and Study

Top-left toggle:
- **Build** — author and arrange your graph.
- **Study** — the app surfaces what's due and tests you. Only lights up when something's due.

> **Why the split.** Building and testing are different cognitive acts. Keeping Study free
> of editing tools stops you from "fixing" a node the instant you blank on it — which would
> quietly convert a retrieval failure (useful) into a re-reading session (much less useful).

---

## 3. Building your graph

- **Add a node:** double-click empty canvas, or click **+ Add node** (top-left). New nodes
  drop straight into editing — just type the label. **⌘/Ctrl+Return** makes another (under
  the selected node, or at center).
- **Select vs. edit:** **single-click selects** a node; **double-click — or just start
  typing — edits** its label in place (the card grows to fit). **Enter** or **Esc** finishes;
  **Esc** with nothing being edited clears the selection.
- **The inspector** (right side, when one node is selected) holds the deeper fields:
  - **Label (prompt)** — what you'll *see* during study. A short cue.
  - **Body (what you recall)** — the hidden target; *never shown on the canvas*.
  - **Recall input** — how you'll answer (see §4).
  - **Color** — an optional category fill (six pastels). Purely yours — it never encodes
    schedule or study state (those stay on the border and glow).
- **Connect nodes:** **drag one node on top of another**; the target **lights up green** —
  release to connect, and the dragged node snaps back. Then type the **relationship** right on
  the new edge. *(You can also drag from the blue dot on a node's side.)* Double-click an edge
  to rename it.
- **Move / nudge:** drag a node to move it; with node(s) selected, **arrow keys nudge**
  (Shift = bigger steps). The spatial layout is yours to keep.
- **Select several:** **click-drag on the empty background** to draw a selection box — every
  node it covers highlights. Drag any selected node to move the whole group.
- **Delete:** select and press **Delete/Backspace** (or the inspector's Delete button). A
  **Undo** toast appears for a few seconds — deleting never loses your review history.
- **Get around:** **two-finger scroll** (or right-drag) to pan; pinch to zoom.

> **Why label vs. body.** The label is the *cue*, the body is the *target* — the same
> structure as a good flashcard, but embedded in a map. Writing a tight label and a precise
> body is itself a generative act that encodes the idea before you ever review it.
> **Why you place the nodes.** Spatial memory is powerful; a layout *you* impose becomes part
> of the memory trace. The app never auto-arranges your graph for the same reason it never
> writes it.
> **Why label the edges.** A concept you can name but can't *relate* to anything is inert.
> Forcing an explicit relationship ("X **enables** Y") is where a lot of real understanding
> lives — and edge labels become their own recall targets later (⟶ coming: reconstruction).

---

## 4. Studying: the review loop

Switch to **Study** (or click the **Study · N** button, where N is how many are due).
**Study happens in place on the graph:** the view centers on the due node (it **glows**), the
rest of the canvas dims, and the controls appear in a **docked bar** at the bottom — not a
blocking pop-up. You recall what's hidden; for a reconstruction you fill the blanked
relationships **right on the edges**.

**Reading the outline colors** (in Build and Study):
- **Red, thick ring, ● dot** → **due**.
- **Dashed grey, ○** → **new**, never studied.
- **Soft/plain** → **resting**, not yet due.

A cluster of red is a decaying region of knowledge you can *see* — a memory heat-map.

> **Why color + a shape/dot, not color alone.** ~8% of people can't reliably distinguish
> red, so "due" is always carried by a weight cue (thicker ring, a dot) as well as color.

**Answering.** Each node uses one of two input modes (you choose per node in Build):
- **Type answer** — you type what you recall and submit; the app checks it against the body
  with a lenient fuzzy match. Good for short key-phrases you want to *produce* exactly.
- **Self-attempt** — you recall it in your head, then reveal to check, and honestly report
  whether you had it. Good for longer or conceptual bodies.

> **Why offer both — and why "produce" is the harder, better default.** Typing forces *overt
> production* (hardest, best encoding). Self-attempt is a pragmatic option for prose you can't
> reasonably type verbatim — but it reintroduces a *self-report* of pass/fail. The app knows
> this: it **logs which mode you used**, so self-reported grades can be trusted less. Honesty
> with yourself on "I had it / I missed it" is what makes self-attempt work.

**When you're stuck — "Need a hint".** Hints are **pull, not push**: the app never volunteers
one. Each click drops one rung down a **scaffolding ladder** and fills the **Support meter**:

1. **Slot shown** — the answer's shape as blanks (word lengths).
2. **First letters** — the first letter of each word.
3. **First half** — the opening half of the text.

Beyond that, the only option is **Reveal answer**.

> **Why hints cost you (this is the core mechanic).** This is *desirable difficulty* and
> *fading scaffolding* in action: start with the hardest version (free recall) and add the
> **least** help that unblocks you. The Support meter isn't decoration — **how much help you
> needed is how the app grades you** (§5). So a hint isn't free: it's an honest signal that
> this memory is weaker and should come back sooner. Pulling a hint only when genuinely stuck
> keeps the difficulty *desirable* — effortful but successful.

### Two kinds of review: recall a node, or rebuild its connections

Each node can be studied two ways, each on its **own** schedule:
- **Body card** — recall the node's hidden body (everything above).
- **Connections card** — **reconstruct the node's relationships** to its neighbors from
  memory. This is *neighborhood reconstruction*, the purest generation task in the app.

**How a reconstruction works.** The due node's label is shown, and so are its 1-hop
neighbors — but the **relationships between them are blanked**. You fill in each edge label
("Claude Code —[ ? ]→ Skill") from memory, then **Submit**. Each blank is checked locally
(the same fuzzy match as typed cards); for anything marked wrong you can tap **"I meant the
same"** to count a synonym as correct — your honest call, logged as an override. Same hint
ladder and Support meter as node-cards; **Reveal answers** counts the review as *Again*.

A connections card only enters study once its node has **at least two labeled edges** (below
that it's just a single-edge flashcard). If a node has many connections, a bounded sample is
shown per review — never the whole graph.

> **Why reconstruct relationships, not just facts?** Isolated facts are brittle; knowledge
> lives in the *connections* between ideas. Rebuilding the links — "how does this relate to
> that?" — is a harder, more generative act than recalling a definition, and it's what turns
> a pile of nodes into a structure you can reason with. It's deliberately scoped to a small
> **due neighborhood** (a node + its immediate neighbors), never the whole map: reconstructing
> everything at once wouldn't be *spaced* retrieval and would just overwhelm you.
> **Why partial credit is capped at "Hard."** If you get 70% of a neighborhood right, the app
> will never grade that **Easy** — a partly-wrong rebuild that earned a long interval is
> exactly the illusion of competence we're guarding against. Full and unaided → Good/Easy;
> anything less than perfect → at best Hard; below the pass line → Again.
> **Why the synonym override is yours, not the app's.** Offline, a string match can't tell
> "causes" from "leads to." Rather than wrongly fail you (which would nuke a healthy
> interval), the app shows the expected label and lets *you* judge whether you meant the same
> — and logs every such call, so we can later measure how often it's needed before deciding
> whether an AI judge is even worth adding.

---

## 5. How grading works (the honest part)

You are **never** asked to rate yourself "Again / Hard / Good / Easy." Instead the app
**derives** the grade from what you *did*:

| What happened | Grade |
|---|---|
| You revealed the answer, or failed | **Again** |
| You succeeded, but used a hint | **Hard** |
| You succeeded unaided, but slowly | **Good** |
| You succeeded unaided and quickly | **Easy** |

("Slow" vs "fast" is a latency cutoff, ~8s, tunable.)

> **Why not let you grade yourself?** Because self-assessment is systematically unreliable —
> the **illusion of competence**. Fluent-feeling material ("yeah, I knew that") is often
> poorly retained, and a subjective 1–4 rating imports that bias straight into the scheduler,
> which then mis-times *every future review*. So:
> - **"Again" is pinned to an objective fact** — you revealed or failed. That's the one grade
>   the scheduler most depends on, and the one we can measure without opinion.
> - **Latency separates memory from temperament.** A stubborn learner who struggles then
>   succeeds unaided earns **Easy**; a quick hint-tapper with identical memory would otherwise
>   look "harder." Timing unaided success stops us from grading your *hint-taking habit*
>   instead of your *memory*.
> - **AI never assigns the grade.** Even when AI help arrives later (as a hint-writer or a
>   match-checker), the grade stays a *pure, deterministic function of your behavior* — same
>   behavior, same grade, every time. A model grading its own helpfulness would inject
>   day-to-day noise into a months-long schedule and make your intervals undebuggable.
> - **Raw behavior is logged separately from the grade.** Every hint, timestamp, latency, and
>   input mode is stored alongside the derived rating — so if we improve the grading rule
>   later, your whole history can be **re-graded** without data loss.

*(This deterministic contract is the single most important design decision in the app; it was
tightened after a top-tier design review specifically to stop the scheduler from being
silently corrupted.)*

---

## 6. Scheduling: why reviews come back when they do

After each review the app schedules the next one using **FSRS** (the same algorithm behind
modern Anki). Easy recalls push the next review far out; an "Again" brings it back soon. The
panel shows the next due time ("next in 3 days"); the node's outline updates.

> **Why let memories fade before reviewing?** The **spacing effect** and the **new theory of
> disuse**: a little forgetting *before* you review is a feature, not a bug. Reviewing right
> before you'd fail produces the biggest durability gain, so the schedule deliberately lets
> retrieval strength drop. Cramming feels productive and isn't.
> **Why the order feels mixed (interleaving).** Study jumps between unrelated nodes rather than
> drilling one cluster. Interleaving is harder in the moment but builds more flexible, durable
> knowledge than blocking.
> **Sibling burying & day rollover.** A node's two cards (body and connections) won't both
> review the same day — reviewing one refreshes the other and would fool the scheduler, so
> the second is held to another day. "Due today" uses a 4am day boundary, matching Anki.

---

## 7. New-cards/day cap

Only a limited number of **brand-new** nodes enter study each day (default **10**,
configurable). Cards you've already started are never capped.

> **Why cap new cards?** Introducing everything at once buries you and — worse — dumps a pile
> of low-quality, first-exposure data into the scheduler that pollutes its estimates. A steady
> trickle keeps sessions humane and keeps spacing meaningful. (This pacing is also what makes
> it safe to seed a large graph and B's forthcoming second card type without an avalanche.)

---

## 8. Progress / Stats

Toolbar → **Stats**. A read-only view of your review log: due now, reviews today and
all-time, **retention** (share recalled without a reveal/fail), the New/Learning/Review
breakdown, your all-time rating mix, storage used, and last-backup age.

> **Why it's read-only, and a caution.** The review log *is* the product — there's
> deliberately no "clear history" button to fumble. And treat retention as a *thermometer,
> not a target*: if it's very high you may be reviewing too soon (not enough desirable
> difficulty); a healthy amount of "Again" means you're studying at the productive edge of
> forgetting. Don't optimize the number — optimize honest recall.

---

## 9. Keeping your data safe

Everything lives locally in your browser (IndexedDB) — no account, no server, fully offline.

- **Persistence** — on load the app asks the browser to make storage persistent; the toolbar
  dot shows whether it was granted.
- **Export / Import** — **Export** downloads a full JSON backup; **Import** restores one
  (replacing current data). A **nudge** appears if you haven't backed up in a while.

> **Why nag about backups?** Browsers *evict* script-storage under pressure or after periods
> of non-use (Safari is aggressive here). For a spaced-repetition tool, losing the
> longitudinal log resets every interval and destroys the data the scheduler learns from — so
> a periodic exported backup is the real safety net, not an afterthought.

---

## 10. Why the app is shaped this way — the short version

Every mechanic is chosen to serve **durable** learning over **easy-feeling** learning
(designed as if by memory researcher Robert Bjork):

- **It tests, it doesn't show** — retrieval practice.
- **You build it; nothing is authored for you** — the generation effect.
- **Start hard, help only as needed, fade the help** — desirable difficulties + fading
  scaffolding.
- **Reviews are spaced and interleaved, and let memory fade first** — spacing + the new
  theory of disuse.
- **Grades come from behavior, never self-rating, never AI** — defeating the illusion of
  competence and keeping the scheduler trustworthy.
- **Raw behavior is logged, so grading can be improved and history re-graded** — the method
  stays honest and revisable.

### Notable decisions & why they changed
- **AI never grades** *(design-review fix)* — an AI scoring its own hint's helpfulness is an
  unauditable loop that would inject noise into a months-long schedule. Grading is a pure
  function of behavior instead.
- **"Again" = reveal-or-fail** — anchoring the most important grade to an objective event, not
  a feeling.
- **Latency in the grade** — so we measure memory, not your hint-taking temperament.
- **Export & storage-persistence shipped early, not "later"** — the log is irreplaceable, so
  data safety couldn't wait.
- **New-card cap defaulted low** — to protect spacing and avoid flooding the scheduler with
  first-exposure noise.

---

## 11. What's coming (designed, not yet built)

- **⟶ AI as an advisory judge (Bundle C).** For reconstruction only, and only when local
  matching is ambiguous: an AI *suggests* whether your paraphrase means the same thing — with
  one-tap override, offline fallback, and **never** touching the grade. Held until the
  override-rate data shows it's actually needed.
- **⟶ AI authoring *suggestions*** — optional prompts for related nodes or edge labels you
  accept, edit, or reject. A nudge, never an author.

*This guide is updated as each feature lands.*
