import { expect } from 'chai';
import { PlainNode, XY, mapRoot, parseMarkdown } from '../src/md-tree';
import { Layout, MdFlowNode, layoutTree } from '../src/tree-layout';

const CANAL = [
    '# Canal',
    '',
    '## Pesquisa',
    '',
    '### Referências',
    '### Artigos',
    '',
    '## Roteiro',
    '',
    '### Introdução',
    '### Desenvolvimento',
    '',
].join('\n');

const LAYOUTS: Layout[] = ['center', 'right', 'radial'];

function find(node: PlainNode, title: string): PlainNode | undefined {
    if (node.title === title) return node;
    for (const child of node.children) {
        const hit = find(child, title);
        if (hit) return hit;
    }
    return undefined;
}

/** Canvas position of every node: the parent's canvas position plus the node's offset. */
function absolute(nodes: MdFlowNode[]): Map<string, XY> {
    const result = new Map<string, XY>();
    for (const node of nodes) {
        const parent = node.parentId ? result.get(node.parentId) : undefined;
        result.set(node.id, parent ? { x: parent.x + node.position.x, y: parent.y + node.position.y } : { ...node.position });
    }
    return result;
}

function parentOf(root: PlainNode, id: string, parent?: PlainNode): PlainNode | undefined {
    if (root.id === id) return parent;
    for (const child of root.children) {
        const hit = parentOf(child, id, root);
        if (hit) return hit;
    }
    return undefined;
}

describe('tree-layout', () => {
    const root = mapRoot(parseMarkdown(CANAL), 'Canal');
    const pesquisa = find(root, 'Pesquisa')!;
    const artigos = find(root, 'Artigos')!;
    const referencias = find(root, 'Referências')!;
    const roteiro = find(root, 'Roteiro')!;
    const introducao = find(root, 'Introdução')!;

    for (const layout of LAYOUTS) {
        it(`${layout}: the root comes first, every parent precedes its children and every child points at its parent`, () => {
            const { nodes } = layoutTree(root, layout);
            expect(nodes[0].id).to.equal(root.id);
            expect(nodes[0].parentId).to.equal(undefined);
            const seen = new Set<string>();
            for (const node of nodes) {
                if (node.id !== root.id) {
                    expect(node.parentId).to.equal(parentOf(root, node.id)!.id);
                    expect(seen.has(node.parentId!), `${node.data.title} listed before its parent`).to.equal(true);
                }
                seen.add(node.id);
            }
            expect(nodes.length).to.equal(7);
        });
    }

    it('no override reproduces the plain layout', () => {
        expect(layoutTree(root, 'center', {})).to.deep.equal(layoutTree(root, 'center'));
    });

    it('an override on a parent shifts the whole subtree by the same delta and leaves the rest alone', () => {
        const before = absolute(layoutTree(root, 'center').nodes);
        const moved = layoutTree(root, 'center', { [pesquisa.id]: { x: 500, y: 300 } });
        const after = absolute(moved.nodes);
        expect(moved.nodes.find(n => n.id === pesquisa.id)!.position).to.deep.equal({ x: 500, y: 300 });

        const delta = { x: after.get(pesquisa.id)!.x - before.get(pesquisa.id)!.x, y: after.get(pesquisa.id)!.y - before.get(pesquisa.id)!.y };
        expect(delta).to.not.deep.equal({ x: 0, y: 0 });
        for (const child of [referencias, artigos]) {
            expect(after.get(child.id)!.x - before.get(child.id)!.x).to.equal(delta.x);
            expect(after.get(child.id)!.y - before.get(child.id)!.y).to.equal(delta.y);
        }
        for (const other of [root, roteiro, introducao]) {
            expect(after.get(other.id)).to.deep.equal(before.get(other.id));
        }
    });

    it("a child override is applied relative to the parent's final position", () => {
        const { nodes } = layoutTree(root, 'center', { [pesquisa.id]: { x: 500, y: 300 }, [artigos.id]: { x: 40, y: 80 } });
        const canvas = absolute(nodes);
        expect(nodes.find(n => n.id === artigos.id)!.position).to.deep.equal({ x: 40, y: 80 });
        expect(canvas.get(artigos.id)).to.deep.equal({ x: canvas.get(pesquisa.id)!.x + 40, y: canvas.get(pesquisa.id)!.y + 80 });
    });

    it('an override on the root is ignored', () => {
        expect(layoutTree(root, 'center', { [root.id]: { x: 999, y: 999 } })).to.deep.equal(layoutTree(root, 'center'));
    });
});
