// Folds and collapsed nodes follow each other: folding a heading or a list item in the note collapses its node in
// the map and unfolding expands it; Space on a node in the map folds and unfolds its line in the note, and
// Obsidian keeps that fold for the note; the note's folds win when the map opens. Nothing writes the note.
const { connect, sleep, reloadPlugin, openEditor, clickNode, md, shot } = require('./lib');

const FILE = 'Folds-e2e.md';
const NOTE = ['# Mapa', '', '## Pesquisa', '- Referências', '- Artigos', '  - Papers', '', '## Roteiro', '', '### Introdução', '### Desenvolvimento', ''].join('\n');
const LINE = { Pesquisa: 2, Artigos: 4, Roteiro: 7 };

/** The note's folded lines, the map's collapsed nodes and the fold Obsidian keeps for the note. */
async function state(page) {
  return page.evaluate(async file => {
    const note = app.workspace.getLeavesOfType('markdown').map(l => l.view).find(v => v.file?.path === file);
    const host = app.workspace.getLeavesOfType('mdmap')[0]?.view.containerEl;
    const nodes = host ? Array.from(host.querySelectorAll('.react-flow__node')) : [];
    const title = n => n.querySelector('.mdmap-title, .mdmap-text')?.textContent;
    const kept = await app.foldManager.load(note.file);
    return {
      noteFolds: note.currentMode.getFoldInfo().folds.map(f => f.from),
      kept: (kept?.folds ?? []).map(f => f.from),
      collapsed: nodes.filter(n => n.querySelector('.mdmap-fold.mdmap-collapsed')).map(title),
      titles: nodes.map(title),
    };
  }, FILE);
}

/** Folds or unfolds the line in the note the way the user does, with the cursor on it and Obsidian's toggle. */
async function toggleInNote(page, line) {
  await page.evaluate(({ file, line }) => {
    const note = app.workspace.getLeavesOfType('markdown').map(l => l.view).find(v => v.file?.path === file);
    note.editor.setCursor({ line, ch: 0 });
    note.editor.exec('toggleFold');
  }, { file: FILE, line });
  await sleep(800);
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
  await page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    return leaf.setViewState({ ...leaf.getViewState(), state: { ...leaf.getViewState().state, mode: 'source' } });
  }, FILE);
  await sleep(500);
  ctx.drain();

  // 1. note -> map: folding "## Roteiro" and "- Artigos" in the note collapses both nodes
  await toggleInNote(page, LINE.Roteiro);
  await toggleInNote(page, LINE.Artigos);
  let s = await state(page);
  console.log('note folds Roteiro and Artigos:', JSON.stringify(s), '| map collapsed both:',
    s.collapsed.includes('Roteiro') && s.collapsed.includes('Artigos') && !s.titles.includes('Introdução') && !s.titles.includes('Papers'));
  console.log(await shot(page, 'folds-01-note-to-map'));

  // 2. unfolding "## Roteiro" in the note expands it in the map
  await toggleInNote(page, LINE.Roteiro);
  s = await state(page);
  console.log('note unfolds Roteiro:', JSON.stringify(s.collapsed), '| map expanded it:', !s.collapsed.includes('Roteiro') && s.titles.includes('Introdução'), '| Artigos still collapsed:', s.collapsed.includes('Artigos'));

  // 3. map -> note: Space on "Pesquisa" folds its heading in the note, and Obsidian keeps the fold
  await clickNode(page, 'Pesquisa');
  await page.keyboard.press('Space');
  await sleep(1500);
  s = await state(page);
  console.log('Space on Pesquisa:', JSON.stringify(s), '| note folded it:', s.noteFolds.includes(LINE.Pesquisa), '| Obsidian kept it:', s.kept.includes(LINE.Pesquisa));
  console.log(await shot(page, 'folds-02-map-to-note'));

  // 4. Space again unfolds it in the note
  await page.keyboard.press('Space');
  await sleep(1500);
  s = await state(page);
  console.log('Space again:', JSON.stringify(s.noteFolds), '| note unfolded it:', !s.noteFolds.includes(LINE.Pesquisa));

  // 5. the note's folds win when the map opens: fold Roteiro with the map closed, then open it
  await page.evaluate(() => app.workspace.detachLeavesOfType('mdmap'));
  await toggleInNote(page, LINE.Roteiro);
  await openEditor(page, FILE);
  s = await state(page);
  console.log('map opened with Roteiro folded in the note:', JSON.stringify(s.collapsed), '| collapsed:', s.collapsed.includes('Roteiro') && s.collapsed.includes('Artigos'));

  console.log('the note is unchanged:', (await md(page, FILE)) === NOTE, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').forEach(l => l.detach());
    const note = app.workspace.getLeavesOfType('markdown').map(l => l.view).find(v => v.file?.path === file);
    note.currentMode.applyFoldInfo({ folds: [], lines: note.editor.lineCount() });
    await new Promise(r => setTimeout(r, 300));
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
    const plugin = app.plugins.plugins.mdmap;
    delete plugin.settings.collapsed[file];
    await plugin.saveSettings();
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
