// Editing protocol against Canal.md: rename, child, sibling, delete, reorder, move, undo/redo, external edit.
const { connect, md, sleep, resetVault, reloadPlugin, openEditor, rect, clickNode, dblClick, drag, report, CANAL } = require('./lib');

async function typeText(page, text) { await page.keyboard.type(text, { delay: 20 }); }
async function selectedTitles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.react-flow__node.selected .mdmap-title')).map(s => s.textContent));
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await resetVault(page, CANAL);
  await reloadPlugin(page);
  await openEditor(page);
  ctx.drain();
  await report(ctx, 'steps-00-open');

  // 1. rename
  const r1 = await clickNode(page, 'Introdução');
  await dblClick(page, r1);
  await page.keyboard.down('Meta'); await page.keyboard.press('a', { commands: ['SelectAll'] }); await page.keyboard.up('Meta'); // over CDP, macOS needs the editing command
  await typeText(page, 'Abertura');
  await page.keyboard.press('Enter');
  await report(ctx, 'steps-01-rename');

  // 2. child
  await clickNode(page, 'Pesquisa');
  await page.keyboard.press('Tab');
  await sleep(200);
  await typeText(page, 'Fontes');
  await page.keyboard.press('Enter');
  await report(ctx, 'steps-02-child');

  // 3. sibling
  await clickNode(page, 'Referências');
  await page.keyboard.press('Enter');
  await sleep(200);
  await typeText(page, 'Livros');
  await page.keyboard.press('Enter');
  await report(ctx, 'steps-03-sibling');

  // 4. delete
  await clickNode(page, 'Livros');
  await page.keyboard.press('Delete');
  await report(ctx, 'steps-04-delete');

  // 5. reorder: Artigos above Referências
  await clickNode(page, 'Artigos');
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Alt');
  await report(ctx, 'steps-05-reorder');

  // 6. move to another parent by drag and drop
  await drag(page, await rect(page, 'Artigos'), await rect(page, 'Roteiro'));
  await report(ctx, 'steps-06-move');

  // 7. undo twice, redo once
  await clickNode(page, 'Canal');
  await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta');
  await report(ctx, 'steps-07a-undo');
  await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta');
  await report(ctx, 'steps-07b-undo');
  await page.keyboard.down('Meta'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Meta');
  await report(ctx, 'steps-07c-redo');

  // 8. external edit: append a heading via the vault, the map updates and keeps the selection
  await clickNode(page, 'Roteiro');
  const before = await md(page);
  await page.evaluate(async c => { await app.vault.adapter.write('Canal.md', c); }, before + '### Encerramento\n');
  await sleep(1200);
  console.log('\nexternal edit -> node Encerramento in map:', !!(await rect(page, 'Encerramento')), '| selection after reload:', JSON.stringify(await selectedTitles(page)));
  await report(ctx, 'steps-08-external');

  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
