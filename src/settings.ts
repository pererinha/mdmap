export interface MdmapSettings {
    /** List items in a heading's body become child nodes of that heading. */
    listItemsAsNodes: boolean;
}

export const DEFAULT_SETTINGS: MdmapSettings = {
    listItemsAsNodes: true,
};
