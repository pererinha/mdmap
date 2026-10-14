// Map width: the "Mind map width" setting gives the map that share of the window when it opens next to the note, at
// 30 % and at 70 %; with Obsidian's internal setDimension missing, the map opens half and half without errors. The
// setting shows as a slider in the plugin's settings. The previous width is put back at the end.
const { connect, sleep, reloadPlugin, openEditor, shot } = require('./lib');

/** The map's share of the note's and the map's width together, in percent. */
async function share(page) {
  return page.evaluate(() => {
    const map = app.workspace.getLeavesOfType('mdmap')[0].parent.containerEl.getBoundingClientRect().width;
    const note = app.workspace.getLeavesOfType('markdown')[0].parent.containerEl.getBoundingClientRect().width;
    return Math.round((map / (map + note)) * 100);
  });
}

async function setWidth(page, width) {
  await page.evaluate(async width => {
    const plugin = app.plugins.plugins.mdmap;
    plugin.settings.mapWidth = width;
    await plugin.saveSettings();
  }, width);
}

(async () => {
  const ctx = await connect();
  const { page, browser } = ctx;
  await reloadPlugin(page);
  const previous = await page.evaluate(() => app.plugins.plugins.mdmap.settings.mapWidth);
  ctx.drain();

  for (const width of [30, 70]) {
    await setWidth(page, width);
    await openEditor(page);
    const got = await share(page);
    console.log(`width ${width}%: the map takes ${got}% | ok:`, Math.abs(got - width) <= 2);
    console.log(await shot(page, `width-${width}`));
  }

  // Without setDimension: the note's group loses the share the previous run gave it, as it never had one then.
  await page.evaluate(() => {
    const tabs = app.workspace.getLeavesOfType('markdown')[0].parent;
    tabs.setDimension(null);
    let proto = Object.getPrototypeOf(tabs);
    while (!Object.prototype.hasOwnProperty.call(proto, 'setDimension')) proto = Object.getPrototypeOf(proto);
    window.__mdmapSetDimension = { proto, fn: proto.setDimension };
    proto.setDimension = undefined;
  });
  await setWidth(page, 30);
  await openEditor(page);
  const fallback = await share(page);
  await page.evaluate(() => { window.__mdmapSetDimension.proto.setDimension = window.__mdmapSetDimension.fn; });
  const errors = ctx.drain().filter(l => !l.includes('[mdmap]'));
  console.log(`without setDimension: the map takes ${fallback}% | half and half: ${Math.abs(fallback - 50) <= 2} | errors: ${JSON.stringify(errors)}`);

  // The settings open in a popout window, a page of its own, so every page is searched for the settings modal.
  await page.evaluate(() => { app.setting.open(); app.setting.openTabById('mdmap'); });
  await sleep(1500);
  const pages = await browser.pages();
  let slider = null;
  for (const p of pages) {
    slider = await p.evaluate(() => {
      const modal = document.querySelector('.modal.mod-settings');
      if (!modal) return null;
      const item = Array.from(modal.querySelectorAll('.setting-item')).find(i => i.textContent.includes('Mind map width'));
      return item ? { found: true, range: !!item.querySelector('input[type=range]'), text: item.textContent.slice(0, 140) } : { found: false };
    }).catch(() => null);
    if (slider) break;
  }
  await page.evaluate(() => app.setting.close());
  console.log('settings:', JSON.stringify(slider), '| slider shown:', !!slider?.range);

  await setWidth(page, previous);
  console.log('width put back:', (await page.evaluate(() => app.plugins.plugins.mdmap.settings.mapWidth)) === previous);
  browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
