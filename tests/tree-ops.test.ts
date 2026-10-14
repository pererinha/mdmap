import { expect } from 'chai';
import { PlainNode } from '../src/md-tree';
import { ancestorIds, countDescendants, findNode, searchNodes, setText, withoutCollapsed } from '../src/tree-ops';

const TREE: PlainNode = {
    id: 'root',
    title: 'Trip',
    children: [
        { id: 'a', title: 'Comments', children: [{ id: 'a1', title: 'No comment', children: [] }] },
        { id: 'b', title: 'Stops', text: 'Lisbon first, then the COMMENTS from Porto', kind: 'paragraph', children: [] },
        { id: 'c', title: 'Budget', children: [] },
    ],
};

describe('tree-ops', () => {
    it('withoutCollapsed drops the children of collapsed nodes and leaves the tree untouched', () => {
        const shown = withoutCollapsed(TREE, new Set(['a']));
        expect(shown.children.map(c => [c.id, c.children.length])).to.deep.equal([['a', 0], ['b', 0], ['c', 0]]);
        expect(findNode(TREE, 'a1')).to.not.equal(undefined);
        expect(withoutCollapsed(TREE, new Set(['root'])).children).to.deep.equal([]);
    });

    it('countDescendants counts every node under the node', () => {
        expect(countDescendants(TREE)).to.equal(4);
        expect(countDescendants(findNode(TREE, 'a')!)).to.equal(1);
        expect(countDescendants(findNode(TREE, 'c')!)).to.equal(0);
    });

    it('ancestorIds goes from the root to the parent', () => {
        expect(ancestorIds(TREE, 'a1')).to.deep.equal(['root', 'a']);
        expect(ancestorIds(TREE, 'root')).to.deep.equal([]);
        expect(ancestorIds(TREE, 'missing')).to.deep.equal([]);
    });

    it('searchNodes finds titles and paragraph text, ignoring case, in document order', () => {
        expect(searchNodes(TREE, 'comment')).to.deep.equal(['a', 'a1', 'b']);
        expect(searchNodes(TREE, '  BUDGET ')).to.deep.equal(['c']);
        expect(searchNodes(TREE, 'Madrid')).to.deep.equal([]);
    });

    it('searchNodes finds nothing for an empty query', () => {
        expect(searchNodes(TREE, '')).to.deep.equal([]);
        expect(searchNodes(TREE, '   ')).to.deep.equal([]);
    });

    it('setText gives a paragraph its whole text and first line, any other node its title', () => {
        const edited = setText(setText(TREE, 'b', 'Faro\nthen Porto', true), 'c', 'Costs');
        expect(findNode(edited, 'b')).to.include({ title: 'Faro', text: 'Faro\nthen Porto', editing: true });
        expect(findNode(edited, 'c')).to.include({ title: 'Costs' });
        expect(findNode(edited, 'c')!.editing).to.equal(undefined);
        expect(findNode(TREE, 'b')!.title).to.equal('Stops');
    });

    it('setText keeps a paragraph\'s thumbnails in step with the embed lines being typed', () => {
        const typed = setText(TREE, 'b', 'Stops\n![[map.png]]\nLisbon');
        expect(findNode(typed, 'b')).to.deep.include({ source: 'Stops\n![[map.png]]\nLisbon', media: ['map.png'] });
        expect(findNode(setText(TREE, 'b', 'Stops'), 'b')!.media).to.equal(undefined);
    });
});
