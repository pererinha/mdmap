/*
 * React Flow editor for one tree. The tree is the state; node positions are
 * derived from it on every change. A node the user dragged keeps its offset
 * from its parent, and its subtree moves with it. Keys:
 * double-click edits, Tab adds a child, Enter adds a sibling, Delete removes,
 * Alt+Up/Down reorders, drag onto a node reparents, Cmd+Z / Cmd+Shift+Z
 * undo and redo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
    Background,
    Handle,
    Panel,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, OnNodeDrag, OnSelectionChangeFunc, ReactFlowInstance } from '@xyflow/react';
import { PlainNode, XY } from './md-tree';
import { Facing, Layout, MdNodeData, NODE_TYPE, layoutTree } from './tree-layout';
import { addChild, addSiblingAfter, isDescendant, moveInto, moveSibling, remove, rename } from './tree-ops';

export interface ResolvedMedia {
    src: string;
    kind: 'image' | 'video';
}

export interface MapEditorHandle {
    /** Shows a tree read from the file, with the file's saved positions. */
    reload(root: PlainNode, positions?: Record<string, XY>): void;
    /** Recomputes every position in the given layout and forgets the saved ones. */
    organize(layout: Layout): void;
    fit(): Promise<boolean>;
    /** The React Flow instance, for scripts that drive the view. */
    instance: ReactFlowInstance<EditorNode>;
}

interface MapEditorProps {
    root: PlainNode;
    /** Saved positions by node id. */
    positions?: Record<string, XY>;
    onChange(root: PlainNode, source: string, positions: Record<string, XY>): void;
    onReady(handle: MapEditorHandle): void;
    /** Turns an embed link into something the node can show; null hides it. */
    resolveMedia?(link: string): ResolvedMedia | null;
    onOpenMedia?(link: string): void;
}

interface EditorNodeData extends MdNodeData {
    editing: boolean;
    resolved: Array<ResolvedMedia & { link: string }>;
    onOpenMedia?(link: string): void;
    onCommit(id: string, title: string): void;
    onCancel(): void;
}

type EditorNode = Node<EditorNodeData, typeof NODE_TYPE>;

const FACINGS: Facing[] = ['left', 'right', 'top', 'bottom'];
const HANDLE_POSITION: Record<Facing, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

function MdNode({ id, data, selected }: NodeProps<EditorNode>) {
    const classes = [
        'mdmap-node',
        data.depth === 0 ? 'mdmap-root-node' : '',
        data.kind === 'list' ? 'mdmap-list-node' : '',
        selected ? 'mdmap-selected' : '',
    ].join(' ');
    const style = data.color ? ({ '--mdmap-branch': data.color } as CSSProperties) : undefined;
    // A source and a target handle on every side; each edge picks the pair that faces the other node.
    const handles = FACINGS.map(facing => (
        <span key={facing}>
            <Handle type="source" id={`out-${facing}`} position={HANDLE_POSITION[facing]} className="mdmap-handle" />
            <Handle type="target" id={`in-${facing}`} position={HANDLE_POSITION[facing]} className="mdmap-handle" />
        </span>
    ));
    return (
        <div className={classes} style={style} title={data.title}>
            {handles}
            {data.editing ? (
                <input
                    className="mdmap-input"
                    defaultValue={data.title}
                    autoFocus
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                            data.onCommit(id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                            data.onCancel();
                        }
                    }}
                    onBlur={e => data.onCommit(id, e.currentTarget.value)}
                />
            ) : (
                <>
                    <span className="mdmap-title">{data.label}</span>
                    {data.preview && data.depth > 0 && <span className="mdmap-preview">{data.preview}</span>}
                    {data.resolved.length > 0 && (
                        <span className="mdmap-media">
                            {data.resolved.map(item =>
                                item.kind === 'video' ? (
                                    <video key={item.link} className="mdmap-thumb" src={item.src} controls preload="metadata" />
                                ) : (
                                    <img
                                        key={item.link}
                                        className="mdmap-thumb"
                                        src={item.src}
                                        alt={item.link}
                                        onClick={e => {
                                            e.stopPropagation();
                                            data.onOpenMedia?.(item.link);
                                        }}
                                    />
                                ),
                            )}
                        </span>
                    )}
                </>
            )}
        </div>
    );
}

const nodeTypes = { [NODE_TYPE]: MdNode };

const ORGANIZERS: Array<{ layout: Layout; label: string }> = [
    { layout: 'right', label: 'Tidy tree' },
    { layout: 'center', label: 'Center root' },
    { layout: 'radial', label: 'Radial' },
];

function Editor({ root: initialRoot, positions: initialPositions, onChange, onReady, resolveMedia, onOpenMedia }: MapEditorProps) {
    const flow = useReactFlow<EditorNode>();
    const rootRef = useRef(initialRoot);
    const positionsRef = useRef<Record<string, XY>>(initialPositions ?? {});
    const layoutRef = useRef<Layout>('center');
    const past = useRef<PlainNode[]>([]);
    const future = useRef<PlainNode[]>([]);
    const selectedId = useRef<string | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const render = useCallback(
        (root: PlainNode) => {
            const laid = layoutTree(root, layoutRef.current, positionsRef.current);
            setNodes(
                laid.nodes.map(node => ({
                    ...node,
                    selected: node.id === selectedId.current,
                    data: {
                        ...node.data,
                        editing: false,
                        onCommit,
                        onCancel,
                        onOpenMedia,
                        resolved: (node.data.media ?? [])
                            .map(link => ({ link, resolved: resolveMedia?.(link) ?? null }))
                            .filter(item => item.resolved !== null)
                            .map(item => ({ link: item.link, ...item.resolved! })),
                    },
                })),
            );
            setEdges(laid.edges);
        },
        [setNodes, setEdges, resolveMedia, onOpenMedia],
    );

    useEffect(() => {
        render(rootRef.current);
    }, []);

    // Nodes are measured after the first render; fit the viewport once they are.
    const initialized = useNodesInitialized();
    const fitted = useRef(false);
    useEffect(() => {
        if (initialized && !fitted.current) {
            fitted.current = true;
            // The split that hosts the view may still be resizing on its first frames.
            setTimeout(() => flow.fitView({ padding: 0.1, maxZoom: 1.25 }), 100);
        }
    }, [initialized, flow]);

    const handleRef = useRef<MapEditorHandle | null>(null);
    useEffect(() => {
        handleRef.current = {
            reload(root, positions) {
                rootRef.current = root;
                if (positions) {
                    positionsRef.current = positions;
                }
                render(root);
            },
            organize(layout) {
                layoutRef.current = layout;
                positionsRef.current = {};
                render(rootRef.current);
                onChange(rootRef.current, `organize:${layout}`, {});
                setTimeout(() => flow.fitView({ padding: 0.1, maxZoom: 1.25 }), 50);
            },
            fit() {
                return flow.fitView({ padding: 0.1, maxZoom: 1.25 });
            },
            instance: flow,
        };
        onReady(handleRef.current);
    }, [onReady, render, flow, onChange]);

    /** Replaces the tree, records history and notifies the view. */
    const apply = useCallback(
        (next: PlainNode, source: string) => {
            if (next === rootRef.current) {
                return;
            }
            past.current.push(rootRef.current);
            future.current = [];
            rootRef.current = next;
            render(next);
            onChange(next, source, positionsRef.current);
        },
        [render, onChange],
    );

    const restore = useCallback(
        (from: PlainNode[], to: PlainNode[], source: string) => {
            const target = from.pop();
            if (!target) {
                return;
            }
            to.push(rootRef.current);
            rootRef.current = target;
            render(target);
            onChange(target, source, positionsRef.current);
        },
        [render, onChange],
    );

    const startEditing = useCallback(
        (id: string) => {
            selectedId.current = id;
            setEditingId(id);
        },
        [],
    );

    const onCommit = useCallback(
        (id: string, title: string) => {
            setEditingId(current => (current === id ? null : current));
            const trimmed = title.trim();
            if (trimmed) {
                apply(rename(rootRef.current, id, trimmed), 'rename');
            }
        },
        [apply],
    );

    const onCancel = useCallback(() => setEditingId(null), []);

    const onSelectionChange = useCallback<OnSelectionChangeFunc<EditorNode>>(({ nodes: selected }) => {
        selectedId.current = selected[0]?.id ?? null;
    }, []);

    const onNodeDragStop = useCallback<OnNodeDrag<EditorNode>>(
        (_event, node) => {
            // The dragged subtree travels with the node; none of it is a drop target.
            const target = flow
                .getIntersectingNodes(node)
                .find(other => other.id !== node.id && !isDescendant(rootRef.current, node.id, other.id));
            if (target) {
                apply(moveInto(rootRef.current, node.id, target.id), 'move');
            } else if (node.id !== rootRef.current.id) {
                // Dropped on empty canvas: the node keeps this offset from its parent and the file remembers it.
                positionsRef.current = { ...positionsRef.current, [node.id]: { ...node.position } };
                render(rootRef.current);
                onChange(rootRef.current, 'position', positionsRef.current);
            } else {
                render(rootRef.current);
            }
        },
        [flow, apply, render, onChange],
    );

    const onKeyDown = useCallback(
        (event: ReactKeyboardEvent) => {
            if (editingId) {
                return;
            }
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                    restore(future.current, past.current, 'redo');
                } else {
                    restore(past.current, future.current, 'undo');
                }
                return;
            }
            const id = selectedId.current;
            if (!id) {
                return;
            }
            const root = rootRef.current;
            switch (event.key) {
                case 'Tab': {
                    event.preventDefault();
                    const added = addChild(root, id);
                    apply(added.root, 'addChild');
                    startEditing(added.id);
                    break;
                }
                case 'Enter': {
                    event.preventDefault();
                    const added = addSiblingAfter(root, id);
                    apply(added.root, 'addSibling');
                    startEditing(added.id);
                    break;
                }
                case 'Delete':
                case 'Backspace':
                    event.preventDefault();
                    selectedId.current = null;
                    apply(remove(root, id), 'remove');
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                    if (event.altKey) {
                        event.preventDefault();
                        apply(moveSibling(root, id, event.key === 'ArrowUp' ? -1 : 1), 'reorder');
                    }
                    break;
            }
        },
        [editingId, apply, restore, startEditing],
    );

    const displayNodes = useMemo<EditorNode[]>(
        () => nodes.map(node => ({ ...node, data: { ...node.data, editing: node.id === editingId } })),
        [nodes, editingId],
    );

    return (
        <div className="mdmap-root" tabIndex={0} onKeyDown={onKeyDown}>
            <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={onSelectionChange}
                onNodeDoubleClick={(_event, node) => startEditing(node.id)}
                onNodeDragStop={onNodeDragStop}
                nodeDragThreshold={4}
                deleteKeyCode={null}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background />
                <Panel position="top-right" className="mdmap-panel">
                    {ORGANIZERS.map(item => (
                        <button
                            key={item.layout}
                            className="mdmap-organize"
                            data-layout={item.layout}
                            onClick={() => handleRef.current?.organize(item.layout)}
                        >
                            {item.label}
                        </button>
                    ))}
                </Panel>
            </ReactFlow>
        </div>
    );
}

export function MapEditor(props: MapEditorProps) {
    return (
        <ReactFlowProvider>
            <Editor {...props} />
        </ReactFlowProvider>
    );
}
