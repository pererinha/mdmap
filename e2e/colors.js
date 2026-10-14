// Colours under the map's gear, on a note with more top-level branches than the palette: a tab per theme shows the
// centre and the six palette colours, opening on the theme Obsidian is in; a palette colour opens a bar with its
// lighter shades, which the branches past the sixth take, and a new branch in the note gets one too. The editor row is locked until Edit; a colour
// typed as hex or picked reaches the open map at once, only in its own theme, and is saved; text that is not a hex
// changes nothing; "Use theme colors" brings the theme's back. Keys pressed in the panel stay out of the map; Escape
// and a click on the canvas close it. The panel never writes the note. The colours saved before are put back.
const { connect, sleep, reloadPlugin, openEditor, md, shot } = require('./lib');

const FILE = 'Colors-e2e.md';
const branches = n => Array.from({ length: n }, (_, i) => `## Ramo ${i + 1}${i === 0 ? '\n### Folha' : ''}`);
const NOTE = ['# Cores', '', ...branches(13)].join('\n') + '\n';
const DATA = '.obsidian/plugins/mdmap/data.json';
// Obsidian's default theme palette: green, orange, yellow, purple, blue, red.
const LIGHT = ['#08b94e', '#ec7500', '#e0ac00', '#7852ee', '#086ddd', '#e93147'];
const DARK = ['#44cf6e', '#e9973f', '#e0de71', '#a882ff', '#027aff', '#fb464c'];
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** A computed colour as `#rrggbb`: `rgb(8, 185, 78)`, or `color(srgb 0.27 0.79 0.48)` for a color-mix result. */
const hex = text => {
  const scale = text.startsWith('color(') ? 255 : 1;
  return '#' + text.match(/[\d.]+/g).slice(0, 3).map(n => Math.round(Number(n) * scale).toString(16).padStart(2, '0')).join('');
};
/** `#rrggbb` mixed with white as CSS color-mix does. */
const mix = (color, white) => '#' + channels(color).map(c => Math.round(c + ((255 - c) * white) / 100).toString(16).padStart(2, '0')).join('');
/** Two `#rrggbb` colours, one step of rounding apart at most. */
const close = (a, b) => channels(a).every((c, i) => Math.abs(c - channels(b)[i]) <= 1);
const near = (rgbText, color) => close(hex(rgbText), color);

/** Switches Obsidian's theme and waits until it has switched, which now and then takes longer than half a second. */
async function setTheme(page, dark) {
  await page.evaluate(dark => app.changeTheme(dark ? 'obsidian' : 'moonstone'), dark);
  await page.waitForFunction(dark => document.body.classList.contains(dark ? 'theme-dark' : 'theme-light'), { timeout: 10000 }, dark);
  await sleep(300);
}

/** Border colour of a node and the stroke of the edge into it. */
async function colorOf(page, title) {
  return page.evaluate(title => {
    const node = Array.from(document.querySelectorAll('.mdmap-node')).find(n => n.querySelector('.mdmap-title')?.textContent === title);
    const id = node.closest('.react-flow__node').dataset.id;
    const edge = Array.from(document.querySelectorAll('.react-flow__edge')).find(e => e.getAttribute('data-testid')?.endsWith(id));
    return { node: getComputedStyle(node).borderTopColor, edge: getComputedStyle(edge.querySelector('path.react-flow__edge-path')).stroke };
  }, title);
}
const rootColor = page => page.evaluate(() => getComputedStyle(document.querySelector('.mdmap-root-node')).backgroundColor);
const rootText = page => page.evaluate(() => getComputedStyle(document.querySelector('.mdmap-root-node')).color);
const branchIs = async (page, title, color) => {
  const c = await colorOf(page, title);
  return near(c.node, color) && near(c.edge, color);
};

const showTab = (page, theme) => page.click(`.mdmap-tabs button:nth-child(${theme === 'light' ? 1 : 2})`);
/** Selects the centre (0) or the branch at position `index` (1 for the first); past the sixth, a shade in its palette colour's bar. */
async function select(page, index) {
  const palette = index === 0 ? 0 : ((index - 1) % 6) + 1;
  await page.click(`.mdmap-swatches .mdmap-swatch:nth-child(${palette + 1})`);
  if (index > 6) {
    await sleep(150);
    await page.click(`.mdmap-shades .mdmap-swatch:nth-child(${Math.floor((index - 1) / 6)})`);
  }
}
const colorsIn = (page, selector) => page.evaluate(selector => Array.from(document.querySelectorAll(selector)).map(b => b.style.getPropertyValue('--mdmap-swatch')), selector);

/** One theme's centre and palette, as `#rrggbb`. */
async function swatches(page, theme) {
  await showTab(page, theme);
  await sleep(200);
  return colorsIn(page, '.mdmap-swatches .mdmap-swatch');
}
/** The shades in the bar of palette colour `palette` (1 to 6). */
async function shades(page, palette) {
  await page.click(`.mdmap-swatches .mdmap-swatch:nth-child(${palette + 1})`);
  await sleep(200);
  return colorsIn(page, '.mdmap-shades .mdmap-swatch');
}
const locked = page => page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-color-editor input')).every(i => i.disabled));

/** Selects a swatch and types into the hex field, key by key. */
async function typeHex(page, theme, index, text) {
  await showTab(page, theme);
  await select(page, index);
  await sleep(200);
  await page.focus('.mdmap-color-hex');
  await page.evaluate(() => document.querySelector('.mdmap-color-hex').select());
  await page.keyboard.type(text);
  await sleep(500);
}

/** Selects a swatch and sets the colour picker as its dialog would, through the input event React listens to. */
async function pickColor(page, theme, index, color) {
  await showTab(page, theme);
  await select(page, index);
  await sleep(200);
  await page.evaluate(color => {
    const input = document.querySelector('.mdmap-color-editor input[type="color"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, color);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, color);
  await sleep(500);
}

const saved = page => page.evaluate(async data => JSON.parse(await app.vault.adapter.read(data)).colors, DATA);
const panelOpen = page => page.evaluate(() => !!document.querySelector('.mdmap-settings'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  // Start with no picked colours; the ones saved before come back at the end.
  const previous = await page.evaluate(async ({ file, content, data }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
    const settings = JSON.parse(await app.vault.adapter.read(data));
    const colors = settings.colors;
    delete settings.colors;
    await app.vault.adapter.write(data, JSON.stringify(settings));
    return colors;
  }, { file: FILE, content: NOTE, data: DATA });
  await reloadPlugin(page);
  await setTheme(page, false);
  await openEditor(page, FILE);
  ctx.drain();
  const accentLight = hex(await rootColor(page));
  const textLight = hex(await rootText(page));

  // 1. the gear opens the panel on the light tab with the centre and the palette; the centre, selected, opens a bar
  // with its text and no shades; a palette colour opens its 25%, 50% and 75% lighter shades; the map's branches past the sixth match
  // them; the editor is locked
  await page.click('.mdmap-settings-button');
  await sleep(300);
  const openTab = await page.evaluate(() => document.querySelector('.mdmap-swatches').dataset.theme);
  const light = await swatches(page, 'light');
  const centreBar = await page.evaluate(() => document.querySelectorAll('.mdmap-shades .mdmap-swatch').length === 1 && !!document.querySelector('.mdmap-shades .mdmap-swatch-text'));
  const greenShades = await shades(page, 1);
  const dark = await swatches(page, 'dark');
  const orangeShadesDark = await shades(page, 2);
  await showTab(page, 'light');
  console.log('panel open:', await panelOpen(page), '| on the light tab:', openTab === 'light', '| centre and palette:', light.length === 7 && close(light[0], accentLight) && light.slice(1).every((c, i) => close(c, LIGHT[i])),
    '| the centre bar has only its text:', centreBar, '| green shades:', same(greenShades.length, 3) && greenShades.every((c, i) => close(c, mix(LIGHT[0], 25 * (i + 1)))),
    '| dark palette and orange shades:', dark.slice(1).every((c, i) => close(c, DARK[i])) && orangeShadesDark.every((c, i) => close(c, mix(DARK[1], 25 * (i + 1)))),
    '| locked:', await locked(page));
  console.log('map: Ramo 7 is green 25% lighter:', await branchIs(page, 'Ramo 7', mix(LIGHT[0], 25)), '| Ramo 13 green 50% lighter:', await branchIs(page, 'Ramo 13', mix(LIGHT[0], 50)));
  console.log(await shot(page, 'colors-01-panel'));

  // 2. Space on a panel button does not collapse the selected node
  const ramo1 = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-title')).find(s => s.textContent === 'Ramo 1').closest('.react-flow__node').dataset.id);
  await page.evaluate(id => app.workspace.getLeavesOfType('mdmap')[0].view.editor.focus(id), ramo1);
  await sleep(600);
  await page.focus('.mdmap-colors-actions button');
  await page.keyboard.press('Space');
  await sleep(300);
  const folha = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-title')).some(s => s.textContent === 'Folha'));
  console.log('Space on Edit unlocks the editor:', !(await locked(page)), '| and leaves "Ramo 1" expanded:', folha);

  // 3. typing a hex for light position 1 colours its branch and the lighter rounds made from it, in the same map
  await page.evaluate(() => (document.querySelector('.react-flow').dataset.mark = 'same'));
  await typeHex(page, 'light', 1, 'ff0000');
  const sameMap = await page.evaluate(() => document.querySelector('.react-flow').dataset.mark === 'same');
  console.log('typed ff0000 for light 1: Ramo 1 red:', await branchIs(page, 'Ramo 1', '#ff0000'), '| Ramo 7 25% lighter red:', await branchIs(page, 'Ramo 7', mix('#ff0000', 25)),
    '| Ramo 13 50% lighter red:', await branchIs(page, 'Ramo 13', mix('#ff0000', 50)), '| Ramo 2 still the theme:', await branchIs(page, 'Ramo 2', LIGHT[1]),
    '| same map:', sameMap, '| saved:', (await saved(page)).light.branches[0] === '#ff0000');

  // 4. text that is not a hex changes nothing, and the field shows the colour again when it loses focus
  await page.evaluate(() => document.querySelector('.mdmap-color-hex').select());
  await page.keyboard.type('zz');
  await sleep(300);
  const stillRed = await branchIs(page, 'Ramo 1', '#ff0000');
  await page.focus('.mdmap-colors-actions button');
  await sleep(200);
  console.log('"zz" changes nothing:', stillRed, '| field back to the colour:', (await page.$eval('.mdmap-color-hex', i => i.value)) === '#ff0000');

  // 5. a position past the palette takes its own colour; the centre too
  await typeHex(page, 'light', 8, '0000ff');
  const afterEight = await saved(page);
  await typeHex(page, 'light', 0, '#123456');
  console.log('light 8 blue:', await branchIs(page, 'Ramo 8', '#0000ff'), '| Ramo 2 still the theme:', await branchIs(page, 'Ramo 2', LIGHT[1]),
    '| saved at position 8:', afterEight.light.branches.length === 8 && afterEight.light.branches[7] === '#0000ff',
    '| centre #123456:', near(await rootColor(page), '#123456'), '| saved:', (await saved(page)).light.root === '#123456');

  // the centre's text, from the bar the centre opens
  await page.click('.mdmap-swatch-text');
  await sleep(200);
  await page.focus('.mdmap-color-hex');
  await page.evaluate(() => document.querySelector('.mdmap-color-hex').select());
  await page.keyboard.type('ffd54a');
  await sleep(500);
  console.log('centre text ffd54a:', near(await rootText(page), '#ffd54a'), '| saved:', (await saved(page)).light.rootText === '#ffd54a');

  // 6. a new top-level branch in the note gets the next colour and a swatch, with the panel open
  await page.evaluate(async file => {
    const f = app.vault.getAbstractFileByPath(file);
    await app.vault.modify(f, (await app.vault.read(f)) + '## Ramo 14\n');
  }, FILE);
  await sleep(1500);
  const ramo14 = await shades(page, 2);
  console.log('Ramo 14 is orange 50% lighter:', await branchIs(page, 'Ramo 14', mix(LIGHT[1], 50)),
    '| like the second orange shade:', close(ramo14[1], mix(LIGHT[1], 50)), '| panel still open:', await panelOpen(page));
  console.log(await shot(page, 'colors-02-light-picked'));

  // 7. the dark theme has its own colours: the theme's until a dark one is picked, here with the colour picker
  await setTheme(page, true);
  const darkBefore = (await branchIs(page, 'Ramo 1', DARK[0])) && (await branchIs(page, 'Ramo 8', mix(DARK[1], 25))) && near(await rootColor(page), dark[0]) && !near(await rootText(page), '#ffd54a');
  await pickColor(page, 'dark', 1, '#00ff00');
  console.log('dark before picking is the theme:', darkBefore, '| dark 1 green from the picker:', await branchIs(page, 'Ramo 1', '#00ff00'),
    '| Ramo 7 25% lighter green:', await branchIs(page, 'Ramo 7', mix('#00ff00', 25)));
  console.log(await shot(page, 'colors-03-dark-picked'));
  await setTheme(page, false);
  const backLight = { ramo1: await colorOf(page, 'Ramo 1'), ramo8: await colorOf(page, 'Ramo 8'), centre: await rootColor(page) };
  console.log('back in light, its own picks:', near(backLight.ramo1.node, '#ff0000') && near(backLight.ramo1.edge, '#ff0000') && near(backLight.ramo8.node, '#0000ff') && near(backLight.ramo8.edge, '#0000ff') && near(backLight.centre, '#123456'), JSON.stringify(backLight));

  // 8. Escape closes the panel and gives the keyboard back to the map; in the dark theme it opens on the dark tab
  await page.focus('.mdmap-colors-actions button');
  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('Escape closes:', !(await panelOpen(page)), '| focus in the map:', await page.evaluate(() => document.activeElement?.classList.contains('mdmap-root')));
  await setTheme(page, true);
  await page.click('.mdmap-settings-button');
  await sleep(300);
  console.log('in the dark theme the panel opens on the dark tab:', await page.evaluate(() => document.querySelector('.mdmap-swatches').dataset.theme === 'dark'));
  await page.click('.mdmap-settings-button');
  await setTheme(page, false);

  // 9. the picked colours survive a plugin reload
  await reloadPlugin(page);
  await openEditor(page, FILE);
  const reloaded = (await branchIs(page, 'Ramo 1', '#ff0000')) && (await branchIs(page, 'Ramo 8', '#0000ff')) && near(await rootColor(page), '#123456');
  await page.click('.mdmap-settings-button');
  await sleep(300);
  const afterReload = await swatches(page, 'light');
  const orangeShades = await shades(page, 2);
  console.log('after reload:', reloaded, '| the swatches show the picked colours:', afterReload[0] === '#123456' && afterReload[1] === '#ff0000' && afterReload[2] === LIGHT[1] && orangeShades[0] === '#0000ff');

  // 10. "Use theme colors" drops the picked colours in both themes, and turns itself off
  await page.click('.mdmap-reset');
  await sleep(500);
  const resetLight = (await branchIs(page, 'Ramo 1', LIGHT[0])) && (await branchIs(page, 'Ramo 8', mix(LIGHT[1], 25))) && near(await rootColor(page), accentLight) && near(await rootText(page), textLight);
  await setTheme(page, true);
  const resetDark = await branchIs(page, 'Ramo 1', DARK[0]);
  await setTheme(page, false);
  const after = await saved(page);
  console.log('theme colours back:', resetLight && resetDark, '| saved empty:', same(after, { light: { root: '', rootText: '', branches: [] }, dark: { root: '', rootText: '', branches: [] } }),
    '| button off:', await page.evaluate(() => document.querySelector('.mdmap-reset').disabled));

  // 11. a click on the canvas closes the panel
  const pane = await page.evaluate(() => {
    const r = document.querySelector('.react-flow__pane').getBoundingClientRect();
    return { x: r.x + 30, y: r.bottom - 30 };
  });
  await page.mouse.click(pane.x, pane.y);
  await sleep(300);
  console.log('canvas click closes:', !(await panelOpen(page)));

  console.log('the panel did not write the note:', (await md(page, FILE)) === NOTE + '## Ramo 14\n', '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  await page.evaluate(async ({ file, data, colors }) => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
    const settings = JSON.parse(await app.vault.adapter.read(data));
    if (colors) settings.colors = colors; else delete settings.colors;
    await app.vault.adapter.write(data, JSON.stringify(settings, null, 2));
  }, { file: FILE, data: DATA, colors: previous });
  await reloadPlugin(page);
  console.log('colours saved before put back:', JSON.stringify(await saved(page)) === JSON.stringify(previous));
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
