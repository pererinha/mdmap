import { ItemView, MarkdownView, Menu, Notice, Scope, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { EditorSync, whenSized } from './editor-sync';
import { PlainNode, XY } from './md-tree';
import { MapEditor, MapEditorHandle, ResolvedMedia } from './map-editor';
import { clearReveal, revealLine } from './reveal';
import { MdmapSettings } from './settings';

export const VIEW_TYPE = 'mdmap';

export default class EditorView extends ItemView {
    private filePath: string;
    private sync: EditorSync;
    private host: HTMLDivElement;
    private reactRoot: Root;
    private editor: MapEditorHandle;

    constructor(
        leaf: WorkspaceLeaf,
        private settings: MdmapSettings,
        private saveSettings: () => Promise<void>,
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return `mdmap: ${this.filePath ?? ''}`;
    }

    getIcon(): string {
        return 'dot-network';
    }

    getState() {
        return { file: this.filePath };
    }

    async setState(state: { file?: string }, result: ViewStateResult) {
        if (state?.file && state.file !== this.filePath) {
            this.filePath = state.file;
            await this.start();
        }
        return super.setState(state, result);
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.addClass('mdmap-content');
        this.host = this.contentEl.createDiv({ cls: 'mdmap-host' });
        this.registerEvent(this.app.workspace.on('resize', () => this.editor?.fit()));
        this.addAction('settings', 'Mind map settings', evt => this.showSettings(evt));
        // Cmd/Ctrl+F while the map has focus goes to its search field instead of Obsidian's file search.
        this.scope = new Scope(this.app.scope);
        this.scope.register(['Mod'], 'f', () => {
            this.editor?.focusSearch();
            return false;
        });
    }

    /** The view's own settings, as a menu of toggles under the gear in the view header. */
    private showSettings(evt: MouseEvent) {
        new Menu()
            .addItem(item =>
                item
                    .setTitle('Show clicked node in the note')
                    .setChecked(this.settings.revealInNote)
                    .onClick(async () => {
                        this.settings.revealInNote = !this.settings.revealInNote;
                        await this.saveSettings();
                        if (!this.settings.revealInNote) {
                            this.reveal(null);
                        }
                    }),
            )
            .showAtMouseEvent(evt);
    }

    /** Scrolls the note open next to the map to the node's line and highlights it; null clears the highlight. */
    private reveal(id: string | null) {
        const note = this.app.workspace
            .getLeavesOfType('markdown')
            .map(leaf => leaf.view)
            .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === this.filePath);
        if (!note) {
            return;
        }
        const line = id !== null && this.settings.revealInNote ? this.sync.lineOf(id) : undefined;
        if (line === undefined) {
            clearReveal(note);
        } else {
            revealLine(note, line);
        }
    }

    async onClose() {
        this.sync?.unwatch();
        this.reactRoot?.unmount();
    }

    private async start() {
        const file = this.app.vault.getAbstractFileByPath(this.filePath);
        if (!(file instanceof TFile)) {
            this.host.setText(`File not found: ${this.filePath}`);
            return;
        }
        this.sync?.unwatch();
        this.sync = new EditorSync(this.app, file, root => this.editor?.reload(root, this.sync.positions()), {
            listItems: this.settings.listItemsAsNodes,
        });
        const root = await this.sync.load();
        // React Flow needs a sized container to fit the view on its first render.
        await whenSized(this.host);

        this.reactRoot?.unmount();
        this.reactRoot = createRoot(this.host);
        this.reactRoot.render(
            <MapEditor
                root={root}
                positions={this.sync.positions()}
                onChange={(next: PlainNode, source: string, positions: Record<string, XY>) => void this.commit(next, source, positions)}
                onReady={handle => (this.editor = handle)}
                resolveMedia={link => this.resolveMedia(link)}
                onOpenMedia={link => void this.app.workspace.openLinkText(link, this.filePath, true)}
                onClickNode={id => this.reveal(id)}
                onCopyNode={id => void this.copyNode(id)}
            />,
        );
        this.sync.watch();
    }

    /** Selects and centers the node of the heading on that line of the note; other lines are ignored. */
    focusHeading(line: number, text: string) {
        const id = this.sync?.headingAt(line, text);
        if (id) {
            this.editor?.focus(id);
        }
    }

    /** Puts the node and everything under it on the clipboard, as Markdown from the note. */
    private async copyNode(id: string) {
        await navigator.clipboard.writeText(this.sync.markdownOf(id));
        new Notice('Copied as Markdown');
    }

    /** Vault embeds resolve through the metadata cache; http(s) links are used as they are. */
    private resolveMedia(link: string): ResolvedMedia | null {
        const kind = /\.(mp4|webm|mov|ogv|m4v)$/i.test(link) ? 'video' : /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(link) ? 'image' : null;
        if (!kind) {
            return null;
        }
        if (/^https?:\/\//.test(link)) {
            return { src: link, kind };
        }
        const file = this.app.metadataCache.getFirstLinkpathDest(link, this.filePath);
        return file ? { src: this.app.vault.getResourcePath(file), kind } : null;
    }

    /** Writes the tree and shows the editor what was written (reconcile may reorder list items before headings). */
    private async commit(next: PlainNode, source: string, positions: Record<string, XY>) {
        if (await this.sync.commit(next, source, positions)) {
            this.editor?.reload(this.sync.root(), this.sync.positions());
        }
    }
}
