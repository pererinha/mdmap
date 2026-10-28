import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import EditorView, { VIEW_TYPE } from './editor-view';
import { mapRoot, parseMarkdown } from './md-tree';
import { toMermaidMindmap } from './mermaid';
import { DEFAULT_SETTINGS, MdmapSettings } from './settings';
import { SettingsActions } from './settings-panel';
import { MdmapSettingTab } from './settings-tab';
import { revealField } from './reveal';
import { followCursor } from './follow-cursor';
import { watchFolds } from './fold-sync';
import { t } from './i18n';

export default class MdmapPlugin extends Plugin {
    settings: MdmapSettings;

    /** What the gear in a map and the settings tab change: each change is saved and shows on every open map. */
    readonly settingsActions: SettingsActions = {
        toggleReveal: () => {
            this.settings.revealInNote = !this.settings.revealInNote;
            void this.saveSettings();
            if (!this.settings.revealInNote) {
                this.maps().forEach(view => view.reveal(null));
            }
        },
        toggleParagraphs: () => {
            this.settings.paragraphsAsNodes = !this.settings.paragraphsAsNodes;
            void this.saveSettings();
            this.maps().forEach(view => view.reparse());
        },
        setColors: colors => {
            this.settings.colors = colors;
            void this.saveSettings();
            this.maps().forEach(view => view.applyColors());
        },
        toggleLock: () => {
            this.settings.locked = !this.settings.locked;
            void this.saveSettings();
        },
    };

    async onload() {
        this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<MdmapSettings> | null) };
        this.registerView(VIEW_TYPE, leaf => new EditorView(leaf, this.settings, () => this.saveSettings(), this.settingsActions));
        this.registerEditorExtension(revealField);
        this.registerEditorExtension(followCursor((file, line, text) => this.focusHeading(file, line, text)));
        this.registerEditorExtension(
            watchFolds((file, lines) =>
                this.maps()
                    .filter(view => view.getState().file === file.path)
                    .forEach(view => view.applyNoteFolds(lines)),
            ),
        );
        this.addCommand({
            id: 'edit-mind-map',
            name: t('editCommand'),
            callback: () => this.openEditor(),
        });
        this.addCommand({
            id: 'copy-mermaid',
            name: t('copyMermaidCommand'),
            callback: () => this.copyMermaid(),
        });
        this.addSettingTab(new MdmapSettingTab(this.app, this));
        // The collapsed nodes of a note follow it when it is renamed or moved.
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                const paths = this.settings.collapsed[oldPath];
                if (paths) {
                    delete this.settings.collapsed[oldPath];
                    this.settings.collapsed[file.path] = paths;
                    void this.saveSettings();
                }
            }),
        );
    }

    /** The mind maps of the note focus the node of the heading the cursor is on. */
    private focusHeading(file: TFile, line: number, text: string) {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
            if (leaf.view instanceof EditorView && leaf.view.getState().file === file.path) {
                leaf.view.focusHeading(line, text);
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /** The open mind maps. */
    private maps(): EditorView[] {
        return this.app.workspace
            .getLeavesOfType(VIEW_TYPE)
            .map(leaf => leaf.view)
            .filter((view): view is EditorView => view instanceof EditorView);
    }

    /** Opens the active note as a mind map in a split next to it. */
    private async openEditor() {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return;
        }
        const leaf = this.app.workspace.getLeaf('split', 'vertical');
        await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
        sizeSplit(leaf, this.settings.mapWidth);
    }

    private async copyMermaid() {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return;
        }
        const md = await this.app.vault.read(file);
        const root = mapRoot(parseMarkdown(md, undefined, { listItems: this.settings.listItemsAsNodes }), file.basename);
        await navigator.clipboard.writeText(toMermaidMindmap(root));
        new Notice(t('mermaidCopied'));
    }
}

/** Obsidian internals, not in its public API: a split's tab groups, and the share of the split a group takes. */
interface SplitItem {
    children?: SplitItem[];
    setDimension?(percent: number | null): void;
}

/**
 * Gives the leaf's tab group `width` percent of its split and the other group the rest.
 * ponytail: only a split of exactly two groups (the note and the map) is sized, and only while Obsidian has
 * setDimension; otherwise the split stays as Obsidian made it, half and half.
 */
function sizeSplit(leaf: WorkspaceLeaf, width: number) {
    const map = leaf.parent as unknown as SplitItem;
    const split = leaf.parent.parent as unknown as SplitItem;
    const note = split.children?.length === 2 ? split.children.find(child => child !== map) : undefined;
    if (map.setDimension && note?.setDimension) {
        map.setDimension(width);
        note.setDimension(100 - width);
    }
}
