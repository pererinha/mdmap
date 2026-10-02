# Changelog

## 1.0.0

First release.

- Edit the current note as a mind map in a split next to it. ATX headings are
  the nodes; paragraphs, lists, embeds and fenced code under a heading are its
  body and move with it. Heading levels follow the tree depth. Unchanged notes
  round-trip byte for byte.
- List items under a heading are child nodes, nested items nest. Paragraphs
  are nodes shown as blocks of wrapped text, and a list right after a
  paragraph hangs from it. The setting *List items and paragraphs as nodes*
  turns both off.
- Rename (double-click), add child (Tab), add sibling (Enter), delete, reorder
  (Alt+Up/Down), move to another parent (drag onto it), undo and redo.
- Two-way sync: the map writes the note; edits to the note update the map and
  keep the selection.
- Body preview under the title; image and video embeds shown inside the node,
  images open in Obsidian on click.
- Root in the centre with branches split between right and left so both sides
  have about the same height, one colour per branch, light and dark theme.
- Free node positions kept in a `%% mindmap-positions` comment block at the
  end of the note, each relative to the node's parent; dragging a node moves
  its subtree.
- *Tidy tree*, *Center root* and *Radial* organizers: no overlapping nodes,
  even spacing whatever the node's height, curves that widen with the fan
  they draw, and nodes that glide to their new places. The view zooms out as
  far as needed to show the whole map.
- Clicking a node scrolls the note to its line and highlights it; a toggle in
  the gear menu of the map's header turns this off.
- Putting the cursor on a heading in the note selects and centers its node in
  the map.
- Trackpad navigation: two-finger scrolling moves the map like a web page;
  pinching zooms.
- A copy icon on each node puts the node and everything under it on the
  clipboard as Markdown.
- Command *Copy current note as Mermaid mindmap*.
