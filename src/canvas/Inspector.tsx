// Right-hand inspector for the selected node or edge. Editing graph content is the
// human's job (generation is sacred) — this is where they author label/body/edge
// labels. Body is edited here but never shown on the canvas.
import { useStore } from '../store/store';
import type { InputMode, NodeColor } from '../types';

const NODE_PALETTE: { token: NodeColor | undefined; hex: string; name: string }[] = [
  { token: undefined, hex: '#ffffff', name: 'Default' },
  { token: 'straw', hex: '#fdf3d7', name: 'Straw' },
  { token: 'sage', hex: '#e8f2e3', name: 'Sage' },
  { token: 'sky', hex: '#e3eef8', name: 'Sky' },
  { token: 'lilac', hex: '#ede8f6', name: 'Lilac' },
  { token: 'blush', hex: '#fae8e4', name: 'Blush' },
  { token: 'sand', hex: '#f2ebdf', name: 'Sand' },
];

export function Inspector() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null);
  const edge = useStore((s) => s.edges.find((e) => e.id === s.selectedEdgeId) ?? null);
  const nodes = useStore((s) => s.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const updateEdge = useStore((s) => s.updateEdge);
  const deleteEdge = useStore((s) => s.deleteEdge);

  if (selectedNodeId && node) {
    return (
      <aside className="inspector">
        <h2>Node</h2>
        <label>
          Label (prompt)
          <input
            value={node.label}
            onChange={(e) => void updateNode(node.id, { label: e.target.value })}
            placeholder="What you'll see"
          />
        </label>
        <label>
          Body (what you recall)
          <textarea
            value={node.body}
            rows={6}
            onChange={(e) => void updateNode(node.id, { body: e.target.value })}
            placeholder="Hidden until you recall it"
          />
        </label>
        <label>
          Recall input
          <select
            value={node.inputMode}
            onChange={(e) => void updateNode(node.id, { inputMode: e.target.value as InputMode })}
          >
            <option value="self-attempt">Self-attempt (recall, then check)</option>
            <option value="typed">Type answer (matched)</option>
          </select>
        </label>
        <label>
          Color
          <div className="color-row">
            {NODE_PALETTE.map((c) => (
              <button
                key={c.token ?? 'default'}
                type="button"
                className={`color-swatch ${(node.color ?? undefined) === c.token ? 'is-active' : ''}`}
                style={{ background: c.hex }}
                title={c.name}
                onClick={() => void updateNode(node.id, { color: c.token })}
              />
            ))}
          </div>
        </label>
        <p className="inspector__hint">
          Drag this node onto another to connect them. Double-click or just type to rename.
        </p>
        <button className="danger" onClick={() => void deleteNode(node.id)}>
          Delete node
        </button>
      </aside>
    );
  }

  if (selectedEdgeId && edge) {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    return (
      <aside className="inspector">
        <h2>Edge</h2>
        <p className="inspector__rel">
          <strong>{src?.label ?? '?'}</strong> → <strong>{tgt?.label ?? '?'}</strong>
        </p>
        <label>
          Relationship
          <input
            value={edge.label}
            autoFocus
            onChange={(e) => void updateEdge(edge.id, e.target.value)}
            placeholder="e.g. causes, is part of, contrasts with"
          />
        </label>
        <button className="danger" onClick={() => void deleteEdge(edge.id)}>
          Delete edge
        </button>
      </aside>
    );
  }

  return (
    <aside className="inspector inspector--empty">
      <h2>Build</h2>
      <p>Double-click the canvas to add a node.</p>
      <p>Click a node to edit its prompt and hidden body.</p>
      <p>Drag from a node's edge to another node to connect them, then label the relationship.</p>
    </aside>
  );
}
