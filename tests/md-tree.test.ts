import { expect } from 'chai';
import { mapRoot, mediaLinks, nodeLines, parseMarkdown, positionsToIds, reconcile, serializeMarkdown, MdNode, PlainNode } from '../src/md-tree';

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

const CANAL_AFTER_MOVE = [
    '# Canal',
    '',
    '## Pesquisa',
    '',
    '### Referências',
    '',
    '## Roteiro',
    '',
    '### Introdução',
    '### Desenvolvimento',
    '### Artigos',
    '',
].join('\n');

function find(node: PlainNode, title: string): PlainNode | undefined {
    if (node.title === title) return node;
    for (const child of node.children) {
        const hit = find(child, title);
        if (hit) return hit;
    }
    return undefined;
}

describe('md-tree', () => {
    it('round-trips the Canal example byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(CANAL))).to.equal(CANAL);
    });

    it('builds the expected hierarchy', () => {
        const root = mapRoot(parseMarkdown(CANAL), 'file');
        expect(root.title).to.equal('Canal');
        expect(root.children.map(c => c.title)).to.deep.equal(['Pesquisa', 'Roteiro']);
        expect(root.children[0].children.map(c => c.title)).to.deep.equal(['Referências', 'Artigos']);
    });

    it('moving Artigos into Roteiro produces the expected markdown', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        const pesquisa = find(root, 'Pesquisa')!;
        const roteiro = find(root, 'Roteiro')!;
        const artigos = find(root, 'Artigos')!;
        pesquisa.children = pesquisa.children.filter(c => c !== artigos);
        roteiro.children.push(artigos);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(CANAL_AFTER_MOVE);
    });

    it('reordering siblings keeps the spacing pattern of the parent', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        const pesquisa = find(root, 'Pesquisa')!;
        pesquisa.children.reverse();
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Pesquisa\n\n### Artigos\n\n### Referências\n\n## Roteiro');
    });

    it('re-parsing with the previous tree keeps node ids', () => {
        const first = parseMarkdown(CANAL);
        const roteiroId = find(mapRoot(first, 'f'), 'Roteiro')!.id;
        const second = parseMarkdown(CANAL + '### Encerramento\n', first);
        const root = mapRoot(second, 'f');
        expect(find(root, 'Roteiro')!.id).to.equal(roteiroId);
        expect(find(root, 'Encerramento')!.id).to.not.equal(roteiroId);
        const renamed = parseMarkdown(CANAL.replace('## Roteiro', '## Script'), first);
        expect(find(mapRoot(renamed, 'f'), 'Script')!.id).to.equal(roteiroId);
    });

    it('body text travels with its heading and is re-leveled', () => {
        const md = '# A\n\n## B\n\ntext under b\n\n## C\n';
        const tree = parseMarkdown(md);
        const root = mapRoot(tree, 'file');
        const b = find(root, 'B')!;
        const c = find(root, 'C')!;
        root.children = [c];
        c.children.push(b);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal('# A\n\n## C\n\n### B\n\ntext under b\n');
    });

    it('keeps front matter, preamble and fenced code', () => {
        const md = '---\ntags: x\n---\nintro\n\n# A\n\n```\n# not a heading\n```\n\n## B\n';
        expect(serializeMarkdown(parseMarkdown(md))).to.equal(md);
        expect(mapRoot(parseMarkdown(md), 'f').children.map(c => c.title)).to.deep.equal(['B']);
    });

    it('uses a virtual root when there are several top-level headings', () => {
        const md = '## A\n## B\n';
        const tree = parseMarkdown(md);
        const root = mapRoot(tree, 'note');
        expect(root.title).to.equal('note');
        expect(root.children.map(c => c.title)).to.deep.equal(['A', 'B']);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(md);
    });

    it('renames and adds nodes through reconcile', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        find(root, 'Roteiro')!.title = 'Script';
        find(root, 'Introdução')!.children.push({ id: 'new1', title: 'Gancho', children: [] });
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Script\n');
        expect(out).to.contain('### Introdução\n\n#### Gancho\n### Desenvolvimento');
    });
});

describe('md-tree with a real note (story.md)', () => {
    const fs = require('fs');
    const story: string = fs.readFileSync(__dirname + '/fixtures-story.md', 'utf8');

    it('round-trips byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(story))).to.equal(story);
    });

    it('turns list items into nodes and keeps paragraphs as body with a preview', () => {
        const root = mapRoot(parseMarkdown(story), 'story');
        expect(root.title).to.equal('story');
        expect(root.children.map(c => c.title)).to.deep.equal(['story vs narrative', 'what is a story', 'the spine', 'summary']);
        const narrative = find(root, 'a narrative')!;
        expect(narrative.children.map(c => c.title)).to.deep.equal(['about CHARACTERS ', 'dealing with a PROBLEM', 'unified by a PREMISSE ', 'told in a STRUCTURED ORDER']);
        expect(narrative.children.every(c => c.kind === 'list')).to.equal(true);
        expect(find(root, 'narrative')!.preview).to.equal('series of events communicated in a logical order');
        expect(find(root, 'narrative')!.children.map(c => c.title)).to.deep.equal(['examples']);
    });

    it('keeps list items as body when the option is off', () => {
        const root = mapRoot(parseMarkdown(story, undefined, { listItems: false }), 'story');
        expect(find(root, 'a narrative')!.children).to.have.length(0);
        expect(find(root, 'a narrative')!.preview).to.equal('- about CHARACTERS');
    });

    it('moving "summary" under "the spine" carries its paragraphs and re-levels "important"', () => {
        const tree = parseMarkdown(story);
        const root = mapRoot(tree, 'story');
        const summary = find(root, 'summary')!;
        root.children = root.children.filter(c => c !== summary);
        find(root, 'the spine')!.children.push(summary);
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('### summary\nthe protagonist encounters');
        expect(out).to.contain('#### important\na story without a *problem*');
        expect(out.split('\n').length).to.equal(story.split('\n').length);
    });
});

describe('md-tree list items', () => {
    const NOTE = [
        '# Note',
        '',
        '## Plan',
        'intro paragraph',
        '- first',
        '- second',
        '  - nested',
        '- third',
        '',
        'closing paragraph',
        '',
        '## Other',
        '- alpha',
        '',
    ].join('\n');

    it('round-trips a note with nested lists and paragraphs byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(NOTE))).to.equal(NOTE);
    });

    it('nests items by indentation and keeps the paragraphs as body', () => {
        const root = mapRoot(parseMarkdown(NOTE), 'note');
        const plan = find(root, 'Plan')!;
        expect(plan.preview).to.equal('intro paragraph');
        expect(plan.children.map(c => c.title)).to.deep.equal(['first', 'second', 'third']);
        expect(find(root, 'second')!.children.map(c => c.title)).to.deep.equal(['nested']);
        expect(find(root, 'third')!.preview).to.equal('closing paragraph');
    });

    it('renames a list item in place', () => {
        const tree = parseMarkdown(NOTE);
        const root = mapRoot(tree, 'note');
        find(root, 'second')!.title = 'segundo';
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(NOTE.replace('- second', '- segundo'));
    });

    it('adds a list item after a sibling and a nested item under an item', () => {
        const tree = parseMarkdown(NOTE);
        const root = mapRoot(tree, 'note');
        const plan = find(root, 'Plan')!;
        plan.children.splice(1, 0, { id: 'n1', title: 'inserted', kind: 'list', children: [] });
        find(root, 'nested')!.children.push({ id: 'n2', title: 'deeper', children: [] });
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('- first\n- inserted\n- second\n  - nested\n    - deeper\n- third');
    });

    it('deletes a list item together with its paragraph', () => {
        const tree = parseMarkdown(NOTE);
        const root = mapRoot(tree, 'note');
        const plan = find(root, 'Plan')!;
        plan.children = plan.children.filter(c => c.title !== 'third');
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(NOTE.replace('- third\n\nclosing paragraph\n', ''));
    });

    it('moves a list item under another heading, after that heading\'s items', () => {
        const tree = parseMarkdown(NOTE);
        const root = mapRoot(tree, 'note');
        const plan = find(root, 'Plan')!;
        const other = find(root, 'Other')!;
        const second = find(root, 'second')!;
        plan.children = plan.children.filter(c => c !== second);
        other.children.unshift(second);
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Other\n- second\n  - nested\n- alpha\n');
        expect(out).to.contain('## Plan\nintro paragraph\n- first\n- third\n\nclosing paragraph\n\n## Other');
    });

    it('writes list items before sub-headings and makes a heading moved under an item a list item', () => {
        const md = '# N\n\n## A\n- one\n\n### B\nbody of b\n';
        const tree = parseMarkdown(md);
        const root = mapRoot(tree, 'n');
        const a = find(root, 'A')!;
        const b = find(root, 'B')!;
        a.children = [b, ...a.children.filter(c => c !== b)];
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(md);
        find(root, 'one')!.children.push(b);
        a.children = a.children.filter(c => c !== b);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal('# N\n\n## A\n- one\n  - B\nbody of b\n');
    });

    it('a new child of a heading is a heading, a new child of an item is an item', () => {
        const tree = parseMarkdown(NOTE);
        const root = mapRoot(tree, 'note');
        find(root, 'Other')!.children.push({ id: 'h1', title: 'Sub', children: [] });
        find(root, 'alpha')!.children.push({ id: 'i1', title: 'beta', children: [] });
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Other\n- alpha\n  - beta\n\n### Sub\n');
    });
});

describe('md-tree media', () => {
    it('lists the embeds of a body and leaves them out of the preview', () => {
        expect(mediaLinks(['![[a/b.png]]', 'text ![alt](https://x.y/c.jpg "t") more', '![[clip.mp4|200]]', '[[not an embed]]']))
            .to.deep.equal(['a/b.png', 'https://x.y/c.jpg', 'clip.mp4']);
        const root = mapRoot(parseMarkdown('# N\n\n## A\n![[shot.png]]\nafter the image\n'), 'n');
        expect(find(root, 'A')!.media).to.deep.equal(['shot.png']);
        expect(find(root, 'A')!.preview).to.equal('after the image');
    });

    it('finds the screenshot embed under heading 4 of story.md', () => {
        const fs = require('fs');
        const story: string = fs.readFileSync(__dirname + '/fixtures-story.md', 'utf8');
        const root = mapRoot(parseMarkdown(story), 'story');
        const conflict = find(root, '4) the protagonist main story conflict')!;
        expect(conflict.media).to.deep.equal(['1.projects/1.personal/utube/_files/Screenshot 2026-10-01 at 2.37.40 PM.png']);
    });
});

describe('md-tree positions block', () => {
    const WITH_BLOCK = CANAL + '\n%% mindmap-positions\nPesquisa/Artigos: 120,-40\nRoteiro: -300,15\n%%\n';

    it('round-trips a note with a positions block byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(WITH_BLOCK))).to.equal(WITH_BLOCK);
        const tree = parseMarkdown(WITH_BLOCK);
        expect(tree.positions).to.deep.equal({ 'Pesquisa/Artigos': { x: 120, y: -40 }, Roteiro: { x: -300, y: 15 } });
        expect(mapRoot(tree, 'f').children.map(c => c.title)).to.deep.equal(['Pesquisa', 'Roteiro']);
    });

    it('maps the block to node ids and back, and drops the block when nothing is positioned', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'f');
        const artigos = find(root, 'Artigos')!;
        const moved = reconcile(tree, root, { [artigos.id]: { x: 120.4, y: -39.6 } });
        expect(serializeMarkdown(moved)).to.equal(CANAL + '\n%% mindmap-positions\nPesquisa/Artigos: 120,-40\n%%\n');
        expect(positionsToIds(mapRoot(moved, 'f'), moved.positions)).to.deep.equal({ [artigos.id]: { x: 120, y: -40 } });
        expect(serializeMarkdown(reconcile(moved, root, {}))).to.equal(CANAL);
    });

    it('a positioned parent and child are separate entries, each an offset from its own parent', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'f');
        const pesquisa = find(root, 'Pesquisa')!;
        const artigos = find(root, 'Artigos')!;
        const out = serializeMarkdown(reconcile(tree, root, { [pesquisa.id]: { x: 500, y: 300 }, [artigos.id]: { x: 40, y: 80 } }));
        expect(out).to.equal(CANAL + '\n%% mindmap-positions\nPesquisa: 500,300\nPesquisa/Artigos: 40,80\n%%\n');
    });

    it('a renamed node keeps its position under the new path', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'f');
        const artigos = find(root, 'Artigos')!;
        artigos.title = 'Papers';
        const out = serializeMarkdown(reconcile(tree, root, { [artigos.id]: { x: 1, y: 2 } }));
        expect(out).to.contain('%% mindmap-positions\nPesquisa/Papers: 1,2\n%%');
    });
});

describe('md-tree node lines', () => {
    const fs = require('fs');
    const notes: Array<[string, string]> = [
        ['Canal', CANAL],
        ['story.md', fs.readFileSync(__dirname + '/fixtures-story.md', 'utf8')],
        ['Canal with a positions block', CANAL + '\n%% mindmap-positions\nPesquisa/Artigos: 120,-40\n%%\n'],
    ];

    for (const [name, md] of notes) {
        it(`${name}: every node's line is its own heading or list item, in document order`, () => {
            const tree = parseMarkdown(md);
            const lines = md.split('\n');
            const lineOf = nodeLines(tree);
            const order: number[] = [];
            const visit = (node: MdNode) => {
                const line = lineOf.get(node.id);
                expect(line, node.title).to.be.a('number');
                const text = lines[line!];
                const own = node.kind === 'list' ? /^\s*([-*+]|\d+[.)])\s(.*)$/.exec(text)?.[2] : /^#{1,6}(?:\s+(.*))?$/.exec(text)?.[1] ?? '';
                expect(own, `line ${line} of ${node.title}`).to.equal(node.title);
                order.push(line!);
                node.children.forEach(visit);
            };
            tree.root.children.forEach(visit);
            expect(order.length).to.be.greaterThan(0);
            expect(order).to.deep.equal([...order].sort((a, b) => a - b));
        });
    }

    it('follows the note after the map changes it', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'f');
        const artigos = find(root, 'Artigos')!;
        const roteiro = find(root, 'Roteiro')!;
        // Move Artigos under Roteiro, as in CANAL_AFTER_MOVE.
        find(root, 'Pesquisa')!.children = find(root, 'Pesquisa')!.children.filter(c => c.id !== artigos.id);
        roteiro.children.push(artigos);
        const moved = reconcile(tree, root);
        const md = serializeMarkdown(moved);
        expect(md.split('\n')[nodeLines(moved).get(artigos.id)!]).to.equal('### Artigos');
        expect(nodeLines(moved).get(artigos.id)).to.equal(md.split('\n').indexOf('### Artigos'));
    });
});
