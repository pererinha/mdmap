import { getLanguage } from 'obsidian';
import { Strings, stringsFor } from './locales';

/** Read once, when the plugin loads. */
const strings = stringsFor(getLanguage());

/** The interface text in Obsidian's language. */
export function t(key: keyof Strings): string {
    return strings[key];
}
