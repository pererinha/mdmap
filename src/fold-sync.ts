/*
 * Folds in the note and collapsed nodes in the map follow each other. Obsidian
 * folds headings and list items with CodeMirror's fold effects; the plugin
 * shares Obsidian's copy of @codemirror/language, so it sees those effects and
 * can dispatch its own. A fold in a note's editor reports the folded lines;
 * folding a line from the map goes to every editor of the note.
 */

import { foldEffect, foldable, foldedRanges, unfoldEffect } from '@codemirror/language';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { TFile, editorInfoField } from 'obsidian';

/** A folded line of a note: 0-based, with its text, so a stale line number can be told apart. */
export interface FoldedLine {
    line: number;
    text: string;
}

/** The note editors that are open, so the map can fold lines in them. Obsidian can leave an editor of a closed note undestroyed, off the page. */
const editors = new Set<EditorView>();

/** Calls `onFold` with the note and all its folded lines whenever a fold or unfold happens in one of its editors. */
export function watchFolds(onFold: (file: TFile, lines: FoldedLine[]) => void): Extension {
    return [
        ViewPlugin.define(view => {
            editors.add(view);
            return { destroy: () => editors.delete(view) };
        }),
        EditorView.updateListener.of(update => {
            if (!update.view.dom.isConnected || !update.transactions.some(tr => tr.effects.some(effect => effect.is(foldEffect) || effect.is(unfoldEffect)))) {
                return;
            }
            const file = update.state.field(editorInfoField, false)?.file;
            if (file) {
                onFold(file, foldedLines(update.state));
            }
        }),
    ];
}

/** The line each folded range hangs from: a fold starts at the end of the heading or list item it hides the rest of. */
function foldedLines(state: EditorState): FoldedLine[] {
    const lines: FoldedLine[] = [];
    foldedRanges(state).between(0, state.doc.length, from => {
        const line = state.doc.lineAt(from);
        lines.push({ line: line.number - 1, text: line.text });
    });
    return lines;
}

/** The folded lines of the note in its first open editor; undefined when no editor has it open. */
export function noteFolds(path: string): FoldedLine[] | undefined {
    const view = editorsOf(path)[0];
    return view ? foldedLines(view.state) : undefined;
}

function editorsOf(path: string): EditorView[] {
    return [...editors].filter(view => view.dom.isConnected && view.state.field(editorInfoField, false)?.file?.path === path);
}

/**
 * Folds or unfolds these lines of the note in its open editors. A line is skipped when the editor has other text
 * there (unsaved edits moved it) or CodeMirror cannot fold it; lines already as asked are left alone.
 */
export function setNoteFolds(path: string, lines: Array<FoldedLine & { folded: boolean }>): void {
    for (const view of editorsOf(path)) {
        const { state } = view;
        const effects = [];
        for (const { line, text, folded } of lines) {
            if (line >= state.doc.lines || state.doc.line(line + 1).text !== text) {
                continue;
            }
            const { from, to } = state.doc.line(line + 1);
            const ranges: Array<{ from: number; to: number }> = [];
            foldedRanges(state).between(from, to, (start, end) => {
                ranges.push({ from: start, to: end });
            });
            if (folded && ranges.length === 0) {
                const range = foldable(state, from, to);
                if (range) {
                    effects.push(foldEffect.of(range));
                }
            } else if (!folded) {
                effects.push(...ranges.map(range => unfoldEffect.of(range)));
            }
        }
        if (effects.length > 0) {
            view.dispatch({ effects });
        }
    }
}
