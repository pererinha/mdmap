export interface MdmapSettings {
    /** List items and paragraphs in a heading's body become nodes; a list right after a paragraph becomes its children. */
    listItemsAsNodes: boolean;
    /** With list items as nodes, paragraphs are nodes too; off, they stay text in the body. */
    paragraphsAsNodes: boolean;
    /** Clicking a node in the map scrolls the note to it and highlights its line. */
    revealInNote: boolean;
}

export const DEFAULT_SETTINGS: MdmapSettings = {
    listItemsAsNodes: true,
    paragraphsAsNodes: true,
    revealInNote: true,
};
