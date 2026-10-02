// The copy button on a node: it shows on hover with an icon, and a click puts the node and everything under it on
// the clipboard as the note's Markdown, without selecting the node, revealing it or touching the note. A press on
// the button does not drag the node. The clipboard's text is saved first and put back at the end.
const { connect, sleep, reloadPlugin, openEditor, rect, md, shot, view } = require('./lib');

const FILE = 'Copy-e2e.md';
const NOTE = [
  '# Canal',
  '',
  '## Pesquisa',
  '',
  'Regras das falas:',
  '',
  '1. primeira',
  '   - detalhe',
  '     - mais fundo',
  '2. segunda',
  '',
  '### Artigos',
  'corpo dos artigos',
  '',
  '## Roteiro',
  '',
  '### Introdução',
  '',
].join('\n');

/** Hovers the node, then clicks its copy button; returns what the button looked like and what landed on the clipboard. */
async function copy(page, title) {
  const node = await rect(page, title);
  await page.mouse.move(node.x, node.y);
  await sleep(200);
  const button = await page.evaluate(title => {
    const span = Array.from(document.querySelectorAll('.mdmap-title, .mdmap-text')).find(s => s.textContent === title || s.textContent.split('\n')[0] === title);
    const el = span.closest('.react-flow__node').querySelector('.mdmap-copy');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: getComputedStyle(el).visibility === 'visible', icon: !!el.querySelector('svg'), label: el.getAttribute('aria-label') };
  }, title);
  await page.evaluate(() => require('electron').clipboard.writeText(''));
  await page.mouse.move(button.x, button.y);
  await page.mouse.click(button.x, button.y);
  await sleep(400);
  const clipboard = await page.evaluate(() => require('electron').clipboard.readText());
  return { button, clipboard };
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  const savedClipboard = await page.evaluate(() => require('electron').clipboard.readText());
  await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
  }, { file: FILE, content: NOTE });
  await reloadPlugin(page);
  await openEditor(page, FILE);
  ctx.drain();

  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-copy')).filter(b => getComputedStyle(b).visibility === 'visible').length);
  console.log('copy buttons visible before any hover:', hidden);

  const cases = [
    ['Pesquisa', NOTE.slice(NOTE.indexOf('## Pesquisa'), NOTE.indexOf('\n\n## Roteiro'))],
    ['detalhe', '- detalhe\n  - mais fundo'],
    ['Regras das falas:', 'Regras das falas:\n\n1. primeira\n   - detalhe\n     - mais fundo\n2. segunda'],
    ['Canal', NOTE.trimEnd()],
  ];
  for (const [title, expected] of cases) {
    const { button, clipboard } = await copy(page, title);
    console.log(`copy "${title}": button ${JSON.stringify(button.label)} visible on hover: ${button.visible}, icon: ${button.icon} | clipboard is the section: ${clipboard === expected}`);
    if (clipboard !== expected) console.log('  got:', JSON.stringify(clipboard), '\n  expected:', JSON.stringify(expected));
  }
  const notice = await page.evaluate(() => Array.from(document.querySelectorAll('.notice')).map(n => n.textContent));
  console.log('notice:', JSON.stringify(notice.slice(-1)));
  console.log(await shot(page, 'copy-01-hover'));

  // The click stayed on the button: no node selected, no line revealed in the note.
  const side = await page.evaluate(`(() => {
    const selected = (${view})().editor.instance.getNodes().filter(n => n.selected).map(n => n.data.title);
    const revealed = document.querySelectorAll('.cm-line.mdmap-revealed').length;
    return { selected, revealed };
  })()`);
  console.log('after the copy clicks:', JSON.stringify(side), '| nothing selected or revealed:', side.selected.length === 0 && side.revealed === 0);

  // A press on the button that moves does not drag the node.
  const before = await rect(page, 'Roteiro');
  await page.mouse.move(before.x, before.y);
  await sleep(200);
  const b = await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('.mdmap-title')).find(s => s.textContent === 'Roteiro');
    const r = span.closest('.react-flow__node').querySelector('.mdmap-copy').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(b.x + i * 10, b.y + i * 10); await sleep(20); }
  await page.mouse.up();
  await sleep(400);
  const after = await rect(page, 'Roteiro');
  console.log('press and move on the button: node stayed put:', Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1);

  console.log(`${FILE} unchanged:`, (await md(page, FILE)) === NOTE, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  await page.evaluate(text => require('electron').clipboard.writeText(text), savedClipboard);
  console.log('clipboard restored:', (await page.evaluate(() => require('electron').clipboard.readText())) === savedClipboard);
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
