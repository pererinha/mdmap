/*
 * Markdown <-> tree adapter.
 *
 * The .md file stays the source of truth. Each ATX heading becomes a node; the
 * lines under a heading (up to the next heading) are its body and travel with
 * the node when it moves. Heading levels are recomputed from tree depth on
 * serialization, so moving a node under a new parent re-levels its subtree.
 *
 * List items and paragraphs in a heading's body become nodes too (kinds
 * "list" and "paragraph"). Items nest by indentation. A paragraph starts at an
 * unindented line that opens the body or follows a blank line; its first line
 * is the node's title and the rest of the paragraph is its body. A list that
 * comes right after a paragraph (blank lines aside) belongs to that paragraph,
 * so "Rules:" followed by a numbered list is one node with the rules as its
 * children. Everything else (blank lines, continuation and indented lines,
 * tables, code, quotes, embeds) stays in the body of the node before it and
 * travels with it; lines before the first such node stay the heading's body.
 * Under a heading, items and paragraphs come before heading children, as in
 * the document.
 *
 * Node positions the user dragged are kept at the end of the note in an
 * Obsidian comment block, keyed by the node's title path. Each value is the
 * node's offset from its parent's top-left corner, so a positioned subtree
 * follows its parent:
 *
 *     %% mindmap-positions
 *     Heading A/Sub B: 120,-40
 *     %%
 *
 * The block is written only while at least one node has a position.
 *
 * Blank lines that separate sections are stored on the node that follows
 * them (`gapBefore`), except for a parent's first child, whose gap is stored
 * on the parent (`gapFirstChild`). Reordering siblings then keeps the
 * document's spacing pattern, and an unchanged document round-trips byte for
 * byte.
 */

export type NodeKind = 'heading' | 'list' | 'paragraph';

export interface MdNode {
    id: string;
    title: string;
    kind: NodeKind;
    /** List items: the bullet or number as written ("-", "*", "1."). */
    marker?: string;
    /** List items: the indentation as written; undefined means derive it from the parent. */
    indent?: string;
    /** Blank lines before this heading when it is not its parent's first heading child; undefined falls back to the tree default. */
    gapBefore?: number;
    /** Blank lines between this node's body (and list items) and its first child heading; undefined falls back to the tree default. */
    gapFirstChild?: number;
    /** Lines under the heading or item, trailing blank lines removed. */
    body: string[];
    children: MdNode[];
}

export interface MdTree {
    /** Lines before the first heading (front matter, intro text), trailing blanks removed. */
    preamble: string[];
    /** Heading level of the first heading; top-level nodes serialize at this level. */
    baseLevel: number;
    /** Blank lines at the end of the file (1 means the file ends with a newline). */
    trailingBlanks: number;
    /** Most common gap in the document; used for new nodes and parents that had no children. */
    defaultGap: number;
    /** Not serialized; holds the top-level headings. */
    root: MdNode;
    /** Dragged node positions by title path; empty means no block in the file. */
    positions: Record<string, XY>;
    /** Blank lines before the positions block. */
    positionsGap: number;
}

export interface XY {
    x: number;
    y: number;
}

const POSITIONS_START = '%% mindmap-positions';
const POSITIONS_END = '%%';
const POSITION_LINE_RE = /^(.*): (-?\d+),(-?\d+)$/;

/** Engine-agnostic shape the views exchange with the editor libraries. */
export interface PlainNode {
    id: string;
    title: string;
    children: PlainNode[];
    /** Undefined on nodes the editor created; reconcile derives the kind from the parent. */
    kind?: NodeKind;
    /** First line of the node's body, for display only. */
    preview?: string;
    /** Embeds in the body, as written: the link target of ![[file]] or ![alt](url). */
    media?: string[];
    /** Paragraphs: the paragraph's whole text, its lines joined with newlines, for display only. */
    text?: string;
}

export interface ParseOptions {
    /** Turn list items and paragraphs into nodes (default true). */
    listItems?: boolean;
}

const HEADING_RE = /^(#{1,6})(?:\s+(.*))?$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s(.*)$/;
const FENCE_RE = /^(```|~~~)/;
const PREVIEW_MAX = 60;
const EMBED_RE = /!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

let idCounter = 0;
export function nextId(): string {
    idCounter += 1;
    return `md${idCounter}`;
}

function trimTrailingBlanks(lines: string[]): number {
    let removed = 0;
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
        removed += 1;
    }
    return removed;
}

/**
 * Parses `md`. When `previous` is given, nodes keep the ids of the matching
 * nodes in the previous tree (same title under the same parent, else same
 * position), so editors keyed by id survive an external edit of the file.
 */
export function parseMarkdown(md: string, previous?: MdTree, options: ParseOptions = {}): MdTree {
    const lines = md.split('\n');
    const root: MdNode = { id: 'root', title: '', kind: 'heading', body: [], children: [] };
    const tree: MdTree = { preamble: [], baseLevel: 1, trailingBlanks: 0, defaultGap: 0, root, positions: {}, positionsGap: 1 };
    const gapCounts = new Map<number, number>();

    // stack of [level, node]; the virtual root sits at level 0
    const stack: Array<{ level: number; node: MdNode }> = [{ level: 0, node: root }];
    let current: MdNode | null = null;
    let inFence = false;
    let seenHeading = false;

    for (const line of lines) {
        if (FENCE_RE.test(line)) {
            inFence = !inFence;
        }
        const match = inFence ? null : line.match(HEADING_RE);
        if (!match) {
            if (current) {
                current.body.push(line);
            } else {
                tree.preamble.push(line);
            }
            continue;
        }

        const level = match[1].length;
        const title = match[2] ?? '';
        const gapBefore = current ? trimTrailingBlanks(current.body) : trimTrailingBlanks(tree.preamble);
        if (!seenHeading) {
            tree.baseLevel = level;
            seenHeading = true;
        }

        gapCounts.set(gapBefore, (gapCounts.get(gapBefore) ?? 0) + 1);
        const node: MdNode = { id: nextId(), title, kind: 'heading', body: [], children: [] };
        while (stack[stack.length - 1].level >= level) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].node;
        if (parent.children.length === 0) {
            parent.gapFirstChild = gapBefore;
        } else {
            node.gapBefore = gapBefore;
        }
        parent.children.push(node);
        stack.push({ level, node });
        current = node;
    }

    tree.trailingBlanks = current ? trimTrailingBlanks(current.body) : trimTrailingBlanks(tree.preamble);
    extractPositions(tree, current ? current.body : tree.preamble);
    gapCounts.forEach((count, gap) => {
        const best = gapCounts.get(tree.defaultGap) ?? 0;
        if (count > best || (count === best && gap > tree.defaultGap)) {
            tree.defaultGap = gap;
        }
    });
    if (options.listItems !== false) {
        splitBody(root);
    }
    if (previous) {
        adoptIds(root, previous.root);
    }
    return tree;
}

/** Takes the positions block off the end of `lines`, when there is one. */
function extractPositions(tree: MdTree, lines: string[]): void {
    if (lines[lines.length - 1] !== POSITIONS_END) {
        return;
    }
    const start = lines.lastIndexOf(POSITIONS_START);
    if (start < 0) {
        return;
    }
    const entries = lines.slice(start + 1, lines.length - 1);
    const positions: Record<string, XY> = {};
    for (const entry of entries) {
        const match = entry.match(POSITION_LINE_RE);
        if (!match) {
            return; // not our block; leave it as body
        }
        positions[match[1]] = { x: Number(match[2]), y: Number(match[3]) };
    }
    lines.splice(start);
    tree.positions = positions;
    tree.positionsGap = trimTrailingBlanks(lines);
}

/** Moves the list items of each heading's body into list nodes, recursively. */
const TABLE_RE = /^\s*\|/;
const QUOTE_RE = /^\s*>/;
const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const EMBED_LINE_RE = /^\s*(?:!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\))\s*$/;

/** Unindented text that can start a paragraph: not a table, quote, rule, comment, embed, fence or list item. */
function isParagraphStart(line: string): boolean {
    return (
        line.trim() !== '' &&
        !/^\s/.test(line) &&
        !TABLE_RE.test(line) &&
        !QUOTE_RE.test(line) &&
        !RULE_RE.test(line) &&
        !line.startsWith('%%') &&
        !line.startsWith('<') &&
        !EMBED_LINE_RE.test(line) &&
        !FENCE_RE.test(line) &&
        !LIST_ITEM_RE.test(line)
    );
}

/** Turns the list items and paragraphs in a heading's body into child nodes; recurses into sub-headings. */
function splitBody(heading: MdNode): void {
    const headingChildren = heading.children;
    const lead: string[] = [];
    const blocks: MdNode[] = [];
    // Open list items by indent width; empty when no list is running.
    const stack: Array<{ width: number; node: MdNode }> = [];
    // Where the top-level items of the running list go: a paragraph's children or the heading's.
    let listParent: MdNode[] = blocks;
    // The last paragraph, while a list that follows it would still be its list.
    let lastParagraph: MdNode | null = null;
    let owner: string[] = lead;
    let inFence = false;
    // The heading line counts as a block boundary, so a paragraph can start right under it.
    let afterBlank = true;

    for (const line of heading.body) {
        const fence = FENCE_RE.test(line);
        // Unindented text after a blank line ends a running list, as in Markdown; a list after it is a new list.
        if (!inFence && afterBlank && line.trim() !== '' && !/^\s/.test(line) && !LIST_ITEM_RE.test(line)) {
            stack.length = 0;
            listParent = blocks;
        }
        if (inFence || fence) {
            owner.push(line);
            inFence = fence ? !inFence : inFence;
            afterBlank = false;
            lastParagraph = null;
            continue;
        }
        if (line.trim() === '') {
            owner.push(line);
            afterBlank = true;
            continue;
        }
        const item = line.match(LIST_ITEM_RE);
        if (item) {
            const [, indent, marker, title] = item;
            const width = indent.length;
            const node: MdNode = { id: nextId(), title, kind: 'list', marker, indent, body: [], children: [] };
            while (stack.length > 0 && stack[stack.length - 1].width >= width) {
                stack.pop();
            }
            if (stack.length === 0 && lastParagraph) {
                listParent = lastParagraph.children;
                lastParagraph = null;
            }
            (stack.length > 0 ? stack[stack.length - 1].node.children : listParent).push(node);
            stack.push({ width, node });
            owner = node.body;
            afterBlank = false;
            continue;
        }
        if (afterBlank && isParagraphStart(line)) {
            const node: MdNode = { id: nextId(), title: line, kind: 'paragraph', body: [], children: [] };
            blocks.push(node);
            lastParagraph = node;
            owner = node.body;
            afterBlank = false;
            continue;
        }
        // Continuation lines, indented lines, tables, quotes, embeds: body of the node before them.
        if (afterBlank) {
            lastParagraph = null;
        }
        owner.push(line);
        afterBlank = false;
    }

    if (blocks.length > 0) {
        heading.body = lead;
        heading.children = [...blocks, ...headingChildren];
    }
    headingChildren.forEach(splitBody);
}

function adoptIds(node: MdNode, previous: MdNode): void {
    const unused = [...previous.children];
    const matches: Array<[MdNode, MdNode | undefined]> = node.children.map(child => {
        const byTitle = unused.findIndex(old => old.title === child.title);
        return [child, byTitle >= 0 ? unused.splice(byTitle, 1)[0] : undefined];
    });
    matches.forEach(([child, old], index) => {
        const match = old ?? (unused.length > 0 && previous.children[index] && unused.includes(previous.children[index])
            ? unused.splice(unused.indexOf(previous.children[index]), 1)[0]
            : undefined);
        if (match) {
            child.id = match.id;
            adoptIds(child, match);
        }
    });
}

export function serializeMarkdown(tree: MdTree): string {
    return writeLines(tree).lines.join('\n');
}

/** Line of each node's heading or list item in the serialized note, 0-based, by node id. */
export function nodeLines(tree: MdTree): Map<string, number> {
    return writeLines(tree).lineOf;
}

/**
 * The heading node written on `line` with exactly this text. When the note in
 * the editor has moved since the file was read (unsaved lines above), the
 * heading with this text nearest to `line`. Undefined for any other line.
 */
export function headingAt(tree: MdTree, line: number, text: string): string | undefined {
    if (!HEADING_RE.test(text)) {
        return undefined;
    }
    const { lines, lineOf } = writeLines(tree);
    let best: { id: string; distance: number } | undefined;
    lineOf.forEach((written, id) => {
        const distance = Math.abs(written - line);
        if (lines[written] === text && (!best || distance < best.distance)) {
            best = { id, distance };
        }
    });
    return best?.id;
}

/**
 * The node's part of the note as Markdown: its own line and everything under
 * it, as written, without trailing blank lines. A list item or an indented
 * paragraph loses its own indentation, so the copy starts at the margin. The
 * virtual root, which has no line of its own, gives the whole note.
 */
export function markdownOf(tree: MdTree, id: string): string {
    const { lines, lineOf, contentEnd } = writeLines(tree);
    const start = lineOf.get(id);
    const node = findMdNode(tree.root, id);
    let section: string[];
    if (start === undefined || !node) {
        section = lines.slice(0, contentEnd);
    } else {
        const inside = new Set<string>();
        const collect = (n: MdNode) => {
            inside.add(n.id);
            n.children.forEach(collect);
        };
        collect(node);
        let end = contentEnd;
        lineOf.forEach((line, other) => {
            if (!inside.has(other) && line > start && line < end) {
                end = line;
            }
        });
        section = lines.slice(start, end);
    }
    while (section.length > 0 && section[section.length - 1].trim() === '') {
        section.pop();
    }
    const indent = section.length > 0 ? section[0].match(/^\s*/)![0] : '';
    return section.map(line => (line.startsWith(indent) ? line.slice(indent.length) : line)).join('\n');
}

function findMdNode(node: MdNode, id: string): MdNode | undefined {
    if (node.id === id) {
        return node;
    }
    for (const child of node.children) {
        const found = findMdNode(child, id);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/** The note's lines, where each node's own line went, and where the content ends before the positions block. */
function writeLines(tree: MdTree): { lines: string[]; lineOf: Map<string, number>; contentEnd: number } {
    const out: string[] = [...tree.preamble];
    const lineOf = new Map<string, number>();
    const gapFor = (parent: MdNode, child: MdNode, firstHeading: boolean) =>
        (firstHeading ? parent.gapFirstChild : child.gapBefore) ?? tree.defaultGap;

    const emitChildren = (parent: MdNode, level: number, indent: string) => {
        let seenHeading = false;
        for (const child of parent.children) {
            if (child.kind === 'list') {
                emitItem(child, indent);
            } else if (child.kind === 'paragraph') {
                emitParagraph(child, indent);
            } else {
                emitHeading(child, level, gapFor(parent, child, !seenHeading));
                seenHeading = true;
            }
        }
    };
    const emitHeading = (node: MdNode, level: number, gap: number) => {
        for (let i = 0; i < gap; i++) {
            out.push('');
        }
        lineOf.set(node.id, out.length);
        out.push(node.title === '' ? '#'.repeat(level) : `${'#'.repeat(level)} ${node.title}`);
        out.push(...node.body);
        emitChildren(node, level + 1, '');
    };
    const emitParagraph = (node: MdNode, indent: string) => {
        // A paragraph at the top of a body needs a blank line before it unless it opens a heading's
        // body; a moved paragraph would otherwise run into the text before it. Under a list item it
        // is indented to the item's content, where Markdown keeps it inside the item.
        const previous = out[out.length - 1];
        if (indent === '' && previous !== undefined && previous.trim() !== '' && !HEADING_RE.test(previous)) {
            out.push('');
        }
        lineOf.set(node.id, out.length);
        out.push(`${indent}${node.title.trimStart()}`);
        out.push(...node.body);
        emitChildren(node, 0, '');
    };
    const emitItem = (node: MdNode, parentIndent: string) => {
        const marker = node.marker ?? '-';
        const indent = node.indent ?? parentIndent;
        lineOf.set(node.id, out.length);
        out.push(`${indent}${marker} ${node.title}`);
        out.push(...node.body);
        emitChildren(node, 0, indent + ' '.repeat(marker.length + 1));
    };

    emitChildren(tree.root, tree.baseLevel, '');
    const contentEnd = out.length;
    const paths = Object.keys(tree.positions);
    if (paths.length > 0) {
        for (let i = 0; i < tree.positionsGap; i++) {
            out.push('');
        }
        out.push(POSITIONS_START);
        for (const path of paths) {
            out.push(`${path}: ${tree.positions[path].x},${tree.positions[path].y}`);
        }
        out.push(POSITIONS_END);
    }
    for (let i = 0; i < tree.trailingBlanks; i++) {
        out.push('');
    }
    return { lines: out, lineOf, contentEnd };
}

/**
 * The node the editor shows as its root. A document with a single top-level
 * heading uses that heading; otherwise the virtual root stands in, titled
 * with the given fallback (typically the file name).
 */
export function mapRoot(tree: MdTree, fallbackTitle: string): PlainNode {
    const top = tree.root.children;
    const source = top.length === 1 ? top[0] : { ...tree.root, title: fallbackTitle };
    return toPlain(source);
}

export function toPlain(node: MdNode): PlainNode {
    const media = mediaLinks(node.body);
    const firstLine = node.body.find(line => line.trim() !== '' && mediaLinks([line]).length === 0)?.trim();
    const preview = firstLine && firstLine.length > PREVIEW_MAX ? `${firstLine.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : firstLine;
    const paragraph = node.kind === 'paragraph';
    return {
        id: node.id,
        title: node.title,
        kind: node.kind,
        preview: paragraph ? undefined : preview,
        media: media.length > 0 ? media : undefined,
        text: paragraph ? paragraphText(node) : undefined,
        children: node.children.map(toPlain),
    };
}

/** The paragraph's own lines: its title and the lines that continue it, up to the first blank line or other block. */
function paragraphText(node: MdNode): string {
    const lines = [node.title];
    for (const line of node.body) {
        if (line.trim() === '' || TABLE_RE.test(line) || FENCE_RE.test(line) || EMBED_LINE_RE.test(line)) {
            break;
        }
        lines.push(line);
    }
    return lines.map(line => line.trim()).join('\n');
}

/** Link targets of the image and video embeds in the lines, in order. */
export function mediaLinks(lines: string[]): string[] {
    const links: string[] = [];
    for (const line of lines) {
        EMBED_RE.lastIndex = 0;
        let match = EMBED_RE.exec(line);
        while (match) {
            links.push((match[1] ?? match[2]).trim());
            match = EMBED_RE.exec(line);
        }
    }
    return links;
}

function indexNodes(node: MdNode, into: Map<string, MdNode>): void {
    into.set(node.id, node);
    node.children.forEach(child => indexNodes(child, into));
}

/**
 * Rebuild the tree from the editor's current structure. Titles, order and
 * nesting come from the editor; bodies, gaps and markers come from the
 * existing nodes matched by id. Unknown ids are new nodes. A node under a
 * list item is a list item; under a heading, list items are written before
 * sub-headings.
 */
export function reconcile(tree: MdTree, editorRoot: PlainNode, positionsById?: Record<string, XY>): MdTree {
    const known = new Map<string, MdNode>();
    indexNodes(tree.root, known);

    const rebuild = (plain: PlainNode, parent: MdNode | undefined, previousSibling: MdNode | undefined): MdNode => {
        const existing = known.get(plain.id);
        // A paragraph stays a paragraph wherever it goes, so its text never gains a list marker; anything
        // else under an item or a paragraph is written as a list item.
        const kind: NodeKind =
            existing?.kind === 'paragraph' ? 'paragraph' : parent?.kind === 'list' || parent?.kind === 'paragraph' ? 'list' : existing?.kind ?? plain.kind ?? 'heading';
        const node: MdNode = {
            id: plain.id,
            title: plain.title,
            kind,
            marker: kind === 'list' ? existing?.marker ?? previousSibling?.marker ?? parent?.marker ?? '-' : undefined,
            indent: kind === 'list' && existing?.kind === 'list' ? existing.indent : undefined,
            gapBefore: existing?.gapBefore,
            gapFirstChild: existing?.gapFirstChild,
            body: existing ? existing.body : [],
            children: [],
        };
        let previous: MdNode | undefined;
        node.children = plain.children.map(child => {
            const built = rebuild(child, node, previous);
            previous = built;
            return built;
        });
        if (kind === 'heading') {
            node.children = attachListsToParagraphs([...node.children.filter(c => c.kind !== 'heading'), ...node.children.filter(c => c.kind === 'heading')]);
        }
        return node;
    };

    const singleTop = tree.root.children.length === 1 && tree.root.children[0].id === editorRoot.id;
    const rebuilt = rebuild(editorRoot, singleTop ? tree.root : undefined, undefined);
    const root: MdNode = singleTop
        ? { ...tree.root, children: [rebuilt] }
        : { ...tree.root, children: rebuilt.children };
    const positions = positionsById ? positionsToPaths(editorRoot, positionsById) : tree.positions;
    return { ...tree, root, positions };
}

/**
 * A list item written right after a paragraph is read back as that paragraph's
 * child, so the tree takes that shape now: items that follow a paragraph among
 * a heading's children move under it.
 */
function attachListsToParagraphs(children: MdNode[]): MdNode[] {
    const result: MdNode[] = [];
    let paragraph: MdNode | null = null;
    for (const child of children) {
        if (child.kind === 'list' && paragraph) {
            paragraph.children = [...paragraph.children, child];
            continue;
        }
        paragraph = child.kind === 'paragraph' ? child : null;
        result.push(child);
    }
    return result;
}

/** Title path of every node under the editor root, by id ("A/B" for B under A). */
function pathsById(root: PlainNode): Map<string, string> {
    const paths = new Map<string, string>();
    const visit = (node: PlainNode, prefix: string) => {
        for (const child of node.children) {
            const path = prefix ? `${prefix}/${child.title}` : child.title;
            paths.set(child.id, path);
            visit(child, path);
        }
    };
    visit(root, '');
    return paths;
}

/** Positions keyed by node id, for the editor. Paths that match no node are dropped. */
export function positionsToIds(root: PlainNode, positions: Record<string, XY>): Record<string, XY> {
    const byPath = new Map<string, string>();
    pathsById(root).forEach((path, id) => byPath.set(path, id));
    const result: Record<string, XY> = {};
    for (const path of Object.keys(positions)) {
        const id = byPath.get(path);
        if (id) {
            result[id] = positions[path];
        }
    }
    return result;
}

/** Positions keyed by title path, for the file. Ids that match no node are dropped. */
export function positionsToPaths(root: PlainNode, positions: Record<string, XY>): Record<string, XY> {
    const paths = pathsById(root);
    const result: Record<string, XY> = {};
    for (const id of Object.keys(positions)) {
        const path = paths.get(id);
        if (path) {
            result[path] = { x: Math.round(positions[id].x), y: Math.round(positions[id].y) };
        }
    }
    return result;
}
