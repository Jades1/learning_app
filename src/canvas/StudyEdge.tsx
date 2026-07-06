// Custom React Flow edge.
//  - Build: shows the relationship label as a chip; when the edge is SELECTED it becomes an
//    inline input so you type the relationship right on the canvas (a just-created edge is
//    auto-selected, so the box appears immediately). Empty edges show a faint "+ relationship".
//  - Study (reconstruction): the due node's incident edges become the fill-the-blank inputs
//    in place — attempt (type) then graded (given vs expected, with a per-blank override).
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useStudy } from '../review/StudyContext';
import { useStore } from '../store/store';

export function StudyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const label = (data as { label?: string } | undefined)?.label ?? '';
  const study = useStudy();
  const mode = useStore((s) => s.mode);
  const updateEdge = useStore((s) => s.updateEdge);
  const selectEdge = useStore((s) => s.selectEdge);
  const startEditEdge = useStore((s) => s.startEditEdge);
  const stopEditing = useStore((s) => s.stopEditing);
  const editing = useStore((s) => s.editingEdgeId === id);
  const isBlank = !!study?.active && study.blankEdgeIds.has(id);

  let content: React.ReactNode;
  if (isBlank && study) {
    if (study.reconPhase === 'attempt') {
      content = (
        <input
          className="edge-input nodrag nopan"
          value={study.valueFor(id)}
          placeholder={study.cueFor(id) || 'relationship?'}
          onChange={(e) => study.setValueFor(id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) study.submitRecon();
          }}
        />
      );
    } else {
      const r = study.resultFor(id);
      const ok = !!r && (r.pass || r.overridden);
      content = (
        <div className={`edge-graded nodrag nopan ${ok ? 'ok' : 'bad'}`}>
          <span className="edge-given">{r?.given || '(blank)'} {ok ? '✓' : '✗'}</span>
          {!ok && r && (
            <span className="edge-expected">
              → {r.expected}
              {r.given.trim() !== '' && (
                <button className="edge-override" onClick={() => study.toggleOverride(id)}>
                  same
                </button>
              )}
            </span>
          )}
        </div>
      );
    }
  } else if (mode === 'build' && editing) {
    // Inline relationship editor — type it right on the edge.
    content = (
      <input
        className="edge-edit nodrag nopan"
        autoFocus
        value={label}
        placeholder="relationship?"
        onChange={(e) => void updateEdge(id, e.target.value)}
        onBlur={() => stopEditing()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
    );
  } else if (label) {
    content = (
      <div
        className="edge-label nodrag nopan"
        onClick={() => mode === 'build' && selectEdge(id)}
        onDoubleClick={() => mode === 'build' && startEditEdge(id)}
      >
        {label}
      </div>
    );
  } else if (mode === 'build') {
    content = (
      <button className="edge-add nodrag nopan" onClick={() => startEditEdge(id)}>
        + relationship
      </button>
    );
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {content && (
        <EdgeLabelRenderer>
          <div
            className="edge-label-wrap"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {content}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
