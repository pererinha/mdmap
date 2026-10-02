// Free positions: drag a node to empty canvas, check the positions block, reopen, organize; then drag a parent and check its subtree follows.
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
/** Screen centres of several nodes at once. */
async function rects(page, titles) {
  const out = {};
  for (const t of titles) out[t] = await rect(page, t);
  return out;
}
/** Drags the node by (dx, dy) screen pixels. */
async function dragBy(page, title, dx, dy) {
  const r = await rect(page, title);
  await drag(page, r, { x: r.x + dx, y: r.y + dy });
}
const near = (a, b) => Math.abs(a - b) <= 1.5;
/** The lines between the markers of the positions block, or null when the file has no block. */
function blockLines(content) {
  const m = content.match(/\n%% mindmap-positions\n([\s\S]*?)\n%%\n$/);
  return m ? m[1].split('\n') : null;
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

  // 6. drag Pesquisa: Referências and Artigos move by the same screen delta; the block has one entry
  const family = ['Pesquisa', 'Referências', 'Artigos', 'Roteiro'];
  const before6 = await rects(page, family);
  await dragBy(page, 'Pesquisa', 0, 160);
  const after6 = await rects(page, family);
  const d6 = { x: after6.Pesquisa.x - before6.Pesquisa.x, y: after6.Pesquisa.y - before6.Pesquisa.y };
  const file6 = await report(ctx, 'positions-06-drag-parent');
  const lines6 = blockLines(file6);
  console.log('parent moved by:', JSON.stringify(d6),
    '| children followed:', ['Referências', 'Artigos'].every(t => near(after6[t].x - before6[t].x, d6.x) && near(after6[t].y - before6[t].y, d6.y)),
    '| Roteiro still:', near(after6.Roteiro.x, before6.Roteiro.x) && near(after6.Roteiro.y, before6.Roteiro.y),
    '| block entries:', JSON.stringify(lines6), '| only Pesquisa:', !!lines6 && lines6.length === 1 && lines6[0].startsWith('Pesquisa: '),
    '| structure intact:', file6.startsWith(CANAL));

  // 7. drag Artigos on its own: its entry is relative to Pesquisa
  await dragBy(page, 'Artigos', 0, 120);
  const file7 = await report(ctx, 'positions-07-drag-child');
  const lines7 = blockLines(file7);
  const artigosEntry = (lines7 || []).find(l => l.startsWith('Pesquisa/Artigos: '));
  const artigosRel7 = await flowPos(page, 'Artigos');
  console.log('block entries:', JSON.stringify(lines7), '| Artigos entry:', artigosEntry,
    '| matches editor offset:', artigosEntry === `Pesquisa/Artigos: ${artigosRel7.x},${artigosRel7.y}`);

  // 8. drag Pesquisa again: Artigos follows and its entry does not change
  const before8 = await rects(page, ['Pesquisa', 'Artigos', 'Referências']);
  await dragBy(page, 'Pesquisa', 200, 0);
  const after8 = await rects(page, ['Pesquisa', 'Artigos', 'Referências']);
  const d8 = { x: after8.Pesquisa.x - before8.Pesquisa.x, y: after8.Pesquisa.y - before8.Pesquisa.y };
  const file8 = await report(ctx, 'positions-08-drag-parent-again');
  const lines8 = blockLines(file8);
  console.log('parent moved by:', JSON.stringify(d8),
    '| Artigos followed:', near(after8.Artigos.x - before8.Artigos.x, d8.x) && near(after8.Artigos.y - before8.Artigos.y, d8.y),
    '| Referências followed:', near(after8.Referências.x - before8.Referências.x, d8.x) && near(after8.Referências.y - before8.Referências.y, d8.y),
    '| Artigos entry unchanged:', (lines8 || []).includes(artigosEntry), '| entries:', JSON.stringify(lines8));
  const pesquisaRel8 = await flowPos(page, 'Pesquisa');

  // 9. reopen: both offsets kept
  await openEditor(page);
  ctx.drain();
  const pesquisaRel9 = await flowPos(page, 'Pesquisa');
  const artigosRel9 = await flowPos(page, 'Artigos');
  await report(ctx, 'positions-09-reopen');
  console.log('Pesquisa kept:', pesquisaRel9.x === pesquisaRel8.x && pesquisaRel9.y === pesquisaRel8.y, JSON.stringify([pesquisaRel8, pesquisaRel9]),
    '| Artigos kept:', artigosRel9.x === artigosRel7.x && artigosRel9.y === artigosRel7.y, JSON.stringify([artigosRel7, artigosRel9]));

  // 10. Tidy tree: everything forgotten, file equals CANAL
  await organize(page, 'right');
  console.log('after Tidy equals CANAL:', (await report(ctx, 'positions-10-tidy')) === CANAL);

  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
