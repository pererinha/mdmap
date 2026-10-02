// Free positions: drag a node to empty canvas, check the positions block, reopen, organize.
const { connect, sleep, resetVault, reloadPlugin, openEditor, rect, drag, report, view, CANAL } = require('./lib');

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
async function organize(page, layout) {
  await page.evaluate(l => document.querySelector(`.mdmap-organize[data-layout="${l}"]`).click(), layout);
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await resetVault(page, CANAL);
  await reloadPlugin(page);
  await openEditor(page);
  ctx.drain();
  await report(ctx, 'positions-00-open');

  // 1. drag Artigos to empty canvas
  await drag(page, await rect(page, 'Artigos'), await emptySpot(page));
  const dragged = await flowPos(page, 'Artigos');
  const after1 = await report(ctx, 'positions-01-drag');
  console.log('position in editor:', JSON.stringify(dragged), '| block in file:', after1.includes('%% mindmap-positions'));

  // 2. reopen the editor: position kept
  await openEditor(page);
  ctx.drain();
  const reopened = await flowPos(page, 'Artigos');
  console.log('position after reopen:', JSON.stringify(reopened), '| kept:', reopened.x === dragged.x && reopened.y === dragged.y);
  await report(ctx, 'positions-02-reopen');

  // 3. nothing else moved: file equals CANAL + block
  console.log('file = CANAL + block:', after1.startsWith(CANAL), JSON.stringify(after1.slice(CANAL.length)));

  // 4. Tidy tree: block removed, file equals the pre-drag file
  await organize(page, 'right');
  console.log('after Tidy equals CANAL:', (await report(ctx, 'positions-03-tidy')) === CANAL);

  // 5. Radial and Center
  await organize(page, 'radial');
  await report(ctx, 'positions-04-radial');
  await organize(page, 'center');
  console.log('after Center equals CANAL:', (await report(ctx, 'positions-05-center')) === CANAL);

  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
