// The search field: Cmd/Ctrl+F with the map in focus puts the keyboard in it, typing highlights the nodes whose title
// or paragraph text contains the query, Enter and Shift+Enter select and center the next and previous match, keys
// typed in the field never edit the map, Escape clears it and gives the keyboard back to the map, and Cmd/Ctrl+F in
// the note still opens Obsidian's own search. The note is never written.
const { connect, sleep, reloadPlugin, openEditor, clickNode, md, shot, view } = require('./lib');

const FILE = 'Search-e2e.md';
const NOTE = ['# Trip', '', '## Comments', '', '- Ask about the comment box', '', '## Stops', '', 'Lisbon first, then the comments from Porto.', '', '## Budget', '', '- Hotels', ''].join('\n');
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function modF(page) {
  await page.keyboard.down(MOD);
  await page.keyboard.press('f');
  await page.keyboard.up(MOD);
  await sleep(300);
}

/** Highlighted nodes, selected nodes, how far the selected one sits from the middle of the pane, the count and where the keyboard is. */
async function searchState(page) {
  return page.evaluate(`(() => {
    const flow = (${view})().editor.instance;
    const title = el => el.querySelector('.mdmap-title, .mdmap-text').textContent.split('\\n')[0];
    const matchEls = Array.from(document.querySelectorAll('.mdmap-node.mdmap-match'));
    const matched = matchEls.map(title);
    // The ring is drawn only if its colour resolves; an undefined variable drops the whole outline.
    const ringed = matchEls.every(el => getComputedStyle(el).outlineStyle === 'solid');
    const selected = flow.getNodes().filter(n => n.selected).map(n => n.data.title);
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const el = document.querySelector('.react-flow__node.selected');
    let offset = null;
    if (el) {
      const r = el.getBoundingClientRect();
      offset = { dx: Math.round(r.x + r.width / 2 - (pane.x + pane.width / 2)), dy: Math.round(r.y + r.height / 2 - (pane.y + pane.height / 2)) };
    }
    const active = document.activeElement;
    return {
      matched, ringed, selected, offset,
      count: document.querySelector('.mdmap-search-count')?.textContent ?? null,
      query: document.querySelector('.mdmap-search-input').value,
      keyboard: active?.classList.contains('mdmap-search-input') ? 'search' : active?.classList.contains('mdmap-root') ? 'map' : active?.closest('.markdown-source-view') ? 'note' : active?.className,
    };
  })()`);
}

const centered = s => s.offset && Math.abs(s.offset.dx) <= 3 && Math.abs(s.offset.dy) <= 3;

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
  }, { file: FILE, content: NOTE });
  await reloadPlugin(page);
  await openEditor(page, FILE);
  ctx.drain();

  // 1. a node selected, then Cmd/Ctrl+F: the keyboard goes to the search field
  await clickNode(page, 'Budget');
  await modF(page);
  let s = await searchState(page);
  console.log('Mod+F with the map in focus: keyboard in the search field:', s.keyboard === 'search', `(${s.keyboard})`);

  // 2. typing highlights the three nodes that contain "comment", none current yet
  await page.keyboard.type('comment');
  await sleep(300);
  s = await searchState(page);
  console.log('type "comment":', JSON.stringify(s.matched), s.count, '| expected 3 ringed matches, 0/3:',
    JSON.stringify(s.matched.sort()) === JSON.stringify(['Ask about the comment box', 'Comments', 'Lisbon first, then the comments from Porto.']) && s.ringed && s.count === '0/3');
  console.log(await shot(page, 'search-01-typed'));

  // 3. Enter, Enter, Shift+Enter step through the matches in document order and center each one
  const steps = [['Enter', 'Comments', '1/3'], ['Enter', 'Ask about the comment box', '2/3'], ['Shift+Enter', 'Comments', '1/3']];
  for (const [key, title, count] of steps) {
    if (key === 'Shift+Enter') { await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift'); } else { await page.keyboard.press('Enter'); }
    await sleep(900);
    s = await searchState(page);
    console.log(`${key}:`, JSON.stringify({ selected: s.selected, offset: s.offset, count: s.count, keyboard: s.keyboard }), `| ${title} selected, centered, ${count}, keyboard in the field:`,
      s.selected.length === 1 && s.selected[0] === title && centered(s) && s.count === count && s.keyboard === 'search');
  }
  console.log(await shot(page, 'search-02-enter'));

  // 4. Backspace edits the query, not the selected node; Tab leaves the field without adding a child
  await page.keyboard.press('Backspace');
  await sleep(300);
  s = await searchState(page);
  console.log('Backspace: query', JSON.stringify(s.query), '| note unchanged:', (await md(page, FILE)) === NOTE);
  await page.keyboard.press('Tab');
  await sleep(500);
  console.log('Tab: note unchanged:', (await md(page, FILE)) === NOTE, '| editing a node:', await page.evaluate(() => !!document.querySelector('.mdmap-editable')));

  // 5. Escape clears the search and gives the keyboard back to the map
  await page.click('.mdmap-search-input');
  await page.keyboard.press('Escape');
  await sleep(300);
  s = await searchState(page);
  console.log('Escape:', JSON.stringify({ query: s.query, matched: s.matched, count: s.count, keyboard: s.keyboard }), '| cleared, keyboard on the map:',
    s.query === '' && s.matched.length === 0 && s.count === null && s.keyboard === 'map');

  // 6. Cmd/Ctrl+F in the note opens Obsidian's search, not the map's
  await page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    leaf.view.editor.focus();
  }, FILE);
  await sleep(300);
  await modF(page);
  const noteSearch = await page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const box = leaf.view.containerEl.querySelector('.document-search-container');
    return { open: !!box && box.offsetParent !== null, inMapField: document.activeElement?.classList.contains('mdmap-search-input') };
  }, FILE);
  console.log('Mod+F in the note:', JSON.stringify(noteSearch), '| Obsidian search open, map field not focused:', noteSearch.open && !noteSearch.inMapField);
  await page.keyboard.press('Escape');

  // 7. none of this wrote the note
  console.log(`${FILE} unchanged:`, (await md(page, FILE)) === NOTE, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
