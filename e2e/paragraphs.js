// Paragraphs as nodes: paragraphs that follow one another are one block of wrapped text that stays inside its
// box, "Regras das falas:" carries the rules as its children, Tab on a paragraph writes a list item right under
// it, undo restores the note, clicking a block highlights its first line in the note, and "Show paragraphs" in the
// gear menu hides and shows the paragraph nodes in the same map, without writing the note.
const { connect, sleep, reloadPlugin, openEditor, clickNode, md, shot, view } = require('./lib');

const FILE = 'Paragraphs-e2e.md';
const LONG = 'Um vídeo por debate. Dois pensadores discordam sobre uma pergunta ligada à tese do canal (viver bem com pouco). '
  + 'Cada pensador fala em primeira pessoa, em português, com voz de inteligência artificial no sotaque da língua dele. '
  + 'O mascote do canal é o árbitro, e ele nunca escolhe um vencedor absoluto; o veredito é sempre condicional.';
const NOTE = [
  '# Vozes',
  '',
  LONG,
  '',
  'Narrador e mascote: português sem sotaque.',
  '',
  '|Pensador|Sotaque|',
  '|---|---|',
  '|Epicuro|grego|',
  '',
  'Regras das falas:',
  '',
  '1. [documentado]: paráfrase própria ou citação com menos de 15 palavras, com fonte.',
  '2. [dramatizado]: frase criada para o debate.',
  '',
].join('\n');

/**
 * Clicks "Show paragraphs" in the gear menu of the map's header, with in-page menus as in reveal.js; returns the
 * saved setting, and whether in any frame of the next second the map was replaced or its viewport moved.
 */
async function showParagraphs(page) {
  const native = await page.evaluate(() => {
    const previous = app.vault.getConfig('nativeMenus');
    app.vault.setConfig('nativeMenus', false);
    return previous;
  });
  await page.evaluate(() => app.workspace.getLeavesOfType('mdmap')[0].view.containerEl.querySelector('.view-action[aria-label="Mind map settings"]').click());
  await sleep(300);
  const item = await page.evaluate(() => new Promise(resolve => {
    const host = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    const map = host.querySelector('.react-flow');
    const viewport = () => host.querySelector('.react-flow__viewport')?.style.transform;
    const before = viewport();
    let replaced = false;
    let moved = false;
    const el = Array.from(document.querySelectorAll('.menu .menu-item')).find(i => i.textContent.includes('Show paragraphs'));
    el?.click();
    const t0 = performance.now();
    const frame = () => {
      replaced ||= host.querySelector('.react-flow') !== map;
      moved ||= viewport() !== before;
      if (performance.now() - t0 < 1000) requestAnimationFrame(frame);
      else resolve({ found: !!el, disabled: !!el?.classList.contains('is-disabled'), replaced, moved });
    };
    requestAnimationFrame(frame);
  }));
  await sleep(500);
  await page.evaluate(previous => app.vault.setConfig('nativeMenus', previous), native);
  const saved = await page.evaluate(async () => JSON.parse(await app.vault.adapter.read('.obsidian/plugins/mdmap/data.json')).paragraphsAsNodes);
  return { ...item, saved };
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

  // 1. the tree the map shows, and how the paragraph blocks render
  const shape = await page.evaluate(`(() => {
    const flow = (${view})().editor.instance;
    const nodes = flow.getNodes();
    const byId = new Map(nodes.map(n => [n.id, n]));
    const rules = nodes.find(n => n.data.title === 'Regras das falas:');
    const blocks = Array.from(document.querySelectorAll('.mdmap-paragraph-node')).map(el => {
      const box = el.getBoundingClientRect();
      const text = el.querySelector('.mdmap-text');
      const r = text.getBoundingClientRect();
      return { first: text.textContent.split('\\n')[0].slice(0, 30), inside: r.bottom <= box.bottom + 1 && r.right <= box.right + 1, clamped: text.scrollHeight > text.clientHeight + 1 };
    });
    const rects = Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps++;
    }
    return {
      kinds: nodes.filter(n => n.data.depth === 1).map(n => n.data.kind + ': ' + n.data.title.slice(0, 30)),
      rulesChildren: nodes.filter(n => n.parentId === rules?.id).map(n => n.data.kind + ': ' + n.data.title.slice(0, 30)),
      blocks,
      overlaps,
      joined: nodes.find(n => n.data.title === ${JSON.stringify(LONG)})?.data.text.includes('Narrador e mascote: português sem sotaque.'),
    };
  })()`);
  console.log('top-level nodes:', JSON.stringify(shape.kinds));
  console.log('children of "Regras das falas:":', JSON.stringify(shape.rulesChildren), '| two rules:', shape.rulesChildren.length === 2 && shape.rulesChildren.every(k => k.startsWith('list')));
  console.log('paragraph blocks:', JSON.stringify(shape.blocks), '| text inside every box:', shape.blocks.every(b => b.inside), '| long one clamped:', shape.blocks.some(b => b.clamped));
  console.log('overlapping nodes:', shape.overlaps);
  console.log('the long paragraph and "Narrador e mascote" are one block:', shape.joined === true);
  console.log(await shot(page, 'paragraphs-01-open'));

  // 2. Tab on "Regras das falas:" adds a rule under it in the note
  await clickNode(page, 'Regras das falas:');
  await page.keyboard.press('Tab');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(800);
  const added = await md(page, FILE);
  const expected = NOTE.replace('2. [dramatizado]: frase criada para o debate.\n', '2. [dramatizado]: frase criada para o debate.\n2. New node\n');
  console.log('after Tab, the note is the original plus "2. New node" under the rules:', added === expected);
  const reread = await page.evaluate(`(() => {
    const nodes = (${view})().editor.instance.getNodes();
    const rules = nodes.find(n => n.data.title === 'Regras das falas:');
    return nodes.filter(n => n.parentId === rules.id).map(n => n.data.title.slice(0, 20));
  })()`);
  console.log('rules in the map now:', JSON.stringify(reread));
  console.log(await shot(page, 'paragraphs-02-tab'));

  // 3. undo puts the note back (a click gives the map the keyboard, as in steps.js)
  await clickNode(page, 'Vozes');
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(800);
  console.log('after undo, the note is the original:', (await md(page, FILE)) === NOTE);

  // 4. clicking a block of paragraphs highlights its first line in the note
  await clickNode(page, LONG);
  const revealed = await page.evaluate(file => {
    const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === file);
    return Array.from(leaf.view.containerEl.querySelectorAll('.cm-line.mdmap-revealed')).map(el => el.textContent.replace(/[​-‍﻿]/g, '').trim());
  }, FILE);
  console.log('highlighted line:', JSON.stringify(revealed.map(l => l.slice(0, 30))), '| is the first line of the block:', revealed.length === 1 && revealed[0] === LONG);
  console.log(await shot(page, 'paragraphs-03-reveal'));

  // 5. "Show paragraphs" in the gear menu: off, no paragraph nodes and the rules hang from the heading; on, they are
  // back. The map stays the same element and the viewport does not move. The toggle drops undo: the history holds
  // trees of the other parse, which would write the note wrong.
  const tree = () => page.evaluate(`(() => {
    const nodes = (${view})().editor.instance.getNodes();
    const root = nodes.find(n => n.data.depth === 0);
    return { kinds: nodes.map(n => n.data.kind), underRoot: nodes.filter(n => n.parentId === root.id).map(n => n.data.kind + ': ' + n.data.title.slice(0, 20)) };
  })()`);
  await clickNode(page, 'Vozes');
  await page.keyboard.down('Meta');
  await page.keyboard.down('Shift');
  await page.keyboard.press('z');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Meta');
  await sleep(800);
  console.log('redo brings back the rule from step 2, so undo has something to undo:', (await md(page, FILE)) === expected);
  const off = await showParagraphs(page);
  const hidden = await tree();
  console.log('gear off:', JSON.stringify(off), '| no paragraph nodes:', !hidden.kinds.includes('paragraph'), '| under "Vozes":', JSON.stringify(hidden.underRoot), '| no flicker:', !off.replaced && !off.moved);
  console.log(await shot(page, 'paragraphs-04-hidden'));
  await clickNode(page, 'Vozes');
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(800);
  console.log('undo after turning off has nothing to undo; the note is unchanged:', (await md(page, FILE)) === expected);
  const on = await showParagraphs(page);
  const shown = await tree();
  console.log('gear on:', JSON.stringify(on), '| paragraph nodes back:', shown.kinds.filter(k => k === 'paragraph').length, '| no flicker:', !on.replaced && !on.moved);
  console.log('the toggles did not write the note:', (await md(page, FILE)) === expected);

  console.log('writes:', ctx.drain().filter(l => l.includes('wrote')).length, '(Tab, undo and redo)');
  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
