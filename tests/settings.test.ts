import { expect } from 'chai';
import { DEFAULT_SETTINGS, colorProps, mixWithWhite, parseHex, toHex, whiteShare } from '../src/settings';

describe('node colours', () => {
    const COLORS = {
        light: { root: '#123456', rootText: '#ffeeaa', branches: ['#ff0000', '', '', '', '', '', '', '#0000ff'] },
        dark: { root: '', rootText: '', branches: ['', '#00ff00'] },
    };

    it("a theme's picked colours set the centre, its text and position variables; an empty one removes its variable", () => {
        const light = colorProps(COLORS, 'light');
        expect(light['--mdmap-center']).to.equal('#123456');
        expect(light['--mdmap-center-text']).to.equal('#ffeeaa');
        expect(light['--mdmap-pick-1']).to.equal('#ff0000');
        expect(light['--mdmap-pick-2']).to.equal('');
        expect(light['--mdmap-pick-8']).to.equal('#0000ff');
        expect(Object.keys(light)).to.have.length(10);
        expect(colorProps(COLORS, 'dark')).to.deep.equal({ '--mdmap-center': '', '--mdmap-center-text': '', '--mdmap-pick-1': '', '--mdmap-pick-2': '#00ff00' });
    });

    it('no colour is picked by default', () => {
        for (const theme of ['light', 'dark'] as const) {
            expect(Object.values(colorProps(DEFAULT_SETTINGS.colors, theme)).every(value => value === '')).to.equal(true);
        }
    });

    it('each round of the palette past the first is 25% closer to white, and the fifth starts over', () => {
        expect([0, 5, 6, 11, 12, 18, 23, 24].map(whiteShare)).to.deep.equal([0, 0, 25, 25, 50, 75, 75, 0]);
    });

    it('a colour mixed with white matches CSS color-mix in srgb', () => {
        expect(mixWithWhite('#08b94e', 0)).to.equal('#08b94e');
        expect(mixWithWhite('#08b94e', 25)).to.equal('#46cb7a');
        expect(mixWithWhite('#ff0000', 50)).to.equal('#ff8080');
        expect(mixWithWhite('#000000', 100)).to.equal('#ffffff');
    });

    it('a computed colour becomes #rrggbb', () => {
        expect(toHex('rgb(8, 185, 78)')).to.equal('#08b94e');
        expect(toHex('rgba(68, 207, 110, 0.5)')).to.equal('#44cf6e');
    });

    it('typed hex is taken with or without # and in any case; anything else is not', () => {
        expect(parseHex('#FF0000')).to.equal('#ff0000');
        expect(parseHex(' 12ab9f ')).to.equal('#12ab9f');
        expect(parseHex('#fff')).to.equal(null);
        expect(parseHex('#ff00zz')).to.equal(null);
        expect(parseHex('')).to.equal(null);
    });
});
