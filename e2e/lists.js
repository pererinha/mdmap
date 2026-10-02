// List items as nodes: rename an item, add a sibling item, a nested item, and a heading child.
const { connect, sleep, resetVault, reloadPlugin, openEditor, clickNode, dblClick, report, view } = require('./lib');

const CANAL_LISTS = '# Canal\n\n## Pesquisa\nnotas da pesquisa\n- Referências\n- Artigos\n\n## Roteiro\n\n### Introdução\n### Desenvolvimento\n';

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await resetVault(page, CANAL_LISTS);
  await reloadPlugin(page);
  await openEditor(page);
  ctx.drain();
  const kinds = await page.evaluate(`(${view})().editor.instance.getNodes().map(n => n.data.title + ':' + n.data.kind + (n.data.preview ? ':' + n.data.preview : ''))`);
  console.log('nodes', JSON.stringify(kinds));
  await report(ctx, 'lists-00-open');

  // 1. rename the item "Artigos" to "Papers"
  await dblClick(page, await clickNode(page, 'Artigos'));
  await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta');
  await page.keyboard.type('Papers', { delay: 20 });
  await page.keyboard.press('Enter');
  await report(ctx, 'lists-01-rename-item');

  // 2. sibling item after "Referências"
  await clickNode(page, 'Referências');
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.type('Livros', { delay: 20 });
  await page.keyboard.press('Enter');
  await report(ctx, 'lists-02-sibling-item');

  // 3. nested item under "Papers"
  await clickNode(page, 'Papers');
  await page.keyboard.press('Tab');
  await sleep(200);
  await page.keyboard.type('Scholar', { delay: 20 });
  await page.keyboard.press('Enter');
  await report(ctx, 'lists-03-nested-item');

  // 4. a new child of the heading "Roteiro" is a heading
  await clickNode(page, 'Roteiro');
  await page.keyboard.press('Tab');
  await sleep(200);
  await page.keyboard.type('Encerramento', { delay: 20 });
  await page.keyboard.press('Enter');
  await report(ctx, 'lists-04-heading-child');

  // 5. with the setting off, the same note has no list nodes
  await page.evaluate(async () => { app.plugins.plugins.mdmap.settings.listItemsAsNodes = false; await app.plugins.plugins.mdmap.saveSettings(); });
  await openEditor(page);
  const kindsOff = await page.evaluate(`(${view})().editor.instance.getNodes().map(n => n.data.kind)`);
  console.log('setting off -> kinds:', JSON.stringify(kindsOff), '| list nodes:', kindsOff.filter(k => k === 'list').length);
  await page.evaluate(async () => { app.plugins.plugins.mdmap.settings.listItemsAsNodes = true; await app.plugins.plugins.mdmap.saveSettings(); });
  await report(ctx, 'lists-05-setting-off');

  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
