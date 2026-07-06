// Starter content for the "Learning Claude" graph (seed-content-learning-claude.md).
// This is SCAFFOLDING for the first session, not gospel — generation is the point,
// so it's loaded only on request and meant to be edited/pruned/extended.

export interface SeedNode {
  key: string; // stable key used to wire edges below
  label: string;
  body: string;
}

export interface SeedEdge {
  source: string; // SeedNode.key
  target: string;
  label: string;
}

export const SEED_TITLE = 'Learning Claude';

export const SEED_NODES: SeedNode[] = [
  { key: 'claude', label: 'Claude', body: "Anthropic's LLM family. Current: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5 — each a point on the capability ↔ speed/cost curve." },
  { key: 'token', label: 'Token', body: 'The unit text is split into. Both billing and context length are measured in tokens, not words or characters.' },
  { key: 'context', label: 'Context window', body: 'The total span of tokens the model can attend to at once (prompt + conversation + output). Fills as a session grows.' },
  { key: 'compact', label: '/compact', body: 'Compresses the conversation into a summary, freeing context tokens while preserving the thread so work continues.' },
  { key: 'cc', label: 'Claude Code', body: "Anthropic's agentic CLI: Claude with tools to read/edit files and run commands to do software tasks." },
  { key: 'claudemd', label: 'CLAUDE.md', body: 'Per-folder instructions file Claude Code reads first; steers behavior, conventions, and rules for that project.' },
  { key: 'skill', label: 'Skill', body: 'A packaged capability invoked as a slash-command (e.g. /render); bundles instructions + scripts for a repeatable task.' },
  { key: 'subagent', label: 'Subagent', body: 'A separate agent instance Claude spawns for a delegated task; its tool output stays out of the main context.' },
  { key: 'mcp', label: 'MCP', body: 'Model Context Protocol — an open standard that connects Claude to external tools and data sources.' },
  { key: 'hook', label: 'Hook', body: 'A shell command the harness runs automatically on an event (e.g. before/after a tool call, on session start).' },
  { key: 'planmode', label: 'Plan mode', body: 'A read-only mode where Claude researches and designs a plan, taking no state-changing actions until approved.' },
  { key: 'perms', label: 'Permissions', body: 'The gate deciding which tools/commands run automatically, prompt for approval, or are denied.' },
  { key: 'tooluse', label: 'Tool use', body: 'How the model acts: it calls functions (read a file, run bash, search) rather than only emitting text.' },
  { key: 'caching', label: 'Prompt caching', body: 'Reuses already-computed context to cut cost/latency on the next turn; the cache has a ~5-minute TTL.' },
  { key: 'workflow', label: 'Workflow', body: 'A script that orchestrates many subagents deterministically (fan-out, pipelines) for large multi-agent tasks.' },
];

export const SEED_EDGES: SeedEdge[] = [
  { source: 'token', target: 'context', label: 'measured within' },
  { source: 'context', target: 'compact', label: 'compacted by' },
  { source: 'compact', target: 'token', label: 'frees' },
  { source: 'caching', target: 'token', label: 'reduces cost of' },
  { source: 'cc', target: 'claude', label: 'is an interface to' },
  { source: 'cc', target: 'claudemd', label: 'reads' },
  { source: 'cc', target: 'skill', label: 'invokes' },
  { source: 'cc', target: 'subagent', label: 'spawns' },
  { source: 'cc', target: 'mcp', label: 'connects via' },
  { source: 'cc', target: 'hook', label: 'runs' },
  { source: 'cc', target: 'perms', label: 'gates actions via' },
  { source: 'mcp', target: 'tooluse', label: 'provides' },
  { source: 'tooluse', target: 'perms', label: 'controlled by' },
  { source: 'planmode', target: 'tooluse', label: 'restricts' },
  { source: 'subagent', target: 'context', label: 'keeps output out of' },
  { source: 'workflow', target: 'subagent', label: 'orchestrates' },
];

/** A loose grid layout so seeded nodes don't stack on the origin. */
export function seedPosition(index: number): { x: number; y: number } {
  const cols = 5;
  return {
    x: 80 + (index % cols) * 260,
    y: 80 + Math.floor(index / cols) * 190,
  };
}
