// The map in the real Obsidian for Android, on an emulator: the build is installed in the app's test vault, a tap
// edits a node, the keyboard opens and the node stays in sight above it, also a node the keyboard would cover, and
// a tap outside writes the new title to the note. On the phone-wide map every button stays clear of the search field,
// and with the lock closed a tap does not edit. Usage: node e2e/android.js   (setup in e2e/README.md, "Android")
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ADB = process.env.ADB || `${process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const PORT = process.env.MDMAP_ANDROID_PORT || '9444';
const VAULT = process.env.MDMAP_ANDROID_VAULT || 'mdmaptest';
const ROOT = path.resolve(__dirname, '..');
const OUT = `${__dirname}/shots`;
const FILE = 'Android-e2e.md';
const NOTE = ['# Phone', ...['skills', 'agents', 'hooks', 'prompts', 'memory', 'tests', 'rules', 'plans'].map(t => `## ${t}`),
  '## Middle', '### light', '### colour', '## Low', '### a', '### b', ''].join('\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = args => execSync(`"${ADB}" ${args}`, { encoding: 'utf8' });
const shot = name => { const f = `${OUT}/${name}.png`; fs.writeFileSync(f, execSync(`"${ADB}" exec-out screencap -p`)); return f; };

/** Puts the node titled `title` at `fraction` of the pane's height, at zoom 1, and returns its centre in device pixels. */
async function place(page, title, fraction) {
  return page.evaluate(({ title, fraction }) => {
    const flow = app.workspace.getLeavesOfType('mdmap')[0].view.editor.instance;
    const node = flow.getInternalNode(flow.getNodes().find(n => n.data.title === title).id);
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const cx = node.internals.positionAbsolute.x + node.measured.width / 2, cy = node.internals.positionAbsolute.y + node.measured.height / 2;
    flow.setViewport({ x: pane.width / 2 - cx, y: pane.height * fraction - cy, zoom: 1 });
    return { x: Math.round((pane.left + pane.width / 2) * devicePixelRatio), y: Math.round((pane.top + pane.height * fraction) * devicePixelRatio) };
  }, { title, fraction });
}

/** The node being edited, the pane and the keyboard, in CSS pixels. */
async function editing(page) {
  return page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const label = document.querySelector('.mdmap-editable');
    return {
      node: label && r(label.closest('.react-flow__node')), pane: r(document.querySelector('.react-flow')),
      keyboard: parseFloat(document.documentElement.style.getPropertyValue('--keyboard-height')) || 0, height: innerHeight,
    };
  });
}
/** Taps the empty canvas, which writes the node being edited. */
async function tapOutside(page) {
  const at = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    for (let y = pane.bottom - 20; y > pane.top; y -= 20) {
      for (let x = pane.right - 20; x > pane.left; x -= 20) {
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x: Math.round(x * devicePixelRatio), y: Math.round(y * devicePixelRatio) };
      }
    }
  });
  adb(`shell input tap ${at.x} ${at.y}`);
  await sleep(1500);
}
const round = r => r && [r.left, r.top, r.right, r.bottom].map(Math.round);
const inSight = e => !!e.node && e.keyboard > 0 && e.node.top >= e.pane.top && e.node.bottom <= e.pane.bottom && e.pane.bottom <= e.height - e.keyboard + 1;

(async () => {
  const socket = adb('shell cat /proc/net/unix').match(/webview_devtools_remote_\d+/)?.[0];
  if (!socket) throw new Error('no WebView to debug: start the emulator and open Obsidian (adb shell am start -n md.obsidian/.MainActivity)');
  adb(`forward tcp:${PORT} localabstract:${socket}`);
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = (await browser.pages()).find(p => p.url().startsWith('http://localhost'));
  // The scenario rewrites a note and the plugin: refuse any vault but the test vault.
  const vault = await page.evaluate(() => app.vault.getName());
  if (vault !== VAULT) {
    browser.disconnect();
    throw new Error(`Obsidian on the emulator has the vault ${vault} open, not ${VAULT}; stopping before touching it`);
  }

  // 1. the build from the repository's root, the note, the map
  const files = Object.fromEntries(['main.js', 'manifest.json', 'styles.css'].map(f => [f, fs.readFileSync(`${ROOT}/${f}`, 'utf8')]));
  await page.evaluate(async ({ files, file, note }) => {
    const dir = '.obsidian/plugins/mdmap';
    if (!(await app.vault.adapter.exists(dir))) await app.vault.adapter.mkdir(dir);
    for (const [f, c] of Object.entries(files)) await app.vault.adapter.write(`${dir}/${f}`, c);
    if (!app.plugins.enabledPlugins.has('mdmap')) {
      await app.plugins.loadManifests();
      await app.plugins.setEnable(true);
      await app.plugins.enablePluginAndSave('mdmap');
    }
    // The lock starts open, as it does for a new user.
    const plugin = app.plugins.plugins.mdmap;
    plugin.settings.locked = false;
    await plugin.saveSettings();
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, note); else await app.vault.create(file, note);
  }, { files, file: FILE, note: NOTE });
  // Reloading only the plugin keeps the styles.css it loaded before: the app starts again with the new build.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady && app.plugins.plugins.mdmap, { timeout: 60000 });
  await sleep(2000); // the workspace brings back the maps that were open, asynchronously
  console.log('installed:', JSON.stringify(await page.evaluate(async file => {
    const until = async test => { for (let i = 0; i < 50 && !test(); i++) await new Promise(r => setTimeout(r, 100)); };
    const open = () => app.workspace.getLeavesOfType('mdmap').find(l => l.view.getState().file === file)?.view.editor?.instance.getNodes().length;
    // The workspace may still be bringing back the maps that were open: try again until the note's map is open.
    for (let i = 0; i < 3 && !open(); i++) {
      // Each run opens a note and a map: close the ones before, so the tabs do not pile up.
      ['mdmap', 'markdown'].forEach(type => app.workspace.getLeavesOfType(type).forEach(l => l.detach()));
      await app.workspace.openLinkText(file, '', false);
      await until(() => app.workspace.getActiveFile()?.path === file);
      app.commands.executeCommandById('mdmap:edit-mind-map');
      await until(open);
    }
    await new Promise(r => setTimeout(r, 1000));
    const maps = app.workspace.getLeavesOfType('mdmap');
    return { version: app.plugins.manifests.mdmap.version, maps: maps.map(l => l.view.getState().file), nodes: maps[0]?.view.editor.instance.getNodes().length };
  }, FILE)));

  // 2. a tap on a node in the middle of the screen edits it, above the keyboard
  let at = await place(page, 'Middle', 0.4);
  await sleep(500);
  adb(`shell input tap ${at.x} ${at.y}`);
  await sleep(2500);
  let e = await editing(page);
  console.log('middle:', JSON.stringify({ node: round(e.node), pane: round(e.pane), keyboard: Math.round(e.keyboard) }), '| edited, in sight above the keyboard:', inSight(e));
  if (!e.keyboard) console.log('the keyboard has no height: Gboard shows its compact toolbar when the AVD has hw.keyboard=yes (see e2e/README.md)');
  console.log(shot('android-01-middle'));
  await tapOutside(page);

  // 3. a node low on the screen, where the keyboard opens, is centred again above it
  at = await place(page, 'Low', 0.85);
  await sleep(500);
  adb(`shell input tap ${at.x} ${at.y}`);
  await sleep(2500);
  e = await editing(page);
  console.log('low:', JSON.stringify({ node: round(e.node), pane: round(e.pane), keyboard: Math.round(e.keyboard) }), '| edited, centred above the keyboard:', inSight(e));
  console.log(shot('android-02-low'));

  // 4. typed at the end of the title, a tap outside writes it to the note
  await page.evaluate(() => getSelection().selectAllChildren(document.querySelector('.mdmap-editable')) || getSelection().collapseToEnd());
  adb('shell input text 2');
  await sleep(500);
  await tapOutside(page);
  const saved = await page.evaluate(f => app.vault.adapter.read(f), FILE);
  console.log('typed "2", tap outside:', JSON.stringify(saved.split('\n').filter(l => l.startsWith('## Low'))), '| note has "## Low2":', saved.includes('## Low2\n'));
  await sleep(1000); // the keyboard closes

  // 5. on a phone-wide map, every button stays inside the map and clear of the search field
  const bar = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const host = app.workspace.getLeavesOfType('mdmap')[0].view.containerEl;
    return { search: r(host.querySelector('.mdmap-search')), buttons: Array.from(host.querySelectorAll('.mdmap-organize, .mdmap-settings-button, .mdmap-tool')).map(r), pane: r(host.querySelector('.react-flow')) };
  });
  const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  const inside = (a, p) => a.left >= p.left && a.right <= p.right && a.top >= p.top && a.bottom <= p.bottom;
  console.log('buttons:', JSON.stringify({ search: round(bar.search), buttons: bar.buttons.map(round) }), '| inside the map, clear of the search field:', bar.buttons.length === 7 && bar.buttons.every(b => inside(b, bar.pane) && apart(b, bar.search)));
  console.log(shot('android-03-buttons'));

  // 6. a tap on the lock closes it and a tap on a node no longer edits; another tap on the lock opens it again
  const lock = async () => {
    const b = await page.evaluate(() => { const r = document.querySelector('.mdmap-tool[data-tool="lock"]').getBoundingClientRect(); return { x: Math.round((r.x + r.width / 2) * devicePixelRatio), y: Math.round((r.y + r.height / 2) * devicePixelRatio) }; });
    adb(`shell input tap ${b.x} ${b.y}`);
    await sleep(800);
    return page.evaluate(() => document.querySelector('.mdmap-tool[data-tool="lock"]').getAttribute('aria-pressed') === 'true');
  };
  const closed = await lock();
  at = await place(page, 'Middle', 0.4);
  await sleep(500);
  adb(`shell input tap ${at.x} ${at.y}`);
  await sleep(1500);
  const edited = await page.evaluate(() => !!document.querySelector('.mdmap-editable'));
  console.log(shot('android-04-locked'));
  const opened = !(await lock());
  console.log('lock:', JSON.stringify({ closed, edited, opened }), '| locked, a tap does not edit; opens again:', closed && !edited && opened);
  browser.disconnect();
})().catch(err => { console.error(err.message); process.exit(1); });
