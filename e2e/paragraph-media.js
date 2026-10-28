// Rich paragraph previews, multiple images, and the caret's position when returning to Markdown source.
const assert = require('assert/strict');
const { connect, sleep, reloadPlugin, openEditor, md, shot } = require('./lib');

const FILE = 'Paragraph-media-e2e.md';
const IMAGES = ['Paragraph-media-wide-e2e.svg', 'Paragraph-media-tall-e2e.svg'];
const TEXT = 'A **clear summary** with *the problem*, `code`, and **the problem** again.\nSecond line with *emphasis*.';
const NOTE = `# Preview\n\n## Summary\n${TEXT}\n![[${IMAGES[0]}]]\n![[${IMAGES[1]}]]\n\n## Other branch\nA neighbouring paragraph.\n\n## Inline media\nInline **media** ![[${IMAGES[0]}]] and more.\n`;

(async () => {
  const { browser, page } = await connect();
  try {
    await page.evaluate(async ({ file, note, images }) => {
      for (const [i, path] of images.entries()) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${i ? 100 : 600}" height="${i ? 600 : 100}"><rect width="100%" height="100%" fill="${i ? '#c49af5' : '#79b9a0'}"/></svg>`;
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.modify(existing, svg); else await app.vault.create(path, svg);
      }
      const existing = app.vault.getAbstractFileByPath(file);
      if (existing) await app.vault.modify(existing, note); else await app.vault.create(file, note);
    }, { file: FILE, note: NOTE, images: IMAGES });
    await reloadPlugin(page);
    await openEditor(page, FILE);
    await page.evaluate(() => {
      const editor = app.workspace.getLeavesOfType('mdmap')[0].view.editor;
      editor.focus(editor.instance.getNodes().find(n => n.data.resolved.length === 2).id);
    });
    await sleep(600);

    for (const dark of [false, true]) {
      await page.evaluate(dark => app.changeTheme(dark ? 'obsidian' : 'moonstone'), dark);
      await sleep(300);
      const metrics = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.mdmap-paragraph-node')].find(e => e.querySelectorAll('.mdmap-thumb').length === 2);
        const box = node.getBoundingClientRect();
        const images = [...node.querySelectorAll('.mdmap-thumb')];
        const rects = images.map(e => e.getBoundingClientRect());
        const preview = node.querySelector('.mdmap-rendered');
        const all = [...document.querySelectorAll('.react-flow__node')].map(e => e.getBoundingClientRect());
        return {
          noDuplicateMedia: !document.querySelector('.mdmap-rendered img, .mdmap-rendered video'),
          inlineMediaKept: [...document.querySelectorAll('.mdmap-paragraph-node')].some(e => e.textContent.startsWith('Inline media') && e.querySelectorAll('.mdmap-thumb').length === 1),
          formatted: preview.querySelectorAll('strong').length === 2 && preview.querySelectorAll('em').length === 2 && !!preview.querySelector('code'),
          noRawEmbeds: !preview.textContent.includes('![['),
          loaded: images.every(e => e.complete && e.naturalWidth > 0),
          contained: rects.every(r => r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom),
          stacked: rects[1].top > rects[0].bottom,
          wholeText: preview.scrollHeight <= preview.clientHeight + 1,
          noOverlap: all.every((a, i) => all.slice(i + 1).every(b => a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5)),
        };
      });
      assert(Object.values(metrics).every(Boolean), JSON.stringify(metrics));
      console.log(dark ? 'dark' : 'light', metrics);
      console.log(await shot(page, `paragraph-media-${dark ? 'dark' : 'light'}`));
    }

    await page.evaluate(() => app.changeTheme('moonstone'));
    // The second occurrence checks that the caret follows the clicked formatted run, not its first occurrence.
    for (const [selector, expected] of [['strong:last-of-type', TEXT.lastIndexOf('the problem') + 4], ['em:last-of-type', TEXT.indexOf('emphasis') + 4]]) {
      const point = await page.evaluate(selector => {
        const node = [...document.querySelectorAll('.mdmap-paragraph-node')].find(e => e.querySelectorAll('.mdmap-thumb').length === 2);
        const text = node.querySelector(selector).firstChild;
        const range = document.createRange();
        range.setStart(text, 4);
        range.setEnd(text, 5);
        const r = range.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        return { x: r.left + .2, y: r.top + r.height / 2, left: box.left, top: box.top };
      }, selector);
      await page.mouse.click(point.x, point.y);
      await sleep(350);
      const edit = await page.evaluate(() => {
        const el = document.querySelector('.mdmap-editable');
        const box = el?.closest('.mdmap-node').getBoundingClientRect();
        return { text: el?.textContent, offset: getSelection().anchorOffset, left: box?.left, top: box?.top };
      });
      assert.equal(edit.offset, expected, JSON.stringify(edit));
      assert.equal(edit.text, `${TEXT}\n![[${IMAGES[0]}]]\n![[${IMAGES[1]}]]`);
      assert(Math.abs(edit.left - point.left) < 1 && Math.abs(edit.top - point.top) < 1, 'node moved when editing started');
      await page.keyboard.press('Escape');
      await sleep(400);
      assert.equal(await md(page, FILE), NOTE, 'preview or unchanged edit wrote to the note');
    }
    console.log('formatted text: caret on the clicked character, box stays in place, source and embeds preserved: true');
  } finally {
    await page.evaluate(async paths => {
      app.changeTheme('moonstone');
      app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === paths[0]).forEach(l => l.detach());
      for (const path of paths) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) await app.vault.delete(file);
      }
    }, [FILE, ...IMAGES]);
    browser.disconnect();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
