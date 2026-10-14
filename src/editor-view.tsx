import { ItemView, MarkdownView, Notice, Scope, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { EditorSync, whenSized } from './editor-sync';
import { FoldedLine, noteFolds, setNoteFolds } from './fold-sync';
import { ParseOptions, PlainNode, XY, idsToPaths, pathsToIds } from './md-tree';
import { MapEditor, MapEditorHandle, ResolvedMedia } from './map-editor';
import { clearReveal, revealLine } from './reveal';
import { MdmapSettings, colorProps } from './settings';
import { SettingsActions } from './settings-panel';
import { t } from './i18n';

export const VIEW_TYPE = 'mdmap';

export default class EditorView extends ItemView {
    private filePath: string;
    private sync: EditorSync;
    private host: HTMLDivElement;
    private reactRoot: Root;
    private editor: MapEditorHandle;
    /** The nodes whose children the map hides, as it last reported them. */
    private collapsed: string[] = [];

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
        this.applyColors();
        this.host = this.contentEl.createDiv({ cls: 'mdmap-host' });
        this.registerEvent(this.app.workspace.on('resize', () => this.editor?.fit()));
        // Switching between the light and the dark theme changes the CSS, and the map takes that theme's picked colours.
        this.registerEvent(this.app.workspace.on('css-change', () => this.applyColors()));
        // Cmd/Ctrl+F while the map has focus goes to its search field instead of Obsidian's file search.
        this.scope = new Scope(this.app.scope);
        this.scope.register(['Mod'], 'f', () => {
            this.editor?.focusSearch();
            return false;
        });
    }

    /** The settings under the gear in the map: each change is saved, and paragraphs and colours change on every open map. */
    private settingsActions(): SettingsActions {
        return {
            toggleReveal: () => {
                this.settings.revealInNote = !this.settings.revealInNote;
                void this.saveSettings();
                if (!this.settings.revealInNote) {
                    this.reveal(null);
                }
            },
            toggleParagraphs: () => {
                this.settings.paragraphsAsNodes = !this.settings.paragraphsAsNodes;
                void this.saveSettings();
                this.forEachMap(view => view.reparse());
            },
            setColors: colors => {
                this.settings.colors = colors;
                void this.saveSettings();
                this.forEachMap(view => view.applyColors());
            },
        };
    }

    private forEachMap(fn: (view: EditorView) => void) {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
            if (leaf.view instanceof EditorView) {
                fn(leaf.view);
            }
        }
    }

    /**
     * The colours picked for the current theme, as the variables the map's palette reads (`src/styles.css`). On the
     * view, so a popout window gets them too.
     */
    applyColors() {
        // The theme is the app's: the main window's body has the new one when css-change fires, a popout's not yet.
        const theme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
        const props = colorProps(this.settings.colors, theme);
        // A position picked before and not now, or only in the other theme, loses its variable.
        for (const name of Array.from(this.contentEl.style)) {
            if (name.startsWith('--mdmap-') && !(name in props)) {
                props[name] = '';
            }
        }
        this.contentEl.setCssProps(props);
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
            this.host.setText(`${t('fileNotFound')}: ${this.filePath}`);
            return;
        }
        this.sync?.unwatch();
        this.sync = new EditorSync(this.app, file, root => this.editor?.reload(root, this.sync.positions()), this.parseOptions());
        const root = await this.sync.load();
        // The note's folds, if it is open, win over the collapsed nodes saved for it.
        const saved = pathsToIds(root, this.settings.collapsed[this.filePath] ?? []);
        const folds = noteFolds(this.filePath);
        this.collapsed = folds ? this.withNoteFolds(saved, folds) : saved;
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
                collapsed={this.collapsed}
                onCollapse={ids => void this.saveCollapsed(ids)}
                settings={this.settings}
                settingsActions={this.settingsActions()}
            />,
        );
        this.sync.watch();
    }

    private parseOptions(): ParseOptions {
        return { listItems: this.settings.listItemsAsNodes, paragraphs: this.settings.paragraphsAsNodes };
    }

    /**
     * Shows the note parsed with the current settings in the same map, which keeps its viewport. Undo and redo
     * are dropped: their trees come from the previous parse and would write the note wrong.
     */
    reparse() {
        if (this.sync && this.editor) {
            this.editor.reload(this.sync.reparse(this.parseOptions()), this.sync.positions(), true);
        }
    }

    /** Selects and centers the node of the heading on that line of the note; other lines are ignored. */
    focusHeading(line: number, text: string) {
        const id = this.sync?.headingAt(line, text);
        if (id) {
            this.editor?.focus(id);
        }
    }

    /** Nodes the note can fold, headings and list items with children other than the root, with their lines. */
    private foldableNodes(): Array<{ id: string; line: FoldedLine }> {
        const nodes: Array<{ id: string; line: FoldedLine }> = [];
        const visit = (node: PlainNode) => {
            for (const child of node.children) {
                const line = child.kind !== 'paragraph' && child.children.length > 0 ? this.sync.lineWithText(child.id) : undefined;
                if (line) {
                    nodes.push({ id: child.id, line });
                }
                visit(child);
            }
        };
        visit(this.sync.root());
        return nodes;
    }

    /** `collapsed` with the nodes the note can fold collapsed exactly where the note has these folds. */
    private withNoteFolds(collapsed: string[], folds: FoldedLine[]): string[] {
        const folded = new Set(folds.map(fold => this.sync.nodeAt(fold.line, fold.text)));
        const foldable = this.foldableNodes().map(node => node.id);
        return [...collapsed.filter(id => !foldable.includes(id)), ...foldable.filter(id => folded.has(id))];
    }

    /** The note's folds changed in its editor: the map collapses the same nodes. */
    applyNoteFolds(folds: FoldedLine[]) {
        if (!this.sync || !this.editor) {
            return;
        }
        const next = this.withNoteFolds(this.collapsed, folds);
        if (next.length !== this.collapsed.length || next.some(id => !this.collapsed.includes(id))) {
            this.editor.setCollapsed(next);
        }
    }

    /**
     * The map collapsed or expanded nodes: the note's open editors fold and unfold the same lines, and the plugin's
     * data keeps them by title path for the next time the map opens.
     */
    private async saveCollapsed(ids: string[]) {
        this.collapsed = ids;
        const paths = idsToPaths(this.sync.root(), ids);
        if (paths.length > 0) {
            this.settings.collapsed[this.filePath] = paths;
        } else {
            delete this.settings.collapsed[this.filePath];
        }
        // Last: the note's editors report their folds back through applyNoteFolds, which can change the nodes again.
        setNoteFolds(this.filePath, this.foldableNodes().map(node => ({ ...node.line, folded: ids.includes(node.id) })));
        await this.saveSettings();
    }

    /** Puts the node and everything under it on the clipboard, as Markdown from the note. */
    private async copyNode(id: string) {
        await navigator.clipboard.writeText(this.sync.markdownOf(id));
        new Notice(t('copiedAsMarkdown'));
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
