# Row grouping and detail rows

Reporting grids (`canopyx-reporting.js`, `@evotecit/canopyx/reporting`) group records by one or more columns, show
labelled aggregates in group headings and a totals row, and expand any record into a detail row that holds a host
template, trusted HTML or a nested CanopyX grid or tree. Both arrive as lazy parts (see [plugins.md](plugins.md)):

| Part | Loads when | Content |
| --- | --- | --- |
| `detail-rows` | a grid with detail rows or grouping requests its first page | the row projection shared by headings and detail rows, detail rows, their keyboard, export and print |
| `grouping` | a grid with grouping or aggregates requests its first page | complete-query summaries, nested headings, aggregates, the group-by bar, group keys and outlines in exports |

The grid's first page waits for its parts, so the first rows it paints already show headings and expanders. Single-file
pages written by `CanopyX.Html` carry the parts a grid needs (`CanopyHtmlAssets.GetRequiredParts`); hosts that serve files
serve `canopyx-detail-rows.*` and `canopyx-grouping.*` beside the runtime. A grid whose detail rows come only from a
JavaScript `detail` option is unknown to the .NET writers: embed `CanopyHtmlAssets.GetPart("detail-rows").Markup` once in
such a page, or serve the files.

The example `orders-by-region.html` (CanopyX.Examples) groups orders by region and status with sum, average, count and
distinct-count aggregates and expands each order into a nested grid of its order lines.

## Grouping

### Declaring it

A fixed grouping (`grouping: { column, direction }`, `CanopyGridReporting.Grouping`) keeps one level the reader cannot
change, as before. Runtime grouping is declared with `groupBy` (the initial levels, outermost first) and `groupable`
(readers may group by any sortable column):

```csharp
var view = new CanopyDataGridView("orders", "Orders") { Reporting = new CanopyGridReporting { Groupable = true } };
view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region"));
view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("status", descending: true));
view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
view.Reporting.Aggregates.Add(new CanopyGridAggregate("average", "amount", CanopyGridAggregateOperation.Average, "Average order"));
```

```json
"reporting": {
  "groupBy": [{ "column": "region", "direction": "asc" }, { "column": "status", "direction": "desc" }],
  "groupable": true,
  "aggregates": [{ "id": "total", "column": "amount", "operation": "sum", "label": "Total amount" }]
}
```

At most four levels. A level's column must be sortable. A fixed grouping cannot be combined with `groupBy` or `groupable`.

The levels belong to the query: every accepted query of such a grid carries `groupBy` (an empty list when ungrouped),
the levels' columns lead its sort and the reader's own sorts apply inside the innermost groups. A query given without
`groupBy` uses the declared levels; `[]` ungroups. Saved views, remembered state and shared state keep the levels;
collapsed groups are saved too, but sharing leaves them out because their keys belong to one result.

### Group order

A level orders its groups by value (`direction`), or by one of the declared aggregates:

```js
grid.setGroupBy([{ column: "region", direction: "desc", aggregate: "total" }, { column: "status", direction: "asc" }]);
```

Groups whose aggregate is missing come last; groups with equal values follow their value. The records of such a level
stay together by value, so its sort entry in the query is ascending. Missing values always form one last group.

### Reader controls

- **The group-by bar** shows a chip per level: the column, its direction, the group order (value or an aggregate),
  collapse or expand of that level, and removal. Alt+Left and Alt+Right move a level; chips can be dragged. Expand all and
  Collapse all close the bar. An empty bar asks the reader to drag a column header onto it. On phones the bar is one
  scrolling line with the column, direction and removal of each level.
- **Column menus** offer *Group by this column* (the new innermost level) and *Stop grouping by this column*.
- **Headers** dragged onto the bar add a level when the definition has `columnReorder` (whose move handles start the drag).
- **Sorting** a grouped column (its header or its menu) turns its groups around.

### Headings

A heading shows its expander, the value (with the column name when there is more than one level), the complete group's
record count, the group's aggregates under their columns and host display cells such as the worst state of the group.
Aggregates of columns out of view (hidden, or left out on a phone) follow the heading's text, so nothing is lost. A
heading's text runs on over the empty cells beside it.

With more than one level the grid is a `treegrid`: headings carry `aria-level` and `aria-expanded`, records the level
under the innermost heading. One level keeps the flat-grid contract (`role="grid"`, the expander's `aria-expanded`).

Keys on a heading: Right expands, or on an expanded heading of a treegrid moves to its first row; Left collapses, or on a
collapsed inner heading moves to its outer heading; Enter and Space toggle; Up, Down and the Page keys walk headings,
records and detail rows; Home and End stay on the row, Ctrl+Home and Ctrl+End reach the first and last record. A record
that becomes the focus opens the collapsed groups around it; a collapse that hides the focused record moves focus to its
heading.

### Aggregates

| Operation | Column | Value |
| --- | --- | --- |
| `count` | any | nonmissing values |
| `distinctCount` | any | distinct nonmissing raw values |
| `sum`, `average`, `minimum`, `maximum` | number | over finite values; null for no values |
| any other name | any | a custom aggregate (below) |

Every aggregate cell shows its function: `sum 12.7M`, `avg 36.2`, `distinct 16`. The templates are translatable labels
with a `{value}` placeholder (`gridAggregateCount`, `gridAggregateSum`, `gridAggregateAverage`, `gridAggregateMinimum`,
`gridAggregateMaximum`, `gridAggregateDistinct`). Values use the column's precision (the most fraction digits among its
loaded values, at most three; averages one more; counts none) and turn compact from one million. The tooltip and the
cell's accessible name give the declared label and the full value. Columns with aggregates are measured with them, so
the labelled values fit.

**Custom aggregates** are registered by a plugin and named by an aggregate's `operation`:

```js
CanopyX.use({ name: "median", aggregates: { median: { label: "med {value}", compute(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return !sorted.length ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
} } } });
```

`compute(values, { column, aggregate })` receives the raw nonmissing values of a group (or of the whole result) and returns
a finite number within the safe-integer magnitude, or null. `label` is the cell template (default `<name> {value}`). In
C# use `new CanopyGridAggregate(id, column, "median", label)`. Inline data needs the plugin (a grid without it reports an
error); a host source computes the value itself.

### Working with the rest of the grid

- **Search and filters** narrow the records; the summary is recomputed for every accepted query.
- **Selection**: with `selectionControls`, a heading's checkbox selects or clears its group's records (up to 10,000 at a
  time, like other ranges); it reads mixed while only some are selected.
- **Paging and scrolling** count records. A page that starts inside a group repeats its headings; collapsed groups are
  skipped without loading their pages. A million hosted records keep sparse headings.
- **Export**: records stay records. Exports of the filtered result add `request.grouping`: the levels (with titles), the
  declared aggregates, the totals and the nested groups with their record ranges (`offset`, `count`), values, display
  text and aggregates, from which a format writes outline levels. Exports of the selection or of all records carry none.
- **Print**: print snapshots (`print()` with an `onPrint` hook) carry the same request.

### API and events

| Member | Meaning |
| --- | --- |
| `setGroupBy(levels)`, `getGroupBy()` | Runtime levels; `setGroupBy` resolves with the accepted query. |
| `setGroupCollapsed(key, collapsed)`, `getCollapsedGroups()` | One group, by its summary key, at any level. |
| `setGroupLevelCollapsed(level, collapsed)` | Every group of a level (1 is the outermost), or of all levels for 0. |
| `expandAllGroups()`, `collapseAllGroups()` | Every group. |
| `getSummary()` | The accepted complete-query summary, with nested `groups`. |
| `canopyx:group` | `{ key, collapsed }` for one group, `{ level, collapsed, keys }` for a level or all groups. |

### Remote data

A hosted grid answers the summary hook with nested groups; [data-protocol.md](data-protocol.md#flat-groups-and-complete-query-totals)
specifies the request and response and lists what a server adapter implements.

## Detail rows

### Declaring them

A detail row sits under its record. Its content loads the first time the record expands and stays while the record is
expanded, also while its row scrolls out of view, so a nested grid keeps its own sort, scroll and focus. A collapse, a
new result without the record or the grid's destruction aborts the content's signal and destroys a nested view. A new
result keeps the expanded records it still contains among its loaded rows.

The content comes from one source, declared in `reporting.detail` (`CanopyGridReporting.Detail`) or passed as the grid's
`detail` option:

| Source | Declaration | Content |
| --- | --- | --- |
| Record payloads | `detail: {}` with each row's `detail` (`CanopyGridRow.Detail`) | a table, property list or trusted HTML, drawn as a tree's detail rows are |
| A nested grid or tree | `detail: { view }` (`CanopyGridDetail.View` / `TreeView`) | each row's `{ "type": "grid", "rows": [...] }` (`CanopyGridRowsDetail`) or `{ "type": "tree", "roots": [...] }` (`CanopyTreeDetail`) as its inline data |
| A page template | `detail: { template: "order-detail" }` | a clone of `<template id="order-detail">`; elements with `data-cx-field="column"` receive the record's cell text |
| A plugin renderer | `detail: { renderer: "order-lines" }` | `detailRenderers["order-lines"](row, element, context)` of a page plugin |
| Host callbacks | the `detail` option | `render(row, element, context)`, `html(row, context)`, `grid(row, context)`, `tree(row, context)` or `source(row, context)` |

```js
CanopyX.configure("orders", { detail: {
  grid: (row, { signal }) => ({ view: linesView, source: linesSourceFor(row.id) }), // a nested grid with its own data source
  hasDetail: row => row.cells.items > 0
} });
```

Callbacks may return promises; the detail shows *Loading…* meanwhile and a message with Retry when they fail. A nested
view starts without its own toolbar (its headers still sort); `options` in the returned object restore it. Nested views of
different records never share remembered state. `hasDetail(row)` limits which records offer an expander; without it
record payload details are offered by the records that carry a payload.

**Trusted input.** `html` callbacks and `html` payloads are inserted as HTML without sanitising, as tree detail rows are:
encode the record text you put into them. Templates, cells and every other text are inserted as text. Host callbacks own
the safety of any markup they produce.

### Sizing

A detail row is as tall as its content and is measured again when its content or the grid's width changes; rows below
move and the reader's place stays. The content stays inside the visible width of the grid, however wide its columns are.
A nested grid or tree is bounded (320 pixels, 280 on phones) and follows its rows when they are fewer.

### Keyboard and focus

The expander leads the record's first cell. Like other cell controls it is reached with F2 (or Enter on a cell) and the
arrow keys, and Enter or Space presses it; its `aria-expanded` tells whether the detail row follows. Down from an
expanded record reaches its detail row (`role="row"` with one cell spanning the columns). On the detail row, Enter or F2
moves into the content (a nested grid's current row, or the first control); Escape on the detail row returns to the
record. Inside the content, Escape that the content does not use (or Escape on a nested grid's row) returns to the
detail row. Keys, clicks and focus inside the content never reach the outer grid, so a nested grid's Space or Enter never
selects or activates the outer record. Controls in expanded content follow the page's Tab order.

### Phones

On phones a detail row stays an **inline section** under its record rather than opening in the record drawer. The drawer
is a single modal sheet: a nested grid or tree inside it would open its own drawer, menus and popovers on top of it (and
the drawer closes the sheet it would be opened from), and the reader would lose their place in the list. Inline, the
detail keeps reading order and scroll position, a nested grid uses its own phone layout, and the drawer stays the place
for the record's hidden fields.

### Print and export

Exports and print snapshots carry data, never the live page: each record's detail rides on the record as a table, a
property list or trusted HTML. Nested grid rows and tree roots become a table of the nested view's visible columns (tree
levels indented); `detail.export(row)` supplies the payload for host-drawn content. The request says `details: true`.
`includeDetails: false` on an export or print call, or `print: false` in the definition, leaves details out. The static
fallback (`CanopyStaticHtml.RenderGrid`) prints detail payloads under their records unless the definition excludes them,
keeping HTML payloads as text.

### API and events

| Member | Meaning |
| --- | --- |
| `expandDetail(id)`, `collapseDetail(id)`, `toggleDetail(id)` | A loaded record of the accepted result; resolves when the content is drawn. |
| `getExpandedDetails()` | The expanded record IDs. |
| `canopyx:detail` | `{ id, expanded }`. |

## Labels

`gridGroupBy`, `gridUngroup`, `gridGroupDrop`, `gridExpandAll`, `gridCollapseAll`, `gridExpandLevel`, `gridCollapseLevel`,
`gridGroupMove`, `gridGroupSortBy`, `gridGroupSortValue`, `gridSelectGroup`, `gridAggregateDistinct`, `gridShowDetail`,
`gridHideDetail`, `gridDetailOf` and `gridDetailFailed` join the existing grouping and aggregate labels, with Polish, German
and Spanish translations in the shipped packs.
