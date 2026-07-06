// Custom React Flow node. Shows the LABEL (the prompt) always; the body stays
// hidden (retrieval practice — the canvas tests, it doesn't show). THREE orthogonal visual
// channels, never repurposed: FILL = the user's chosen category color; BORDER/ring =
// scheduler state (due/new/resting); OPACITY/glow = study role. During study the due node
// glows, neighbors stay bright, everything else dims.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore, type DueState } from '../store/store';
import type { NodeColor } from '../types';

/** Study focus role: the node under review, a shown neighbor, faded, or not studying. */
export type StudyRole = 'due' | 'context' | 'dim' | null;

export interface ConceptNodeData {
  label: string;
  dueState: DueState;
  study: StudyRole;
  /** Lit up while a dragged node hovers over this one (drop-to-connect target). */
  connectTarget?: boolean;
  /** This node is being edited — show the inline label input. */
  editing?: boolean;
  /** User-chosen fill color (category), absent = default. */
  color?: NodeColor;
  [key: string]: unknown;
}

function ConceptNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as ConceptNodeData;
  const mode = useStore((s) => s.mode);
  const updateNode = useStore((s) => s.updateNode);
  const stopEditing = useStore((s) => s.stopEditing);
  const editSelectAll = useStore((s) => s.editSelectAll);
  const editing = mode === 'build' && !!d.editing;

  const classes = [
    'concept-node',
    `is-${d.dueState}`,
    d.color ? `color-${d.color}` : '',
    selected ? 'is-selected' : '',
    d.study ? `is-study-${d.study}` : '',
    d.connectTarget ? 'is-connect-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Handle type="target" position={Position.Left} />
      <div className="concept-node__badge" aria-hidden>
        {d.dueState === 'due' ? '●' : d.dueState === 'new' ? '○' : ''}
      </div>
      {editing ? (
        <input
          className="concept-node__input nodrag"
          autoFocus
          value={d.label}
          placeholder="label"
          onFocus={(e) => {
            if (editSelectAll) e.target.select();
          }}
          onChange={(e) => void updateNode(id, { label: e.target.value })}
          onBlur={() => stopEditing()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <div className="concept-node__label">{d.label || 'Untitled'}</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeImpl);
