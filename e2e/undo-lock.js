// The undo and redo buttons and the lock. Undo and redo take back and bring back a rename, a position dragged on empty
// canvas and a layout button, positions block included. The lock, open by default, keeps the map from changing the
// note: no editing, keys, dragging, layouts or undo; Space still collapses. It stays closed when the map opens again,
// and opening it brings editing back. What the lock was before is put back.
const { connect, sleep, resetVault, reloadPlugin, openEditor, rect, drag, clickAt, clickNode, md, shot, view, CANAL } = require('./lib');

/** Which tool buttons are enabled, whether the lock is closed, and whether the layout buttons are enabled. */
async function tools(page) {
  return page.evaluate(() => {
    const host = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    const button = tool => host.querySelector(`.mdmap-tool[data-tool="${tool}"]`);
    return {
      undo: !button('undo').disabled, redo: !button('redo').disabled, locked: button('lock').getAttribute('aria-pressed') === 'true',
      layouts: Array.from(host.querySelectorAll('.mdmap-organize')).every(b => !b.disabled),
    };
  });
}
async function press(page, tool) {
  await page.evaluate(t => app.workspace.getLeavesOfType('mdmap')[0].view.containerEl.querySelector(`.mdmap-tool[data-tool="${t}"]`).click(), tool);
  await sleep(700);
}
async function flowPos(page, title) {
  const n = await page.evaluate(`(${view})().editor.instance.getNodes().find(n => n.data.title === ${JSON.stringify(title)}).position`);
  return { x: Math.round(n.x), y: Math.round(n.y) };
}
async function emptySpot(page) {
  return page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getBoundingClientRect());
    const pane = document.querySelector('.react-flow__pane').getBoundingClientRect();
    return { x: pane.x + pane.width / 2, y: Math.max(...rects.map(r => r.bottom)) + 120 };
  });
}
/** Clicks the node, replaces its whole text with `text` and presses Escape. */
async function rename(page, title, text) {
  await clickAt(page, await rect(page, title));
  await page.evaluate(() => getSelection().selectAllChildren(document.querySelector('.mdmap-editable')));
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await sleep(700);
}
const hasBlock = content => content.includes('%% mindmap-positions');

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  const lockedBefore = await page.evaluate(() => app.plugins.plugins.mdmap.settings.locked);
  try {
    await page.evaluate(async () => {
      const plugin = app.plugins.plugins.mdmap;
      plugin.settings.locked = false;
      delete plugin.settings.collapsed['Canal.md'];
      await plugin.saveSettings();
    });
    await resetVault(page, CANAL);
    await reloadPlugin(page);
    await openEditor(page);
    // Collapsed nodes left by another run would hide the nodes below; the note's folds bring them back on opening.
    await page.evaluate(`(${view})().editor.setCollapsed([])`);
    await sleep(500);
    ctx.drain();
    let s = await tools(page);
    console.log('opened:', JSON.stringify(s), '| lock open, nothing to undo or redo:', !s.locked && !s.undo && !s.redo && s.layouts);

    // 1. a rename, undone and redone with the buttons
    await rename(page, 'Artigos', 'Fontes');
    const renamed = await md(page);
    s = await tools(page);
    console.log('rename:', JSON.stringify(s), '| note has "### Fontes", undo enabled:', renamed.includes('### Fontes\n') && s.undo && !s.redo);
    await press(page, 'undo');
    s = await tools(page);
    console.log('undo:', JSON.stringify(s), '| note back to the start, redo enabled:', (await md(page)) === CANAL && !s.undo && s.redo);
    await press(page, 'redo');
    console.log('redo: note has "### Fontes" again:', (await md(page)) === renamed);
    await press(page, 'undo');

    // 2. a position dragged on empty canvas, undone and redone with its positions block
    const start = await flowPos(page, 'Artigos');
    await drag(page, await rect(page, 'Artigos'), await emptySpot(page));
    const dragged = await md(page);
    console.log('drag: positions block written:', hasBlock(dragged));
    await press(page, 'undo');
    const back = await flowPos(page, 'Artigos');
    console.log('undo drag:', JSON.stringify({ start, back }), '| block gone, node back:', (await md(page)) === CANAL && back.x === start.x && back.y === start.y);
    await press(page, 'redo');
    console.log('redo drag: same block again:', (await md(page)) === dragged);

    // 3. a layout button drops the positions; undo brings them back
    await page.evaluate(() => document.querySelector('.mdmap-organize[data-layout="right"]').click());
    await sleep(900);
    console.log('Tidy: positions block dropped:', (await md(page)) === CANAL);
    await press(page, 'undo');
    console.log('undo Tidy: positions block back:', (await md(page)) === dragged);
    console.log(await shot(page, 'undo-lock-01-history'));

    // 4. the lock: nothing changes the note, Space still collapses
    await press(page, 'lock');
    s = await tools(page);
    const saved = await page.evaluate(() => app.plugins.plugins.mdmap.settings.locked);
    const grips = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-grip')).every(g => getComputedStyle(g).display === 'none'));
    console.log('locked:', JSON.stringify(s), '| closed and saved, layouts, undo and redo disabled, grips hidden:', s.locked && saved && !s.layouts && !s.undo && !s.redo && grips);
    const before = await md(page);
    await clickAt(page, await rect(page, 'Pesquisa'));
    console.log('locked click: no edit:', !(await page.evaluate(() => !!document.querySelector('.mdmap-editable'))));
    await clickNode(page, 'Pesquisa');
    for (const key of ['Tab', 'Enter', 'Delete']) {
      await page.keyboard.press(key);
      await sleep(300);
    }
    await page.keyboard.down('Meta');
    await page.keyboard.press('z');
    await page.keyboard.up('Meta');
    await sleep(500);
    const at = await flowPos(page, 'Roteiro');
    await drag(page, await rect(page, 'Roteiro'), await emptySpot(page));
    const still = await flowPos(page, 'Roteiro');
    console.log('locked Tab, Enter, Delete, Cmd+Z, drag:', JSON.stringify({ at, still }), '| note unchanged, node not moved:', (await md(page)) === before && at.x === still.x && at.y === still.y);
    // The drag panned the map instead, maybe under the buttons: fit it again before clicking a node.
    await page.evaluate(`(${view})().editor.fit()`);
    await sleep(600);
    await clickNode(page, 'Pesquisa');
    await page.keyboard.press(' ');
    await sleep(500);
    const hidden = (await rect(page, 'Referências')) === null;
    await page.keyboard.press(' ');
    await sleep(500);
    const shown = (await rect(page, 'Referências')) !== null;
    console.log('locked Space:', JSON.stringify({ hidden, shown }), '| collapses and expands, note unchanged:', hidden && shown && (await md(page)) === before);
    console.log(await shot(page, 'undo-lock-02-locked'));

    // 5. the lock stays closed when the map opens again; opening it brings editing back
    await openEditor(page);
    ctx.drain();
    s = await tools(page);
    console.log('reopened: still locked:', s.locked);
    await press(page, 'lock');
    await clickAt(page, await rect(page, 'Pesquisa'));
    const editing = await page.evaluate(() => !!document.querySelector('.mdmap-editable'));
    await page.keyboard.press('Escape');
    await sleep(500);
    console.log('unlocked: click edits again, lock saved open:', editing && !(await page.evaluate(() => app.plugins.plugins.mdmap.settings.locked)));
  } finally {
    await page.evaluate(async locked => {
      const plugin = app.plugins.plugins.mdmap;
      plugin.settings.locked = locked;
      await plugin.saveSettings();
    }, lockedBefore);
    await resetVault(page, CANAL);
  }
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
