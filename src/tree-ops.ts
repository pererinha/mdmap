/*
 * Pure operations on the editor tree. Every function returns a new tree and
 * leaves the input untouched, so the view can keep snapshots for undo/redo.
 */

import { PlainNode, nextId } from './md-tree';

export const NEW_NODE_TITLE = 'New node';

export function findNode(root: PlainNode, id: string): PlainNode | undefined {
    if (root.id === id) {
        return root;
    }
    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) {
            return found;
        }
    }
    return undefined;
}

export function findParent(root: PlainNode, id: string): PlainNode | undefined {
    for (const child of root.children) {
        if (child.id === id) {
            return root;
        }
        const found = findParent(child, id);
        if (found) {
            return found;
        }
    }
    return undefined;
}

export function isDescendant(root: PlainNode, ancestorId: string, id: string): boolean {
    const ancestor = findNode(root, ancestorId);
    return !!ancestor && ancestor.id !== id && !!findNode(ancestor, id);
}

/** Ids of the nodes whose title or paragraph text contains `query`, ignoring case, in document order. */
export function searchNodes(root: PlainNode, query: string): string[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return [];
    }
    const ids: string[] = [];
    const visit = (node: PlainNode) => {
        if (node.title.toLowerCase().includes(needle) || node.text?.toLowerCase().includes(needle)) {
            ids.push(node.id);
        }
        node.children.forEach(visit);
    };
    visit(root);
    return ids;
}

function mapTree(node: PlainNode, fn: (node: PlainNode) => PlainNode): PlainNode {
    const mapped = fn(node);
    return { ...mapped, children: mapped.children.map(child => mapTree(child, fn)) };
}

export function rename(root: PlainNode, id: string, title: string): PlainNode {
    return mapTree(root, node => (node.id === id ? { ...node, title } : node));
}

/** Appends a child and returns the new tree with the child's id. */
export function addChild(root: PlainNode, parentId: string, title = NEW_NODE_TITLE): { root: PlainNode; id: string } {
    const parent = findNode(root, parentId);
    const child: PlainNode = { id: nextId(), title, kind: parent?.kind === 'list' ? 'list' : 'heading', children: [] };
    const next = mapTree(root, node => (node.id === parentId ? { ...node, children: [...node.children, child] } : node));
    return { root: next, id: child.id };
}

/** Inserts a sibling right after `id`; a sibling of the root becomes a child of the root. */
export function addSiblingAfter(root: PlainNode, id: string, title = NEW_NODE_TITLE): { root: PlainNode; id: string } {
    const parent = findParent(root, id);
    if (!parent) {
        return addChild(root, root.id, title);
    }
    const reference = findNode(root, id);
    const sibling: PlainNode = { id: nextId(), title, kind: reference?.kind, children: [] };
    const next = mapTree(root, node => {
        if (node.id !== parent.id) {
            return node;
        }
        const index = node.children.findIndex(child => child.id === id);
        const children = node.children.slice();
        children.splice(index + 1, 0, sibling);
        return { ...node, children };
    });
    return { root: next, id: sibling.id };
}

export function remove(root: PlainNode, id: string): PlainNode {
    if (root.id === id) {
        return root;
    }
    return mapTree(root, node => ({ ...node, children: node.children.filter(child => child.id !== id) }));
}

/** Moves the node among its siblings by `delta` positions; no-op at the edges. */
export function moveSibling(root: PlainNode, id: string, delta: number): PlainNode {
    const parent = findParent(root, id);
    if (!parent) {
        return root;
    }
    const index = parent.children.findIndex(child => child.id === id);
    const target = index + delta;
    if (target < 0 || target >= parent.children.length) {
        return root;
    }
    return mapTree(root, node => {
        if (node.id !== parent.id) {
            return node;
        }
        const children = node.children.slice();
        const [moved] = children.splice(index, 1);
        children.splice(target, 0, moved);
        return { ...node, children };
    });
}

/** Moves the subtree `id` to be the last child of `targetId`; no-op when the target is inside the subtree. */
export function moveInto(root: PlainNode, id: string, targetId: string): PlainNode {
    if (id === root.id || id === targetId || isDescendant(root, id, targetId)) {
        return root;
    }
    const subtree = findNode(root, id);
    if (!subtree || !findNode(root, targetId)) {
        return root;
    }
    const without = remove(root, id);
    return mapTree(without, node => (node.id === targetId ? { ...node, children: [...node.children, subtree] } : node));
}
