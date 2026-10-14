import { en, Strings } from './en';
import { ptBR } from './pt-br';

export type { Strings };

/** Translations by Obsidian's language code; European Portuguese takes the Brazilian one. */
const LOCALES: Record<string, Partial<Strings>> = { 'pt-BR': ptBR, pt: ptBR };

/** The interface text for an Obsidian language code, in English where it has no translation. */
export function stringsFor(language: string): Strings {
    return { ...en, ...LOCALES[language] };
}
