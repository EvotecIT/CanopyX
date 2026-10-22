# Matrix view

A matrix shows a state for every pair of two sets of entities: replication between domain controllers (a square matrix),
services by servers, policies by domain controllers. The rows and the columns are both items with attributes; each cell
holds a state (a tone and a symbol, never colour alone), and optionally a value, short text and details.

- [Quick start](#quick-start)
- [The document](#the-document)
- [States, totals and the diagonal](#states-totals-and-the-diagonal)
- [Sorting, filtering and grouping](#sorting-filtering-and-grouping)
- [Details and events](#details-and-events)
- [Keyboard](#keyboard)
- [Phones](#phones)
- [Labels and right to left](#labels-and-right-to-left)
- [Static output, print and email](#static-output-print-and-email)
- [API](#api)
- [Performance](#performance)
- [Packaging and size](#packaging-and-size)
- [Limits](#limits)

## Quick start

```csharp
var matrix = new CanopyMatrix("replication", "Inbound replication") { Square = true };
matrix.State("failing", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
    .State("delayed", "Delayed", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true)
    .State("healthy", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
matrix.Rows.Title = "Destination";
matrix.Columns.Title = "Source";                       // a square matrix takes only a title for its columns
matrix.Rows.Attribute("site", "Site", facet: true);
matrix.Rows.GroupBy = "site";
foreach (var dc in controllers) matrix.Rows.Item(dc.Id, dc.Name, item => item.Value("site", dc.Site));
foreach (var link in links) {
    var cell = matrix.Set(link.Destination, link.Source, link.Failures > 0 ? "failing" : link.Late ? "delayed" : "healthy");
    if (link.Failures > 0) cell.Text = link.Failures.ToString(CultureInfo.InvariantCulture);
    cell.Detail("Last success", link.LastSuccess.ToString("u", CultureInfo.InvariantCulture));
}
matrix.SaveHtmlPage("replication.html");                // a page fills the window; a fragment takes CanopyHtmlOptions.Height
```

`AddCells(records, row, column, state, configure)` adds a cell per record. In JavaScript, `CanopyX.createMatrix(host, { view })`
takes the same document; the grid and reporting entry points create matrices, and the matrix part loads on first use.

`MatrixExamples` in `CanopyX.Examples` writes `matrix-replication.html` (150 domain controllers in 12 sites),
`matrix-services.html` (services by 60 servers, cards on phones), `matrix-consistency.html` (400 policies by 40 domain
controllers, opening on the problems), their dark pages, `matrix-static.html` and the benchmark pages `large/matrix-150.html`
and `large/matrix-400.html`.

## The document

```json
{ "protocol": "canopyx/2", "type": "matrix", "id": "services", "label": "Services by server",
  "rows": { "title": "Server", "attributes": [{ "id": "site", "title": "Site", "facet": true }],
            "items": [{ "id": "srv1", "label": "SRV-OSL-01", "values": { "site": "Oslo" } }], "groupBy": "site",
            "sort": { "by": "#total", "direction": "desc" } },
  "columns": { "title": "Service", "items": [{ "id": "dns", "label": "DNS" }, { "id": "ntp", "label": "Time" }] },
  "states": [{ "id": "critical", "label": "Critical", "tone": "danger", "symbol": "cross", "attention": true },
             { "id": "ok", "label": "Running", "tone": "success", "symbol": "check" }],
  "cells": ["10"],
  "notes": [[0, 0, null, "3/3", "Probes failing: 3/3.", [["Last check", "06:00"]]]] }
```

| Property | Meaning |
| --- | --- |
| `rows`, `columns` | The axes: `title`, `noun`, up to 32 `attributes` (`id`, `title`, `kind` text, number or datetime, `facet`), 1 to 10,000 `items` (`id`, `label`, `secondary`, `href`, `values` by attribute: a value, or `{ value, text }`; datetime values are ISO 8601, sorted by instant at millisecond precision; an omitted zone means UTC), and the first `groupBy` and `sort` (`by` is `#label`, `#total` or an attribute; `direction` asc or desc). |
| `square`, `columnTitle` | A square matrix has no `columns`: its rows are also its columns, and `columnTitle` names them (for example Source beside Destination). |
| `diagonal` | The self cells of a square matrix: `self` (the default) draws them hatched and counts them nowhere; `data` treats them as ordinary cells. |
| `states` | 1 to 36 states, **worst first**: `id`, `label`, `tone` (a CanopyX or host tone), the required `symbol` (check, cross, warning, info, dot, dash, question, clock, pause) so no state relies on colour alone, and `attention`. |
| `cells` | One string per row, one character per column: the state's position as a digit (`0`-`9`, `a`-`z`), `.` for no data. A 400 by 400 matrix is about 160 KB. |
| `notes` | Sparse extras, `[row, column, value, text, title, details]` by position: a number the cell shows, short text instead (at most 64 characters), a longer title for the tooltip and the dialog, and up to 16 `[label, value]` details. Trailing items can be left out. |
| `totals` | `states` the totals count (by default those marked `attention`), and `rows: false` or `columns: false` to hide the totals column or row. |
| `attentionOnly` | Opens on the rows and columns that have a cell needing attention. |
| `hideEmpty` | Opens hiding the rows and columns whose visible cells all lack data. |
| `cellWidth`, `density` | 24 to 120 pixels (32 by default); compact, normal or comfortable. |
| `details` | `dialog` (the default) shows a cell's details unless the host handles `canopyx:matrixCell`; `host` only raises the event. |
| `phone` | `scroll` (the default) keeps row headers pinned while the columns scroll; `cards` shows a card per row below 640 pixels. |
| `legend`, `labels` | Hide the legend; the matrix labels that differ from English. |
| `autoHeight` | `false` keeps the host's height. By default a matrix whose content fits is only as tall as its toolbar, legend and cells, with the host's height as the bound, as trees and flat grids are; longer matrices fill the host and scroll inside it. |

The document is checked strictly in C# (`Validate`, `ToJson`, `FromJson`) and in the browser: unknown properties, duplicate ids,
cells that name no state, and links that are not http, https, mailto or relative fail the whole document with a message.
`tests/fixtures/matrix-small.json` is read by both.

## States, totals and the diagonal

A cell draws its state's symbol in the state's tone; only states marked `attention` fill the cell, so a healthy matrix stays
quiet. A value or short text shows beside the symbol when both fit the cell, and is always in the tooltip, the dialog and the
cell's accessible name ("DC05 and DC07: Failing, 3"). The legend lists each state with how many visible cells hold it.

The totals column counts, per row, the cells of the visible columns whose state the totals count ("DC05: 3"), the totals row
does the same per column, and its last cell holds the grand total. A collapsed group's row or column shows the worst state of its
members' cells and how many need attention. In a square matrix the self cells are hatched and never counted. A cell without data
shows a faint dot, quieter than the hatch, so a sparse matrix reads as drawn rather than unfinished.

The header and the totals row stay in view while the cells scroll; a soft shadow under the header and above the totals row
shows when rows pass beneath them. A column group's name starts where its band meets the view, and a band with too little in
view, cut to a sliver at its edge, shows no name rather than a lone arrow; a band's full name is its tooltip.

## Sorting, filtering and grouping

Each axis has a panel (the Rows and Columns buttons, named after the axis titles):

- **Sort by** name (natural order, so DC2 comes before DC10), total, an attribute, or as listed; **Descending** reverses it.
- **Group by** an attribute: a row group is a heading row with a collapse button, a column group a band above the column labels.
  Collapsing rolls the group into one row or column.
- **Facets**: for each attribute marked `facet`, its values with their counts; checking values keeps the items that have them
  (the grid's `in` filter on attribute values).

**Search** finds rows and columns by label, secondary text and attribute values: it filters each axis it matches (only the
rows of a square matrix). **Only problems** keeps the rows and columns that have a cell needing attention among the other
axis's visible items. **Hide empty rows and columns**, offered when some cells have no data, keeps those with a cell that has
data among the other axis's visible items: on its own it drops the empty rows and columns, and with a search or a facet it keeps
the partners of what was found (search for DC010 in a replication matrix to see only its sources). Totals, the legend and the
summary ("Rows: 35 of 400, columns: 40 of 40 · Need attention: 459") follow.
The query is plain data, raised as `canopyx:matrixState` and accepted by `setState`.

## Details and events

Hovering a cell (after a short pause) or moving to it with the keyboard shows a tooltip with both items, the state, the value
and the details. Clicking a cell or pressing Enter raises `canopyx:matrixCell` (cancelable) with the row and column ids (or
their group keys for rolled-up cells), the state id (`self` for a self cell, null without data), the value, text, title,
details, and how many members a rolled-up cell covers and need attention. Unless the host calls `preventDefault`, or the
document sets `details: "host"`, a dialog lists the same and returns focus to the cell when it closes. Row and column headers
with an `href` are links. CanopyX never acts on a cell itself.

## Keyboard

The matrix is an ARIA grid with one tab stop. Focus is a row and a column: the header row, the data rows and the totals row;
the row headers, the cells and the totals column.

| Key | Moves to |
| --- | --- |
| Arrows | The next cell, header or total (Left and Right are mirrored right to left) |
| Home, End | The row header, the row's total |
| Ctrl+Home, Ctrl+End | The first row header, the grand total |
| Page Up, Page Down | A viewport up or down |
| Enter, Space | Opens the cell's details, toggles a group, follows a header link, or rolls up a column group from its column header |
| Escape | Closes the tooltip, the axis panel or the dialog |

`aria-rowcount`, `aria-colcount` and the row and column indexes describe the whole matrix while only a window is mounted. The
screen-reader speech pass is backlog, as for the grids.

## Phones

At 640 pixels and narrower the row headers show labels only, the controls grow to 44-pixel targets, and the columns scroll
sideways with the row headers pinned. With `phone: "cards"` a card per row lists its total and the cells that need attention,
a hundred cards at a time, under their group names.

## Labels and right to left

The texts the matrix writes itself are the `matrix…` labels, translated in the five label packs (`CanopyLabels.Polish()` and
the others, `@evotecit/canopyx/locales/pl` and the others). A matrix written with `Labels = CanopyLabels.German()` carries
them in its document. The stylesheet uses logical properties, and the canvas draws from the inline start, so a page with
`dir="rtl"` mirrors the row headers, the totals and the arrow keys.

## Static output, print and email

`CanopyStaticHtml.RenderMatrix(matrix, options)` writes a script-free table with inline styles for email, print and Office:
symbols as characters with the state as their tooltip, row totals and the legend. A matrix of more than 2,500 cells is listed
instead as the cells that need attention (row, column, state, value), up to `MaxRows`. Printing a page draws the same from
the visible matrix.

## API

| Member | What it does |
| --- | --- |
| `sort(axis, by, direction)` | Sorts `rows` or `columns` by `#label`, `#total`, an attribute, or null for as listed. |
| `group(axis, attribute)` | Groups an axis by an attribute, or null for none. |
| `filter(axis, attribute, values)` | Keeps the items whose attribute value is among `values`; null clears it. |
| `setSearch(text)`, `setAttentionOnly(on)` | The search and the only-problems switch. |
| `getState()`, `setState(state)` | The query: search, filters, only problems, hide empty (`hideEmpty`), sorts, groups and collapsed groups. |
| `getVisible()` | The ids of the visible rows and columns, members of collapsed groups included. |
| `focusCell(row, column)` | Moves focus to a cell. |
| `update(document)` | Replaces the document and keeps the query that still applies, for live refresh. |
| `destroy()`, `ready` | Removes the matrix; a promise that settles once the first window is painted. |

Options: `view`, `labels`, `state`, `onReady`, `onCell(detail, event)` and `onStateChange(state)`; the events are
`canopyx:matrixReady`, `canopyx:matrixCell`, `canopyx:matrixState` and `canopyx:error`. TypeScript: `MatrixDocument`,
`MatrixOptions`, `MatrixApi`, `MatrixQueryState` and `MatrixCellDetail` from `@evotecit/canopyx/grid`.

## Performance

Both axes are windowed with `AxisWindow`, a shared helper of the grid runtimes (`31-axis-window.js`). Before building it, flat
grids were measured at 10 to 400 columns (`tests/browser/bench/columns-benchmark.mjs`): mounted cells grow with the column count
and scrolling a 200-column grid drops frames, so windowing columns pays off; the grid can adopt the same helper. Each mounted row
draws its cells on canvas tiles of 16 columns, which scroll with the row natively; only the focused cell is an element, so the
matrix keeps its grid semantics without a node per cell. Colours, fonts and symbols come from the stylesheet, so themes, host
tones and forced colours apply, and a theme switch draws the cells again.

`tests/browser/bench/matrix-benchmark.mjs` scrolls the 150 by 150 and 400 by 400 benchmark pages down, sideways and diagonally;
`matrix-performance.spec.mjs` holds the budgets at four times slowed CPU. Each scroll direction retires its animation-frame
sampler before the next begins. Measured on a workstation (1680 by 950, 40 wheel steps, medians of three runs):

| Matrix | CPU | Ready | Frames over 50 ms: down, sideways, diagonal |
| --- | --- | --- | --- |
| 150 × 150 | 1x | 139 ms | 0, 0, 0 |
| 150 × 150 | 4x | 810 ms | 4, 2, 9 |
| 400 × 400 | 1x | 185 ms | 0, 0, 0 |
| 400 × 400 | 4x | 698 ms | 6, 3, 16 |

Runs vary with workstation activity; these measurements include concurrent correctness validation. The opt-in budgets allow
1,500 ms to become ready and at most 11, 4 and 20 frames over 50 ms for the three scroll directions.

The grid scroll benchmark at 4x (5,000 rows, nine columns) drops 3 frames in 40 steps for comparison.

## Packaging and size

The matrix ships as the lazy `matrix` part (`canopyx-matrix.js` and `.css`, about 25 KB gzip, guard 27 KiB), loaded by the grid
and reporting entry points when a matrix document mounts. The grid entry points carry only the `createMatrix` shell and
`AxisWindow`. CanopyX.Html writes a matrix page with the data-grid entry point and embeds the matrix part in single-file pages.

## Limits

- 10,000 items per axis and 1,000,000 cells; 36 states; 32 attributes per axis; 16 details per cell.
- The data is inline: the dense cell strings keep even a 1,000 by 1,000 matrix near 1 MB. Paging a larger matrix from the host
  (windows of cells requested as the reader scrolls) is a later addition.
- Sorting by one column's states ("sort rows by DC07") is not offered; sort by total or an attribute.

Group headings use `CanopyLabels.MatrixGroupHeadingCount` (`matrixGroupHeadingCount` in JavaScript), default `{count}`. Collapsed-cell tooltips and details retain `MatrixGroupCount` (`matrixGroupCount`), default `Items: {count}`. Override them independently, for example `matrix.Labels.MatrixGroupHeadingCount = "({count})"`; all language packs retain the compact default.
