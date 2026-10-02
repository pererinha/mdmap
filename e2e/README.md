# End-to-end scenarios

The scenarios drive a real Obsidian over the Chrome DevTools Protocol with
`puppeteer-core`, using real keyboard and mouse input, and check `Canal.md`
after every step.

## Setup

```sh
e2e/setup.sh
```

This creates `test-vault/` from `e2e/fixtures/`, builds the plugin into the
vault, and launches a second Obsidian with its own profile
(`test-vault/.obsidian-profile`) and the debugging port 9333. Your own
Obsidian keeps running. Override the port with `MDMAP_CDP_PORT` and the
profile with `MDMAP_OBSIDIAN_PROFILE`.

On the first launch Obsidian asks whether to trust the vault's plugins:

```sh
node e2e/drive.js trust
node e2e/drive.js enable
node e2e/drive.js status
```

## Scenarios

```sh
node e2e/steps.js      # rename, child, sibling, delete, reorder, move, undo/redo, external edit
node e2e/lists.js      # list items as nodes, and the setting that turns them off
node e2e/positions.js  # free positions, the positions block, Tidy / Center / Radial
node e2e/story.js      # story.md in light and dark theme, thumbnails, attribution, no write
node e2e/organize.js   # organizer buttons on story.md: transition sampled over time, overlaps, drag follows the pointer
node e2e/reveal.js     # clicking a node highlights its line in the note; the gear in the view header turns it off
node e2e/trackpad.js   # two-finger scroll pans one to one, pinch zooms around the fingers, the window does not zoom
```

Each scenario prints the content of `Canal.md` after each step and saves
screenshots to `e2e/shots/`. Write the output to a file instead of piping it
through `head`: a closed pipe kills the scenario midway.
