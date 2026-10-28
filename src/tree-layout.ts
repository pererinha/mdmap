/*
 * Positions and visual data for the editor tree. React Flow has no layout of
 * its own. This is a tidy tree: every subtree is a block as tall as its
 * children stacked with a fixed gap (or as the node itself, if taller), a
 * parent is centred on its children, siblings keep the document order. The
 * gap between two depth columns grows with the widest fan that crosses it, so
 * edges to far children still curve gently. In the default "center" layout
 * the top-level branches go to the side that keeps both sides closest in
 * height; the "right" layout puts every branch on the right. The "radial"
 * layout gives every leaf an angle sized to its box and pushes each ring out
 * until no two boxes overlap.
 *
 * Every node except the root is a React Flow child of its parent (`parentId`):
 * its position is an offset from the parent's top-left corner, so the whole
 * subtree follows when the parent moves, and a saved position stays valid
 * wherever the parent ends up.
 */

import type { Edge, Node } from '@xyflow/react';
// Declares Obsidian's global createEl for the unit tests, which compile this file on its own; nothing is imported at runtime.
import type {} from 'obsidian';
import { NodeKind, PlainNode, XY } from './md-tree';
import { PALETTE_SIZE, ROUNDS, whiteShare } from './settings';
import { withoutCollapsed } from './tree-ops';

export const NODE_TYPE = 'md';

export type Layout = 'center' | 'right' | 'radial';
export type Side = 'left' | 'right';

/** The palette colour of the top-level branch at `index`: the one picked for it, or else the theme's (`src/styles.css`). */
const paletteColor = (index: number) => `var(--mdmap-color-${(index % PALETTE_SIZE) + 1})`;

/** The colour of the top-level branch at `index`: its palette colour, lighter on each round of the palette past the first. */
export function branchColor(index: number): string {
    const white = whiteShare(index);
    return white ? `color-mix(in srgb, ${paletteColor(index)} ${100 - white}%, white)` : paletteColor(index);
}

/**
 * The colour of a node at `depth` under the top-level branch at `index`: the branch's own on the branch, and under it
 * a shade of its palette colour, one level per shade, the last for every level below: the shade picked at position
 * `index % PALETTE_SIZE + level * PALETTE_SIZE`, or else the palette colour 25 % closer to white per level.
 */
export function nodeColor(index: number, depth: number): string {
    if (depth <= 1) {
        return branchColor(index);
    }
    const shade = (index % PALETTE_SIZE) + Math.min(depth - 1, ROUNDS - 1) * PALETTE_SIZE;
    return `var(--mdmap-pick-${shade + 1}, color-mix(in srgb, ${paletteColor(index)} ${100 - whiteShare(shade)}%, white))`;
}

export interface MdNodeData extends Record<string, unknown> {
    title: string;
    kind?: NodeKind;
    /** First line of the node's body, shown dimmed under the title. */
    preview?: string;
    /** Embed links of the node's body; the editor resolves them to thumbnails. */
    media?: string[];
    /** Paragraphs: the whole text, shown as a block of `textLines` wrapped lines. */
    text?: string;
    /** Paragraphs: the text with its embed lines as the note has them, which editing shows. */
    source?: string;
    textLines?: number;
    depth: number;
    /** Which side of the root the node sits on; the root has no side. */
    side?: Side;
    /** The node's colour, from the top-level branch it belongs to and its depth (`nodeColor`); undefined on the root. */
    color?: string;
}

export type MdFlowNode = Node<MdNodeData, typeof NODE_TYPE>;

const CHAR_WIDTH = 7.5;
const PADDING_X = 24;
/** Left and right border of a node box, 2 px each. */
const BORDER_X = 4;
const NODE_HEIGHT = 36;
const PREVIEW_HEIGHT = 14;
const PREVIEW_CHAR_WIDTH = 6.5;
export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 120;
/** Full-width media rows in paragraph nodes; matches `.mdmap-paragraph-node .mdmap-thumb`. */
const PARAGRAPH_THUMB_HEIGHT = 160;
const ROOT_SIZE = 84;
/** Paragraph blocks: fixed width, 13 px text on 18 px lines, as tall as their whole text. */
const PARAGRAPH_WIDTH = 280;
const PARAGRAPH_CHAR_WIDTH = 7;
const PARAGRAPH_LINE_HEIGHT = 18;
/** Smallest horizontal gap between two depth columns. */
const GAP_X = 60;
/** Largest horizontal gap between two depth columns. */
const GAP_X_MAX = 640;
/** Column gap per pixel of vertical distance between a parent and its farthest child. */
const FAN_SLOPE = 0.25;
/** Vertical gap between two stacked subtrees. */
export const GAP_Y = 16;

/** Paragraph text, its source and the number of lines its block shows. */
function textData(node: PlainNode): Pick<MdNodeData, 'text' | 'source' | 'textLines'> {
    return node.text === undefined ? {} : { text: node.text, source: node.source, textLines: paragraphLines(node.text) };
}

/** Wrapped lines a paragraph's text takes in its block. */
export function paragraphLines(text: string): number {
    const perLine = Math.floor((PARAGRAPH_WIDTH - PADDING_X - 2) / PARAGRAPH_CHAR_WIDTH);
    return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Width of a label in the node font, measured on a canvas; `charWidth` per character where there is no DOM, as in the unit tests. */
function labelWidth(label: string, weight: number, size = 14, charWidth = CHAR_WIDTH): number {
    if (measureContext === undefined) {
        measureContext = typeof document === 'undefined' ? null : createEl('canvas').getContext('2d');
    }
    if (!measureContext) {
        return label.length * charWidth;
    }
    measureContext.font = `${weight} ${size}px ${getComputedStyle(document.body).getPropertyValue('--font-interface')}`;
    return measureContext.measureText(label).width;
}

/** Estimated box size before the node is measured: the whole title on one line, or a paragraph's whole text. */
export function estimateSize(title: string, depth: number, preview?: string, media?: string[], text?: string): { width: number; height: number } {
    if (text !== undefined) {
        const mediaHeight = (media?.length ?? 0) * (PARAGRAPH_THUMB_HEIGHT + 6);
        return { width: PARAGRAPH_WIDTH, height: paragraphLines(text) * PARAGRAPH_LINE_HEIGHT + 14 + mediaHeight };
    }
    if (depth === 0) {
        // One line of semibold text in an ellipse as tall as `.mdmap-root-node`'s min-height.
        return { width: Math.max(ROOT_SIZE, Math.ceil(labelWidth(title, 600) + PADDING_X + BORDER_X)), height: ROOT_SIZE };
    }
    const titleWidth = Math.ceil(labelWidth(title, 400) + PADDING_X + BORDER_X);
    const previewWidth = preview ? Math.ceil(labelWidth(preview, 400, 11, PREVIEW_CHAR_WIDTH) + PADDING_X + BORDER_X) : 0;
    const mediaHeight = media && media.length > 0 ? THUMB_HEIGHT + 6 : 0;
    const mediaWidth = media && media.length > 0 ? Math.min(media.length, 2) * (THUMB_WIDTH + 6) + PADDING_X : 0;
    return {
        width: Math.max(60, titleWidth, previewWidth, mediaWidth),
        height: (preview ? NODE_HEIGHT + PREVIEW_HEIGHT : NODE_HEIGHT) + mediaHeight,
    };
}

interface Branch {
    node: PlainNode;
    /** Position among the root's children, which picks the colours of the branch. */
    index: number;
}

/** A side of a node box; every node has a source handle `out-<side>` and a target handle `in-<side>` on each. */
export type Facing = 'left' | 'right' | 'top' | 'bottom';

const OPPOSITE: Record<Facing, Facing> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** Edge from `parent` to `node`, leaving the parent on its `facing` side and entering the node on the opposite one. */
function branchEdge(parent: PlainNode, node: PlainNode, color: string, facing: Facing): Edge {
    return {
        id: `${parent.id}-${node.id}`,
        source: parent.id,
        sourceHandle: `out-${facing}`,
        target: node.id,
        targetHandle: `in-${OPPOSITE[facing]}`,
        type: 'default',
        style: { stroke: color, strokeWidth: 2 },
    };
}

/**
 * Height of the block a subtree needs: its children stacked with GAP_Y, or the node itself if taller.
 */
function blockHeights(node: PlainNode, depth: number, heights: Map<string, number>): number {
    const own = estimateSize(node.title, depth, node.preview, node.media, node.text).height;
    const stacked = node.children.reduce((sum, child, index) => sum + blockHeights(child, depth + 1, heights) + (index > 0 ? GAP_Y : 0), 0);
    const height = Math.max(own, stacked);
    heights.set(node.id, height);
    return height;
}

/** Total height of the given branches stacked with GAP_Y. */
function stackHeight(branches: Branch[], heights: Map<string, number>): number {
    return branches.reduce((sum, branch, index) => sum + heights.get(branch.node.id)! + (index > 0 ? GAP_Y : 0), 0);
}

/**
 * Lays out the branches of one side as a tidy tree. Depth 1 starts one column
 * gap away from x = 0; the x axis grows away from the root. Returns the
 * nodes, the edges and the total height so the caller can centre the side on
 * the root, whose centre is at half that height.
 */
function layoutSide(root: PlainNode, branches: Branch[], side: Side, heights: Map<string, number>): { nodes: MdFlowNode[]; edges: Edge[]; height: number } {
    const height = stackHeight(branches, heights);
    const placed: Array<{ node: PlainNode; depth: number; color: string; parent: PlainNode; size: { width: number; height: number }; centerY: number }> = [];
    const columnWidth: number[] = [];
    /** Largest vertical distance between a node at this depth and its parent. */
    const fanSpread: number[] = [];

    /** Places the subtree in the block that starts at `top` and returns the node's centre y. */
    const place = (node: PlainNode, depth: number, branch: number, parent: PlainNode, top: number): number => {
        const color = nodeColor(branch, depth);
        const size = estimateSize(node.title, depth, node.preview, node.media, node.text);
        const block = heights.get(node.id)!;
        let centerY = top + block / 2;
        if (node.children.length > 0) {
            const stacked = node.children.reduce((sum, child, index) => sum + heights.get(child.id)! + (index > 0 ? GAP_Y : 0), 0);
            let y = top + (block - stacked) / 2;
            const centers = node.children.map(child => {
                const center = place(child, depth + 1, branch, node, y);
                y += heights.get(child.id)! + GAP_Y;
                return center;
            });
            // Midway between the first and the last child, kept inside the node's own block.
            const mid = (centers[0] + centers[centers.length - 1]) / 2;
            centerY = Math.min(Math.max(mid, top + size.height / 2), top + block - size.height / 2);
        }
        placed.push({ node, depth, color, parent, size, centerY });
        columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, size.width);
        return centerY;
    };
    let top = 0;
    for (const branch of branches) {
        place(branch.node, 1, branch.index, root, top);
        top += heights.get(branch.node.id)! + GAP_Y;
    }

    // The root's centre is at half the side's height once the caller centres the side on it.
    const centerOf = new Map(placed.map(entry => [entry.node.id, entry.centerY]));
    for (const { depth, parent, centerY } of placed) {
        const parentCenter = parent === root ? height / 2 : centerOf.get(parent.id)!;
        fanSpread[depth] = Math.max(fanSpread[depth] ?? 0, Math.abs(centerY - parentCenter));
    }

    const columnX: number[] = [];
    let x = 0;
    for (let depth = 1; depth < columnWidth.length; depth++) {
        x += Math.min(GAP_X_MAX, Math.max(GAP_X, FAN_SLOPE * (fanSpread[depth] ?? 0)));
        columnX[depth] = x;
        x += columnWidth[depth];
    }

    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    for (const { node, depth, color, parent, size, centerY } of placed) {
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x: side === 'right' ? columnX[depth] : -(columnX[depth] + size.width), y: centerY - size.height / 2 },
            data: { title: node.title, ...textData(node), kind: node.kind, preview: node.preview, media: node.media, depth, side, color },
            ...size,
        });
        edges.push(branchEdge(parent, node, color, side));
    }
    return { nodes, edges, height };
}

/**
 * Positions for the tree in the given layout. Nodes listed in `overrides` keep
 * the offset from their parent that the user gave them, moved only as far as
 * it takes to clear the other boxes; the root is never overridden. The nodes in `collapsed` are laid out without their children.
 * The root comes first and every parent precedes its children, as React Flow
 * requires for `parentId`.
 */
export function layoutTree(
    whole: PlainNode,
    layout: Layout = 'center',
    overrides: Record<string, XY> = {},
    collapsed: ReadonlySet<string> = new Set(),
): { nodes: MdFlowNode[]; edges: Edge[] } {
    const root = withoutCollapsed(whole, collapsed);
    const laid = layout === 'radial' ? layoutRadial(root) : layoutTidy(root, layout, whole);
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
    clearSaved(nodes, overrides);
    return { nodes, edges: laid.edges };
}

/** Canvas boxes of the nodes, which come parent first. */
function canvasBoxes(nodes: MdFlowNode[]): Map<string, { x: number; y: number; width: number; height: number }> {
    const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const node of nodes) {
        const parent = node.parentId ? boxes.get(node.parentId) : undefined;
        boxes.set(node.id, { x: (parent?.x ?? 0) + node.position.x, y: (parent?.y ?? 0) + node.position.y, width: node.width ?? 0, height: node.height ?? 0 });
    }
    return boxes;
}

/**
 * A saved position can end up under another box, when a box grows or the tree around it moves: such a node moves,
 * with its subtree, up or down, whichever is shorter, until none of its boxes overlaps another. The saved position
 * itself stays as the user gave it.
 */
function clearSaved(nodes: MdFlowNode[], overrides: Record<string, XY>): void {
    for (const node of nodes) {
        if (!node.parentId || !overrides[node.id]) {
            continue;
        }
        const boxes = canvasBoxes(nodes);
        const inside = new Set([node.id]);
        for (const other of nodes) {
            if (other.parentId && inside.has(other.parentId)) {
                inside.add(other.id);
            }
        }
        const own = [...inside].map(id => boxes.get(id));
        const others = [...boxes].filter(([id]) => !inside.has(id)).map(([, box]) => box);
        /** How far the subtree has to go in that direction, past each box it meets on the way, to overlap none. */
        const shift = (down: boolean): number => {
            let dy = 0;
            for (;;) {
                let next = dy;
                for (const a of own) {
                    for (const b of others) {
                        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y + dy < b.y + b.height && b.y < a.y + dy + a.height) {
                            next = down ? Math.max(next, b.y + b.height + GAP_Y - a.y) : Math.min(next, b.y - GAP_Y - a.y - a.height);
                        }
                    }
                }
                if (next === dy) {
                    return dy;
                }
                dy = next;
            }
        };
        const down = shift(true);
        const up = down === 0 ? 0 : shift(false);
        const dy = -up < down ? up : down;
        if (dy !== 0) {
            node.position = { x: node.position.x, y: node.position.y + dy };
        }
    }
}

/**
 * Splits the top-level branches between the two sides so their heights stay
 * as close as possible: the tallest branch goes first, each to the side that
 * is shorter at that moment. Each side keeps the document order.
 */
export function balanceSides(branches: Branch[], heights: Map<string, number>): { right: Branch[]; left: Branch[] } {
    const order = branches.map((branch, index) => ({ branch, index })).sort((a, b) => heights.get(b.branch.node.id)! - heights.get(a.branch.node.id)! || a.index - b.index);
    const right: typeof order = [];
    const left: typeof order = [];
    let rightHeight = 0;
    let leftHeight = 0;
    for (const item of order) {
        const added = heights.get(item.branch.node.id)! + GAP_Y;
        if (rightHeight <= leftHeight) {
            right.push(item);
            rightHeight += added;
        } else {
            left.push(item);
            leftHeight += added;
        }
    }
    const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;
    return { right: right.sort(byIndex).map(item => item.branch), left: left.sort(byIndex).map(item => item.branch) };
}

/** `whole` is `root` with the children of collapsed nodes, which the sides are balanced on. */
function layoutTidy(root: PlainNode, layout: 'center' | 'right', whole: PlainNode): { nodes: MdFlowNode[]; edges: Edge[] } {
    const branches: Branch[] = root.children.map((node, index) => ({ node, index }));
    const heights = new Map<string, number>();
    branches.forEach(branch => blockHeights(branch.node, 1, heights));
    // Balanced on the whole tree, so collapsing a branch does not send branches to the other side.
    const wholeHeights = new Map<string, number>();
    whole.children.forEach(node => blockHeights(node, 1, wholeHeights));
    const { right, left } = layout === 'right' ? { right: branches, left: [] } : balanceSides(branches, wholeHeights);

    const rootSize = estimateSize(root.title, 0);
    const sides = [
        { side: 'right' as Side, laid: layoutSide(root, right, 'right', heights) },
        { side: 'left' as Side, laid: layoutSide(root, left, 'left', heights) },
    ];

    const nodes: MdFlowNode[] = [
        {
            id: root.id,
            type: NODE_TYPE,
            position: { x: -rootSize.width / 2, y: -rootSize.height / 2 },
            data: { title: root.title, kind: root.kind, preview: root.preview, depth: 0 },
            ...rootSize,
        },
    ];
    const edges: Edge[] = [];
    for (const { side, laid } of sides) {
        const offsetX = side === 'right' ? rootSize.width / 2 : -rootSize.width / 2;
        const offsetY = -laid.height / 2;
        for (const node of laid.nodes) {
            nodes.push({ ...node, position: { x: node.position.x + offsetX, y: node.position.y + offsetY } });
        }
        edges.push(...laid.edges);
    }
    return { nodes, edges };
}

/** Space kept between two boxes on the same ring, and between two rings. */
const RADIAL_GAP = 16;

/**
 * Root in the centre, one ring per depth. Every subtree gets a sector as wide
 * as its own box or its children need (a wide box needs more angle near the
 * top and the bottom than at the sides) and its node sits in the middle of
 * that sector. Each ring is pushed out until it clears the previous ring and
 * no two of its boxes overlap.
 */
function layoutRadial(root: PlainNode): { nodes: MdFlowNode[]; edges: Edge[] } {
    interface Item { node: PlainNode; depth: number; color: string; parent?: PlainNode; size: { width: number; height: number }; angle: number }
    const items = new Map<string, Item>();
    /** `branch` is the position of the top-level branch the node belongs to. */
    const collect = (node: PlainNode, depth: number, branch: number, parent?: PlainNode) => {
        const color = depth === 0 ? '' : nodeColor(branch, depth);
        const item: Item = { node, depth, color, parent, size: estimateSize(node.title, depth, node.preview, node.media, node.text), angle: 0 };
        items.set(node.id, item);
        node.children.forEach((child, index) => collect(child, depth + 1, depth === 0 ? index : branch, node));
    };
    collect(root, 0, 0);

    // Each subtree gets a sector of the circle as wide as it needs: its own box, or its
    // children's sectors put together, whichever is wider. A box needs angle in proportion
    // to its extent across the radius, which depends on its angle (so a few rounds settle
    // it), and inversely to its ring's radius, taken as proportional to its depth.
    const maxDepth = Math.max(...Array.from(items.values()).map(item => item.depth));
    const weights = new Map<string, number>();
    const weigh = (node: PlainNode): number => {
        const item = items.get(node.id)!;
        const across = Math.abs(Math.sin(item.angle)) * item.size.width + Math.abs(Math.cos(item.angle)) * item.size.height + RADIAL_GAP;
        const own = item.depth === 0 ? 0 : (across * maxDepth) / item.depth;
        const weight = Math.max(own, node.children.reduce((sum, child) => sum + weigh(child), 0));
        weights.set(node.id, weight);
        return weight;
    };
    const assign = (node: PlainNode, from: number, span: number) => {
        items.get(node.id)!.angle = from + span / 2;
        const total = node.children.reduce((sum, child) => sum + weights.get(child.id)!, 0);
        let start = from;
        for (const child of node.children) {
            const share = total > 0 ? (span * weights.get(child.id)!) / total : 0;
            assign(child, start, share);
            start += share;
        }
    };
    for (let round = 0; round < 4; round++) {
        weigh(root);
        assign(root, -Math.PI / 2 - Math.PI, 2 * Math.PI);
    }

    const byDepth: Item[][] = [];
    items.forEach(item => (byDepth[item.depth] = [...(byDepth[item.depth] ?? []), item]));
    const halfDiagonal = (ring: Item[]) => Math.max(...ring.map(item => Math.hypot(item.size.width, item.size.height) / 2));
    const radius: number[] = [0];
    for (let depth = 1; depth < byDepth.length; depth++) {
        const ring = byDepth[depth];
        // Clear the previous ring: every box stays inside its own band of distances from the centre.
        let r = radius[depth - 1] + halfDiagonal(byDepth[depth - 1]) + halfDiagonal(ring) + RADIAL_GAP;
        // Two boxes on the same ring stop overlapping once they are apart on x or on y, and both
        // distances grow with the radius.
        for (let i = 0; i < ring.length; i++) {
            for (let j = i + 1; j < ring.length; j++) {
                const a = ring[i];
                const b = ring[j];
                const dx = Math.abs(Math.cos(a.angle) - Math.cos(b.angle));
                const dy = Math.abs(Math.sin(a.angle) - Math.sin(b.angle));
                const needX = dx > 1e-9 ? ((a.size.width + b.size.width) / 2 + RADIAL_GAP) / dx : Infinity;
                const needY = dy > 1e-9 ? ((a.size.height + b.size.height) / 2 + RADIAL_GAP) / dy : Infinity;
                const need = Math.min(needX, needY);
                if (need !== Infinity) {
                    r = Math.max(r, need);
                }
            }
        }
        radius[depth] = r;
    }
    // Space the inner rings out to their share of the outer radius, so a ring with few
    // nodes does not leave a hole between the root and the rest; then make sure every
    // ring still clears the one inside it.
    for (let depth = byDepth.length - 2; depth >= 1; depth--) {
        radius[depth] = Math.max(radius[depth], (radius[depth + 1] * depth) / (depth + 1));
    }
    for (let depth = 1; depth < byDepth.length; depth++) {
        radius[depth] = Math.max(radius[depth], radius[depth - 1] + halfDiagonal(byDepth[depth - 1]) + halfDiagonal(byDepth[depth]) + RADIAL_GAP);
    }

    const center = (item: Item) => ({ x: radius[item.depth] * Math.cos(item.angle), y: radius[item.depth] * Math.sin(item.angle) });
    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    items.forEach(item => {
        const { node, depth, color, parent, size, angle } = item;
        if (depth === 0) {
            nodes.push({
                id: node.id,
                type: NODE_TYPE,
                position: { x: -size.width / 2, y: -size.height / 2 },
                data: { title: node.title, kind: node.kind, preview: node.preview, depth: 0 },
                ...size,
            });
            return;
        }
        const r = radius[depth];
        const side: Side = Math.cos(angle) < 0 ? 'left' : 'right';
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x: r * Math.cos(angle) - size.width / 2, y: r * Math.sin(angle) - size.height / 2 },
            data: { title: node.title, ...textData(node), kind: node.kind, preview: node.preview, media: node.media, depth, side, color },
            ...size,
        });
        // The edge leaves the parent on the side that faces the child, so it curves along the
        // way it travels instead of hooking at both ends.
        const from = parent === root ? { x: 0, y: 0 } : center(items.get(parent!.id)!);
        const to = center(item);
        const facing: Facing = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? (to.x >= from.x ? 'right' : 'left') : to.y >= from.y ? 'bottom' : 'top';
        edges.push(branchEdge(parent!, node, color, facing));
    });
    return { nodes, edges };
}
