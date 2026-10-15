# Cell ranges and the clipboard

A flat grid can let readers select rectangles of cells, copy them into a spreadsheet or a text editor, paste values back
and drag a fill handle. Ranges are cells, not rows: row selection keeps its checkboxes, Space and the selection bar, and
the two never change each other.

Ranges ship as the `cell-range` part (`canopyx-cell-range.js` and `.css`, see [Plugins and Parts](plugins.md)). A grid
with `rangeSelection` loads it with its first query; the API members load it on first use on any grid.

## Turning ranges on

```csharp
grid.RangeSelection = new CanopyGridRangeSelection { FillHandle = true };   // MultipleRanges defaults to true
grid.Clipboard.CopyHeaders = true;                                         // copies start with the column titles
grid.Clipboard.CopyValues = CanopyGridClipboardValues.Raw;                 // or Display, the default
```

```json
"rangeSelection": { "multiple": true, "fillHandle": true },
"clipboard": { "copyHeaders": true, "copyValues": "raw", "paste": true }
```

`rangeSelection` is `true` or `{ enabled, multiple, fillHandle }` (C# `Enabled`, `MultipleRanges`, `FillHandle`); the host's
`rangeSelection` and `clipboard` options override the view's. `enabled: false` turns the pointer, keyboard and touch input
off while the part and the API keep working.

The .NET writers carry the part's payload in a single-file page only when the view sets `RangeSelection`. A host that turns
ranges on in the browser instead (the `rangeSelection` option, or the API on a grid without it) serves `canopyx-cell-range.js`
and `.css` beside the runtime, or adds the payload with `CanopyHtmlDocument.EmbedOnce(CanopyHtmlAssets.GetPart("cell-range"))`.

| Setting | Default | Meaning |
| --- | --- | --- |
| `multiple` | `true` | Ctrl or Cmd adds ranges. |
| `fillHandle` | `false` | A single range shows the fill handle. |
| `copyHeaders` | `false` | Copies start with the column titles, and the group rows above them when the grid has [column groups](column-groups.md). |
| `copyValues` | `display` | `display` copies the text the cells show; `raw` copies raw values. |
| `paste` | `true` | Ctrl/Cmd+V and the cell menu paste into the grid. |

## Selecting

| Input | Result |
| --- | --- |
| Drag over cells | A range from the pressed cell to the cell under the pointer; the grid scrolls near its edges. |
| Click | Moves the anchor and focus to the cell. It shows no range, so ordinary clicks look as before. |
| Shift+click | A range from the anchor to the clicked cell. |
| Ctrl/Cmd+click or drag | Adds a range (when `multiple`). |
| Shift+arrows | Extends a range from the focused cell; Ctrl/Cmd with them goes to the last row or column. |
| Shift+Page Up/Down, Shift+Home/End | By a page; to the first or last column (Ctrl/Cmd: and the first or last row). |
| Ctrl/Cmd+A | Every cell of the result. |
| Escape | Clears the ranges. |
| Context menu key, Shift+F10, right-click | The cell menu ("Cell actions"): Copy cells, Copy cells with headers, Paste, Select all cells, Clear cell selection. Right-clicking a link or another control keeps the browser's own menu. |
| Long press on a touch screen, then drag | A range from the pressed cell; the page does not scroll while the finger extends it. Two round handles on the corners resize it afterwards, a long press inside a range opens the cell menu, and a plain tap clears the ranges. |

Focus stays on the anchor cell while the far corner moves and scrolls into view. A plain arrow key clears the ranges and
moves focus as it always did. Links, buttons and other controls in cells keep their own clicks. A new query (search,
filters, sorting, paging), a new data revision, or a reporting group that collapses or expands clears the ranges, because row
positions then mean other rows; a reload of the same query at the same revision keeps them. Shift and Ctrl/Cmd clicks change
only the ranges, never the row selection, and a click that clears the ranges raises `cellRangeChange` like any other change.

Ranges are drawn as a tint with an outline on each range's outer edges, from the theme's accent in light and dark. In
forced colours (Windows high contrast) the cells and everything in them (links, badges, presenters) take the system
highlight colours, `Highlight` and `HighlightText`, and the outline is drawn in `HighlightText`. Cells
in a range carry `aria-selected="true"`, the grid is `aria-multiselectable`, and the live region says
"3 rows × 4 columns selected" (`gridCellRangeSelected`) or "2 ranges selected, 13 cells" (`gridCellRangesSelected`).

## Copying

Ctrl/Cmd+C, the cell menu, the more menu's Copy cells and `copyCellRanges()` copy the ranges. Without ranges they copy the
focused cell, or, with focus on a row rather than one of its cells, that row's visible cells; Ctrl/Cmd+C with focus on a row
and no ranges keeps the grid's own copy (the selected rows, or the focused row). The clipboard gets two forms of the same
cells:

- **Tab-separated text**, one line per row, which every spreadsheet, editor and terminal reads. Fields with tabs, line breaks
  or quotes are quoted, and text that would start a spreadsheet formula (`=`, `+`, `-`, `@`) gets an apostrophe, as the CSV
  export does.
- **An HTML table** that keeps the cell types, which spreadsheet applications read first: numbers carry their values
  (so `1 234,50` pastes as the number 1234.5 whatever the spreadsheet's language), dates are written as
  `yyyy-MM-dd HH:mm:ss` in the grid's time zone so they read as dates, and text is marked as text.

With `copyValues: "raw"` the text form holds raw values too: numbers with a dot, dates as `yyyy-MM-dd HH:mm:ss`, booleans as
TRUE and FALSE. Several ranges with the same columns copy as one block of their rows; ranges with different columns copy one
block each, separated by an empty line. Rows that are not loaded yet are read from the source first; a copy covers at most
200,000 cells.

Ctrl/Cmd+C writes through the browser's copy event when every row is loaded, which needs no clipboard permission; otherwise,
and from the menus and the API, the asynchronous clipboard writes both forms (or the text alone where only that is
available).

## Pasting

Ctrl/Cmd+V (or Paste in the cell menu, which asks the browser to read the clipboard) pastes tab-separated text from the first
range's top-left corner, or from the focused cell, as many rows and columns as the text has; the pasted block becomes the
range. A single value pastes into every cell of every range. Each value is read as its column's kind:

- numbers as the page language writes them (`1 234,5` in Polish), plainly (`1234.5`, `1,234.5`), with spaces or apostrophes
  grouping digits, parentheses for negatives, and a currency sign or unit around them;
- dates as ISO 8601, as `yyyy-MM-dd [HH:mm[:ss]]`, or in the page language's day, month and year order, in the grid's time zone;
- true and false as `true`/`false`, `1`/`0`, `yes`/`no` or the grid's own Yes and No labels, for boolean cells;
- choices of a select or lookup editor by their label or value.

Text that its column cannot read is refused before anything else happens.

CanopyX never writes data itself. The cancelable `canopyx:paste` event (`onPaste`) offers the remaining cells to the host:
`{ source, cells, refused, respondWith }`, each cell `{ id, column, row, text, value, previous }` and `source` one of
`clipboard`, `api` or `fill`. Cancelling it (or returning `false`) refuses the whole paste. A handler may answer with
`detail.respondWith({ refused: [{ id, column, reason }] })` (or `false` for every cell), with or without the editing part; the
cells it refuses are reported and left alone. Pasted lines go to data rows only: in a grouped report, group headings take none.

- **With the editing part** (flat-grid columns marked `editable`), the cells then go through editing: a cell
  that cannot be edited (its column, `isEditable` or a read-only grid) is refused, each value passes the column's checks and
  validators, refused values are not applied, and every applied value is one step that a single undo takes back.
- **Without it**, the grid applies nothing. A handler that applies the values to its data answers with the cells it refused
  and reloads the grid; the cells it did not refuse count as applied.

The live region announces what changed ("Pasted 4 cells. 2 cells were not pasted"), and a report above the grid lists every
refused cell with its row, column and reason until it is dismissed (`gridPasteReport`, `gridPasteCell`).

## The fill handle

With `fillHandle: true`, a single range shows a small square on its bottom-right corner. Dragging it down fills the cells
below; the cells it will fill show a dashed outline while it moves. Each column continues its values: two or more numbers,
or dates, with the same step go on with that step (100, 150 → 200, 250); anything else repeats in turn. Ctrl/Cmd+D fills the
range from its first row. Filled values go the way pasted values go, with `source: "fill"`.

## API

| Member | Result |
| --- | --- |
| `getCellRanges()` | `[{ startRow, endRow, startColumn, endColumn }]`: row positions in the shown order and column ids, inclusive. |
| `setCellRanges(ranges)` | Replaces the ranges; omitted ends make a range of one cell. |
| `clearCellRanges()`, `selectAllCells()` | Clears the ranges; selects every cell. |
| `getCellRangeText(options?)` | The ranges as tab-separated text, loading rows that are not cached. `options` takes `headers` and `values`. |
| `copyCellRanges(options?)` | Copies the ranges (or the focused cell) and resolves with the text. |
| `pasteCells(text, at?)` | Pastes at `{ row, column }` or at the ranges; resolves with `{ applied, refused, cancelled }`. |

The reads answer at once (empty before the part loads). The actions run at once once the part is in, and every action answers
with a promise that rejects when it fails (invalid ranges or options, an unavailable clipboard, a part that cannot load); they
never raise the grid's `error` event. The `error` event reports failures of the grid's own work: the part loading for a view
with `rangeSelection`, and copies and pastes started from the keyboard, the menus or the pointer.

`canopyx:cellRangeChange` (`onCellRangeChange`) reports `{ ranges }` after each change. TypeScript: `GridCellRange`,
`GridRangeSelection`, `GridClipboardSettings`, `GridPasteEvent`, `GridPasteResult` and `GridCellRangeApi` from
`@evotecit/canopyx/grid`.

## Labels

`gridCellRangeSelected`, `gridCellRangesSelected`, `gridCellRangeCleared`, `gridCopyCells`, `gridCopyCellsWithHeaders`,
`gridPasteCells`, `gridSelectAllCells`, `gridCellsCopied`, `gridCellsPasted`, `gridPasteRefused`, `gridPasteReadOnly`,
`gridPasteType`, `gridPasteReport`, `gridPasteCell`, `gridFillHandle`, `gridCellsFilled`, `gridCellMenu` and `gridClearCellRanges`,
translated in every label pack.

## Example

`quarterly-budget.html` selects and copies cells of a budget, takes pasted amounts into its month columns only (refusing
other columns and negative amounts in its paste handler), and shows the fill handle.
