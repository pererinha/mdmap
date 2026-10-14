// Free positions: drag a node to empty canvas, check the positions block, reopen, organize; then drag a parent and check its subtree follows;
// an edge that crosses another box is drawn behind it, and a dragged box over the others.
const { connect, sleep, resetVault, reloadPlugin, openEditor, rect, drag, clickNode, report, view, CANAL } = require('./lib');

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

  // 11. a node placed so its edge crosses another box, and selected: every edge stays in the layer under the boxes
  const ref = await page.evaluate(`(${view})().editor.instance.getNodes().find(n => n.data.title === 'Referências')`);
  const across = { x: Math.round(ref.position.x + ref.measured.width * 1.15), y: Math.round(ref.position.y - ref.measured.height * 1.5) };
  await resetVault(page, CANAL + `\n%% mindmap-positions\nPesquisa/Artigos: ${across.x},${across.y}\n%%\n`);
  await openEditor(page);
  await clickNode(page, 'Artigos');
  await sleep(400);
  const layers = await page.evaluate(() => {
    const byTitle = t => Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.querySelector('.mdmap-title')?.textContent === t);
    const edge = Array.from(document.querySelectorAll('.react-flow__edge')).find(e => e.getAttribute('data-testid')?.endsWith(byTitle('Artigos').dataset.id));
    const path = edge.querySelector('path.react-flow__edge-path'), m = path.getScreenCTM(), box = byTitle('Referências').getBoundingClientRect();
    let crosses = 0;
    for (let l = 0; l < path.getTotalLength(); l += 4) {
      const p = path.getPointAtLength(l);
      const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
      if (x > box.left + 4 && x < box.right - 4 && y > box.top + 4 && y < box.bottom - 4) crosses++;
    }
    const z = el => Number(getComputedStyle(el).zIndex);
    const edges = Array.from(document.querySelectorAll('.react-flow__edge')).map(e => e.closest('svg'));
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    // At the same layer, the nodes come later in the page and are drawn over the edges.
    const edgesFirst = edges.every(svg => svg.compareDocumentPosition(document.querySelector('.react-flow__nodes')) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { crosses, maxEdge: Math.max(...edges.map(z)), minNode: Math.min(...nodes.map(z)), edgesFirst };
  });
  console.log('edge across a box, its node selected:', JSON.stringify(layers), '| edges behind every box:', layers.crosses > 0 && layers.maxEdge <= layers.minNode && layers.edgesFirst);
  await report(ctx, 'positions-11-edge-behind');
  await resetVault(page, CANAL);

  // 12. a branch dragged over a deeper box is drawn over it while it moves; the note is put back after the drop
  await openEditor(page);
  const roteiro = await rect(page, 'Roteiro');
  const artigos = await rect(page, 'Artigos');
  await page.mouse.move(roteiro.x, roteiro.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(roteiro.x + (artigos.x + 20 - roteiro.x) * i / 12, roteiro.y + (artigos.y + 8 - roteiro.y) * i / 12);
    await sleep(30);
  }
  await sleep(300);
  const onTop = await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('.react-flow__node')?.querySelector('.mdmap-title')?.textContent, { x: artigos.x + 20, y: artigos.y + 8 });
  await page.mouse.up();
  await sleep(500);
  console.log('dragged Roteiro over Artigos, on top:', onTop, '| the dragged box is over:', onTop === 'Roteiro');
  await resetVault(page, CANAL);

  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
