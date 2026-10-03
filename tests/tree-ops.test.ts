import { expect } from 'chai';
import { PlainNode } from '../src/md-tree';
import { searchNodes } from '../src/tree-ops';

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
    it('searchNodes finds titles and paragraph text, ignoring case, in document order', () => {
        expect(searchNodes(TREE, 'comment')).to.deep.equal(['a', 'a1', 'b']);
        expect(searchNodes(TREE, '  BUDGET ')).to.deep.equal(['c']);
        expect(searchNodes(TREE, 'Madrid')).to.deep.equal([]);
    });

    it('searchNodes finds nothing for an empty query', () => {
        expect(searchNodes(TREE, '')).to.deep.equal([]);
        expect(searchNodes(TREE, '   ')).to.deep.equal([]);
    });
});
