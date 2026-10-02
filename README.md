# mdmap

An [Obsidian](https://obsidian.md) plugin that edits the current note as a
mind map. The note stays the only source of truth: headings and list items
are the nodes, and every change in the map is written back to the Markdown.

## Features

- **Headings as nodes.** Each ATX heading is a node; its depth follows the
  heading level. Paragraphs, lists, embeds and fenced code under a heading
  are its body and move with it. Heading levels are recomputed from the tree
  when a subtree moves. Notes with several top-level headings get a root
  named after the file.
- **List items as nodes.** List items under a heading become its children
  (nested items nest). A setting turns this off.
- **Body preview and media.** The first line of a node's body is shown under
  its title. Image and video embeds in the body are shown inside the node;
  clicking an image opens it in Obsidian.
- **Two-way sync.** Editing the map writes the note. Editing the note (in
  Obsidian or outside it) updates the map and keeps the selection.
- **Free positions and organizers.** Drag a node to empty canvas and it stays
  there; the position is saved in the note. The buttons *Tidy tree*, *Center
  root* and *Radial* recompute every position and forget the saved ones.
- **Mermaid export.** A command copies the note as a Mermaid `mindmap` block.
- **Undo and redo** inside the map.

## Commands

| Command | What it does |
|---|---|
| Edit current note as mind map | Opens the active note as a mind map in a split next to it |
| Copy current note as Mermaid mindmap | Copies the note's tree as a Mermaid `mindmap` block to the clipboard |

## Keys and mouse

| Action | Input |
|---|---|
| Rename | Double-click the node, type, Enter (Escape cancels) |
| Add child | Tab |
| Add sibling | Enter |
| Delete | Delete or Backspace |
| Reorder among siblings | Alt+Up / Alt+Down |
| Move to another parent | Drag the node onto the new parent |
| Keep a free position | Drag the node to empty canvas |
| Undo / redo | Cmd+Z / Cmd+Shift+Z (Ctrl on Windows and Linux) |

## Setting

**List items as nodes** (on by default). When off, only headings are nodes
and list items stay in the heading's body. Takes effect when a mind map is
opened.

## The positions block

When you drag a node to empty canvas, the plugin appends a comment block to
the end of the note so the position survives reopening:

```
%% mindmap-positions
Pesquisa/Artigos: -54,149
%%
```

Each line is the node's path (titles joined with `/`) and its x,y on the
canvas. Obsidian hides `%%` comments in reading view. The block is removed
when no node has a free position any more, for example after *Tidy tree*.

## Embeds with an external URL

Image or video embeds whose link is an `http://` or `https://` URL are loaded
from that URL when the node is rendered, so the server behind the URL sees a
request from your machine. Embeds of files in the vault are loaded locally.

## Install

Until the plugin is in the community directory: download `main.js`,
`manifest.json` and `styles.css` from a release into
`<vault>/.obsidian/plugins/mdmap/`, then enable *mdmap* in
**Settings → Community plugins**.

## Development

```sh
npm install
npm run build     # main.js; MDMAP_VAULT=/path/to/vault also copies the plugin into that vault
npm test          # unit tests of the Markdown adapter and the Mermaid export
```

End-to-end scenarios against a real Obsidian: see [e2e/README.md](e2e/README.md).

Built on [React Flow](https://reactflow.dev). The licenses of the bundled
packages are in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
