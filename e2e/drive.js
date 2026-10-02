// One-off actions on the test Obsidian. Usage: node drive.js status | trust | enable | md | shot [name] | eval <js>
const { connect, shot, md, sleep } = require('./lib');

const steps = {
  async status({ page }) {
    console.log(JSON.stringify(await page.evaluate(() => ({
      modal: document.querySelector('.modal')?.innerText?.slice(0, 200),
      plugin: !!app.plugins.plugins['mdmap'],
      enabled: Array.from(app.plugins.enabledPlugins),
      files: app.vault.getFiles().map(f => f.path),
    })), null, 1));
  },
  async trust({ page }) {
    console.log(await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.modal button')).find(x => /trust/i.test(x.innerText));
      if (!b) return 'no trust button';
      b.click();
      return 'clicked ' + b.innerText;
    }));
    await sleep(1500);
  },
  async enable({ page }) {
    console.log('plugin loaded:', await page.evaluate(async () => {
      await app.plugins.setEnable(true);
      await app.plugins.enablePluginAndSave('mdmap');
      return !!app.plugins.plugins['mdmap'];
    }));
  },
  async md({ page }) { console.log(await md(page)); },
  async shot({ page }, name) { console.log(await shot(page, name || 'shot')); },
  async eval({ page }, code) { console.log(JSON.stringify(await page.evaluate(code), null, 1)); },
};

(async () => {
  const [step, ...args] = process.argv.slice(2);
  if (!steps[step]) throw new Error('unknown step: ' + step);
  const ctx = await connect();
  try { await steps[step](ctx, ...args); } finally { ctx.browser.disconnect(); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
