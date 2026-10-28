export interface MdmapSettings {
    /** List items and paragraphs in a heading's body become nodes; a list right after a paragraph becomes its children. */
    listItemsAsNodes: boolean;
    /** With list items as nodes, paragraphs are nodes too; off, they stay text in the body. */
    paragraphsAsNodes: boolean;
    /** Clicking a node in the map scrolls the note to it and highlights its line. */
    revealInNote: boolean;
    /** The mind map's share of the window when it opens next to the note, in percent; the note gets the rest. */
    mapWidth: number;
    /** The collapsed nodes of each note, by the note's path, as title paths ("A/B" for B under A). */
    collapsed: Record<string, string[]>;
    /** The colours picked in the map's settings, for each theme. */
    colors: NodeColors;
    /** The lock in the map is closed: the map shows the note but does not change it. */
    locked: boolean;
}

/**
 * The colours picked for one theme, as `#rrggbb`: the centre and its text, and by position the palette colours, then their
 * shades for the nodes under a top-level branch, one round of the palette per level (`nodeColor` in `src/tree-layout.ts`).
 * A position with no colour, empty or past the end, takes the palette's colour for it.
 */
export interface ThemeColors {
    root: string;
    /** The text on the centre. */
    rootText: string;
    branches: string[];
}

export interface NodeColors {
    light: ThemeColors;
    dark: ThemeColors;
}

/** The palette: the theme's six colours, or the ones picked for the first six positions. */
export const PALETTE_SIZE = 6;

/**
 * Rounds of the palette before it starts over: its colours, then 25%, 50% and 75% closer to white. The top-level branches
 * past the sixth take them in turn; the nodes under a branch take its palette colour's shades, one round per level.
 */
export const ROUNDS = 4;

/** How much white, in percent, the palette colour at position `index` is mixed with: a top-level branch's or a shade's. */
export function whiteShare(index: number): number {
    return (Math.floor(index / PALETTE_SIZE) % ROUNDS) * 25;
}

const NO_COLORS: ThemeColors = { root: '', rootText: '', branches: [] };

export const DEFAULT_SETTINGS: MdmapSettings = {
    listItemsAsNodes: true,
    paragraphsAsNodes: true,
    revealInNote: true,
    mapWidth: 50,
    collapsed: {},
    // Replaced whole on every change, never changed in place.
    colors: { light: NO_COLORS, dark: NO_COLORS },
    locked: false,
};

/** The CSS variables a map reads the colours picked for a theme from (`src/styles.css`); an empty colour's variable is removed. */
export function colorProps(colors: NodeColors, theme: keyof NodeColors): Record<string, string> {
    const props: Record<string, string> = { '--mdmap-center': colors[theme].root, '--mdmap-center-text': colors[theme].rootText };
    colors[theme].branches.forEach((color, index) => (props[`--mdmap-pick-${index + 1}`] = color));
    return props;
}

/** `#rrggbb` mixed with white as CSS `color-mix(in srgb, …)` does, `white` percent of it white. */
export function mixWithWhite(hex: string, white: number): string {
    const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
    return '#' + channels.map(c => Math.round(c + ((255 - c) * white) / 100).toString(16).padStart(2, '0')).join('');
}

/** Typed hex, with or without `#`, as `#rrggbb`; null unless it is six hex digits. */
export function parseHex(text: string): string | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
    return match ? `#${match[1].toLowerCase()}` : null;
}

/** A computed colour, `rgb(8, 185, 78)`, as the `#08b94e` a colour input takes. */
export function toHex(rgb: string): string {
    return '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
}
