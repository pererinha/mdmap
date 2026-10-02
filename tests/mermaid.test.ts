import { expect } from 'chai';
import { mapRoot, parseMarkdown } from '../src/md-tree';
import { toMermaidMindmap } from '../src/mermaid';

describe('mermaid export', () => {
    it('writes a mindmap block with the hierarchy by indentation', () => {
        const root = mapRoot(parseMarkdown('# Canal\n\n## Pesquisa\n- Fontes\n\n### Artigos (2026)\n## Roteiro\n'), 'f');
        expect(toMermaidMindmap(root)).to.equal(
            ['mindmap', '  root((Canal))', '    Pesquisa', '      Fontes', '      n3["Artigos (2026)"]', '    Roteiro', ''].join('\n'),
        );
    });

    it('matches the expected output for story.md', () => {
        const fs = require('fs');
        const story: string = fs.readFileSync(__dirname + '/fixtures-story.md', 'utf8');
        const expected: string = fs.readFileSync(__dirname + '/fixtures-story.mmd', 'utf8');
        expect(toMermaidMindmap(mapRoot(parseMarkdown(story), 'story'))).to.equal(expected);
    });
});
