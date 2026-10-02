/*
 * Positions and visual data for the editor tree. React Flow has no layout of
 * its own. This is a tidy tree: every leaf takes one row, a parent is centred
 * on its children, siblings keep the document order. In the default "center"
 * layout the top-level branches alternate right and left of the root; the
 * "right" layout puts every branch on the right.
 *
 * Every node except the root is a React Flow child of its parent (`parentId`):
 * its position is an offset from the parent's top-left corner, so the whole
 * subtree follows when the parent moves, and a saved position stays valid
 * wherever the parent ends up.
 */

import type { Edge, Node } from '@xyflow/react';
import { NodeKind, PlainNode, XY } from './md-tree';

export const NODE_TYPE = 'md';

export type Layout = 'center' | 'right' | 'radial';
export type Side = 'left' | 'right';

/** One colour per top-level branch, inherited by the subtree. Obsidian defines these for both themes. */
export const BRANCH_COLORS = [
    'var(--color-green)',
    'var(--color-orange)',
    'var(--color-yellow)',
    'var(--color-purple)',
    'var(--color-blue)',
    'var(--color-red)',
];

export const LABEL_MAX = 40;

export interface MdNodeData extends Record<string, unknown> {
    title: string;
    kind?: NodeKind;
    /** First line of the node's body, shown dimmed under the title. */
    preview?: string;
    /** Embed links of the node's body; the editor resolves them to thumbnails. */
    media?: string[];
    /** Title cut to LABEL_MAX characters for the canvas; the full title goes to the tooltip and the editor. */
    label: string;
    depth: number;
    /** Which side of the root the node sits on; the root has no side. */
    side?: Side;
    /** Colour of the top-level branch this node belongs to; undefined on the root. */
    color?: string;
}

export type MdFlowNode = Node<MdNodeData, typeof NODE_TYPE>;

const CHAR_WIDTH = 7.5;
const PADDING_X = 24;
const NODE_HEIGHT = 36;
const PREVIEW_HEIGHT = 14;
const PREVIEW_CHAR_WIDTH = 6.5;
const PREVIEW_MAX_WIDTH = 240;
export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 120;
const ROOT_SIZE = 84;
const GAP_X = 60;
const GAP_Y = 16;

export function shortLabel(title: string): string {
    return title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1).trimEnd()}…` : title;
}

/** Estimated box size before the node is measured. */
export function estimateSize(title: string, depth: number, preview?: string, media?: string[]): { width: number; height: number } {
    if (depth === 0) {
        const side = Math.max(ROOT_SIZE, Math.round(shortLabel(title).length * CHAR_WIDTH + PADDING_X));
        return { width: side, height: side };
    }
    const titleWidth = Math.round(shortLabel(title).length * CHAR_WIDTH + PADDING_X);
    const previewWidth = preview ? Math.min(PREVIEW_MAX_WIDTH, Math.round(preview.length * PREVIEW_CHAR_WIDTH + PADDING_X)) : 0;
    const mediaHeight = media && media.length > 0 ? THUMB_HEIGHT + 6 : 0;
    const mediaWidth = media && media.length > 0 ? Math.min(media.length, 2) * (THUMB_WIDTH + 6) + PADDING_X : 0;
    return {
        width: Math.max(60, titleWidth, previewWidth, mediaWidth),
        height: (preview ? NODE_HEIGHT + PREVIEW_HEIGHT : NODE_HEIGHT) + mediaHeight,
    };
}

interface Branch {
    node: PlainNode;
    color: string;
}

/**
 * Lays out the branches of one side as a tidy tree. Depth 1 is at x = 0; the
 * x axis grows away from the root. Returns the nodes, the edges and the
 * total height so the caller can centre the side on the root.
 */
function layoutSide(root: PlainNode, branches: Branch[], side: Side): { nodes: MdFlowNode[]; edges: Edge[]; height: number } {
    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    const columnWidth: number[] = [];

    const measure = (node: PlainNode, depth: number) => {
        columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, estimateSize(node.title, depth, node.preview, node.media).width);
        node.children.forEach(child => measure(child, depth + 1));
    };
    branches.forEach(branch => measure(branch.node, 1));

    const columnX: number[] = [];
    columnWidth.reduce((x, width, depth) => {
        columnX[depth] = x;
        return x + width + GAP_X;
    }, 0);

    let nextRow = 0;
    /** Places the subtree and returns the node's centre y. */
    const place = (node: PlainNode, depth: number, color: string, parent: PlainNode): number => {
        const size = estimateSize(node.title, depth, node.preview, node.media);
        let centerY: number;
        if (node.children.length === 0) {
            // A tall node takes as many rows as it needs.
            const rows = Math.max(1, Math.ceil((size.height + GAP_Y) / (NODE_HEIGHT + GAP_Y)));
            centerY = nextRow * (NODE_HEIGHT + GAP_Y) + (rows * (NODE_HEIGHT + GAP_Y) - GAP_Y) / 2;
            nextRow += rows;
        } else {
            const centers = node.children.map(child => place(child, depth + 1, color, node));
            centerY = (centers[0] + centers[centers.length - 1]) / 2;
        }
        const x = side === 'right' ? columnX[depth] : -(columnX[depth] + size.width);
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x, y: centerY - size.height / 2 },
            data: { title: node.title, label: shortLabel(node.title), kind: node.kind, preview: node.preview, media: node.media, depth, side, color },
            ...size,
        });
        edges.push({
            id: `${parent.id}-${node.id}`,
            source: parent.id,
            sourceHandle: parent === root ? side : undefined,
            target: node.id,
            type: 'default',
            style: { stroke: color, strokeWidth: 2 },
        });
        return centerY;
    };
    branches.forEach(branch => place(branch.node, 1, branch.color, root));

    const height = nextRow > 0 ? nextRow * (NODE_HEIGHT + GAP_Y) - GAP_Y : 0;
    return { nodes, edges, height };
}

/**
 * Positions for the tree in the given layout. Nodes listed in `overrides` keep
 * the offset from their parent that the user gave them; the root is never
 * overridden. The root comes first and every parent precedes its children,
 * as React Flow requires for `parentId`.
 */
export function layoutTree(root: PlainNode, layout: Layout = 'center', overrides: Record<string, XY> = {}): { nodes: MdFlowNode[]; edges: Edge[] } {
    const laid = layout === 'radial' ? layoutRadial(root) : layoutTidy(root, layout);
    const absolute = new Map(laid.nodes.map(node => [node.id, node]));
    const nodes: MdFlowNode[] = [];
    const visit = (plain: PlainNode, parent?: MdFlowNode) => {
        const node = absolute.get(plain.id)!;
        if (parent) {
            const offset = overrides[node.id] ?? { x: node.position.x - parent.position.x, y: node.position.y - parent.position.y };
            nodes.push({ ...node, parentId: parent.id, position: { ...offset } });
        } else {
            nodes.push({ ...node, position: { ...node.position } });
        }
        plain.children.forEach(child => visit(child, node));
    };
    visit(root);
    return { nodes, edges: laid.edges };
}

function layoutTidy(root: PlainNode, layout: 'center' | 'right'): { nodes: MdFlowNode[]; edges: Edge[] } {
    const branches: Branch[] = root.children.map((node, index) => ({ node, color: BRANCH_COLORS[index % BRANCH_COLORS.length] }));
    const right = layout === 'right' ? branches : branches.filter((_, index) => index % 2 === 0);
    const left = layout === 'right' ? [] : branches.filter((_, index) => index % 2 === 1);

    const rootSize = estimateSize(root.title, 0);
    const sides = [
        { side: 'right' as Side, laid: layoutSide(root, right, 'right') },
        { side: 'left' as Side, laid: layoutSide(root, left, 'left') },
    ];

    const nodes: MdFlowNode[] = [
        {
            id: root.id,
            type: NODE_TYPE,
            position: { x: -rootSize.width / 2, y: -rootSize.height / 2 },
            data: { title: root.title, label: shortLabel(root.title), kind: root.kind, preview: root.preview, depth: 0 },
            ...rootSize,
        },
    ];
    const edges: Edge[] = [];
    for (const { side, laid } of sides) {
        const offsetX = side === 'right' ? rootSize.width / 2 + GAP_X : -(rootSize.width / 2 + GAP_X);
        const offsetY = -laid.height / 2;
        for (const node of laid.nodes) {
            nodes.push({ ...node, position: { x: node.position.x + offsetX, y: node.position.y + offsetY } });
        }
        edges.push(...laid.edges);
    }
    return { nodes, edges };
}

const RADIUS = 220;

/** Root in the centre, every leaf on its own angle, parents on the mean angle of their children. */
function layoutRadial(root: PlainNode): { nodes: MdFlowNode[]; edges: Edge[] } {
    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    const rootSize = estimateSize(root.title, 0);
    nodes.push({
        id: root.id,
        type: NODE_TYPE,
        position: { x: -rootSize.width / 2, y: -rootSize.height / 2 },
        data: { title: root.title, label: shortLabel(root.title), kind: root.kind, preview: root.preview, depth: 0 },
        ...rootSize,
    });
    const countLeaves = (node: PlainNode): number =>
        node.children.length === 0 ? 1 : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
    const step = (2 * Math.PI) / Math.max(1, countLeaves(root));
    let nextLeaf = 0;

    /** Places the subtree and returns the node's angle. */
    const place = (node: PlainNode, depth: number, color: string, parent: PlainNode): number => {
        let angle: number;
        if (node.children.length === 0) {
            angle = nextLeaf * step - Math.PI / 2;
            nextLeaf += 1;
        } else {
            const angles = node.children.map(child => place(child, depth + 1, color, node));
            angle = (angles[0] + angles[angles.length - 1]) / 2;
        }
        const size = estimateSize(node.title, depth, node.preview, node.media);
        const r = depth * RADIUS;
        const side: Side = Math.cos(angle) < 0 ? 'left' : 'right';
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x: r * Math.cos(angle) - size.width / 2, y: r * Math.sin(angle) - size.height / 2 },
            data: { title: node.title, label: shortLabel(node.title), kind: node.kind, preview: node.preview, media: node.media, depth, side, color },
            ...size,
        });
        edges.push({
            id: `${parent.id}-${node.id}`,
            source: parent.id,
            sourceHandle: parent === root ? side : undefined,
            target: node.id,
            type: 'default',
            style: { stroke: color, strokeWidth: 2 },
        });
        return angle;
    };
    root.children.forEach((child, index) => place(child, 1, BRANCH_COLORS[index % BRANCH_COLORS.length], root));
    return { nodes, edges };
}
