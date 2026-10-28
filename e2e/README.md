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
node e2e/positions.js  # free positions, the positions block, Tidy / Center / Radial; edges behind the boxes, a dragged box over them
node e2e/story.js      # story.md in light and dark theme, thumbnails, attribution, no write
node e2e/organize.js   # organizer buttons on story.md: transition sampled over time, overlaps, drag follows the pointer
node e2e/reveal.js     # clicking a node highlights its line in the note; the map's gear turns it off
node e2e/trackpad.js   # two-finger scroll pans one to one, pinch zooms around the fingers, the window does not zoom
node e2e/paragraphs.js # paragraphs that follow one another as one text block, a list hanging from the paragraph before it, Tab and undo on it, the gear's "Show paragraphs"
node e2e/paragraph-media.js # formatted paragraph text, multiple images inside the box in both themes, caret on the clicked formatted text, no write on unchanged edits
node e2e/copy.js       # the copy icon on a node puts its Markdown section on the clipboard (saved and restored)
node e2e/grip.js       # the grip shows when the pointer reaches it, also from outside the box; dragged onto another node it moves its node there; Cmd+Z
node e2e/i18n.js       # with Obsidian in Brazilian Portuguese, commands, buttons, search and the settings under the gear are in Portuguese; the language is put back
node e2e/width.js      # the map opens at the "Mind map width" share (30 %, 70 %), half and half without Obsidian's setDimension; the slider in the settings
node e2e/settings.js   # the settings tab has the gear's switches, which change the open map, and opens the colour editor in a modal in the settings window; the settings search finds them; what was there before is put back
node e2e/collapse.js   # Space and the fold button collapse and expand a node, the count of hidden nodes, kept on reopening; search and Tab expand; the note is not written
node e2e/folds.js      # folding a heading or list item in the note collapses its node and back; the note's folds win when the map opens
node e2e/focus.js      # the cursor on a heading in the note selects and centers its node; the keyboard stays in the note
node e2e/search.js     # Cmd/Ctrl+F, highlighted matches, Enter / Shift+Enter center them, Escape; Cmd/Ctrl+F in the note is Obsidian's
node e2e/editing.js    # editing in place: same look, caret where clicked, the box grows, Enter / Escape, long titles, a paragraph edited whole
node e2e/colors.js     # the gear's colours on a note with 13 top-level branches: a tab per theme with the centre and the palette; the centre opens a bar with its text colour, branches past the sixth lighter each round, a new branch too; a palette colour opens a bar with its shades, which colour the nodes under its branches by level; Edit; hex typed or picked reaches the open map in its theme only; kept on reload; "Use theme colors"; Escape and a canvas click close; the colours saved before are put back
node e2e/undo-lock.js  # the undo and redo buttons take back and bring back a rename, a dragged position and a layout, positions block included; the lock stops editing, keys, dragging and layouts, Space still collapses, it stays closed on reopening; the lock is put back
node e2e/android.js    # Obsidian for Android on an emulator (see "Android" below): the node being edited stays visible above the keyboard; a tap outside saves it
```

The scenarios create, rewrite and delete notes, so they stop unless the
Obsidian on the port has `test-vault/` open.

Each scenario prints the content of `Canal.md` after each step and saves
screenshots to `e2e/shots/`. Write the output to a file instead of piping it
through `head`: a closed pipe kills the scenario midway.

## Android

`e2e/android.js` tests the map in Obsidian for Android, on an emulator. It:

1. installs the build from the repository's root;
2. opens the map of `Android-e2e.md`;
3. taps a node in the middle of the screen and one near the bottom, and
   checks that each stays visible above the keyboard;
4. types in the node, taps outside it, and checks that the note has the new
   title.

Set up once:

- Create an Android emulator (AVD) in Android Studio's Device Manager, and set
  `hw.keyboard=no` in its `config.ini`. With `hw.keyboard=yes`, the on-screen
  keyboard shows only a small toolbar with no height, and the test fails.
- Install Obsidian from its APK:
  `gh release download -R obsidianmd/obsidian-releases -p '*.apk'`, then
  `adb install Obsidian-*.apk`.
- In Obsidian, create a vault named `mdmaptest` in the app's storage.

Run:

```sh
emulator -avd <name> -no-window -no-audio &
adb shell am start -n md.obsidian/.MainActivity
node e2e/android.js
```

The script looks for `adb` in `$ANDROID_HOME/platform-tools` (default
`~/Library/Android/sdk`). To change it, set `ADB`. To use another vault, set
`MDMAP_ANDROID_VAULT`. To change the port on this computer that connects to
Obsidian on the emulator (default 9444), set `MDMAP_ANDROID_PORT`.

## Every test

```sh
e2e/all.sh
```

Start the test Obsidian (`e2e/setup.sh`) and the emulator first. The script
runs `tsc`, the unit tests, every scenario above and `e2e/android.js`. It saves
each scenario's output in `e2e/shots/<scenario>.log`, then prints each
scenario's exit code and every check that came out false.

Two false checks are expected:

- `search.js` "3 ringed matches": a known failure, also present in 1.2.1.
- `search.js` "editing a node: false": false is the correct result.
