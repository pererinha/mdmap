// Shared helpers for the e2e scenarios: connect to the test Obsidian over CDP, read and reset Canal.md, open the mind map.
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const PORT = process.env.MDMAP_CDP_PORT || '9333';
const OUT = `${__dirname}/shots`;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = (await browser.pages()).find(p => p.url().startsWith('app://obsidian.md'));
  if (!page) throw new Error('no Obsidian page on port ' + PORT);
  const logs = [];
  page.on('console', m => { const t = m.text(); if (t.includes('[mdmap]') || m.type() === 'error') logs.push(t.slice(0, 200)); });
  const size = await page.evaluate(() => { try { const w = require('electron').remote.getCurrentWindow(); w.setSize(1600, 900); return w.getSize(); } catch (e) { return 'resize failed: ' + e.message; } });
  console.log('window', JSON.stringify(size));
  return { browser, page, logs, drain: () => logs.splice(0) };
}
async function shot(page, name) { const f = `${OUT}/${name}.png`; await page.screenshot({ path: f }); return f; }
async function md(page, file = 'Canal.md') { return page.evaluate(f => app.vault.adapter.read(f), file); }
async function resetVault(page, content) {
  await page.evaluate(async c => { await app.vault.adapter.write('Canal.md', c); }, content);
  await sleep(600);
}
async function reloadPlugin(page) {
  await page.evaluate(async () => { await app.plugins.disablePlugin('mdmap'); await app.plugins.enablePlugin('mdmap'); });
  await sleep(500);
}
/** Opens `file` in the markdown pane and runs the edit command, which opens the mind map in a split. */
async function openEditor(page, file = 'Canal.md') {
  await sleep(1500); // the workspace restores the previous editor leaf asynchronously after a plugin reload
  await page.evaluate(async file => {
    app.workspace.leftSplit.collapse();
    app.workspace.detachLeavesOfType('mdmap');
    const leaf = app.workspace.getLeavesOfType('markdown')[0] ?? app.workspace.getLeaf(false);
    await leaf.openFile(app.vault.getAbstractFileByPath(file));
    app.workspace.getLeavesOfType('empty').forEach(l => l.detach());
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById('mdmap:edit-mind-map');
  }, file);
  await sleep(2500);
}
/** Screen rectangle of the node whose title is `title`, or null. */
async function rect(page, title) {
  return page.evaluate(title => {
    const span = Array.from(document.querySelectorAll('.mdmap-title')).find(s => s.textContent === title);
    if (!span) return null;
    const r = span.closest('.react-flow__node').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, title);
}
async function clickNode(page, title) {
  const r = await rect(page, title);
  if (!r) throw new Error('node not found: ' + title);
  await page.mouse.click(r.x, r.y);
  await sleep(250);
  return r;
}
/** Double-click as two separate clicks; a single click({clickCount: 2}) does not reach React Flow. */
async function dblClick(page, r) {
  await page.mouse.move(r.x, r.y);
  await page.mouse.down({ clickCount: 1 }); await page.mouse.up({ clickCount: 1 });
  await sleep(80);
  await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 });
  await sleep(400);
}
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4); // the drag starts after the threshold
  await sleep(50);
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 15, from.y + (to.y - from.y) * i / 15);
    await sleep(30);
  }
  await sleep(200);
  await page.mouse.up();
  await sleep(500);
}
/** Prints the logs since the last report and the content of Canal.md, and saves a screenshot. */
async function report(ctx, name) {
  await sleep(500);
  const content = await md(ctx.page);
  const logs = ctx.drain();
  const f = await shot(ctx.page, name);
  console.log(`\n### ${name}\nlogs: ${logs.join(' | ') || '(none)'}\n--- Canal.md ---\n${content}--- end --- ${f}`);
  return content;
}
const view = () => app.workspace.getLeavesOfType('mdmap')[0].view;
const CANAL = '# Canal\n\n## Pesquisa\n\n### Referências\n### Artigos\n\n## Roteiro\n\n### Introdução\n### Desenvolvimento\n';

module.exports = { connect, shot, md, sleep, resetVault, reloadPlugin, openEditor, rect, clickNode, dblClick, drag, report, view, CANAL };
