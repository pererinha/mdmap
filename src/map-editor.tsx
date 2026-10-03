/*
 * React Flow editor for one tree. The tree is the state; node positions are
 * derived from it on every change. A node the user dragged keeps its offset
 * from its parent, and its subtree moves with it. The organizer buttons glide
 * every node to the new layout and the viewport to its bounds. On a trackpad,
 * two-finger scrolling moves the map as far as the fingers move, like a web
 * page, and pinching zooms. Keys:
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
    getViewportForBounds,
    useReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, OnNodeDrag, OnSelectionChangeFunc, ReactFlowInstance } from '@xyflow/react';
import { setIcon } from 'obsidian';
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
    /** Selects the node and glides the viewport to center it, zooming in to at least FOCUS_ZOOM. */
    focus(id: string): void;
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
    /** A click on a node, or null for a click on empty canvas. */
    onClickNode?(id: string | null): void;
    /** The copy button on a node: the node and everything under it as Markdown. */
    onCopyNode?(id: string): void;
}

interface EditorNodeData extends MdNodeData {
    editing: boolean;
    resolved: Array<ResolvedMedia & { link: string }>;
    onOpenMedia?(link: string): void;
    onCopy?(id: string): void;
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
        data.kind === 'paragraph' ? 'mdmap-paragraph-node' : '',
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
        <>
        <div className={classes} style={style} title={data.text ?? data.title}>
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
                    {data.text !== undefined ? (
                        <span className="mdmap-text" style={{ WebkitLineClamp: data.textLines }}>
                            {data.text}
                        </span>
                    ) : (
                        <span className="mdmap-title">{data.label}</span>
                    )}
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
        {data.onCopy && !data.editing && (
            // Shown on hover and on the selected node; `nodrag` keeps a press on it from dragging the node.
            <button
                className="mdmap-copy nodrag"
                aria-label="Copy as Markdown"
                ref={el => {
                    if (el && !el.firstChild) {
                        setIcon(el, 'copy');
                    }
                }}
                onClick={e => {
                    e.stopPropagation();
                    data.onCopy!(id);
                }}
                onDoubleClick={e => e.stopPropagation()}
            />
        )}
        </>
    );
}

const nodeTypes = { [NODE_TYPE]: MdNode };

/** Lowest zoom: low enough that fitting the view shows the whole map even for notes with hundreds of nodes. */
const MIN_ZOOM = 0.01;
const FIT_PADDING = 0.1;
const FIT_MAX_ZOOM = 1.25;
/** How long the organizer buttons take to move the nodes and the viewport. */
const ORGANIZE_MS = 450;
/** Zoom a focused node is shown at, at least, so its text can be read. */
const FOCUS_ZOOM = 1;

function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const ORGANIZERS: Array<{ layout: Layout; label: string }> = [
    { layout: 'right', label: 'Tidy tree' },
    { layout: 'center', label: 'Center root' },
    { layout: 'radial', label: 'Radial' },
];

function Editor({ root: initialRoot, positions: initialPositions, onChange, onReady, resolveMedia, onOpenMedia, onClickNode, onCopyNode }: MapEditorProps) {
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
    const containerRef = useRef<HTMLDivElement>(null);
    /** Frame request of the running organizer animation, if any. */
    const animation = useRef<number | null>(null);

    const stopAnimation = useCallback(() => {
        if (animation.current !== null) {
            cancelAnimationFrame(animation.current);
            animation.current = null;
        }
    }, []);

    /** Editor nodes and edges for the tree in the current layout and saved positions. */
    const build = useCallback(
        (root: PlainNode): { nodes: EditorNode[]; edges: Edge[] } => {
            const laid = layoutTree(root, layoutRef.current, positionsRef.current);
            return {
                nodes: laid.nodes.map(node => ({
                    ...node,
                    selected: node.id === selectedId.current,
                    data: {
                        ...node.data,
                        editing: false,
                        onCommit,
                        onCancel,
                        onOpenMedia,
                        onCopy: onCopyNode,
                        resolved: (node.data.media ?? [])
                            .map(link => ({ link, resolved: resolveMedia?.(link) ?? null }))
                            .filter(item => item.resolved !== null)
                            .map(item => ({ link: item.link, ...item.resolved! })),
                    },
                })),
                edges: laid.edges,
            };
        },
        [resolveMedia, onOpenMedia, onCopyNode],
    );

    const render = useCallback(
        (root: PlainNode) => {
            stopAnimation();
            const built = build(root);
            setNodes(built.nodes);
            setEdges(built.edges);
        },
        [stopAnimation, build, setNodes, setEdges],
    );

    /**
     * Moves every node from where it is now to its place in `target`, and the
     * viewport to the bounds of `target`, in ORGANIZE_MS. Positions are relative
     * to the parent, so interpolating them moves each subtree as one piece.
     */
    const glide = useCallback(
        (target: EditorNode[]) => {
            stopAnimation();
            const from = new Map(flow.getNodes().map(node => [node.id, node.position]));
            const started = performance.now();
            const frame = (now: number) => {
                const t = Math.min(1, (now - started) / ORGANIZE_MS);
                const k = easeInOutCubic(t);
                setNodes(
                    target.map(node => {
                        const start = from.get(node.id);
                        return start && t < 1
                            ? { ...node, position: { x: start.x + (node.position.x - start.x) * k, y: start.y + (node.position.y - start.y) * k } }
                            : node;
                    }),
                );
                animation.current = t < 1 ? requestAnimationFrame(frame) : null;
            };
            frame(started);

            // Bounds of the final layout: canvas positions follow the parent chain; parents come first.
            const canvas = new Map<string, XY>();
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const node of target) {
                const parent = node.parentId ? canvas.get(node.parentId) : undefined;
                const at = parent ? { x: parent.x + node.position.x, y: parent.y + node.position.y } : node.position;
                canvas.set(node.id, at);
                const measured = flow.getInternalNode(node.id)?.measured;
                const width = measured?.width ?? node.width ?? 0;
                const height = measured?.height ?? node.height ?? 0;
                minX = Math.min(minX, at.x);
                minY = Math.min(minY, at.y);
                maxX = Math.max(maxX, at.x + width);
                maxY = Math.max(maxY, at.y + height);
            }
            const container = containerRef.current;
            if (container && target.length > 0) {
                const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                const viewport = getViewportForBounds(bounds, container.clientWidth, container.clientHeight, MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING);
                flow.setViewport(viewport, { duration: ORGANIZE_MS });
            }
        },
        [flow, setNodes, stopAnimation],
    );

    useEffect(() => stopAnimation, [stopAnimation]);

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
            setTimeout(() => flow.fitView({ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }), 100);
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
                const built = build(rootRef.current);
                setEdges(built.edges);
                glide(built.nodes);
                onChange(rootRef.current, `organize:${layout}`, {});
            },
            fit() {
                return flow.fitView({ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM });
            },
            focus(id) {
                const node = flow.getInternalNode(id);
                if (!node) {
                    return;
                }
                selectedId.current = id;
                setNodes(nodes => nodes.map(n => (Boolean(n.selected) === (n.id === id) ? n : { ...n, selected: n.id === id })));
                const { x, y } = node.internals.positionAbsolute;
                const width = node.measured?.width ?? node.width ?? 0;
                const height = node.measured?.height ?? node.height ?? 0;
                flow.setCenter(x + width / 2, y + height / 2, { zoom: Math.max(flow.getZoom(), FOCUS_ZOOM), duration: ORGANIZE_MS });
            },
            instance: flow,
        };
        onReady(handleRef.current);
    }, [onReady, render, build, glide, setEdges, flow, onChange]);

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

    // A node grabbed while the organizer animation runs: finish it, so the frames stop moving nodes under the pointer.
    const onNodeDragStart = useCallback<OnNodeDrag<EditorNode>>(() => {
        if (animation.current !== null) {
            render(rootRef.current);
        }
    }, [render]);

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
        <div className="mdmap-root" ref={containerRef} tabIndex={0} onKeyDown={onKeyDown}>
            <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={onSelectionChange}
                onNodeClick={(_event, node) => onClickNode?.(node.id)}
                onPaneClick={() => onClickNode?.(null)}
                onNodeDoubleClick={(_event, node) => startEditing(node.id)}
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
                nodeDragThreshold={4}
                panOnScroll
                panOnScrollSpeed={1}
                deleteKeyCode={null}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={MIN_ZOOM}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
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
