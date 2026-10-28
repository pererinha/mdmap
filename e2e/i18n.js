// Interface language: with Obsidian in Brazilian Portuguese the commands, the organizer buttons, the search field and
// the settings under the map's gear are in Portuguese; back in English they are in English. Obsidian's getLanguage() reads
// localStorage.language, so the scenario sets it, reloads the window and puts the previous value back at the end.
const { connect, sleep, openEditor, shot } = require('./lib');

/**
 * Sets the app language and reloads the window, which loads the plugin again. A scenario before this one can leave
 * no note open, and openEditor needs one after a reload: the note opens in the leaf Obsidian would reuse.
 */
async function setLanguage(page, language) {
  await page.evaluate(language => (language ? localStorage.setItem('language', language) : localStorage.removeItem('language')), language);
  await page.reload();
  await page.waitForFunction(() => window.app?.workspace?.layoutReady && app.commands.commands['mdmap:edit-mind-map'], { timeout: 30000 });
  await page.evaluate(async () => {
    app.workspace.detachLeavesOfType('mdmap');
    if (app.workspace.getLeavesOfType('markdown').length === 0) {
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(app.vault.getAbstractFileByPath('Canal.md'));
      await leaf.loadIfDeferred();
    }
  });
  await sleep(1000);
}

/** Opens the map after a reload and waits until its buttons are on the page. */
async function openMap(page) {
  await openEditor(page);
  await page.waitForFunction(() => app.workspace.getLeavesOfType('mdmap')[0]?.view.containerEl.querySelector('.mdmap-organize'), { timeout: 15000 });
}

/** The text the plugin shows: commands, organizer buttons, search placeholder and the settings under the gear. */
async function texts(page) {
  return page.evaluate(async () => {
    const view = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    const gear = view.querySelector('.mdmap-settings-button');
    gear.click();
    await new Promise(r => setTimeout(r, 300));
    const panel = Array.from(view.querySelectorAll('.mdmap-settings label, .mdmap-colors-heading > span:first-child, .mdmap-tabs button, .mdmap-colors-actions button')).map(e => e.textContent);
    gear.click();
    return {
      commands: Object.values(app.commands.commands).filter(c => c.id.startsWith('mdmap:')).map(c => c.name),
      organizers: Array.from(view.querySelectorAll('.mdmap-organize')).map(b => b.textContent),
      search: view.querySelector('.mdmap-search-input').placeholder,
      gear: gear.getAttribute('aria-label'),
      panel,
    };
  });
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  const previous = await page.evaluate(() => localStorage.getItem('language'));

  try {
    await setLanguage(page, 'pt-BR');
    await openMap(page);
    const pt = await texts(page);
    console.log('pt-BR:', JSON.stringify(pt));
    console.log('in Portuguese:', pt.organizers.join() === 'Árvore,Raiz no centro,Radial' && pt.search === 'Buscar nós'
      && pt.gear === 'Configurações do mapa mental'
      && pt.panel.join() === 'Mostrar na nota o nó clicado,Mostrar parágrafos,Lembrar a posição do mapa,Cores,Claro,Escuro,Editar,Usar cores do tema'
      && pt.commands.some(c => c.endsWith('Editar a nota atual como mapa mental')));
    console.log(await shot(page, 'i18n-01-pt-br'));
  } finally {
    await setLanguage(page, previous);
  }
  await openMap(page);
  const en = await texts(page);
  console.log('back:', JSON.stringify(en));
  console.log('in English:', en.organizers.join() === 'Tidy tree,Center root,Radial' && en.search === 'Search nodes'
    && en.gear === 'Mind map settings'
    && en.panel.join() === 'Show clicked node in the note,Show paragraphs,Remember map position,Colors,Light,Dark,Edit,Use theme colors'
    && en.commands.some(c => c.endsWith('Edit current note as mind map')));
  console.log('language restored:', (await page.evaluate(() => localStorage.getItem('language'))) === previous);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
