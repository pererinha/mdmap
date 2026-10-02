# mdmap

An [Obsidian](https://obsidian.md) plugin that shows the current note as a
mind map you can edit. Headings, list items and paragraphs become nodes.
Every change you make in the map is saved to the note, and the note is the
only place where the content is stored.

## Features

- **Headings as nodes.** Each heading written with `#` is a node, and its
  level sets how deep the node is in the map. The paragraphs, lists, embeds
  and code blocks under a heading belong to its node and move with it. When
  you move a node, the plugin updates the heading levels of the node and
  everything under it. If a note has more than one top-level heading, the map
  adds a root node named after the file.
- **List items as nodes.** The list items under a heading become its
  children, and an indented item becomes a child of the item above it. You
  can turn this off in the settings.
- **Paragraphs as nodes.** Each paragraph under a heading is a node that
  shows up to six lines of its text. Hover over it to see the full text. A
  list that comes right after a paragraph becomes the paragraph's children,
  so `Rules:` followed by a numbered list is one node with each rule as a
  child. Tables, code blocks, quotes and embeds belong to the node before
  them. The setting that turns off list items also turns off paragraphs.
- **Preview and media.** A node shows the first line of its content under its
  title. Images and videos embedded in that content are shown inside the
  node. Click an image to open it in Obsidian.
- **Changes go both ways.** When you edit the map, the plugin saves the note.
  When you edit the note, in Obsidian or in another app, the map updates and
  the selected node stays selected.
- **Place nodes anywhere.** Drag a node to an empty part of the map and it
  stays there, and the nodes under it move with it. The plugin saves the
  position in the note, measured from the node's parent, so the node stays
  next to its parent when the parent moves. The buttons *Tidy tree*, *Center
  root* and *Radial* calculate new positions for every node, delete the saved
  positions, and animate the nodes to their new places. None of the three
  layouts lets nodes overlap. *Center root* puts branches on both sides of
  the root so the two sides have about the same height. The map zooms out as
  far as it needs to show every node.
- **Find a node in the note.** Click a node and the note next to the map
  scrolls to that node's line and highlights it. The keyboard stays in the
  map. In reading view, the note scrolls until the line is at the top. Use
  the gear in the map's header to turn this on or off.
- **Find a heading in the map.** Put the cursor on a heading in the note,
  with a click or the arrow keys, and the map selects its node, moves it to
  the center and zooms in so you can read it. The keyboard stays in the note.
- **Copy a node as Markdown.** Hover over or select a node to show a copy
  icon in its corner. Click the icon to copy the node and everything under
  it, exactly as written in the note. If the node is an indented list item,
  the copy starts at the left margin.
- **Copy the note as Mermaid.** A command copies the whole note as a Mermaid
  `mindmap` block.
- **Undo and redo** changes made in the map.

## Commands

| Command | What it does |
|---|---|
| Edit current note as mind map | Opens the active note as a mind map next to it |
| Copy current note as Mermaid mindmap | Copies the whole note to the clipboard as a Mermaid `mindmap` block |

## Keys and mouse

| Action | Input |
|---|---|
| Rename | Double-click the node, type, press Enter (Escape cancels) |
| Add a child | Tab |
| Add a sibling | Enter |
| Delete | Delete or Backspace |
| Move up or down among siblings | Alt+Up / Alt+Down |
| Move to another parent | Drag the node onto the new parent |
| Place a node anywhere | Drag the node to an empty part of the map; the nodes under it move with it |
| Copy a node and the nodes under it as Markdown | Hover over the node and click the copy icon in its corner |
| Undo / redo | Cmd+Z / Cmd+Shift+Z (Ctrl on Windows and Linux) |
| Move around the map | Scroll with two fingers on a trackpad or with the mouse wheel, or drag an empty part of the map |
| Zoom | Pinch on a trackpad, or Cmd+scroll (Ctrl on Windows and Linux) |

## Settings

**List items and paragraphs as nodes** (on by default, in *Settings →
mdmap*). When it is off, only headings are nodes, and list items and
paragraphs belong to the heading above them. The change applies the next
time you open a mind map.

**Show clicked node in the note** (on by default, in the gear menu of the
map's header). When it is off, clicking a node only selects it in the map.

## Where positions are saved

When you drag a node to an empty part of the map, the plugin adds a comment
block at the end of the note, so the node is in the same place the next time
you open the map:

```
%% mindmap-positions
Pesquisa/Artigos: -54,149
%%
```

Each line has the node's path (the titles from the root down, separated by
`/`) and its x,y distance from the top-left corner of its parent. Because the
distance is measured from the parent, the node stays next to its parent when
the parent moves. Obsidian hides `%%` comments in reading view. The plugin
deletes the block when no node has a saved position, for example after you
click *Tidy tree*.

## Images and videos from the internet

If an embedded image or video links to an `http://` or `https://` address,
the plugin downloads it from that address when it shows the node. This means
the server at that address receives a request from your computer. Images and
videos stored in the vault are read from the vault.

## Install

The plugin is not in the community directory yet. To install it manually:

1. Download `main.js`, `manifest.json` and `styles.css` from a
   [release](https://github.com/pererinha/mdmap/releases) into
   `<vault>/.obsidian/plugins/mdmap/`, or build them from the source code
   directly into the vault (see Development below).
2. Turn on *mdmap* in **Settings → Community plugins**.

Report bugs and suggest ideas in [issues](https://github.com/pererinha/mdmap/issues).

## Development

```sh
git clone https://github.com/pererinha/mdmap.git
cd mdmap
npm install
npm run build     # builds main.js; with MDMAP_VAULT=/path/to/vault it also copies the plugin into that vault
npm test          # unit tests for reading and writing Markdown, the layouts and the Mermaid export
```

To run tests in a real Obsidian app, see [e2e/README.md](e2e/README.md).

### Release

1. Set the new version in `manifest.json` and `package.json`, and describe
   the changes in [CHANGELOG.md](CHANGELOG.md).
2. Push a tag with exactly that version and no `v` (`1.0.1`, not `v1.0.1`).
   Obsidian finds the release by this name.
3. The [release workflow](.github/workflows/release.yml) runs the tests,
   builds the plugin, and publishes `main.js`, `manifest.json` and
   `styles.css` in a GitHub release named after the tag.

Built with [React Flow](https://reactflow.dev). The licenses of the packages
included in the build are in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
