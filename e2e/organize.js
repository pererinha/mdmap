// Organizer buttons on a real note: screenshots per layout, the transition sampled over time, overlaps
// measured on the rendered nodes, the whole map inside the pane, the file left untouched; then a drag on Canal.md sampled mid-move.
// Usage: node e2e/organize.js [shot-prefix]   (MDMAP_FILE picks the note, default story.md)
const { connect, sleep, resetVault, reloadPlugin, openEditor, rect, shot, md, view, CANAL } = require('./lib');

const FILE = process.env.MDMAP_FILE || 'story.md';
const PREFIX = process.argv[2] || 'organize';
const LAYOUTS = ['right', 'center', 'radial'];

/** Clicks the organizer and samples every node's canvas position at the given times, in the page. */
async function organizeSampled(page, layout, times) {
  return page.evaluate(async ({ layout, times, viewSrc }) => {
    const flow = eval(viewSrc)().editor.instance;
    const snap = () => Object.fromEntries(flow.getNodes().map(n => {
      const p = flow.getInternalNode(n.id).internals.positionAbsolute;
      return [n.id, [p.x, p.y]];
    }));
    const start = snap();
    const t0 = performance.now();
    document.querySelector(`.mdmap-organize[data-layout="${layout}"]`).click();
    const samples = [];
    for (const t of times) {
      await new Promise(r => setTimeout(r, Math.max(0, t0 + t - performance.now())));
      samples.push({ t, pos: snap() });
    }
    return { start, samples };
  }, { layout, times, viewSrc: `(${view})` });
}

/** Share of the way from start to end covered at each sample, for the node that moves the most. */
function progress({ start, samples }) {
  const end = samples[samples.length - 1].pos;
  let id = null, best = 0;
  for (const k of Object.keys(end)) {
    const d = Math.hypot(end[k][0] - start[k][0], end[k][1] - start[k][1]);
    if (d > best) { best = d; id = k; }
  }
  if (!id) return { moved: 0, shares: [] };
  const shares = samples.map(s => {
    const d = Math.hypot(s.pos[id][0] - start[id][0], s.pos[id][1] - start[id][1]);
    return `${s.t}ms:${(d / best).toFixed(2)}`;
  });
  return { moved: Math.round(best), shares };
}

/** Overlapping pairs among the rendered node boxes, in screen space. */
async function renderedOverlaps(page) {
  return page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getBoundingClientRect());
    let pairs = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) pairs++;
    }
    return { nodes: r.length, pairs };
  });
}

/** Nodes whose rendered box falls outside the map pane, and the current zoom. */
async function outsidePane(page) {
  return page.evaluate(`(() => {
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const out = Array.from(document.querySelectorAll('.react-flow__node')).filter(n => {
      const r = n.getBoundingClientRect();
      return r.left < pane.left - 0.5 || r.right > pane.right + 0.5 || r.top < pane.top - 0.5 || r.bottom > pane.bottom + 0.5;
    }).length;
    return { out, zoom: Number((${view})().editor.instance.getZoom().toFixed(3)) };
  })()`);
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await reloadPlugin(page);
  await openEditor(page, FILE);
  const before = await md(page, FILE);
  ctx.drain();
  const opened = await outsidePane(page);
  console.log(`on open: zoom ${opened.zoom}, nodes outside the pane ${opened.out} | ${await shot(page, `${PREFIX}-open`)}`);

  for (const layout of LAYOUTS) {
    const sampled = await organizeSampled(page, layout, [0, 100, 200, 300, 450, 700, 1200]);
    const p = progress(sampled);
    await sleep(800);
    const overlaps = await renderedOverlaps(page);
    const fit = await outsidePane(page);
    const f = await shot(page, `${PREFIX}-${layout}`);
    console.log(`${layout}: moved ${p.moved}px | progress ${p.shares.join(' ')} | rendered nodes ${overlaps.nodes}, overlapping pairs ${overlaps.pairs} | zoom ${fit.zoom}, nodes outside the pane ${fit.out} | ${f}`);
  }
  console.log(`${FILE} unchanged:`, before === (await md(page, FILE)), '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);

  // Drag on Canal.md: on an intermediate frame the node has moved exactly as far as the pointer.
  await resetVault(page, CANAL);
  await openEditor(page);
  const from = await rect(page, 'Roteiro');
  const to = { x: from.x, y: from.y + 150 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4);
  await sleep(50);
  // Compare two intermediate frames, so the drag threshold at the start does not count.
  const frames = {};
  for (let i = 1; i <= 10; i++) {
    const pointer = { x: from.x + (to.x - from.x) * i / 10, y: from.y + (to.y - from.y) * i / 10 };
    await page.mouse.move(pointer.x, pointer.y);
    await sleep(16);
    if (i === 3 || i === 7) frames[i] = { pointerY: pointer.y, nodeY: (await rect(page, 'Roteiro')).y };
  }
  await page.mouse.up();
  await sleep(500);
  const pointerDy = Math.round(frames[7].pointerY - frames[3].pointerY);
  const nodeDy = Math.round(frames[7].nodeY - frames[3].nodeY);
  console.log('mid-drag between frames 3 and 7: pointer', pointerDy, 'px, node', nodeDy, 'px | node follows pointer:', Math.abs(pointerDy - nodeDy) <= 1.5);
  await page.evaluate(() => document.querySelector('.mdmap-organize[data-layout="center"]').click());
  await sleep(1200);
  console.log('Canal.md back to CANAL after Center root:', (await md(page)) === CANAL);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
