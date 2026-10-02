// Trackpad navigation: two-finger scrolling moves the map as far as the fingers move, like a web page, without
// zooming; pinching (a wheel event with ctrlKey on macOS) zooms around the fingers; the window's own zoom stays put.
const { connect, sleep, reloadPlugin, openEditor, md, shot, view, CANAL } = require('./lib');

const FILE = 'Trackpad-e2e.md';

async function viewport(page) {
  return page.evaluate(`(${view})().editor.instance.getViewport()`);
}

/** The canvas point under the given screen point. */
async function canvasAt(page, point) {
  return page.evaluate(`(${view})().editor.instance.screenToFlowPosition(${JSON.stringify(point)})`);
}

/** A gesture is a run of small wheel events, as a trackpad sends them. */
async function gesture(page, deltaX, deltaY, steps) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaX: deltaX / steps, deltaY: deltaY / steps });
    await sleep(16);
  }
  await sleep(300);
}

const round = v => ({ x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10, zoom: Math.round(v.zoom * 1000) / 1000 });

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
  }, { file: FILE, content: CANAL });
  await reloadPlugin(page);
  await openEditor(page, FILE);
  ctx.drain();

  // A point on empty canvas, below the nodes.
  const point = await page.evaluate(() => {
    const r = document.querySelector('.react-flow__pane').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.85 };
  });
  await page.mouse.move(point.x, point.y);
  const windowZoom = () => page.evaluate(() => require('electron').webFrame.getZoomFactor());
  const windowZoom0 = await windowZoom();

  // 1. two fingers right and down: the map moves 120 px left and 200 px up, zoom unchanged
  const v0 = await viewport(page);
  await gesture(page, 120, 200, 10);
  const v1 = await viewport(page);
  const panned = { dx: Math.round((v1.x - v0.x) * 10) / 10, dy: Math.round((v1.y - v0.y) * 10) / 10 };
  console.log('two-finger scroll:', JSON.stringify(round(v0)), '->', JSON.stringify(round(v1)), '| moved', JSON.stringify(panned),
    '| one to one:', panned.dx === -120 && panned.dy === -200, '| zoom unchanged:', v1.zoom === v0.zoom);
  console.log(await shot(page, 'trackpad-01-scroll'));

  // 2. pinch out (zoom in) and in (zoom out); the canvas point under the fingers stays under them
  const under0 = await canvasAt(page, point);
  await page.keyboard.down('Control');
  await gesture(page, 0, -40, 8);
  await page.keyboard.up('Control');
  const v2 = await viewport(page);
  const under2 = await canvasAt(page, point);
  console.log('pinch out:', JSON.stringify(round(v1)), '->', JSON.stringify(round(v2)), '| zoomed in:', v2.zoom > v1.zoom,
    '| point under the fingers kept:', Math.abs(under2.x - under0.x) < 1 && Math.abs(under2.y - under0.y) < 1);
  console.log(await shot(page, 'trackpad-02-pinch-out'));

  await page.keyboard.down('Control');
  await gesture(page, 0, 80, 8);
  await page.keyboard.up('Control');
  const v3 = await viewport(page);
  const under3 = await canvasAt(page, point);
  console.log('pinch in:', JSON.stringify(round(v2)), '->', JSON.stringify(round(v3)), '| zoomed out:', v3.zoom < v2.zoom,
    '| point under the fingers kept:', Math.abs(under3.x - under0.x) < 1 && Math.abs(under3.y - under0.y) < 1);

  // 3. the Obsidian window did not zoom and the note was not written
  console.log('window zoom unchanged:', (await windowZoom()) === windowZoom0, '|', `${FILE} unchanged:`, (await md(page, FILE)) === CANAL,
    '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);

  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
