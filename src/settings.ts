export interface MdmapSettings {
    /** List items in a heading's body become child nodes of that heading. */
    listItemsAsNodes: boolean;
    /** Clicking a node in the map scrolls the note to it and highlights its line. */
    revealInNote: boolean;
}

export const DEFAULT_SETTINGS: MdmapSettings = {
    listItemsAsNodes: true,
    revealInNote: true,
};
