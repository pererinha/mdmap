// The grip: transparent while the pointer is away from its node, shown as soon as the pointer reaches it, also from
// outside the box, where half of it lies; dragged from there onto another node it moves its node under that one, and
// Cmd+Z puts the note back.
const { connect, sleep, reloadPlugin, openEditor, rect, md, shot } = require('./lib');

const FILE = 'Grip-e2e.md';
const NOTE = ['# Mapa', '', '## Alfa', '', '## Beta', ''].join('\n');

/** The grip of the node with this title: its centre, its opacity and whether the node is hovered. */
async function grip(page, title) {
  return page.evaluate(title => {
    const node = Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.querySelector('.mdmap-title')?.textContent === title);
    const el = node.querySelector('.mdmap-grip');
    const g = el.getBoundingClientRect();
    const box = node.querySelector('.mdmap-node').getBoundingClientRect();
    return { x: g.x + g.width / 2, y: g.y + g.height / 2, outward: g.x + g.width / 2 < box.x + box.width / 2 ? -1 : 1, edge: g.x + g.width / 2 < box.x + box.width / 2 ? box.left : box.right, radius: g.width / 2, opacity: getComputedStyle(el).opacity, hovered: node.matches(':hover') };
  }, title);
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

  // 1. away from "Beta", its grip is transparent
  let g = await grip(page, 'Beta');
  await page.mouse.move(g.x + g.outward * 200, g.y + 200);
  await sleep(200);
  g = await grip(page, 'Beta');
  console.log('pointer away: grip transparent:', g.opacity === '0', JSON.stringify(g));

  // 2. from outside the box, on the edge's side, onto the half of the grip outside the box: it shows
  await page.mouse.move(g.x + g.outward * 60, g.y);
  await sleep(150);
  const outside = { x: g.edge + g.outward * (g.radius / 2 + 1), y: g.y };
  await page.mouse.move(outside.x, outside.y, { steps: 6 });
  await sleep(200);
  g = await grip(page, 'Beta');
  console.log('pointer on the grip, outside the box: grip shown:', g.opacity === '1' && g.hovered, JSON.stringify(g));
  console.log(await shot(page, 'grip-01-from-outside'));

  // 3. dragged from there onto "Alfa", "Beta" goes under it; Cmd+Z puts the note back
  const alfa = await rect(page, 'Alfa');
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(outside.x + (alfa.x - outside.x) * i / 15, outside.y + (alfa.y - outside.y) * i / 15);
    await sleep(25);
  }
  await page.mouse.up();
  await sleep(800);
  const moved = await md(page, FILE);
  console.log('dragged onto Alfa, Beta is under it:', /^## Alfa$/m.test(moved) && /^### Beta$/m.test(moved) && !/^## Beta$/m.test(moved), JSON.stringify(moved));
  await page.evaluate(() => app.workspace.getLeavesOfType('mdmap')[0].view.containerEl.querySelector('.mdmap-root').focus());
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(800);
  console.log('after Cmd+Z, the note is the original:', (await md(page, FILE)) === NOTE);

  console.log('writes:', ctx.drain().filter(l => l.includes('wrote')).length, '(move and undo)');
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
