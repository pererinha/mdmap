// Records the README's demo in the test Obsidian, at a brisk pace: a trip note next to its map; a node clicked in the
// map shows its line in the note, and a sibling added there shows up in the note; a node dragged onto another moves
// in the note; Space collapses a branch and the note folds it; an item edited in the note shows up in the map, once
// Obsidian has saved the note; Radial lays the map out again; and a palette colour picked in the map's gear recolours a
// branch. The note has headings and list items only: paragraph blocks are wide enough to make the map unreadable at
// the GIF's size. The theme's colours are used, and the plugin's data, the theme and the window size are put back at
// the end.
//
//   node e2e/demo-gif.js /tmp/demo.webm
//   ffmpeg -y -i /tmp/demo.webm -vf "fps=14,scale=2400:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=200" /tmp/pal.png
//   ffmpeg -y -i /tmp/demo.webm -i /tmp/pal.png -lavfi "fps=14,scale=2400:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" -loop 0 mdmap.gif
const { connect, sleep, reloadPlugin, openEditor, drag, shot } = require('./lib');

const FILE = 'Trip to Italy.md';
const NOTE = `# Trip to Italy

## Packing
- Passport
- Charger
- Camera

## Route
- Rome
- Florence
- Venice

## Budget
- Hotels
- Food
- Trains

## Ideas
- Cooking class
- Vespa tour
- Lake Como
`;
const DATA = '.obsidian/plugins/mdmap/data.json';
const OUT = process.argv[2];
const [W, H] = [1200, 760];
/** Obsidian's inline title repeats the note's first heading; hidden while recording. */
const HIDE_TITLE = '.inline-title { display: none !important; }';
const resize = (page, w, h) => page.evaluate((w, h) => require('electron').remote.getCurrentWindow().setSize(w, h), w, h);
const type = (page, text) => page.keyboard.type(text, { delay: 55 });

/** The end of the note's line whose text, without heading or list marks, is `text`, for clicking into it. */
const lineEnd = (page, text) => page.evaluate(text => {
  const line = Array.from(document.querySelectorAll('.markdown-source-view .cm-line')).find(l => l.textContent.replace(/^[#\-•\s]*/, '').trim() === text);
  const r = line.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(line);
  return { x: range.getBoundingClientRect().right + 2, y: r.y + r.height / 2 };
}, text);

/** Centre of a node of the map, refusing one outside the map's pane, where a click would land in the note. */
async function nodeAt(page, title) {
  const r = await page.evaluate(title => {
    const node = Array.from(document.querySelectorAll('.mdmap-node')).find(n => n.querySelector('.mdmap-title')?.textContent === title);
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, inside: box.left >= pane.left && box.right <= pane.right && box.top >= pane.top && box.bottom <= pane.bottom };
  }, title);
  if (!r.inside) throw new Error(`node "${title}" is outside the map's pane`);
  return r;
}
const clickNode = async (page, title) => {
  const r = await nodeAt(page, title);
  await page.mouse.click(r.x, r.y);
};
const organize = (page, layout) => page.evaluate(l => document.querySelector(`.mdmap-organize[data-layout="${l}"]`).click(), layout);

(async () => {
  if (!OUT) throw new Error('usage: node e2e/demo-gif.js <out.webm>');
  const ctx = await connect();
  const { page } = ctx;
  const saved = await page.evaluate(async data => ({ data: await app.vault.adapter.read(data), dark: document.body.classList.contains('theme-dark') }), DATA);
  let recorder;
  try {
    await page.evaluate(async ({ file, content, data, css }) => {
      const existing = app.vault.getAbstractFileByPath(file);
      if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
      const settings = JSON.parse(await app.vault.adapter.read(data));
      Object.assign(settings, { listItemsAsNodes: true, paragraphsAsNodes: true, revealInNote: true, mapWidth: 74 });
      delete settings.colors;
      delete settings.collapsed?.[file];
      await app.vault.adapter.write(data, JSON.stringify(settings));
      app.changeTheme('moonstone');
      app.workspace.rightSplit.collapse();
      document.head.createEl('style', { attr: { id: 'mdmap-demo-style' }, text: css });
    }, { file: FILE, content: NOTE, data: DATA, css: HIDE_TITLE });
    await page.waitForFunction(() => document.body.classList.contains('theme-light'), { timeout: 10000 });
    await resize(page, W, H);
    await reloadPlugin(page);
    await openEditor(page, FILE);
    await organize(page, 'center');
    await sleep(1000);

    recorder = await page.screencast({ path: OUT });
    // 1. the note and its map, side by side
    await sleep(1200);
    await shot(page, 'demo-01-start');

    // 2. a click on a node shows its line in the note; Enter adds a sibling, which the note gets
    await clickNode(page, 'Charger');
    await sleep(700);
    await page.keyboard.press('Enter');
    await sleep(250);
    await type(page, 'Adapter');
    await page.keyboard.press('Escape');
    await sleep(1000);
    await shot(page, 'demo-02-sibling');

    // 3. a node dragged onto another moves under it, in the note too
    await drag(page, await nodeAt(page, 'Lake Como'), await nodeAt(page, 'Route'));
    await sleep(900);
    await shot(page, 'demo-03-drag');

    // 4. Space collapses a branch, and the note folds its heading
    await clickNode(page, 'Packing');
    await sleep(400);
    await page.keyboard.press('Space');
    await sleep(1000);
    await shot(page, 'demo-04-collapse');

    // 5. an item edited in the note changes in the map when Obsidian saves the note
    const food = await lineEnd(page, 'Food');
    await page.mouse.click(food.x, food.y);
    await sleep(500);
    await type(page, ' & wine');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.mdmap-title')).some(t => t.textContent === 'Food & wine'), { timeout: 10000 });
    await sleep(900);
    await shot(page, 'demo-05-note-edit');

    // 6. Radial lays the map out again
    await organize(page, 'radial');
    await sleep(1400);
    await shot(page, 'demo-06-radial');

    // 7. a palette colour picked under the map's gear recolours its branch
    await page.click('.mdmap-settings-button');
    await sleep(400);
    await page.click('.mdmap-swatches .mdmap-swatch:nth-child(3)');
    await sleep(300);
    await page.click('.mdmap-colors-actions button');
    await sleep(300);
    await page.focus('.mdmap-color-hex');
    await page.evaluate(() => document.querySelector('.mdmap-color-hex').select());
    await type(page, 'e63946');
    await sleep(900);
    await shot(page, 'demo-07-colour');
    await page.keyboard.press('Escape');
    await sleep(1300);
    await shot(page, 'demo-08-end');
  } finally {
    if (recorder) await recorder.stop();
    await page.evaluate(async ({ file, data, saved }) => {
      app.workspace.getLeavesOfType('mdmap').forEach(l => l.detach());
      const f = app.vault.getAbstractFileByPath(file);
      if (f) await app.vault.delete(f);
      await app.vault.adapter.write(data, saved.data);
      app.changeTheme(saved.dark ? 'obsidian' : 'moonstone');
      document.getElementById('mdmap-demo-style')?.remove();
    }, { file: FILE, data: DATA, saved });
    await reloadPlugin(page);
    await resize(page, 1600, 900);
    console.log('data put back:', (await page.evaluate(data => app.vault.adapter.read(data), DATA)) === saved.data);
    ctx.browser.disconnect();
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
