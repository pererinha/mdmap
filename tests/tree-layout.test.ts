import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PlainNode, XY, mapRoot, parseMarkdown } from '../src/md-tree';
import { GAP_Y, Layout, MdFlowNode, branchColor, layoutTree, nodeColor } from '../src/tree-layout';
import { countDescendants } from '../src/tree-ops';

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

interface Box { id: string; title: string; x: number; y: number; width: number; height: number; side?: string }

/** Canvas boxes of every node, from the parent chain. */
function boxes(nodes: MdFlowNode[]): Box[] {
    const canvas = absolute(nodes);
    return nodes.map(node => ({ id: node.id, title: node.data.title, ...canvas.get(node.id)!, width: node.width!, height: node.height!, side: node.data.side }));
}

function overlapping(all: Box[]): string[] {
    const hits: string[] = [];
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            const a = all[i];
            const b = all[j];
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
                hits.push(`${a.title} / ${b.title}`);
            }
        }
    }
    return hits;
}

function subtreeIds(node: PlainNode, into: string[] = []): string[] {
    into.push(node.id);
    node.children.forEach(child => subtreeIds(child, into));
    return into;
}

/** Vertical extent of the given boxes. */
function extent(of: Box[]): number {
    return of.length === 0 ? 0 : Math.max(...of.map(b => b.y + b.height)) - Math.min(...of.map(b => b.y));
}

describe('tree-layout while a paragraph is edited', () => {
    // Sections of eight lines: a paragraph shows six, and its whole text while it is edited.
    const sections = Array.from({ length: 20 }, (_, i) => [`## Seção ${i + 1}`, ...Array.from({ length: 8 }, (_, j) => `linha ${j + 1} da seção ${i + 1}`), ''].join('\n'));
    const longa = mapRoot(parseMarkdown(['# Longa', '', ...sections].join('\n')), 'Longa');

    for (const layout of ['center', 'right'] as Layout[]) {
        it(`${layout}: editing any paragraph leaves every top-level branch on its side`, () => {
            const side = (root: PlainNode) => {
                const nodes = layoutTree(root, layout).nodes;
                return root.children.map(child => nodes.find(node => node.id === child.id)!.data.side);
            };
            const resting = side(longa);
            const edited = longa.children.map(section => {
                const paragraph = section.children[0];
                const root = { ...longa, children: longa.children.map(s => (s === section ? { ...s, children: [{ ...paragraph, editing: true }] } : s)) };
                return JSON.stringify(side(root)) === JSON.stringify(resting) ? null : section.title;
            });
            expect(edited.filter(Boolean)).to.deep.equal([]);
        });
    }
});

describe('tree-layout on real notes', () => {
    const story = mapRoot(parseMarkdown(readFileSync(join(__dirname, '../e2e/fixtures/story.md'), 'utf8'), undefined, { listItems: true }), 'story');
    const canal = mapRoot(parseMarkdown(CANAL), 'Canal');
    const notes: Array<[string, PlainNode]> = [['story fixture', story], ['Canal', canal]];

    for (const [name, root] of notes) {
        for (const layout of LAYOUTS) {
            it(`${name}, ${layout}: no two node boxes overlap`, () => {
                expect(overlapping(boxes(layoutTree(root, layout).nodes))).to.deep.equal([]);
            });

            it(`${name}, ${layout}: a collapsed branch lays out without its nodes, and no boxes overlap`, () => {
                const branch = root.children.find(child => child.children.length > 0)!;
                const nodes = layoutTree(root, layout, {}, new Set([branch.id])).nodes;
                expect(nodes.length).to.equal(layoutTree(root, layout).nodes.length - countDescendants(branch));
                expect(nodes.some(node => node.id === branch.id)).to.equal(true);
                expect(nodes.filter(node => node.parentId === branch.id)).to.deep.equal([]);
                expect(overlapping(boxes(nodes))).to.deep.equal([]);
            });

            it(`${name}, ${layout}: collapsing a branch leaves every top-level branch on its side`, () => {
                const side = (nodes: MdFlowNode[]) => root.children.map(child => nodes.find(node => node.id === child.id)!.data.side);
                for (const branch of root.children.filter(child => child.children.length > 0)) {
                    expect(side(layoutTree(root, layout, {}, new Set([branch.id])).nodes)).to.deep.equal(side(layoutTree(root, layout).nodes));
                }
            });
        }

        for (const layout of ['center', 'right'] as Layout[]) {
            it(`${name}, ${layout}: sibling leaves are exactly GAP_Y apart, whatever their height`, () => {
                const byId = new Map(boxes(layoutTree(root, layout).nodes).map(b => [b.id, b]));
                const gaps: number[] = [];
                const visit = (node: PlainNode) => {
                    node.children.forEach((child, index) => {
                        const next = node.children[index + 1];
                        if (next && child.children.length === 0 && next.children.length === 0) {
                            const a = byId.get(child.id)!;
                            gaps.push(Math.round((byId.get(next.id)!.y - (a.y + a.height)) * 1000) / 1000);
                        }
                        visit(child);
                    });
                };
                root.children.forEach(visit);
                expect(gaps.length).to.be.greaterThan(0);
                expect(Array.from(new Set(gaps))).to.deep.equal([GAP_Y]);
            });
        }

        it(`${name}, center: the two sides differ in height by no more than the tallest top-level branch`, () => {
            const all = boxes(layoutTree(root, 'center').nodes);
            const byId = new Map(all.map(b => [b.id, b]));
            const sideOf = (side: string) => all.filter(b => b.side === side);
            const tallest = Math.max(...root.children.map(branch => extent(subtreeIds(branch).map(id => byId.get(id)!))));
            expect(Math.abs(extent(sideOf('left')) - extent(sideOf('right')))).to.be.at.most(tallest + GAP_Y);
        });
    }

    it('center splits the story fixture branches by height, not by order', () => {
        const all = boxes(layoutTree(story, 'center').nodes);
        const sides = story.children.map(branch => all.find(b => b.id === branch.id)!.side);
        // Alternating by order would give right, left, right, left, ...
        const alternating = story.children.map((_, index) => (index % 2 === 0 ? 'right' : 'left'));
        expect(sides).to.not.deep.equal(alternating);
    });

    for (const layout of LAYOUTS) {
        it(`${layout}: every edge leaves its parent on the side facing the child and enters on the opposite side`, () => {
            const { nodes, edges } = layoutTree(story, layout);
            const byId = new Map(boxes(nodes).map(b => [b.id, b]));
            const opposite: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
            for (const edge of edges) {
                const facing = String(edge.sourceHandle).replace('out-', '');
                expect(edge.targetHandle).to.equal(`in-${opposite[facing]}`);
                const s = byId.get(edge.source)!;
                const t = byId.get(edge.target)!;
                const dx = t.x + t.width / 2 - (s.x + s.width / 2);
                const dy = t.y + t.height / 2 - (s.y + s.height / 2);
                const toward = { left: dx < 0, right: dx > 0, top: dy < 0, bottom: dy > 0 }[facing];
                expect(toward, `${s.title} -> ${t.title} leaves on ${facing}`).to.equal(true);
            }
        });
    }
});

describe('branch colours', () => {
    it('the first six top-level branches take the palette; later ones the palette lighter each round', () => {
        expect(branchColor(0)).to.equal('var(--mdmap-color-1)');
        expect(branchColor(5)).to.equal('var(--mdmap-color-6)');
        expect(branchColor(6)).to.equal('color-mix(in srgb, var(--mdmap-color-1) 75%, white)');
        expect(branchColor(13)).to.equal('color-mix(in srgb, var(--mdmap-color-2) 50%, white)');
        expect(branchColor(24)).to.equal('var(--mdmap-color-1)');
    });

    it("the nodes under a branch take its palette colour's shades, one level each and the last for every level below", () => {
        expect(nodeColor(0, 1)).to.equal(branchColor(0));
        expect(nodeColor(6, 1)).to.equal(branchColor(6));
        expect(nodeColor(0, 2)).to.equal('var(--mdmap-pick-7, color-mix(in srgb, var(--mdmap-color-1) 75%, white))');
        expect(nodeColor(1, 3)).to.equal('var(--mdmap-pick-14, color-mix(in srgb, var(--mdmap-color-2) 50%, white))');
        expect(nodeColor(0, 4)).to.equal('var(--mdmap-pick-19, color-mix(in srgb, var(--mdmap-color-1) 25%, white))');
        expect(nodeColor(0, 6)).to.equal(nodeColor(0, 4));
        expect(nodeColor(6, 2)).to.equal(nodeColor(0, 2));
    });

    it('every layout colours each node by its top-level branch and its depth', () => {
        const root = mapRoot(parseMarkdown(['# Root', ...Array.from({ length: 8 }, (_, i) => `## B${i + 1}\n### leaf ${i + 1}\n#### twig ${i + 1}`)].join('\n')), 'Root');
        for (const layout of ['center', 'right', 'radial'] as Layout[]) {
            const colorOf = (title: string) => layoutTree(root, layout).nodes.find(node => node.data.title === title)!.data.color;
            expect(colorOf('B2'), layout).to.equal(nodeColor(1, 1));
            expect(colorOf('leaf 2'), layout).to.equal(nodeColor(1, 2));
            expect(colorOf('twig 2'), layout).to.equal(nodeColor(1, 3));
            expect(colorOf('B7'), layout).to.equal(nodeColor(6, 1));
            expect(colorOf('leaf 7'), layout).to.equal(nodeColor(6, 2));
            expect(colorOf('B8'), layout).to.equal(nodeColor(7, 1));
        }
    });
});
