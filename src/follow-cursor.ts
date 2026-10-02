/*
 * The other direction of "show the node in the note": when the user puts the
 * cursor on a line of a note, by clicking or with the keyboard, the mind map
 * of that note can focus the node of that line. Only selections the user made
 * count; typing, and the plugin's own edits and scrolling, do not.
 */

import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { TFile, editorInfoField } from 'obsidian';

/**
 * Calls `onCursor` with the note, the 0-based line and its text when the user
 * clicks a line, or moves the cursor to another line with the keyboard.
 */
export function followCursor(onCursor: (file: TFile, line: number, text: string) => void): Extension {
    return EditorView.updateListener.of(update => {
        if (!update.selectionSet || update.docChanged || !update.transactions.some(tr => tr.isUserEvent('select'))) {
            return;
        }
        const line = update.state.doc.lineAt(update.state.selection.main.head);
        const before = update.startState.doc.lineAt(update.startState.selection.main.head).number;
        const clicked = update.transactions.some(tr => tr.isUserEvent('select.pointer'));
        if (!clicked && before === line.number) {
            return;
        }
        const file = update.state.field(editorInfoField, false)?.file;
        if (file) {
            onCursor(file, line.number - 1, line.text);
        }
    });
}
