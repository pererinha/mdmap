/*
 * Shows a node of the map in its note. In editing mode the note scrolls the
 * node's line to the middle and highlights it with a line decoration, so the
 * map keeps the keyboard focus (a selection is not drawn while the editor is
 * not focused). In reading mode the note scrolls the line to the top.
 */

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { MarkdownView } from 'obsidian';

/** Highlights the given 0-based line, or clears the highlight with null. */
const revealEffect = StateEffect.define<number | null>();

/** The highlighted line of each editor; registered once by the plugin. */
export const revealField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(highlight, tr) {
        highlight = highlight.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(revealEffect)) {
                highlight =
                    effect.value === null || effect.value >= tr.state.doc.lines
                        ? Decoration.none
                        : Decoration.set([Decoration.line({ class: 'mdmap-revealed' }).range(tr.state.doc.line(effect.value + 1).from)]);
            }
        }
        return highlight;
    },
    provide: field => EditorView.decorations.from(field),
});

/** The CodeMirror view behind a markdown view's editor; Obsidian does not type it. */
function codeMirror(view: MarkdownView): EditorView | undefined {
    return (view.editor as unknown as { cm?: EditorView }).cm;
}

export function revealLine(view: MarkdownView, line: number): void {
    if (view.getMode() === 'preview') {
        view.previewMode.applyScroll(line);
        return;
    }
    const cm = codeMirror(view);
    if (!cm || line >= cm.state.doc.lines) {
        return;
    }
    cm.dispatch({ effects: [revealEffect.of(line), EditorView.scrollIntoView(cm.state.doc.line(line + 1).from, { y: 'center' })] });
}

export function clearReveal(view: MarkdownView): void {
    codeMirror(view)?.dispatch({ effects: revealEffect.of(null) });
}
