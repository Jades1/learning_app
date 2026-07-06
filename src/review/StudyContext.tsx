// Study session state, shared between the canvas (glowing node, edge inputs) and the docked
// StudyBar. Study happens IN PLACE on the graph; this context is the single source for the
// active card's interaction. It NEVER decides a grade — it assembles behavioral signals and
// hands them to store.submitReview(), which runs the deterministic grade() (contract).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useStore, type ReviewSignals } from '../store/store';
import type { BlankResult, GNode, InputMode, Outcome } from '../types';
import { cueForRung, MAX_RUNG } from './scaffold';
import { checkMatch, type MatchResult } from './match';
import { buildReconTask, scoreBlank, correctnessOf, type ReconTask } from './reconstruction';
import { LABEL_MATCH_THRESHOLD, MAX_BLANKS, TYPED_MATCH_THRESHOLD } from './config';

export interface StudyApi {
  active: boolean;
  kind: 'body' | 'connections' | null;
  node: GNode | null;
  done: boolean;
  index: number;
  queueLen: number;

  // focus / canvas
  dueNodeId: string | null;
  focusNodeIds: Set<string>; // due + neighbors (kept bright)
  neighborIds: Set<string>;

  // shared scaffolding
  rung: number;
  canHint: boolean;
  requestHint: () => void;

  // reconstruction
  task: ReconTask | null;
  reconPhase: 'attempt' | 'graded';
  reconRevealed: boolean;
  correctness: number;
  blankEdgeIds: Set<string>;
  valueFor: (edgeId: string) => string;
  setValueFor: (edgeId: string, v: string) => void;
  cueFor: (edgeId: string) => string;
  resultFor: (edgeId: string) => BlankResult | null;
  overriddenFor: (edgeId: string) => boolean;
  toggleOverride: (edgeId: string) => void;
  submitRecon: () => void;
  revealRecon: () => void;

  // body
  inputMode: InputMode | null;
  bodyPhase: 'attempt' | 'reveal';
  bodyGaveUp: boolean;
  typed: string;
  setTyped: (v: string) => void;
  match: MatchResult | null;
  submitTyped: () => void;
  revealBodyAnswer: () => void; // give up (typed) or self-attempt reveal
  bodyText: string;

  // finalize (both kinds)
  finish: (outcome: Outcome, override?: boolean) => void;
}

const StudyCtx = createContext<StudyApi | null>(null);
export const useStudy = () => useContext(StudyCtx);

export function StudyProvider({ children }: { children: ReactNode }) {
  const mode = useStore((s) => s.mode);
  const card = useStore((s) => s.currentCard());
  const node = useStore((s) => s.currentNode());
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const studyQueue = useStore((s) => s.studyQueue);
  const studyIndex = useStore((s) => s.studyIndex);
  const submitReview = useStore((s) => s.submitReview);

  const active = mode === 'study' && !!card && !!node;
  const kind = active ? card!.type : null;

  // --- per-card interaction state (reset when the card changes) ---
  const promptShownAt = useRef(Date.now());
  const firstHintAt = useRef<number | null>(null);
  const attemptEndedAt = useRef<number | null>(null);
  const [rung, setRung] = useState(0);
  const [hintTimes, setHintTimes] = useState<number[]>([]);
  // reconstruction
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<BlankResult[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [reconPhase, setReconPhase] = useState<'attempt' | 'graded'>('attempt');
  const [reconRevealed, setReconRevealed] = useState(false);
  // body
  const [typed, setTyped] = useState('');
  const [bodyPhase, setBodyPhase] = useState<'attempt' | 'reveal'>('attempt');
  const [bodyGaveUp, setBodyGaveUp] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);

  const cardId = card?.id;
  useEffect(() => {
    promptShownAt.current = Date.now();
    firstHintAt.current = null;
    attemptEndedAt.current = null;
    setRung(0);
    setHintTimes([]);
    setValues({});
    setResults(null);
    setOverrides({});
    setReconPhase('attempt');
    setReconRevealed(false);
    setTyped('');
    setBodyPhase('attempt');
    setBodyGaveUp(false);
    setMatch(null);
  }, [cardId]);

  const task = useMemo(
    () =>
      active && kind === 'connections' && node
        ? buildReconTask(node, edges, nodes, MAX_BLANKS)
        : null,
    [active, kind, node, edges, nodes],
  );

  const neighborIds = useMemo(
    () => new Set(task ? task.blanks.map((b) => b.neighborId) : []),
    [task],
  );
  const focusNodeIds = useMemo(() => {
    const s = new Set<string>();
    if (node) s.add(node.id);
    neighborIds.forEach((id) => s.add(id));
    return s;
  }, [node, neighborIds]);
  const blankEdgeIds = useMemo(
    () => new Set(task ? task.blanks.map((b) => b.edgeId) : []),
    [task],
  );

  const requestHint = useCallback(() => {
    setRung((r) => {
      if (r >= MAX_RUNG) return r;
      const t = Date.now();
      if (firstHintAt.current === null) firstHintAt.current = t;
      setHintTimes((h) => [...h, t]);
      return r + 1;
    });
  }, []);

  const latency = () =>
    (firstHintAt.current ?? attemptEndedAt.current ?? Date.now()) - promptShownAt.current;

  const finish = useCallback(
    (outcome: Outcome, override = false) => {
      if (!node || !card) return;
      const isRecon = card.type === 'connections';
      const merged: BlankResult[] | undefined = isRecon
        ? (results ?? []).map((r) => ({ ...r, overridden: overrides[r.edgeId] ?? false }))
        : undefined;
      const signals: ReviewSignals = {
        outcome,
        usedHint: firstHintAt.current !== null,
        deepestRung: rung,
        latencyMs: latency(),
        inputMode: isRecon ? 'typed' : node.inputMode,
        correctness: isRecon && merged ? correctnessOf(merged) : null,
        blankCount: isRecon && task ? task.blanks.length : null,
        blanks: merged,
        hintCount: hintTimes.length,
        hintTimestamps: hintTimes,
        userOverride: override || (merged?.some((b) => b.overridden) ?? false),
      };
      void submitReview(signals);
    },
    [node, card, results, overrides, rung, hintTimes, task, submitReview],
  );

  // --- reconstruction actions ---
  const scoreAll = useCallback(
    (): BlankResult[] =>
      (task?.blanks ?? []).map((b) =>
        scoreBlank(b, values[b.edgeId] ?? '', LABEL_MATCH_THRESHOLD),
      ),
    [task, values],
  );
  const submitRecon = useCallback(() => {
    attemptEndedAt.current = Date.now();
    setResults(scoreAll());
    setReconRevealed(false);
    setReconPhase('graded');
  }, [scoreAll]);
  const revealRecon = useCallback(() => {
    attemptEndedAt.current = Date.now();
    setResults(scoreAll());
    setReconRevealed(true);
    setReconPhase('graded');
  }, [scoreAll]);

  const merged = useMemo(
    () => (results ?? []).map((r) => ({ ...r, overridden: overrides[r.edgeId] ?? false })),
    [results, overrides],
  );
  const correctness = correctnessOf(merged);
  const resultFor = useCallback(
    (edgeId: string) => merged.find((r) => r.edgeId === edgeId) ?? null,
    [merged],
  );

  // --- body actions ---
  const submitTyped = useCallback(() => {
    if (!node) return;
    const result = checkMatch(typed, node.body, TYPED_MATCH_THRESHOLD);
    setMatch(result);
    if (result.pass) {
      attemptEndedAt.current = Date.now();
      finish('success');
    }
  }, [node, typed, finish]);

  const revealBodyAnswer = useCallback(() => {
    attemptEndedAt.current = Date.now();
    // Typed reveal = giving up; self-attempt reveal = checking your own recall.
    setBodyGaveUp(node?.inputMode === 'typed');
    setBodyPhase('reveal');
  }, [node]);

  const api: StudyApi = {
    active,
    kind,
    node,
    done: active ? false : mode === 'study',
    index: studyIndex,
    queueLen: studyQueue.length,
    dueNodeId: node?.id ?? null,
    focusNodeIds,
    neighborIds,
    rung,
    canHint: rung < MAX_RUNG,
    requestHint,
    task,
    reconPhase,
    reconRevealed,
    correctness,
    blankEdgeIds,
    valueFor: (edgeId) => values[edgeId] ?? '',
    setValueFor: (edgeId, v) => setValues((old) => ({ ...old, [edgeId]: v })),
    cueFor: (edgeId) => {
      const b = task?.blanks.find((x) => x.edgeId === edgeId);
      return b && rung > 0 ? cueForRung(b.expected, rung) : '';
    },
    resultFor,
    overriddenFor: (edgeId) => overrides[edgeId] ?? false,
    toggleOverride: (edgeId) => setOverrides((o) => ({ ...o, [edgeId]: !o[edgeId] })),
    submitRecon,
    revealRecon,
    inputMode: node?.inputMode ?? null,
    bodyPhase,
    bodyGaveUp,
    typed,
    setTyped,
    match,
    submitTyped,
    revealBodyAnswer,
    bodyText: node?.body ?? '',
    finish,
  };

  return <StudyCtx.Provider value={api}>{children}</StudyCtx.Provider>;
}
