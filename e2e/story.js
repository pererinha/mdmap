// Renders story.md in light and dark theme: root circle, branch colours, thumbnails, attribution, no write.
const { connect, shot, md, sleep, reloadPlugin, openEditor, view } = require('./lib');

async function setTheme(page, dark) {
  await page.evaluate(dark => { app.changeTheme(dark ? 'obsidian' : 'moonstone'); }, dark);
  await sleep(800);
}
async function metrics(page) {
  return page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.mdmap-node'));
    const style = el => getComputedStyle(el);
    const root = document.querySelector('.mdmap-root-node');
    const r = root.getBoundingClientRect();
    const flowNodes = (${view})().editor.instance.getNodes();
    const rootNode = flowNodes.find(n => n.data.depth === 0);
    const depth1 = flowNodes.filter(n => n.data.depth === 1);
    const rootCx = rootNode.position.x + rootNode.measured.width / 2;
    const d1Cx = depth1.map(n => n.position.x + n.measured.width / 2);
    const thumbs = Array.from(document.querySelectorAll('.mdmap-thumb'));
    return {
      theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light',
      nodes: nodes.length,
      rootIsCircle: Math.abs(r.width - r.height) < 2 && style(root).borderRadius === '50%',
      rootBetweenChildren: Math.min(...d1Cx) < rootCx && rootCx < Math.max(...d1Cx),
      distinctBranchColors: new Set(nodes.filter(n => n !== root).map(n => style(n).borderColor)).size,
      unfilledNodes: nodes.filter(n => ['rgba(0, 0, 0, 0)', 'transparent'].includes(style(n).backgroundColor)).length,
      thumbnails: thumbs.length,
      thumbLoaded: thumbs.every(t => t.tagName === 'VIDEO' || (t.complete && t.naturalWidth > 0)),
      attribution: !!document.querySelector('.react-flow__attribution'),
    };
  })()`);
}

(async () => {
  const ctx = await connect();
  const { page } = ctx;
  await reloadPlugin(page);
  await openEditor(page, 'story.md');
  const before = await md(page, 'story.md');
  await setTheme(page, false);
  console.log('light', JSON.stringify(await metrics(page)));
  console.log(await shot(page, 'story-light'));
  await setTheme(page, true);
  console.log('dark', JSON.stringify(await metrics(page)));
  console.log(await shot(page, 'story-dark'));
  await setTheme(page, false);
  console.log('story.md unchanged after render:', before === (await md(page, 'story.md')), '| writes:', ctx.drain().filter(l => l.includes('wrote')).length);
  ctx.browser.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1); });
