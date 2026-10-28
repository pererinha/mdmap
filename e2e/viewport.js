// The map stays where the user left it: closing an image tab opened from a node leaves the viewport as it was and
// resizing the window does not refit. With "Remember map position" off, moving the map writes nothing and a saved
// point is ignored; turned on in the gear, opening the map does not write the note, the note's positions block gets
// the `view x,y` line, and reopening the map puts that point at the center of the view.
const fs = require('fs');
const path = require('path');
const { connect, sleep, openEditor, md, shot, view } = require('./lib');

const FILE = 'Viewport-e2e.md';
const STORY = fs.readFileSync(path.join(__dirname, 'fixtures', 'story.md'), 'utf8');

async function viewport(page) {
  return page.evaluate(`(${view})().editor.instance.getViewport()`);
}

/** The map point at the center of the pane. */
async function center(page) {
  return page.evaluate(`(() => {
    const v = (${view})();
    const { x, y, zoom } = v.editor.instance.getViewport();
    const pane = v.contentEl.querySelector('.react-flow').getBoundingClientRect();
    return { x: (pane.width / 2 - x) / zoom, y: (pane.height / 2 - y) / zoom };
  })()`);
}

/** A two-finger scroll over the pane, as a trackpad sends it. */
async function pan(page, deltaX, deltaY) {
  const pane = await page.evaluate(`(() => { const r = (${view})().contentEl.querySelector('.react-flow').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.mouse.move(pane.x, pane.y);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel({ deltaX: deltaX / 20, deltaY: deltaY / 20 });
    await sleep(16);
  }
  await sleep(800);
}

const same = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.zoom - b.zoom) < 0.001;
const round = v => Object.fromEntries(Object.entries(v).map(([k, n]) => [k, Math.round(n * 100) / 100]));
const viewLine = content => content.match(/\n%% mindmap-positions\n(?:.*\n)*?view (-?\d+),(-?\d+)\n(?:.*\n)*?%%\n?$/);

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.delete(existing);
    await app.vault.create(file, content);
  }, { file: FILE, content: STORY });
  await page.evaluate(() => {
    window.__mdmapResizes = 0;
    window.__mdmapResizeRef = app.workspace.on('resize', () => window.__mdmapResizes++);
  });

  const initial = await page.evaluate(() => app.plugins.plugins.mdmap.settings.rememberPosition);
  await page.evaluate(() => (app.plugins.plugins.mdmap.settings.rememberPosition = false));

  // Off: moving the map leaves the note as it is.
  await openEditor(page, FILE);
  await sleep(1000);
  await pan(page, 240, 160);
  await sleep(600);
  console.log('off: moving the map does not write the note:', (await md(page, FILE)) === STORY);

  // The gear turns it on.
  // The panel renders after the click that opens it, so the row is waited for.
  const toggled = await page.evaluate(`(async () => {
    const v = (${view})();
    const button = v.contentEl.querySelector('.mdmap-settings-button');
    button.click();
    const find = () => Array.from(v.contentEl.querySelectorAll('.mdmap-setting')).find(r => r.textContent.trim() === 'Remember map position');
    for (let i = 0; i < 40 && !find(); i++) await new Promise(r => setTimeout(r, 50));
    const row = find();
    if (!row) return 'no row';
    row.querySelector('input').click();
    await new Promise(r => setTimeout(r, 100));
    button.click();
    return app.plugins.plugins.mdmap.settings.rememberPosition;
  })()`);
  console.log('the gear turns "Remember map position" on:', JSON.stringify(toggled), toggled === true);

  // Opening the map of a note with no saved point leaves the note as it is.
  await openEditor(page, FILE);
  await sleep(1000);
  console.log('opening the map does not write the note:', (await md(page, FILE)) === STORY);

  // The map stops at a new point: the positions block gets the view line.
  await pan(page, 240, 160);
  const moved = await viewport(page);
  const movedCenter = await center(page);
  await sleep(600);
  const written = await md(page, FILE);
  const line = viewLine(written);
  console.log('view line after moving:', line ? `view ${line[1]},${line[2]}` : null, '| center:', JSON.stringify(round(movedCenter)),
    '| matches the center:', !!line && Math.abs(Number(line[1]) - movedCenter.x) <= 1 && Math.abs(Number(line[2]) - movedCenter.y) <= 1);
  console.log('only the block changed:', written.startsWith(STORY.replace(/\n+$/, '')), JSON.stringify(written.slice(STORY.replace(/\n+$/, '').length)));

  // An image opened from a node, then its tab closed.
  const resizesBefore = await page.evaluate(() => window.__mdmapResizes);
  const opened = await page.evaluate(`(() => { const img = (${view})().contentEl.querySelector('img.mdmap-thumb'); if (!img) return false; img.click(); return true; })()`);
  await sleep(1200);
  const imageLeaves = await page.evaluate(() => app.workspace.getLeavesOfType('image').length);
  await shot(page, 'viewport-01-image-open');
  await page.evaluate(() => app.workspace.getLeavesOfType('image').forEach(l => l.detach()));
  await sleep(1200);
  const back = await viewport(page);
  const resizes = (await page.evaluate(() => window.__mdmapResizes)) - resizesBefore;
  await shot(page, 'viewport-02-image-closed');
  console.log('image tab opened:', opened && imageLeaves === 1, '| resize events while it was open and closed:', resizes);
  console.log('viewport before', JSON.stringify(round(moved)), 'after closing the image', JSON.stringify(round(back)), '| unchanged:', same(moved, back));

  // The window gets smaller and back: the map is not framed again.
  const beforeResize = await viewport(page);
  await page.evaluate(() => require('electron').remote.getCurrentWindow().setSize(1300, 800));
  await sleep(1000);
  const afterResize = await viewport(page);
  await page.evaluate(() => require('electron').remote.getCurrentWindow().setSize(1600, 900));
  await sleep(1000);
  console.log('viewport before', JSON.stringify(round(beforeResize)), 'after resizing the window', JSON.stringify(round(afterResize)), '| unchanged:', same(beforeResize, afterResize));

  // The map closed and opened again: the saved point is at the center of the view.
  const beforeReopen = await md(page, FILE);
  const saved = viewLine(beforeReopen);
  await openEditor(page, FILE);
  await sleep(1000);
  const reopened = await center(page);
  await shot(page, 'viewport-03-reopened');
  console.log('center after reopening:', JSON.stringify(round(reopened)), '| saved:', saved ? `${saved[1]},${saved[2]}` : null,
    '| at the saved point:', !!saved && Math.abs(reopened.x - Number(saved[1])) <= 1 && Math.abs(reopened.y - Number(saved[2])) <= 1);
  await sleep(800);
  console.log('reopening does not write the note:', (await md(page, FILE)) === beforeReopen);

  // Off again: the saved point is ignored, the map opens framed whole.
  await page.evaluate(() => (app.plugins.plugins.mdmap.settings.rememberPosition = false));
  await openEditor(page, FILE);
  await sleep(1000);
  const offCenter = await center(page);
  console.log('off: center after reopening:', JSON.stringify(round(offCenter)), '| away from the saved point:',
    !!saved && (Math.abs(offCenter.x - Number(saved[1])) > 1 || Math.abs(offCenter.y - Number(saved[2])) > 1),
    '| note unchanged:', (await md(page, FILE)) === beforeReopen);

  await page.evaluate(async on => {
    app.plugins.plugins.mdmap.settings.rememberPosition = on;
    await app.plugins.plugins.mdmap.saveSettings();
  }, initial);

  await page.evaluate(async file => {
    app.workspace.offref(window.__mdmapResizeRef);
    app.workspace.getLeavesOfType('mdmap').forEach(l => l.detach());
    const f = app.vault.getAbstractFileByPath(file);
    if (f) await app.vault.delete(f);
  }, FILE);
  console.log('logs:', ctx.drain().join(' | ') || '(none)');
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
