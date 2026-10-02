// The cursor on a heading in the note focuses its node in the map: the node is selected and glides to the middle of
// the pane, zoomed to at least 1, while the keyboard stays in the note. Arrow keys onto another heading move the
// focus; a click on a line that is not a heading changes nothing; the note is never written.
const { connect, sleep, reloadPlugin, openEditor, md, shot, view } = require('./lib');

const FILE = 'Focus-e2e.md';
const NOTE = ['# Longa', '', ...Array.from({ length: 30 }, (_, i) => [`## Seção ${i + 1}`, ...Array.from({ length: 8 }, (_, j) => `linha ${j + 1} da seção ${i + 1}`), '']).flat()].join('\n');

/** Scrolls the note to the line with this text and clicks it with the mouse. */
async function clickLine(page, text) {
  const point = await page.evaluate(({ file, text }) => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const editor = leaf.view.editor;
    const lines = editor.getValue().split('\n');
    const line = lines.findIndex(l => l.replace(/^#+\s*/, '') === text);
    editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    return line;
  }, { file: FILE, text });
  await sleep(300);
  const r = await page.evaluate(({ file, text }) => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    const el = Array.from(leaf.view.containerEl.querySelectorAll('.cm-line')).find(e => e.textContent.replace(/[​-‍﻿]/g, '').replace(/^#+\s*/, '').trim() === text);
    const b = el.getBoundingClientRect();
    return { x: b.x + Math.min(40, b.width / 2), y: b.y + b.height / 2 };
  }, { file: FILE, text });
  await page.mouse.click(r.x, r.y);
  await sleep(700);
  return point;
}

/** Which nodes are selected, how far the first one sits from the middle of the pane, the zoom, and where the keyboard is. */
async function mapState(page) {
  return page.evaluate(`(() => {
    const flow = (${view})().editor.instance;
    const selected = flow.getNodes().filter(n => n.selected).map(n => n.data.title);
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const el = document.querySelector('.react-flow__node.selected');
    let offset = null;
    if (el) {
      const r = el.getBoundingClientRect();
      offset = { dx: Math.round(r.x + r.width / 2 - (pane.x + pane.width / 2)), dy: Math.round(r.y + r.height / 2 - (pane.y + pane.height / 2)) };
    }
    return { selected, offset, zoom: Math.round(flow.getZoom() * 100) / 100, keyboardInNote: !!document.activeElement?.closest('.markdown-source-view') };
  })()`);
}

function verdict(state, title) {
  const centered = state.offset && Math.abs(state.offset.dx) <= 3 && Math.abs(state.offset.dy) <= 3;
  return state.selected.length === 1 && state.selected[0] === title && centered && state.zoom >= 1 && state.keyboardInNote;
}

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
  console.log('map on open:', JSON.stringify(await mapState(page)));

  // 1. click the heading "Seção 20" in the note
  await clickLine(page, 'Seção 20');
  let s = await mapState(page);
  console.log('click "## Seção 20":', JSON.stringify(s), '| focused, centered, zoom >= 1, keyboard in the note:', verdict(s, 'Seção 20'));
  console.log(await shot(page, 'focus-01-click-heading'));

  // 2. arrow keys over the body do nothing; reaching "## Seção 21" focuses it
  await page.keyboard.press('ArrowDown');
  await sleep(300);
  s = await mapState(page);
  console.log('ArrowDown onto a body line: still Seção 20:', s.selected.length === 1 && s.selected[0] === 'Seção 20');
  for (let i = 0; i < 9; i++) { await page.keyboard.press('ArrowDown'); await sleep(60); }
  await sleep(700);
  s = await mapState(page);
  console.log('ArrowDown onto "## Seção 21":', JSON.stringify(s), '| focused, centered, zoom >= 1, keyboard in the note:', verdict(s, 'Seção 21'));

  // 3. a click on a line that is not a heading changes nothing
  await clickLine(page, 'linha 3 da seção 5');
  s = await mapState(page);
  console.log('click a body line of Seção 5: still Seção 21:', s.selected.length === 1 && s.selected[0] === 'Seção 21');

  // 4. the top heading focuses the root
  await clickLine(page, 'Longa');
  s = await mapState(page);
  console.log('click "# Longa":', JSON.stringify(s), '| root focused:', verdict(s, 'Longa'));
  console.log(await shot(page, 'focus-02-root'));

  // 5. none of this touched the note or highlighted a line in it
  const revealed = await page.evaluate(() => document.querySelectorAll('.cm-line.mdmap-revealed').length);
  console.log(`${FILE} unchanged:`, (await md(page, FILE)) === NOTE, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length, '| highlighted lines:', revealed);
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
