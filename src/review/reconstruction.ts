// Neighborhood reconstruction (Bundle B) — pure helpers for building a fill-the-blank
// task and scoring it fully offline. No AI: each edge label is judged by the same local
// fuzzy match as typed node-cards. The human reconstructs every relationship (generation
// is sacred); the app only checks.
import type { BlankResult, GEdge, GNode } from '../types';
import { checkMatch } from './match';

export interface Blank {
  edgeId: string;
  /** The edge label to recall. */
  expected: string;
  fromLabel: string;
  toLabel: string;
  /** The node on the other end of this edge from the due node. */
  neighborId: string;
  neighborLabel: string;
  /** True if the edge points FROM the due node TO the neighbor. */
  outgoing: boolean;
}

export interface ReconTask {
  nodeId: string;
  nodeLabel: string;
  blanks: Blank[];
  /** True if incident edges were sampled down to the cap (coverage rotates over reviews). */
  sampled: boolean;
  totalIncident: number;
}

/** Labeled edges incident to a node (either direction). Unlabeled edges aren't recall
 *  targets, so they never become blanks and don't count toward eligibility. */
export function labeledIncidentEdges(nodeId: string, edges: GEdge[]): GEdge[] {
  return edges.filter(
    (e) => (e.source === nodeId || e.target === nodeId) && e.label.trim() !== '',
  );
}

/** Reconstruction eligibility degree = number of labeled incident edges. */
export function reconDegree(nodeId: string, edges: GEdge[]): number {
  return labeledIncidentEdges(nodeId, edges).length;
}

export function buildReconTask(
  node: GNode,
  edges: GEdge[],
  nodes: GNode[],
  maxBlanks: number,
): ReconTask {
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? '?';
  // Deterministic order by edge id so the same review is reproducible.
  const incident = labeledIncidentEdges(node.id, edges).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const chosen = incident.slice(0, maxBlanks);
  const blanks: Blank[] = chosen.map((e) => {
    const outgoing = e.source === node.id;
    const neighborId = outgoing ? e.target : e.source;
    return {
      edgeId: e.id,
      expected: e.label,
      fromLabel: labelOf(e.source),
      toLabel: labelOf(e.target),
      neighborId,
      neighborLabel: labelOf(neighborId),
      outgoing,
    };
  });
  return {
    nodeId: node.id,
    nodeLabel: node.label,
    blanks,
    sampled: incident.length > chosen.length,
    totalIncident: incident.length,
  };
}

/** Score one filled blank against its expected label (offline). Empty = wrong. */
export function scoreBlank(blank: Blank, given: string, threshold: number): BlankResult {
  const g = given.trim();
  if (g === '') {
    return { edgeId: blank.edgeId, expected: blank.expected, given: '', score: 0, pass: false, overridden: false };
  }
  const { pass, score } = checkMatch(g, blank.expected, threshold);
  return { edgeId: blank.edgeId, expected: blank.expected, given: g, score, pass, overridden: false };
}

/** Fraction correct, counting one-tap overrides as correct (Fable N4). */
export function correctnessOf(results: BlankResult[]): number {
  if (results.length === 0) return 0;
  const good = results.filter((r) => r.pass || r.overridden).length;
  return good / results.length;
}
