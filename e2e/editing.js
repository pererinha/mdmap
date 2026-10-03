// Editing in place: a double-click makes the label itself editable, so the node keeps its box, border, font and
// colours and only a caret appears, where the double-click landed. Typing grows the box and moves its neighbours
// without writing the note; Enter writes it, Escape puts everything back. A long title shows whole while it is
// edited, a paragraph block is edited whole (Shift+Enter adds a line) and the table between its paragraphs stays,
// and a node added with Tab starts with its text selected.
const { connect, sleep, reloadPlugin, openEditor, clickNode, dblClick, md, shot } = require('./lib');

const FILE = 'Editing-e2e.md';
const LONG = 'A heading whose title is longer than forty characters';
const NOTE = ['# Editing', '', '## Comments', '', '- Ask about the comment box', '', `## ${LONG}`, '', '## Story', '',
  'First line of the paragraph,', 'second line of the paragraph.', '', '|a|b|', '|---|---|', '', 'Third line after the table.', ''].join('\n');
const MAC = process.platform === 'darwin';

async function chord(page, modifiers, key) {
  for (const m of modifiers) await page.keyboard.down(m);
  await page.keyboard.press(key);
  for (const m of [...modifiers].reverse()) await page.keyboard.up(m);
}

/** Screen point on the left edge of the character at `offset` in the label whose text (first line) is `text`. */
async function charPoint(page, text, offset) {
  return page.evaluate(({ text, offset }) => {
    const span = Array.from(document.querySelectorAll('.mdmap-title, .mdmap-text')).find(s => s.textContent === text || s.textContent.split('\n')[0] === text);
    const range = document.createRange();
    range.setStart(span.firstChild, offset);
    range.setEnd(span.firstChild, offset + 1);
    const r = range.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2 };
  }, { text, offset });
}

/** Box, border, background and text style of the node whose label starts with `text`, or of the node being edited. */
async function look(page, text) {
  return page.evaluate(text => {
    const label = document.querySelector('.mdmap-editable') ?? Array.from(document.querySelectorAll('.mdmap-title, .mdmap-text')).find(s => s.textContent.split('\n')[0] === text);
    const node = label.closest('.mdmap-node');
    const wrapper = label.closest('.react-flow__node').getBoundingClientRect();
    const n = getComputedStyle(node);
    const l = getComputedStyle(label);
    return {
      box: { w: Math.round(wrapper.width), h: Math.round(wrapper.height) },
      node: [n.borderTopColor, n.borderTopWidth, n.backgroundColor, n.paddingLeft, n.paddingTop].join(' '),
      text: [l.fontFamily.slice(0, 30), l.fontSize, l.fontWeight, l.lineHeight, l.color].join(' '),
      fits: node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
      inputs: document.querySelectorAll('.mdmap-root input:not(.mdmap-search-input)').length,
    };
  }, text);
}

/** Puts the caret at the end of line `line` of the text being edited. Cmd+Right sent over CDP does not move it on macOS. */
async function caretAtEndOfLine(page, line) {
  await page.evaluate(line => {
    const text = document.querySelector('.mdmap-editable').firstChild;
    const offset = text.textContent.split('\n').slice(0, line + 1).join('\n').length;
    getSelection().collapse(text, offset);
  }, line);
}

async function caret(page) {
  return page.evaluate(() => {
    const s = getSelection();
    const editable = document.querySelector('.mdmap-editable');
    return { inEditable: !!editable && editable.contains(s.anchorNode), offset: s.anchorOffset, collapsed: s.isCollapsed, selected: s.toString(), text: editable?.textContent ?? null };
  });
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function box(page, text) {
  return page.evaluate(text => {
    const span = Array.from(document.querySelectorAll('.mdmap-title, .mdmap-text')).find(s => s.textContent.split('\n')[0] === text) ?? document.querySelector('.mdmap-editable');
    const r = span.closest('.react-flow__node').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, text);
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

  // 1. the node looks the same while it is edited, and the caret lands on the double-clicked character
  const before = await look(page, 'Comments');
  console.log(await shot(page, 'editing-01-before'));
  await dblClick(page, await charPoint(page, 'Comments', 4));
  const during = await look(page, 'Comments');
  let c = await caret(page);
  console.log('same look while editing:', JSON.stringify({ before, during }), '|', JSON.stringify(before) === JSON.stringify(during));
  console.log('caret at "Comm|ents":', JSON.stringify(c), '|', c.inEditable && c.collapsed && c.offset === 4 && c.text === 'Comments');
  console.log(await shot(page, 'editing-02-during'));

  // 2. typing grows the box and moves the child, without writing the note
  const child0 = await box(page, 'Ask about the comment box');
  await caretAtEndOfLine(page, 0);
  await page.keyboard.type(' and notes', { delay: 20 });
  await sleep(300);
  const grown = await look(page, 'Comments');
  const edited = await box(page, 'Comments and notes');
  const child1 = await box(page, 'Ask about the comment box');
  console.log('typing:', JSON.stringify({ width: [before.box.w, grown.box.w], fits: grown.fits, childMoved: Math.round(child1.x - child0.x) }), '| box grew, text fits, child clear of it, note unchanged:',
    grown.box.w > before.box.w && grown.fits && !overlaps(edited, child1) && (await md(page, FILE)) === NOTE);

  // 3. Enter writes the note
  await page.keyboard.press('Enter');
  await sleep(800);
  let note = await md(page, FILE);
  console.log('Enter: note has "## Comments and notes", no editor left:', note.includes('## Comments and notes\n') && !(await page.evaluate(() => !!document.querySelector('.mdmap-editable'))));

  // 4. Escape puts the text, the box and the note back
  const item0 = await look(page, 'Ask about the comment box');
  await dblClick(page, await charPoint(page, 'Ask about the comment box', 2));
  await chord(page, [MAC ? 'Meta' : 'Control'], 'a');
  await page.keyboard.type('Something much longer than the item was', { delay: 10 });
  await page.keyboard.press('Escape');
  await sleep(500);
  const item1 = await look(page, 'Ask about the comment box');
  console.log('Escape: text, box and note back:', JSON.stringify(item0.box) === JSON.stringify(item1.box) && (await md(page, FILE)) === note);

  // 5. a long title shows whole while edited, in a box that fits it
  const cut = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-title')).map(s => s.textContent).find(t => t.startsWith('A heading whose')));
  await dblClick(page, await charPoint(page, cut, 3));
  c = await caret(page);
  const longLook = await look(page, cut);
  console.log('long title:', JSON.stringify({ cut, editing: c.text }), '| whole while edited, fits:', cut.endsWith('…') && c.text === LONG && longLook.fits);
  await page.keyboard.press('Escape');
  await sleep(400);

  // 6. a paragraph block is edited whole: the caret on line 2, a new line with Shift+Enter, the table kept
  const second = 'First line of the paragraph,\nsecond line of the paragraph.\nThird line after the table.'.indexOf('second');
  await dblClick(page, await charPoint(page, 'First line of the paragraph,', second));
  c = await caret(page);
  console.log('paragraph caret on "second":', JSON.stringify({ offset: c.offset, expected: second }), '|', c.inEditable && c.offset === second && c.text.split('\n').length === 3);
  console.log(await shot(page, 'editing-03-paragraph'));
  await caretAtEndOfLine(page, 1);
  await page.keyboard.type(' Edited.', { delay: 10 });
  await chord(page, ['Shift'], 'Enter');
  await page.keyboard.type('A new line.', { delay: 10 });
  await page.keyboard.press('Enter');
  await sleep(800);
  note = await md(page, FILE);
  const expected = NOTE.replace('## Comments\n', '## Comments and notes\n').replace('second line of the paragraph.\n', 'second line of the paragraph. Edited.\nA new line.\n');
  console.log('paragraph written, table kept:', note === expected);
  if (note !== expected) console.log(JSON.stringify(note));

  // 7. Tab adds a child whose text starts selected
  await clickNode(page, 'Comments and notes');
  await page.keyboard.press('Tab');
  await sleep(500);
  c = await caret(page);
  console.log('Tab: new node editing with its text selected:', c.inEditable && c.selected === 'New node');
  await page.keyboard.type('Child', { delay: 20 });
  await page.keyboard.press('Enter');
  await sleep(800);
  console.log('new child written:', (await md(page, FILE)).includes('Child'), '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);

  await page.evaluate(async file => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
  }, FILE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
