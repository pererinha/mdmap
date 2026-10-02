/*
 * Mermaid `mindmap` export of the editor tree. Indentation carries the
 * hierarchy; titles with characters Mermaid reads as shapes or quotes are
 * wrapped in a square node with the quotes escaped.
 */

import { PlainNode } from './md-tree';

const UNSAFE_RE = /[()[\]{}"]/;

function label(title: string, index: number): string {
    const text = title.trim() === '' ? '(empty)' : title.trim();
    if (!UNSAFE_RE.test(text)) {
        return text;
    }
    return `n${index}["${text.replace(/"/g, '#quot;')}"]`;
}

export function toMermaidMindmap(root: PlainNode): string {
    const lines = ['mindmap'];
    let index = 0;
    const rootText = root.title.trim() === '' ? '(root)' : root.title.trim();
    lines.push(`  root((${UNSAFE_RE.test(rootText) ? `"${rootText.replace(/"/g, '#quot;')}"` : rootText}))`);
    const visit = (node: PlainNode, depth: number) => {
        for (const child of node.children) {
            index += 1;
            lines.push(`${'  '.repeat(depth)}${label(child.title, index)}`);
            visit(child, depth + 1);
        }
    };
    visit(root, 2);
    return lines.join('\n') + '\n';
}
