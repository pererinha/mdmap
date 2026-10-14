# Changelog

## 1.3.1

- On a phone, the node you edit now stays visible above the keyboard. When the
  keyboard opened, Obsidian shrank the window and also added empty space the
  height of the keyboard at the bottom of the map. The map became a strip at
  the top of the screen, and the node being edited could end up outside it. A
  node that the keyboard would cover now moves up into view.
- The switches under the map's gear no longer use the CSS selector `:has`,
  which Obsidian's plugin review flags. Their focus outline now also shows
  after a click, not only when you reach them with the keyboard.
- Added a contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md).

## 1.3.0

- Needs Obsidian 1.13 or later. Older versions of Obsidian keep getting 1.2.1.
- Nodes collapse and expand. Press Space on the selected node, or click the
  dot on the side its children leave from, and its children hide; a collapsed
  node shows how many nodes it hides. Collapsing a heading or a list item folds
  it in the note, and folding it in the note collapses the node; when the map
  opens, the note's folds win. A search match, the node of the line your cursor
  is on, Tab on a collapsed node and a node moved into one show what was hidden
  above them. The map remembers each note's collapsed nodes. Space no longer
  pans the canvas; dragging it still does.
- That dot is drawn like the grip and drags like it: drop it on another node
  and the node, with everything under it, moves there.
- "Show paragraphs" under the map's gear hides paragraph nodes and shows them
  again, without rewriting the note. With paragraphs hidden, their text stays
  in the heading's body, and text after a list item belongs to that item, so
  moving or deleting the item in the map takes the text with it.
- A "Mind map width" setting gives the map 20 to 80 % of the window when it
  opens next to the note.
- The interface follows Obsidian's language. Brazilian Portuguese is the first
  translation, also used for Portuguese; other languages stay in English.
- The grip shows as soon as the pointer reaches it, also from outside the
  node's box.
- A paragraph you double-click in a long note is edited where it is. Its whole
  text, taller than the box, used to send its branch to the other side of the
  root, away from the pointer.
- The map's settings moved from the gear in the view header to a gear inside
  the map, next to the layout buttons. Its panel has "Show clicked node in the
  note" and "Show paragraphs" as switches, and the colours.
- The plugin's settings tab has the same settings as the map's gear, and
  Obsidian's settings search finds them: "Show paragraphs", "Show clicked node
  in the note", and under "Colors", "Node colors", which opens the colour
  editor, and "Use theme colors".
- Node colours can be changed, separately for the light and the dark theme:
  the centre, the text on it, and the six palette colours the top-level
  branches take in turn. A palette colour opens a bar with its shades, one for
  each level under its branches: the branch's children take the first, their
  children the second, and every level further down the third; until changed,
  each level is 25 % closer to white. Edit unlocks a colour picker and a field
  for the hex; "Use theme colors" goes back to the theme's. Until you change
  them, the colours follow Obsidian's theme.
- Top-level branches past the sixth no longer repeat the first six colours:
  each round of the palette is 25 % closer to white than the one before, up to
  75 %, so a colour comes back only after 24 branches.
- The layout buttons are one group, each with an icon and its name; on a
  narrow map, a phone's for one, only the icons show.
- Edges are drawn behind the boxes, also when the node they reach is selected,
  and a node you drag stays over the others.
- Thanks to CalQL8or for the suggestions behind collapsing nodes, hiding
  paragraphs, the width setting and the translation.
- Thanks to sanketss84 for the suggestion behind the node colours.

## 1.2.1

- The "List items and paragraphs as nodes" setting shows up in Obsidian's
  settings search, from Obsidian 1.13 on.
- Each write to the note is logged with `console.debug` instead of
  `console.log`, as Obsidian's plugin guidelines ask.
- Releases come with GitHub artifact attestations for `main.js` and
  `styles.css`, and their notes are this changelog's section.

## 1.2.0

- A grip moves a node under another one. Every node except the root shows a
  dot on the side its edge comes in when you hover it or select it; drag the
  dot onto any part of another node and the node, with everything under it,
  moves there and the note is rewritten. A drop on the empty canvas changes
  nothing, and Cmd+Z undoes the move. It works with touch too: tap the node,
  then drag its dot. Dragging the whole box onto another node still works.
- A press on the middle of a node's side drags the node. It used to start an
  invisible connection there, and the node stayed where it was.

## 1.1.0

- Editing happens in the node itself: a double-click puts the caret where you
  clicked, in the same text and box, instead of opening a text field. The box
  and the nodes around it follow the text as you type. A click outside or
  Escape ends the edit and writes the note; after Escape the keyboard is back
  on the map, so Tab, Enter and Cmd+Z act on the node. A title longer than 40
  characters shows whole while it is edited. A paragraph block is edited whole,
  every line of it, and Enter or Shift+Enter adds a line; tables and code
  between its paragraphs stay where they are. Its image embeds show as Markdown
  (`![[image.png]]`) where the note has them, with the images still under the
  text, and editing or deleting that line changes the image as you type.
- Search: a field at the top-left of the map, also reached with Cmd/Ctrl+F
  while the map has focus, highlights the nodes whose title or paragraph text
  contains what you type and shows how many there are. Enter and Shift+Enter
  select and center the next and previous match; Escape clears the search.
  Cmd/Ctrl+F in the note still opens Obsidian's search.
- Edges meet the root's ellipse. With a long title they met a point below it,
  because the root's box was a square while the ellipse is one line tall.
- Node boxes fit their labels: each label is measured in the node's font.
  Labels with wide letters, such as "Comments", no longer run into the box's
  border, and long labels no longer get boxes much wider than their text.
- The map no longer shows the React Flow link in its bottom-right corner.
- The map view's title starts with "mdmap:" instead of "Mind map:".

## 1.0.1

- React Flow's styles ship in `styles.css`, which Obsidian loads with the
  plugin, instead of a `<style>` element the map added to the page when it
  opened. The community directory does not allow plugins to add `<style>`
  elements. The map looks the same.

## 1.0.0

First release.

- Edit the current note as a mind map in a split next to it. ATX headings are
  the nodes; paragraphs, lists, embeds and fenced code under a heading are its
  body and move with it. Heading levels follow the tree depth. Unchanged notes
  round-trip byte for byte.
- List items under a heading are child nodes, nested items nest. Paragraphs
  that follow one another are one node shown as a block of wrapped text, and
  a list right after a paragraph hangs from it, which keeps that paragraph a
  node of its own. The setting *List items and paragraphs as nodes* turns
  both off.
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
