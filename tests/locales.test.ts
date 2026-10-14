import { expect } from 'chai';
import { stringsFor } from '../src/locales';
import { en } from '../src/locales/en';

describe('locales', () => {
    it('Brazilian and European Portuguese get the Portuguese text', () => {
        expect(stringsFor('pt-BR').searchNodes).to.equal('Buscar nós');
        expect(stringsFor('pt').searchNodes).to.equal('Buscar nós');
    });

    it('a language with no translation gets English', () => {
        expect(stringsFor('ja')).to.deep.equal(en);
    });

    it('no text is empty', () => {
        for (const language of ['en', 'pt-BR']) {
            expect(Object.entries(stringsFor(language)).filter(([, text]) => !text.trim())).to.deep.equal([]);
        }
    });
});
