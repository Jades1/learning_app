# Seed content — "Learning Claude" graph

Starter content for the first graph, to dogfood the study loop (MVP milestone 6). Maps
to the data model in `DECISIONS.md`: each **node** has a `label` (prompt) + `body` (what
you recall); each **edge** is `source —label→ target`. This is a *starter* — James
should edit, prune, and add, since **generation is the point**. Treat it as scaffolding
for the first session, not gospel.

## Nodes

| # | label | body (recall target) |
|---|-------|----------------------|
| 1 | **Claude** | Anthropic's LLM family. Current: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5 — each a point on the capability ↔ speed/cost curve. |
| 2 | **Token** | The unit text is split into. Both billing and context length are measured in tokens, not words or characters. |
| 3 | **Context window** | The total span of tokens the model can attend to at once (prompt + conversation + output). Fills as a session grows. |
| 4 | **/compact** | Compresses the conversation into a summary, freeing context tokens while preserving the thread so work continues. |
| 5 | **Claude Code** | Anthropic's agentic CLI: Claude with tools to read/edit files and run commands to do software tasks. |
| 6 | **CLAUDE.md** | Per-folder instructions file Claude Code reads first; steers behavior, conventions, and rules for that project. |
| 7 | **Skill** | A packaged capability invoked as a slash-command (e.g. `/render`); bundles instructions + scripts for a repeatable task. |
| 8 | **Subagent** | A separate agent instance Claude spawns for a delegated task; its tool output stays out of the main context. |
| 9 | **MCP** | Model Context Protocol — an open standard that connects Claude to external tools and data sources. |
| 10 | **Hook** | A shell command the harness runs automatically on an event (e.g. before/after a tool call, on session start). |
| 11 | **Plan mode** | A read-only mode where Claude researches and designs a plan, taking no state-changing actions until approved. |
| 12 | **Permissions** | The gate deciding which tools/commands run automatically, prompt for approval, or are denied. |
| 13 | **Tool use** | How the model acts: it calls functions (read a file, run bash, search) rather than only emitting text. |
| 14 | **Prompt caching** | Reuses already-computed context to cut cost/latency on the next turn; the cache has a ~5-minute TTL. |
| 15 | **Workflow** | A script that orchestrates many subagents deterministically (fan-out, pipelines) for large multi-agent tasks. |

## Edges (relationships)

- Token —`measured within`→ Context window
- Context window —`compacted by`→ /compact
- /compact —`frees`→ Token
- Prompt caching —`reduces cost of`→ Token
- Claude Code —`is an interface to`→ Claude
- Claude —`comes in tiers`→ (Opus/Sonnet/Haiku/Fable) *(consider splitting into per-tier nodes later)*
- Claude Code —`reads`→ CLAUDE.md
- Claude Code —`invokes`→ Skill
- Claude Code —`spawns`→ Subagent
- Claude Code —`connects via`→ MCP
- Claude Code —`runs`→ Hook
- Claude Code —`gates actions via`→ Permissions
- MCP —`provides`→ Tool use
- Tool use —`controlled by`→ Permissions
- Plan mode —`restricts`→ Tool use
- Subagent —`keeps output out of`→ Context window
- Workflow —`orchestrates`→ Subagent

## Suggested card types (per node)

- **body cards** (recall the definition): all nodes.
- **connections cards** (reconstruct the 1-hop neighborhood): the hubs — Claude Code (#5),
  Context window (#3), Token (#2) — these have the richest connectivity and make the best
  reconstruction targets.
