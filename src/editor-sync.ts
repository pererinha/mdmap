/*
 * Keeps one .md file and one mind map editor in sync.
 *
 * Editor -> file: the view hands over the editor's current tree; the sync
 * reconciles it with the parsed file and writes the result if it changed.
 * File -> editor: a vault 'modify' event for the file that is not our own
 * write re-parses the file and asks the view to reload the editor.
 */

import { App, EventRef, TFile } from 'obsidian';
import { MdTree, ParseOptions, PlainNode, XY, mapRoot, parseMarkdown, positionsToIds, reconcile, serializeMarkdown } from './md-tree';

export class EditorSync {
    private tree: MdTree;
    private lastWritten: string;
    private modifyRef: EventRef;

    constructor(
        private app: App,
        private file: TFile,
        private onExternalChange: (root: PlainNode) => void,
        private options: ParseOptions = {},
    ) {}

    async load(): Promise<PlainNode> {
        const md = await this.app.vault.read(this.file);
        this.lastWritten = md;
        this.tree = parseMarkdown(md, undefined, this.options);
        return this.root();
    }

    root(): PlainNode {
        return mapRoot(this.tree, this.file.basename);
    }

    /** The file's saved positions, keyed by node id of the current root. */
    positions(): Record<string, XY> {
        return positionsToIds(this.root(), this.tree.positions);
    }

    /** Returns true when the file was written. */
    async commit(editorRoot: PlainNode, source: string, positions?: Record<string, XY>): Promise<boolean> {
        const next = reconcile(this.tree, editorRoot, positions);
        const md = serializeMarkdown(next);
        if (md === this.lastWritten) {
            return false;
        }
        this.tree = next;
        this.lastWritten = md;
        await this.app.vault.modify(this.file, md);
        console.log(`[mdmap] ${source}: wrote ${this.file.path}`);
        return true;
    }

    watch(): void {
        this.modifyRef = this.app.vault.on('modify', async changed => {
            if (changed.path !== this.file.path) {
                return;
            }
            const md = await this.app.vault.read(this.file);
            if (md === this.lastWritten) {
                return;
            }
            this.lastWritten = md;
            this.tree = parseMarkdown(md, this.tree, this.options);
            this.onExternalChange(this.root());
        });
    }

    unwatch(): void {
        if (this.modifyRef) {
            this.app.vault.offref(this.modifyRef);
        }
    }
}

/** Resolves once the element has a non-zero size, or after `frames` attempts. */
export function whenSized(el: HTMLElement, frames = 60): Promise<boolean> {
    return new Promise(resolve => {
        const check = (left: number) => {
            if (el.clientWidth > 0 && el.clientHeight > 0) {
                resolve(true);
            } else if (left <= 0) {
                resolve(false);
            } else {
                requestAnimationFrame(() => check(left - 1));
            }
        };
        check(frames);
    });
}

export function injectCss(id: string, css: string): void {
    if (document.getElementById(id)) {
        return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}
