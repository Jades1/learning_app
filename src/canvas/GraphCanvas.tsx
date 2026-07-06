// The graph — editor in Build, study surface in Study. React Flow renders nodes/edges
// DERIVED from the store (single source of truth). In Study the due node glows, the view
// centers on its neighborhood, and reconstruction blanks become inputs on the edges
// (StudyEdge) driven by StudyContext. Controls live in a docked StudyBar, not a modal.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  SelectionMode,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../store/store';
import { ConceptNode, type ConceptNodeData, type StudyRole } from './ConceptNode';
import { StudyEdge } from './StudyEdge';
import { StudyProvider, useStudy } from '../review/StudyContext';
import { StudyBar } from '../review/StudyBar';

const nodeTypes = { concept: ConceptNode };
const edgeTypes = { study: StudyEdge };
const defaultEdgeOptions = { type: 'study' }; // no arrowheads (user decision)

function CanvasInner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const mode = useStore((s) => s.mode);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useStore((s) => s.selectedEdgeIds);
  const dueState = useStore((s) => s.dueState);

  const setNodePosition = useStore((s) => s.setNodePosition);
  const persistNodePosition = useStore((s) => s.persistNodePosition);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const addEdge = useStore((s) => s.addEdge);
  const addNode = useStore((s) => s.addNode);
  const applyNodeSelect = useStore((s) => s.applyNodeSelect);
  const applyEdgeSelect = useStore((s) => s.applyEdgeSelect);
  const clearSelection = useStore((s) => s.clearSelection);
  const editingNodeId = useStore((s) => s.editingNodeId);
  const startEditNode = useStore((s) => s.startEditNode);
  const endStudy = useStore((s) => s.endStudy);

  const study = useStudy();
  const { screenToFlowPosition, fitView, getIntersectingNodes } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  // Where a node started its drag, so we can snap it back if it's dropped ON another node.
  const dragOrigin = useRef<{ id: string; x: number; y: number } | null>(null);
  // Drop-to-connect: the node you're hovering over, "armed" only after a short dwell so a
  // quick drag-past doesn't connect. The armed node lights up as live feedback.
  const [armedTargetId, setArmedTargetId] = useState<string | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTarget = useRef<string | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDwell = () => {
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    dwellTimer.current = null;
  };
  useEffect(() => () => clearDwell(), []);

  const now = useMemo(() => new Date(), [nodes, edges]);

  const roleOf = useCallback(
    (id: string): StudyRole => {
      if (!study?.active) return null;
      if (id === study.dueNodeId) return 'due';
      if (study.focusNodeIds.has(id)) return 'context';
      return 'dim';
    },
    [study],
  );

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'concept',
        position: { x: n.x, y: n.y },
        selected: selectedNodeIds.includes(n.id),
        data: {
          label: n.label,
          dueState: dueState(n.id, now),
          study: roleOf(n.id),
          connectTarget: n.id === armedTargetId,
          color: n.color,
          editing: n.id === editingNodeId, // explicit edit state (double-click / typing)
        } satisfies ConceptNodeData,
      })),
    [nodes, selectedNodeIds, dueState, now, roleOf, armedTargetId, editingNodeId],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'study',
        selected: selectedEdgeIds.includes(e.id),
        data: { label: e.label },
      })),
    [edges, selectedEdgeIds],
  );

  // Center the view on the due neighborhood whenever the studied card changes.
  const focusKey =
    study?.active ? [...study.focusNodeIds].sort().join(',') : '';
  useEffect(() => {
    if (!focusKey) return;
    const ids = focusKey.split(',').map((id) => ({ id }));
    // Defer to next frame so RF has the latest node set.
    const t = setTimeout(() => fitView({ nodes: ids, padding: 0.35, duration: 500, maxZoom: 1.4 }), 0);
    return () => clearTimeout(t);
  }, [focusKey, fitView]);

  // Build-mode keyboard: Enter/type -> edit, Esc -> deselect, Del -> delete (undoable),
  // arrows -> nudge, Cmd/Ctrl+Enter -> new node. All gated on no focused input + not editing.
  useEffect(() => {
    if (mode !== 'build') return;
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const st = useStore.getState();
      if (st.editingNodeId || st.editingEdgeId) return;
      const nodeIds = st.selectedNodeIds;
      const edgeIds = st.selectedEdgeIds;

      // Cmd/Ctrl+Enter -> new node (under the sole selected node, else canvas center).
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (nodeIds.length === 1) {
          const n = st.nodes.find((x) => x.id === nodeIds[0]);
          if (n) void st.addNode(n.x, n.y + 96);
        } else {
          const el = wrapper.current;
          const rect = el?.getBoundingClientRect();
          const p = rect
            ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            : { x: 0, y: 0 };
          void st.addNode(p.x, p.y);
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (nodeIds.length || edgeIds.length) {
          e.preventDefault();
          edgeIds.forEach((id) => void st.deleteEdge(id));
          nodeIds.forEach((id) => void st.deleteNode(id));
        }
        return;
      }
      if (e.key === 'Enter') {
        if (nodeIds.length === 1) {
          e.preventDefault();
          st.startEditNode(nodeIds[0], true);
        } else if (edgeIds.length === 1) {
          e.preventDefault();
          st.startEditEdge(edgeIds[0]);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (nodeIds.length || edgeIds.length) st.clearSelection();
        return;
      }
      if (e.key.startsWith('Arrow') && nodeIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 16 : 2;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        for (const id of nodeIds) {
          const n = st.nodes.find((x) => x.id === id);
          if (n) st.setNodePosition(id, n.x + dx, n.y + dy);
        }
        if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(
          () => nodeIds.forEach((id) => void st.persistNodePosition(id)),
          250,
        );
        return;
      }
      // A printable key on the sole selected node starts editing, replacing the label.
      if (nodeIds.length === 1 && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        void st.updateNode(nodeIds[0], { label: e.key });
        st.startEditNode(nodeIds[0], false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, screenToFlowPosition]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const selects: { id: string; selected: boolean }[] = [];
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position) {
          setNodePosition(ch.id, ch.position.x, ch.position.y);
        } else if (ch.type === 'remove') {
          void deleteNode(ch.id);
        } else if (ch.type === 'select') {
          selects.push({ id: ch.id, selected: ch.selected });
        }
      }
      if (selects.length) applyNodeSelect(selects);
    },
    [setNodePosition, deleteNode, applyNodeSelect],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const selects: { id: string; selected: boolean }[] = [];
      for (const ch of changes) {
        if (ch.type === 'remove') void deleteEdge(ch.id);
        else if (ch.type === 'select') selects.push({ id: ch.id, selected: ch.selected });
      }
      if (selects.length) applyEdgeSelect(selects);
    },
    [deleteEdge, applyEdgeSelect],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) void addEdge(c.source, c.target);
    },
    [addEdge],
  );

  // "Over" a node = the dragged node's CENTER falls inside that node's rectangle — not just
  // a bounding-box near-overlap — so dragging *past* or *beside* a node doesn't arm it.
  const bestIntersecting = useCallback(
    (node: Node): string | null => {
      const cx = node.position.x + (node.measured?.width ?? 0) / 2;
      const cy = node.position.y + (node.measured?.height ?? 0) / 2;
      for (const h of getIntersectingNodes(node)) {
        if (h.id === node.id) continue;
        const w = h.measured?.width ?? 0;
        const ht = h.measured?.height ?? 0;
        if (cx >= h.position.x && cx <= h.position.x + w && cy >= h.position.y && cy <= h.position.y + ht) {
          return h.id;
        }
      }
      return null;
    },
    [getIntersectingNodes],
  );

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragOrigin.current = { id: node.id, x: node.position.x, y: node.position.y };
  }, []);

  // While dragging, track the hovered node and arm it after a ~250ms dwell (it lights up).
  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      if (mode !== 'build') return;
      const target = bestIntersecting(node);
      if (target === hoverTarget.current) return;
      hoverTarget.current = target;
      clearDwell();
      setArmedTargetId(null);
      if (target) dwellTimer.current = setTimeout(() => setArmedTargetId(target), 120);
    },
    [mode, bestIntersecting],
  );

  // On drop, connect ONLY to an armed (dwelled + lit) node, and snap the dragged node back
  // to where it started so connecting never disturbs your layout. Otherwise reposition.
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      clearDwell();
      const origin = dragOrigin.current;
      if (armedTargetId && mode === 'build') {
        void addEdge(node.id, armedTargetId); // dragged -> target; auto-selects new edge
        if (origin && origin.id === node.id) {
          setNodePosition(node.id, origin.x, origin.y);
          void persistNodePosition(node.id);
        }
      } else {
        void persistNodePosition(node.id);
      }
      dragOrigin.current = null;
      hoverTarget.current = null;
      setArmedTargetId(null);
    },
    [armedTargetId, mode, addEdge, setNodePosition, persistNodePosition],
  );

  const onNodeDoubleClick = useCallback(
    (_: unknown, node: Node) => {
      if (mode === 'build') startEditNode(node.id, false);
    },
    [mode, startEditNode],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
    // Clicking empty canvas during study drops back to viewing the graph (same as
    // "End session"). Clicks on the node card / docked study bar are not pane clicks,
    // so an in-progress answer isn't dismissed by mis-clicks on the review UI.
    if (mode === 'study') endStudy();
  }, [clearSelection, mode, endStudy]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== 'build') return;
      const target = e.target as HTMLElement;
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__edge') ||
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__panel')
      ) {
        return;
      }
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void addNode(pos.x, pos.y);
    },
    [mode, screenToFlowPosition, addNode],
  );

  const onAddNodeButton = useCallback(() => {
    const el = wrapper.current;
    if (!el) {
      void addNode(0, 0);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    void addNode(pos.x, pos.y);
  }, [screenToFlowPosition, addNode]);

  return (
    <div
      className={`canvas ${mode === 'study' ? 'is-studying' : ''} ${armedTargetId ? 'is-connecting' : ''}`}
      ref={wrapper}
      onDoubleClick={onDoubleClick}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeDragThreshold={2}
        onPaneClick={onPaneClick}
        nodesConnectable={mode === 'build'}
        nodesDraggable={mode === 'build'}
        elementsSelectable={mode === 'build'}
        zoomOnDoubleClick={false}
        selectionOnDrag={mode === 'build'}
        selectionMode={SelectionMode.Partial}
        panOnDrag={mode === 'build' ? [1, 2] : true}
        panOnScroll
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dcd6ca" />
        <Controls showInteractive={false} />
        {mode === 'build' && (
          <Panel position="top-left">
            <button className="canvas-add" onClick={onAddNodeButton}>
              + Add node
            </button>
          </Panel>
        )}
        {mode === 'study' && <StudyBar />}
      </ReactFlow>
    </div>
  );
}

export function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <StudyProvider>
        <CanvasInner />
      </StudyProvider>
    </ReactFlowProvider>
  );
}
