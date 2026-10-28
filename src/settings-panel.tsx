/*
 * The gear in the map's top-right panel and the settings it opens under it:
 * the two view toggles and the colours. The plugin's settings tab opens the
 * same colour editor in a modal. A tab for the light and one for the dark
 * theme each show the centre and the six palette colours; the centre opens a
 * bar under them with its text colour, a palette colour one with its shades,
 * which colour the nodes under its top-level branches, one level each, the
 * last for every level below. A position with no colour picked shows the
 * palette's colour for it. A click on a swatch selects it and the row at the bottom shows it;
 * with Edit on, that row changes it with the colour picker or by typing its
 * hex. "Use theme colours" drops every picked colour.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, MdmapSettings, NodeColors, PALETTE_SIZE, ROUNDS, ThemeColors, mixWithWhite, parseHex, toHex, whiteShare } from './settings';
import { t } from './i18n';

/** What the panel changes; the view saves each change and shows it on every open map. */
export interface SettingsActions {
    toggleReveal: () => void;
    toggleParagraphs: () => void;
    setColors: (colors: NodeColors) => void;
    toggleLock: () => void;
}

type Theme = keyof NodeColors;
/** The centre, its text, or a position in `ThemeColors.branches`: a palette colour or a shade of one. */
type Slot = 'root' | 'rootText' | number;

const THEMES: Array<{ theme: Theme; label: string }> = [
    { theme: 'light', label: t('lightTheme') },
    { theme: 'dark', label: t('darkTheme') },
];

/** The Obsidian colours behind the palette, in order (`src/styles.css`); the centre is the accent, its text the text on it. */
const THEME_PALETTE = ['green', 'orange', 'yellow', 'purple', 'blue', 'red'];

/** The theme's colours, read from an element with that theme's class, so both themes can be read in either one. */
function themeColors(doc: Document, theme: Theme): ThemeColors {
    const probe = doc.body.createDiv({ cls: `theme-${theme}` });
    const read = (variable: string) => {
        probe.setCssProps({ color: `var(--${variable})` });
        return toHex(getComputedStyle(probe).color);
    };
    const colors = { root: read('interactive-accent'), rootText: read('text-on-accent'), branches: THEME_PALETTE.map(name => read(`color-${name}`)) };
    probe.remove();
    return colors;
}

/** `colors` with `color` at `slot`, the positions before it kept or left empty. */
function withColor(colors: ThemeColors, slot: Slot, color: string): ThemeColors {
    if (typeof slot === 'string') {
        return { ...colors, [slot]: color };
    }
    const branches = Array.from({ length: Math.max(colors.branches.length, slot + 1) }, (_, at) => colors.branches[at] ?? '');
    branches[slot] = color;
    return { ...colors, branches };
}

const themeLabel = (theme: Theme) => THEMES.find(item => item.theme === theme)!.label;
const positionLabel = (at: number) =>
    `${t('branchColor')} ${(at % PALETTE_SIZE) + 1}${at < PALETTE_SIZE ? '' : ` · ${t('level')} ${Math.floor(at / PALETTE_SIZE) + 1}`}`;
const slotLabel = (theme: Theme, slot: Slot) =>
    `${themeLabel(theme)} · ${slot === 'root' ? t('centerColor') : slot === 'rootText' ? t('centerText') : positionLabel(slot)}`;
/** A ref that puts the Lucide icon `name` in its element once. */
export const iconRef = (name: string) => (el: HTMLElement | null) => {
    if (el && !el.firstChild) {
        setIcon(el, name);
    }
};
const swatchStyle = (color: string) => ({ '--mdmap-swatch': color }) as CSSProperties;

/** Whether any colour is picked, in either theme. */
export function hasPickedColors(colors: NodeColors): boolean {
    return (['light', 'dark'] as const).some(of => colors[of].root !== '' || colors[of].rootText !== '' || colors[of].branches.some(color => color !== ''));
}

interface ColorEditorProps {
    /** Shared with the plugin and changed in place by the actions. */
    settings: MdmapSettings;
    actions: SettingsActions;
}

/** The colours: the theme tabs, the swatches and the bar under them, Edit and "Use theme colours", and the selected colour's row. */
export function ColorEditor({ settings, actions }: ColorEditorProps) {
    const [editing, setEditing] = useState(false);
    /** The theme's own colours, read when the editor shows. */
    const [theme] = useState<NodeColors>(() => ({ light: themeColors(document, 'light'), dark: themeColors(document, 'dark') }));
    /** The theme whose colours the swatches show, at first the one Obsidian is in, and the colour selected in it. */
    const [tab, setTab] = useState<Theme>(() => (document.body.classList.contains('theme-dark') ? 'dark' : 'light'));
    const [slot, setSlot] = useState<Slot>('root');
    /** The hex being typed, until the field loses focus; null shows the selected colour. */
    const [typed, setTyped] = useState<string | null>(null);
    // The actions change `settings` in place; this renders the editor again after one.
    const [, setVersion] = useState(0);
    const run = (action: () => void) => {
        action();
        setVersion(version => version + 1);
    };
    /** The swatch the bar under the row belongs to: the centre for its text, or the palette colour of a shade. */
    const parent: Slot = typeof slot === 'number' ? slot % PALETTE_SIZE : 'root';

    /** The colour shown for a position: the one picked, or the palette's, as src/tree-layout.ts colours the map. */
    const shown = (of: Theme, at: Slot): string => {
        const picked = settings.colors[of];
        if (at === 'root') {
            return picked.root || theme[of].root || '#000000';
        }
        if (at === 'rootText') {
            return picked.rootText || theme[of].rootText || '#ffffff';
        }
        if (picked.branches[at]) {
            return picked.branches[at];
        }
        const palette = picked.branches[at % PALETTE_SIZE] || theme[of].branches[at % PALETTE_SIZE] || '#000000';
        return mixWithWhite(palette, whiteShare(at));
    };
    const pick = (color: string) => run(() => actions.setColors({ ...settings.colors, [tab]: withColor(settings.colors[tab], slot, color) }));
    const select = (at: Slot) => {
        setSlot(at);
        setTyped(null);
    };

    const swatch = (at: Slot) => (
        <button
            key={String(at)}
            className={['mdmap-swatch', at === 'root' ? 'mdmap-swatch-root' : '', slot === at ? 'is-selected' : '', at === parent ? 'is-parent' : ''].join(' ')}
            aria-label={slotLabel(tab, at)}
            aria-pressed={slot === at}
            style={swatchStyle(shown(tab, at))}
            onClick={() => select(at)}
        />
    );

    return (
        <div className="mdmap-colors">
            <div className="mdmap-colors-heading">
                <span>{t('nodeColors')}</span>
                <span className="mdmap-tabs">
                    {THEMES.map(({ theme: of, label }) => (
                        <button
                            key={of}
                            className={tab === of ? 'is-active' : ''}
                            aria-pressed={tab === of}
                            onClick={() => {
                                setTab(of);
                                setTyped(null);
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </span>
            </div>

            <div className="mdmap-swatches" data-theme={tab}>
                {swatch('root')}
                {Array.from({ length: PALETTE_SIZE }, (_, at) => swatch(at))}
            </div>
            <div className="mdmap-shades">
                {parent === 'root' ? (
                    // The centre's text, previewed on the centre's colour.
                    <button
                        className={['mdmap-swatch', 'mdmap-swatch-text', slot === 'rootText' ? 'is-selected' : ''].join(' ')}
                        aria-label={slotLabel(tab, 'rootText')}
                        aria-pressed={slot === 'rootText'}
                        style={{ '--mdmap-swatch': shown(tab, 'root'), color: shown(tab, 'rootText') } as CSSProperties}
                        onClick={() => select('rootText')}
                    >
                        Aa
                    </button>
                ) : (
                    Array.from({ length: ROUNDS - 1 }, (_, round) => swatch(parent + (round + 1) * PALETTE_SIZE))
                )}
            </div>

            <div className="mdmap-colors-actions">
                <button className={editing ? 'mod-cta' : ''} aria-pressed={editing} onClick={() => setEditing(!editing)}>
                    {t('editColors')}
                </button>
                <button
                    className="mdmap-reset"
                    disabled={!hasPickedColors(settings.colors)}
                    onClick={() => {
                        setTyped(null);
                        run(() => actions.setColors(DEFAULT_SETTINGS.colors));
                    }}
                >
                    {t('themeColors')}
                </button>
            </div>

            <div className="mdmap-color-editor">
                <span>{slotLabel(tab, slot)}</span>
                <input
                    type="color"
                    aria-label={slotLabel(tab, slot)}
                    disabled={!editing}
                    value={shown(tab, slot)}
                    onChange={event => {
                        setTyped(null);
                        pick(event.target.value);
                    }}
                />
                <input
                    type="text"
                    className="mdmap-color-hex"
                    aria-label={t('hexColor')}
                    spellCheck={false}
                    disabled={!editing}
                    value={typed ?? shown(tab, slot)}
                    onChange={event => {
                        setTyped(event.target.value);
                        const hex = parseHex(event.target.value);
                        if (hex) {
                            pick(hex);
                        }
                    }}
                    onBlur={() => setTyped(null)}
                />
            </div>
        </div>
    );
}

interface SettingsPanelProps {
    /** Shared with the plugin and changed in place by the actions. */
    settings: MdmapSettings;
    actions: SettingsActions;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** The gear next to the layout buttons and the panel it opens: the view toggles, then the colours. */
export function SettingsPanel({ settings, actions, open, onOpenChange }: SettingsPanelProps) {
    // The actions change `settings` in place; this renders the toggles again after one.
    const [, setVersion] = useState(0);
    const toggle = (label: string, on: boolean, action: () => void, disabled = false) => (
        <label className="mdmap-setting">
            <span>{label}</span>
            <span className={['checkbox-container', on ? 'is-enabled' : '', disabled ? 'is-disabled' : ''].join(' ')}>
                <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => {
                        action();
                        setVersion(version => version + 1);
                    }}
                />
            </span>
        </label>
    );

    return (
        // Keys pressed in the panel never reach the map's shortcuts (Space collapses, Delete removes).
        <span className="mdmap-settings-anchor" onKeyDown={event => event.stopPropagation()}>
            <button
                className="mdmap-settings-button"
                aria-label={t('viewSettings')}
                aria-expanded={open}
                ref={iconRef('settings')}
                onClick={() => onOpenChange(!open)}
            />
            {open && (
                <div
                    className="mdmap-settings"
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            onOpenChange(false);
                        }
                    }}
                >
                    {toggle(t('showClickedNode'), settings.revealInNote, actions.toggleReveal)}
                    {/* Without list items as nodes, paragraphs are never nodes. */}
                    {toggle(t('showParagraphs'), settings.paragraphsAsNodes, actions.toggleParagraphs, !settings.listItemsAsNodes)}
                    <ColorEditor settings={settings} actions={actions} />
                </div>
            )}
        </span>
    );
}
