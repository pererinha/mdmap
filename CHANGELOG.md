# Changelog

## 1.0.0

First release.

- Edit the current note as a mind map in a split next to it. ATX headings are
  the nodes; paragraphs, lists, embeds and fenced code under a heading are its
  body and move with it. Heading levels follow the tree depth. Unchanged notes
  round-trip byte for byte.
- List items under a heading are child nodes, nested items nest. The setting
  *List items as nodes* turns this off.
- Rename (double-click), add child (Tab), add sibling (Enter), delete, reorder
  (Alt+Up/Down), move to another parent (drag onto it), undo and redo.
- Two-way sync: the map writes the note; edits to the note update the map and
  keep the selection.
- Body preview under the title; image and video embeds shown inside the node,
  images open in Obsidian on click.
- Root in the centre with branches alternating right and left, one colour per
  branch, light and dark theme.
- Free node positions kept in a `%% mindmap-positions` comment block at the
  end of the note; *Tidy tree*, *Center root* and *Radial* organizers.
- Command *Copy current note as Mermaid mindmap*.
