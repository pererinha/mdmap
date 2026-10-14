// The plugin's settings tab has what the gear in a map has: "Show paragraphs" switched there hides and shows the
// paragraph nodes of the open map, and is off-limits while list items are not nodes; "Show clicked node in the note"
// is there; "Node colors" opens the map's colour editor in a modal in the settings window, and a colour picked there
// colours the open map; "Use theme colors" drops it. The settings search finds the new rows. The settings, colours and
// search text from before are put back. The settings open in a popout window, a page of its own.
const { connect, sleep, reloadPlugin, openEditor, md } = require('./lib');

const FILE = 'Settings-e2e.md';
const NOTE = '# Ajustes\n\n## Primeiro\n\nUm parágrafo sob o primeiro título.\n\n## Segundo\n';
const LIGHT_GREEN = 'rgb(8, 185, 78)';

async function settingsPage(browser) {
  for (const p of await browser.pages()) {
    if (await p.evaluate(() => !!document.querySelector('.modal.mod-settings')).catch(() => false)) return p;
  }
  throw new Error('no settings window');
}

/** Clicks the centre of an element with the mouse, in its own window, which becomes the active one. */
async function click(page, find, arg) {
  await page.bringToFront();
  const r = await page.evaluate(find, arg);
  if (!r) throw new Error('nothing to click for ' + JSON.stringify(arg));
  await page.mouse.click(r.x, r.y);
  await sleep(400);
}
const rowPart = ([name, part]) => {
  const item = Array.from(document.querySelectorAll('.modal.mod-settings .vertical-tab-content .setting-item')).find(i => i.querySelector('.setting-item-name')?.textContent.trim() === name);
  const el = part ? item?.querySelector(part) : item;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const rowState = (page, name) => page.evaluate(name => {
  const item = Array.from(document.querySelectorAll('.modal.mod-settings .vertical-tab-content .setting-item')).find(i => i.querySelector('.setting-item-name')?.textContent.trim() === name);
  if (!item) return null;
  const toggle = item.querySelector('.checkbox-container');
  return { on: toggle?.classList.contains('is-enabled'), disabled: !!(item.classList.contains('is-disabled') || toggle?.classList.contains('is-disabled') || item.querySelector('input:disabled')) };
}, name);

const paragraphNodes = page => page.evaluate(() => document.querySelectorAll('.mdmap-paragraph-node').length);
const branchColor = (page, title) => page.evaluate(title => getComputedStyle(Array.from(document.querySelectorAll('.mdmap-node')).find(n => n.querySelector('.mdmap-title')?.textContent === title)).borderTopColor, title);
const saved = page => page.evaluate(async () => JSON.parse(await app.vault.adapter.read('.obsidian/plugins/mdmap/data.json')));

(async () => {
  const ctx = await connect();
  const { page, browser } = ctx;
  // Start with no picked colours and every switch on; what was there before comes back at the end.
  const previous = await page.evaluate(async ({ file, content }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, content); else await app.vault.create(file, content);
    const { colors, listItemsAsNodes, paragraphsAsNodes, revealInNote } = app.plugins.plugins.mdmap.settings;
    return { colors, listItemsAsNodes, paragraphsAsNodes, revealInNote };
  }, { file: FILE, content: NOTE });
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins.mdmap;
    Object.assign(plugin.settings, { listItemsAsNodes: true, paragraphsAsNodes: true, revealInNote: true, colors: { light: { root: '', rootText: '', branches: [] }, dark: { root: '', rootText: '', branches: [] } } });
    await plugin.saveSettings();
  });
  let search = null;
  try {
    await reloadPlugin(page);
    await page.evaluate(() => app.changeTheme('moonstone'));
    await page.waitForFunction(() => document.body.classList.contains('theme-light'));
    await openEditor(page, FILE);
    ctx.drain();
    console.log('paragraph nodes on the map at first:', await paragraphNodes(page));

    // 1. the tab lists the gear's switches and the colours
    await page.evaluate(() => { app.setting.open(); app.setting.openTabById('mdmap'); });
    await sleep(1500);
    const settings = await settingsPage(browser);
    search = await settings.evaluate(() => document.querySelector('.modal.mod-settings input[type=search]').value);
    const rows = await settings.evaluate(() => Array.from(document.querySelectorAll('.modal.mod-settings .vertical-tab-content .setting-item-name')).map(e => e.textContent.trim()));
    const heading = await settings.evaluate(() => document.querySelector('.modal.mod-settings .vertical-tab-content').textContent.includes('Colors'));
    console.log('rows:', JSON.stringify(rows), '| the gear\'s settings are there:',
      ['Show paragraphs', 'Show clicked node in the note', 'Node colors', 'Use theme colors'].every(n => rows.includes(n)) && heading,
      '| "Use theme colors" off with nothing picked:', (await rowState(settings, 'Use theme colors')).disabled);

    // 2. "Show paragraphs" switched off and on in the tab changes the open map at once
    await click(settings, rowPart, ['Show paragraphs', '.checkbox-container']);
    await sleep(600);
    const off = { nodes: await paragraphNodes(page), saved: (await saved(page)).paragraphsAsNodes };
    await click(settings, rowPart, ['Show paragraphs', '.checkbox-container']);
    await sleep(600);
    const on = { nodes: await paragraphNodes(page), saved: (await saved(page)).paragraphsAsNodes };
    console.log('Show paragraphs off:', JSON.stringify(off), '| on:', JSON.stringify(on), '| the map follows:', off.nodes === 0 && !off.saved && on.nodes > 0 && on.saved);

    // 3. with list items not nodes, "Show paragraphs" is off-limits; back on, it is not
    await click(settings, rowPart, ['List items and paragraphs as nodes', '.checkbox-container']);
    const locked = await rowState(settings, 'Show paragraphs');
    await click(settings, rowPart, ['List items and paragraphs as nodes', '.checkbox-container']);
    const unlocked = await rowState(settings, 'Show paragraphs');
    console.log('Show paragraphs off-limits without list items:', locked.disabled, '| usable again:', !unlocked.disabled);

    // 4. "Show clicked node in the note" switched in the tab is saved
    await click(settings, rowPart, ['Show clicked node in the note', '.checkbox-container']);
    const revealOff = (await saved(page)).revealInNote;
    await click(settings, rowPart, ['Show clicked node in the note', '.checkbox-container']);
    console.log('Show clicked node off then on:', revealOff === false && (await saved(page)).revealInNote === true);

    // 5. "Node colors" opens the colour editor in the settings window; a hex typed there colours the open map
    await click(settings, rowPart, ['Node colors']);
    const inSettingsWindow = await settings.evaluate(() => !!document.querySelector('.mdmap-colors-modal .mdmap-colors'));
    const swatch = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    await click(settings, swatch, '.mdmap-colors-modal .mdmap-swatches .mdmap-swatch:nth-child(2)');
    await click(settings, swatch, '.mdmap-colors-modal .mdmap-colors-actions button');
    await settings.focus('.mdmap-colors-modal .mdmap-color-hex');
    await settings.evaluate(() => document.querySelector('.mdmap-colors-modal .mdmap-color-hex').select());
    await settings.keyboard.type('ff0000');
    await sleep(500);
    const picked = await branchColor(page, 'Primeiro');
    await settings.keyboard.press('Escape');
    await sleep(400);
    console.log('colour editor in the settings window:', inSettingsWindow, '| Primeiro red on the map:', picked === 'rgb(255, 0, 0)',
      '| modal closed:', await settings.evaluate(() => !document.querySelector('.mdmap-colors-modal')),
      '| "Use theme colors" usable now:', !(await rowState(settings, 'Use theme colors')).disabled);

    // 6. "Use theme colors" in the tab drops it
    await click(settings, rowPart, ['Use theme colors']);
    const back = await branchColor(page, 'Primeiro');
    console.log('Primeiro back to the theme:', back === LIGHT_GREEN, '| saved empty:', JSON.stringify((await saved(page)).colors.light) === JSON.stringify({ root: '', rootText: '', branches: [] }),
      '| "Use theme colors" off again:', (await rowState(settings, 'Use theme colors')).disabled);

    // 7. the settings search finds the new rows
    await settings.focus('.modal.mod-settings input[type=search]');
    await settings.evaluate(() => document.querySelector('.modal.mod-settings input[type=search]').select());
    await settings.keyboard.type('paragraphs');
    await sleep(800);
    const results = await settings.evaluate(() => Array.from(document.querySelectorAll('.modal.mod-settings .setting-search-result-item')).map(e => e.textContent.trim()));
    console.log('search "paragraphs":', JSON.stringify(results), '| finds Show paragraphs:', results.includes('Show paragraphs'));
    console.log('note unchanged:', (await md(page, FILE)) === NOTE, '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  } finally {
    // The search text, the settings and the colours from before come back, also after a failure.
    if (search !== null) {
      const settings = await settingsPage(browser).catch(() => null);
      await settings?.evaluate(text => {
        const input = document.querySelector('.modal.mod-settings input[type=search]');
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, search);
    }
    await page.evaluate(() => app.setting.close());
    await page.evaluate(async ({ file, previous }) => {
      app.workspace.getLeavesOfType('mdmap').filter(l => l.view.getState().file === file).forEach(l => l.detach());
      const note = app.vault.getAbstractFileByPath(file);
      if (note) await app.vault.delete(note);
      const plugin = app.plugins.plugins.mdmap;
      Object.assign(plugin.settings, previous);
      await plugin.saveSettings();
    }, { file: FILE, previous });
    await reloadPlugin(page);
    const after = await saved(page);
    console.log('settings from before put back:', JSON.stringify({ colors: after.colors, listItemsAsNodes: after.listItemsAsNodes, paragraphsAsNodes: after.paragraphsAsNodes, revealInNote: after.revealInNote }) === JSON.stringify(previous));
  }
  browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
