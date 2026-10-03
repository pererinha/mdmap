// Editing in place: a double-click makes the label itself editable, so the node keeps its box, border, font and
// colours and only a caret appears, where the double-click landed. Typing grows the box and moves its neighbours
// without writing the note; a click outside or Escape writes it, Escape gives the keyboard back to the map, and
// Cmd+Z undoes the edit. Enter never ends the edit: it adds a line in a paragraph and nothing in a heading. A long
// title shows whole while edited, a paragraph block is edited whole and the table between its paragraphs stays, a
// node added with Tab starts with its text selected, and a paragraph with an image shows its embed line as Markdown
// while edited, with the image still under the text.
const { connect, sleep, reloadPlugin, openEditor, clickNode, dblClick, md, shot } = require('./lib');

const FILE = 'Editing-e2e.md';
const IMAGE = 'Editing-e2e.png';
const LONG = 'A heading whose title is longer than forty characters';
const NOTE = ['# Editing', '', '## Comments', '', '- Ask about the comment box', '', `## ${LONG}`, '', '## Story', '',
  'First line of the paragraph,', 'second line of the paragraph.', '', '|a|b|', '|---|---|', '', 'Third line after the table.', '',
  '## Picture', '', 'A paragraph with a picture.', `![[${IMAGE}]]`, ''].join('\n');
const MAC = process.platform === 'darwin';
const MOD = MAC ? 'Meta' : 'Control';

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
  await page.evaluate(async ({ file, content, image }) => {
    if (!app.vault.getAbstractFileByPath(image)) {
      const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
      const g = canvas.getContext('2d');
      g.fillStyle = '#3b82f6'; g.fillRect(0, 0, 160, 90); g.fillStyle = '#f59e0b'; g.fillRect(20, 20, 60, 50);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      await app.vault.createBinary(image, await blob.arrayBuffer());
    }
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
  }, { file: FILE, content: NOTE, image: IMAGE });
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

  // 3. Enter in a heading neither ends the edit nor adds a line; Escape writes the note and gives the keyboard to the map
  await page.keyboard.press('Enter');
  await sleep(300);
  c = await caret(page);
  console.log('Enter in a heading: still editing, no new line:', c.inEditable && c.text === 'Comments and notes');
  await page.keyboard.press('Escape');
  await sleep(800);
  let note = await md(page, FILE);
  const onMap = () => page.evaluate(() => document.activeElement?.classList.contains('mdmap-root') && !document.querySelector('.mdmap-editable'));
  console.log('Escape: note has "## Comments and notes", editing over, keyboard on the map:', note.includes('## Comments and notes\n') && (await onMap()));

  // 4. a click outside writes the note too; Cmd+Z then puts the text, the box and the note back
  const item0 = await look(page, 'Ask about the comment box');
  const note0 = note;
  await dblClick(page, await charPoint(page, 'Ask about the comment box', 2));
  await page.keyboard.down(MOD); await page.keyboard.press('a', { commands: ['SelectAll'] }); await page.keyboard.up(MOD);
  await page.keyboard.type('Something much longer than the item was', { delay: 10 });
  const pane = await page.evaluate(() => { const r = document.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: r.right - 40, y: r.bottom - 40 }; });
  await page.mouse.click(pane.x, pane.y);
  await sleep(800);
  note = await md(page, FILE);
  console.log('click outside: the item is written:', note.includes('- Something much longer than the item was\n'));
  await chord(page, [MOD], 'z');
  await sleep(800);
  const item1 = await look(page, 'Ask about the comment box');
  note = await md(page, FILE);
  console.log('Cmd+Z: text, box and note back:', JSON.stringify(item0.box) === JSON.stringify(item1.box) && note === note0);

  // 5. a long title shows whole while edited, in a box that fits it
  const cut = await page.evaluate(() => Array.from(document.querySelectorAll('.mdmap-title')).map(s => s.textContent).find(t => t.startsWith('A heading whose')));
  await dblClick(page, await charPoint(page, cut, 3));
  c = await caret(page);
  const longLook = await look(page, cut);
  console.log('long title:', JSON.stringify({ cut, editing: c.text }), '| whole while edited, fits:', cut.endsWith('…') && c.text === LONG && longLook.fits);
  await page.keyboard.press('Escape');
  await sleep(400);

  // 6. a paragraph block is edited whole: the caret on line 2, Shift+Enter and Enter add lines, a click outside writes it
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
  await page.keyboard.type('Another line.', { delay: 10 });
  await sleep(300);
  c = await caret(page);
  console.log('Shift+Enter and Enter in a paragraph: still editing, two lines added, note unchanged:', c.inEditable && c.text.split('\n').length === 5 && (await md(page, FILE)) === note);
  await page.mouse.click(pane.x, pane.y);
  await sleep(800);
  note = await md(page, FILE);
  const expected = NOTE.replace('## Comments\n', '## Comments and notes\n').replace('second line of the paragraph.\n', 'second line of the paragraph. Edited.\nA new line.\nAnother line.\n');
  console.log('paragraph written, table kept:', note === expected);
  if (note !== expected) console.log(JSON.stringify(note));

  // 7. Tab adds a child whose text starts selected
  await clickNode(page, 'Comments and notes');
  await page.keyboard.press('Tab');
  await sleep(500);
  c = await caret(page);
  console.log('Tab: new node editing with its text selected:', c.inEditable && c.selected === 'New node');
  await page.keyboard.type('Child', { delay: 20 });
  await page.keyboard.press('Escape');
  await sleep(800);
  console.log('new child written, keyboard on the map:', (await md(page, FILE)).includes('Child') && (await onMap()));
  // the keyboard is on the map, so Tab right away adds a child to "Child"
  await page.keyboard.press('Tab');
  await sleep(500);
  c = await caret(page);
  await page.keyboard.press('Escape');
  await sleep(800);
  console.log('Tab after Escape adds a grandchild:', c.inEditable && c.selected === 'New node' && (await md(page, FILE)).includes('New node'));

  // 8. a paragraph with an image: the embed line shows as Markdown while edited, and the image stays under the text
  const picture = async () => page.evaluate(() => {
    const node = (document.querySelector('.mdmap-editable') ?? Array.from(document.querySelectorAll('.mdmap-text')).find(s => s.textContent.startsWith('A paragraph with'))).closest('.mdmap-node');
    const img = node.querySelector('img.mdmap-thumb');
    const text = node.querySelector('.mdmap-editable, .mdmap-text');
    return { image: !!img && img.complete && img.naturalWidth > 0, below: !!img && img.getBoundingClientRect().top >= text.getBoundingClientRect().bottom - 1, text: text.textContent };
  });
  const shown = await picture();
  await dblClick(page, await charPoint(page, 'A paragraph with a picture.', 2));
  const editingPicture = await picture();
  console.log('picture while edited:', JSON.stringify({ shown, editingPicture }), '| embed line as Markdown, image still under the text:',
    shown.image && shown.text === 'A paragraph with a picture.' && editingPicture.image && editingPicture.below && editingPicture.text === `A paragraph with a picture.\n![[${IMAGE}]]`);
  console.log(await shot(page, 'editing-04-picture'));
  await caretAtEndOfLine(page, 0);
  await page.keyboard.type(' Nice.', { delay: 10 });
  await page.keyboard.press('Escape');
  await sleep(800);
  note = await md(page, FILE);
  console.log('picture paragraph written, embed kept:', note.includes(`A paragraph with a picture. Nice.\n![[${IMAGE}]]\n`));
  // deleting the embed line hides the image at once; Escape writes that, and Cmd+Z brings both back
  await dblClick(page, await charPoint(page, 'A paragraph with a picture. Nice.', 2));
  await page.evaluate(() => {
    const el = document.querySelector('.mdmap-editable');
    const text = el.firstChild;
    getSelection().setBaseAndExtent(text, text.textContent.indexOf('\n'), text, text.textContent.length);
  });
  await page.keyboard.press('Backspace');
  await sleep(300);
  const deleted = await picture();
  await page.keyboard.press('Escape');
  await sleep(800);
  const withoutEmbed = !(await md(page, FILE)).includes(`![[${IMAGE}]]`);
  await chord(page, [MOD], 'z');
  await sleep(800);
  const restored = await picture();
  console.log('embed line deleted: image gone at once, Escape writes it, Cmd+Z brings image and note back:', !deleted.image && withoutEmbed && restored.image && (await md(page, FILE)) === note);

  await page.evaluate(async (file, image) => {
    app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
    await app.vault.delete(app.vault.getAbstractFileByPath(file));
    await app.vault.delete(app.vault.getAbstractFileByPath(image));
  }, FILE, IMAGE);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
