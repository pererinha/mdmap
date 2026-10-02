// Clicking a node shows it in the note: the note scrolls to the node's line and highlights it while the map keeps
// the focus; a click on empty canvas clears it; the gear in the view header turns it off and on; reading mode scrolls.
const { connect, sleep, reloadPlugin, openEditor, clickNode, md, shot } = require('./lib');

const FILE = 'Reveal-e2e.md';
// Long enough that the sections near the end are far below the note's first screen.
const LONG = ['# Longa', '', ...Array.from({ length: 30 }, (_, i) => [`## Seção ${i + 1}`, ...Array.from({ length: 8 }, (_, j) => `linha ${j + 1} da seção ${i + 1}`), '']).flat()].join('\n');

/** The note's highlighted lines, whether they are on screen, the editor mode and where the focus is. */
async function noteState(page) {
  return page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const scroller = leaf.view.containerEl.querySelector('.markdown-source-view .cm-scroller').getBoundingClientRect();
    const lines = Array.from(leaf.view.containerEl.querySelectorAll('.cm-line.mdmap-revealed')).map(el => {
      const r = el.getBoundingClientRect();
      // Live preview puts zero-width characters around the hidden heading marks.
      const text = el.textContent.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/^#+\s*/, '').trim();
      return { text, onScreen: r.top >= scroller.top && r.bottom <= scroller.bottom };
    });
    return { mode: leaf.view.getMode(), revealed: lines, focusInMap: !!document.activeElement?.closest('.mdmap-root') };
  }, FILE);
}

function check(label, state, expected) {
  const ok = expected === null
    ? state.revealed.length === 0
    : state.revealed.length === 1 && state.revealed[0].text === expected && state.revealed[0].onScreen;
  console.log(`${label}: ${JSON.stringify(state)} | ok: ${ok && state.focusInMap}`);
}

/**
 * Opens the gear menu in the map's header and clicks the toggle; returns the saved setting. On macOS Obsidian may
 * draw menus natively, outside the page, so the scenario switches to in-page menus for the click and back after.
 */
async function toggleFromGear(page) {
  const native = await page.evaluate(() => {
    const previous = app.vault.getConfig('nativeMenus');
    app.vault.setConfig('nativeMenus', false);
    return previous;
  });
  await page.evaluate(() => {
    const leaf = app.workspace.getLeavesOfType('mdmap')[0];
    leaf.view.containerEl.querySelector('.view-action[aria-label="Mind map settings"]').click();
  });
  await sleep(300);
  const item = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.menu .menu-item')).find(i => i.textContent.includes('Show clicked node in the note'));
    const checked = el.classList.contains('mod-checked') || !!el.querySelector('.menu-item-icon svg');
    el.click();
    return { found: !!el, checkedBefore: checked };
  });
  await sleep(500);
  await page.evaluate(previous => app.vault.setConfig('nativeMenus', previous), native);
  const saved = await page.evaluate(async () => JSON.parse(await app.vault.adapter.read('.obsidian/plugins/mdmap/data.json')).revealInNote);
  return { ...item, saved };
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
  }, { file: FILE, content: LONG });
  await reloadPlugin(page);
  await openEditor(page, FILE);
  ctx.drain();

  // 1. a node far down the note: its line is highlighted, on screen, and the map keeps the focus
  await clickNode(page, 'Seção 25');
  check('click Seção 25', await noteState(page), 'Seção 25');
  console.log(await shot(page, 'reveal-01-click'));

  // 2. another node: the highlight moves
  await clickNode(page, 'Seção 3');
  check('click Seção 3', await noteState(page), 'Seção 3');

  // 3. empty canvas: the highlight goes away
  const pane = await page.evaluate(() => {
    const r = document.querySelector('.react-flow__pane').getBoundingClientRect();
    return { x: r.x + 30, y: r.bottom - 30 };
  });
  await page.mouse.click(pane.x, pane.y);
  await sleep(300);
  check('click empty canvas', await noteState(page), null);

  // 4. the gear turns it off: clicks no longer touch the note
  const off = await toggleFromGear(page);
  console.log('gear toggle 1:', JSON.stringify(off), '| turned off:', off.found && off.saved === false);
  await clickNode(page, 'Seção 25');
  check('click Seção 25 while off', await noteState(page), null);

  // 5. and on again
  const on = await toggleFromGear(page);
  console.log('gear toggle 2:', JSON.stringify(on), '| turned on:', on.found && on.saved === true);
  await clickNode(page, 'Seção 25');
  check('click Seção 25 while on', await noteState(page), 'Seção 25');

  // 6. reading mode: the node's heading comes to the top of the note
  await page.evaluate(async file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const state = leaf.getViewState();
    await leaf.setViewState({ ...state, state: { ...state.state, mode: 'preview' } });
  }, FILE);
  await sleep(800);
  await clickNode(page, 'Seção 10');
  await sleep(500);
  const preview = await page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const box = leaf.view.previewMode.containerEl.querySelector('.markdown-preview-view').getBoundingClientRect();
    const heading = Array.from(leaf.view.previewMode.containerEl.querySelectorAll('h2')).find(h => h.textContent.trim() === 'Seção 10');
    return { mode: leaf.view.getMode(), headingTop: heading ? Math.round(heading.getBoundingClientRect().top - box.top) : null };
  }, FILE);
  console.log('reading mode, click Seção 10:', JSON.stringify(preview), '| at the top:', preview.headingTop !== null && Math.abs(preview.headingTop) < 80);
  console.log(await shot(page, 'reveal-02-reading-mode'));
  await page.evaluate(async file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const state = leaf.getViewState();
    await leaf.setViewState({ ...state, state: { ...state.state, mode: 'source' } });
  }, FILE);
  await sleep(500);

  // 7. nothing was written to the note
  console.log(`${FILE} unchanged:`, (await md(page, FILE)) === LONG, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
