/** The plugin's interface text in English, which the other languages fall back to. */
export const en = {
    editCommand: 'Edit current note as mind map',
    copyMermaidCommand: 'Copy current note as Mermaid mindmap',
    mermaidCopied: 'Mermaid mindmap copied to the clipboard',
    viewSettings: 'Mind map settings',
    showClickedNode: 'Show clicked node in the note',
    showParagraphs: 'Show paragraphs',
    fileNotFound: 'File not found',
    copyAsMarkdown: 'Copy as Markdown',
    copiedAsMarkdown: 'Copied as Markdown',
    grip: 'Drag onto another node to move this node under it',
    searchNodes: 'Search nodes',
    tidyTree: 'Tidy tree',
    centerRoot: 'Center root',
    radial: 'Radial',
    listItemsName: 'List items and paragraphs as nodes',
    listItemsDesc:
        'Show the list items and paragraphs under a heading as nodes; a list right after a paragraph becomes its children. Takes effect when a mind map is opened.',
};

export type Strings = typeof en;
