import { Notice, Plugin, TFile } from 'obsidian';
import EditorView, { VIEW_TYPE } from './editor-view';
import { mapRoot, parseMarkdown } from './md-tree';
import { toMermaidMindmap } from './mermaid';
import { DEFAULT_SETTINGS, MdmapSettings } from './settings';
import { MdmapSettingTab } from './settings-tab';
import { revealField } from './reveal';
import { followCursor } from './follow-cursor';

export default class MdmapPlugin extends Plugin {
    settings: MdmapSettings;

    async onload() {
        this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<MdmapSettings> | null) };
        this.registerView(VIEW_TYPE, leaf => new EditorView(leaf, this.settings, () => this.saveSettings()));
        this.registerEditorExtension(revealField);
        this.registerEditorExtension(followCursor((file, line, text) => this.focusHeading(file, line, text)));
        this.addCommand({
            id: 'edit-mind-map',
            name: 'Edit current note as mind map',
            callback: () => this.openEditor(),
        });
        this.addCommand({
            id: 'copy-mermaid',
            name: 'Copy current note as Mermaid mindmap',
            callback: () => this.copyMermaid(),
        });
        this.addSettingTab(new MdmapSettingTab(this.app, this));
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

    /** Opens the active note as a mind map in a split next to it. */
    private async openEditor() {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return;
        }
        const leaf = this.app.workspace.getLeaf('split', 'vertical');
        await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
    }

    private async copyMermaid() {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return;
        }
        const md = await this.app.vault.read(file);
        const root = mapRoot(parseMarkdown(md, undefined, { listItems: this.settings.listItemsAsNodes }), file.basename);
        await navigator.clipboard.writeText(toMermaidMindmap(root));
        new Notice('Mermaid mindmap copied to the clipboard');
    }
}
