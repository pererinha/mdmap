// Collapsing nodes: Space on the selected node hides its children and the viewport stays put, Space again shows
// them; the button on the side the children leave from does the same with the mouse and shows how many nodes it
// hides; the collapsed nodes survive reopening the map; a search match inside a collapsed node expands it and is
// centered; Tab on a collapsed node expands it for the new child. Collapsing never writes the note.
const { connect, sleep, reloadPlugin, openEditor, clickNode, md, shot } = require('./lib');

const FILE = 'Collapse-e2e.md';
const NOTE = ['# Mapa', '', '## Pesquisa', '- Referências', '- Artigos', '  - Papers', '', '## Roteiro', '', '### Introdução', '### Desenvolvimento', ''].join('\n');

/** Titles of the nodes on the canvas, the fold buttons by node title, the viewport and what the plugin saved. */
async function state(page) {
  return page.evaluate(async file => {
    const host = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    const nodes = Array.from(host.querySelectorAll('.react-flow__node'));
    const title = n => n.querySelector('.mdmap-title, .mdmap-text')?.textContent;
    const folds = {};
    for (const n of nodes) {
      const button = n.querySelector('.mdmap-fold');
      if (button) folds[title(n)] = { text: button.textContent, collapsed: button.classList.contains('mdmap-collapsed'), visible: getComputedStyle(button).opacity === '1' };
    }
    const data = JSON.parse(await app.vault.adapter.read('.obsidian/plugins/mdmap/data.json'));
    return {
      titles: nodes.map(title),
      folds,
      viewport: host.querySelector('.react-flow__viewport').style.transform,
      selected: nodes.filter(n => n.classList.contains('selected')).map(title),
      saved: data.collapsed?.[file] ?? [],
    };
  }, FILE);
}

async function key(page, name, modifiers = []) {
  for (const m of modifiers) await page.keyboard.down(m);
  await page.keyboard.press(name);
  for (const m of modifiers.reverse()) await page.keyboard.up(m);
  await sleep(600);
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
    const plugin = app.plugins.plugins.mdmap;
    if (plugin) { delete plugin.settings.collapsed?.[file]; await plugin.saveSettings(); }
  }, { file: FILE, content: NOTE });
  await reloadPlugin(page);
  await openEditor(page, FILE);
  ctx.drain();

  // 1. Space on "Pesquisa" hides its three nodes; the viewport does not move
  await clickNode(page, 'Pesquisa');
  let before = await state(page);
  await key(page, 'Space');
  let s = await state(page);
  console.log('Space collapses:', JSON.stringify(s.folds.Pesquisa), '| hidden:', !['Referências', 'Artigos', 'Papers'].some(t => s.titles.includes(t)),
    '| count 3:', s.folds.Pesquisa?.text === '3', '| viewport kept:', s.viewport === before.viewport, '| saved:', JSON.stringify(s.saved));
  console.log(await shot(page, 'collapse-01-space'));

  // 2. Space again shows them
  await key(page, 'Space');
  s = await state(page);
  console.log('Space expands:', ['Referências', 'Artigos', 'Papers'].every(t => s.titles.includes(t)), '| saved:', JSON.stringify(s.saved));

  // 3. the button on "Roteiro" collapses it with the mouse: it sits on the box's border, shows only on hover or
  // selection, and stays shown while the pointer goes from the middle of the box to it
  await clickNode(page, 'Mapa');
  await page.mouse.move(5, 5);
  await sleep(300);
  s = await state(page);
  console.log('button on an unselected expanded node hidden:', s.folds.Roteiro && !s.folds.Roteiro.visible);
  const geometry = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.querySelector('.mdmap-title')?.textContent === 'Roteiro');
    const box = node.querySelector('.mdmap-node').getBoundingClientRect();
    const r = node.querySelector('.mdmap-fold').getBoundingClientRect();
    const border = r.x + r.width / 2 < box.x + box.width / 2 ? box.left : box.right;
    return { from: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, to: { x: r.x + r.width / 2, y: r.y + r.height / 2 }, onBorder: r.left < border && border < r.right };
  });
  const shownOnTheWay = [];
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(geometry.from.x + (geometry.to.x - geometry.from.x) * i / 10, geometry.from.y + (geometry.to.y - geometry.from.y) * i / 10);
    await sleep(40);
    shownOnTheWay.push((await state(page)).folds.Roteiro.visible);
  }
  console.log('button on the border:', geometry.onBorder, '| shown all the way from the box to it:', shownOnTheWay.every(Boolean), JSON.stringify(shownOnTheWay));
  await page.mouse.down();
  await page.mouse.up();
  await sleep(600);
  s = await state(page);
  console.log('button collapses:', JSON.stringify(s.folds.Roteiro), '| hidden:', !s.titles.includes('Introdução') && !s.titles.includes('Desenvolvimento'), '| saved:', JSON.stringify(s.saved));
  console.log(await shot(page, 'collapse-02-button'));
  const again = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.querySelector('.mdmap-title')?.textContent === 'Roteiro');
    const r = node.querySelector('.mdmap-fold').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(again.x, again.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  await sleep(600);
  s = await state(page);
  console.log('a second click expands it:', s.titles.includes('Introdução') && s.titles.includes('Desenvolvimento') && !s.folds.Roteiro.collapsed, '| note unchanged:', (await md(page, FILE)) === NOTE);
  // collapsed again, for the reopening step
  await page.mouse.down();
  await page.mouse.up();
  await sleep(600);

  // 4. reopening the map keeps "Roteiro" collapsed
  await openEditor(page, FILE);
  s = await state(page);
  console.log('after reopening, Roteiro still collapsed:', s.folds.Roteiro?.collapsed === true && !s.titles.includes('Introdução'));

  // 5. a search match inside "Roteiro" expands it, and the match is selected and centered
  await clickNode(page, 'Mapa');
  await key(page, 'f', ['Meta']);
  await page.keyboard.type('Intro');
  await key(page, 'Enter');
  await sleep(600);
  s = await state(page);
  const centered = await page.evaluate(() => {
    const host = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    const pane = host.querySelector('.react-flow').getBoundingClientRect();
    const node = Array.from(host.querySelectorAll('.react-flow__node')).find(n => n.querySelector('.mdmap-title')?.textContent === 'Introdução');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return Math.abs(r.x + r.width / 2 - (pane.x + pane.width / 2)) < 30 && Math.abs(r.y + r.height / 2 - (pane.y + pane.height / 2)) < 30;
  });
  console.log('search expands Roteiro:', s.titles.includes('Introdução'), '| selected:', JSON.stringify(s.selected), '| centered:', centered, '| saved:', JSON.stringify(s.saved));
  console.log(await shot(page, 'collapse-03-search'));
  await key(page, 'Escape');

  // 6. Tab on a collapsed "Pesquisa" expands it for the new child; Escape, then undo puts the note back.
  // The search zoomed in on "Introdução": fit the map so "Pesquisa" is on screen to click.
  await page.evaluate(() => app.workspace.getLeavesOfType('mdmap')[0].view.editor.fit());
  await sleep(500);
  await clickNode(page, 'Pesquisa');
  await key(page, 'Space');
  await key(page, 'Tab');
  await key(page, 'Escape');
  s = await state(page);
  const written = await md(page, FILE);
  console.log('Tab expands Pesquisa:', s.titles.includes('Referências') && s.titles.includes('New node'), '| note has the new heading under it:', written.includes('## Pesquisa\n- Referências\n- Artigos\n  - Papers\n\n### New node\n'));
  await clickNode(page, 'Mapa');
  await key(page, 'z', ['Meta']);
  console.log('after undo, the note is the original:', (await md(page, FILE)) === NOTE);

  console.log('writes:', ctx.drain().filter(l => l.includes('wrote')).length, '(Tab and undo)');
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
    const plugin = app.plugins.plugins.mdmap;
    delete plugin.settings.collapsed[file];
    await plugin.saveSettings();
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
