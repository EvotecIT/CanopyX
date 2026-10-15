# CanopyX recipes

Short how-tos for common tasks with the data grid. Each recipe shows the JavaScript definition and, where it applies, the
C# authoring API. The full option list is in the [authoring reference](authoring.md) and the [protocol](data-protocol.md);
[features](features.md) lists everything the views do.

JavaScript examples import the data grid:

```javascript
import { createDataGrid } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";
```

Recipes marked **reporting** import from `@evotecit/canopyx/reporting` and its `reporting.css` instead. C# pages pick the
right runtime automatically.

- [Show records from your server](#show-records-from-your-server)
- [Give a cell separate display, sort and search values](#give-a-cell-separate-display-sort-and-search-values)
- [Draw a cell yourself](#draw-a-cell-yourself)
- [Start with a sort and a filter](#start-with-a-sort-and-a-filter)
- [Show pages instead of continuous scrolling](#show-pages-instead-of-continuous-scrolling)
- [Export: CSV, copy and your own formats](#export-csv-copy-and-your-own-formats)
- [Fit narrow screens and phones](#fit-narrow-screens-and-phones)
- [Pin columns to the edges](#pin-columns-to-the-edges)
- [Group rows with totals](#group-rows-with-totals)
- [Filter by values with counts](#filter-by-values-with-counts)
- [Keep a grid up to date while it is open](#keep-a-grid-up-to-date-while-it-is-open)
- [Remember the reader's view](#remember-the-readers-view)
- [Translate the controls](#translate-the-controls)

## Show records from your server

The grid sends a query (search, sort, filters, offset and limit) to a function you supply, and your server answers with one
window of the complete sorted and filtered result.

```javascript
const grid = createDataGrid(document.getElementById("orders"), {
  view: {
    protocol: "canopyx/2", type: "grid", id: "orders", label: "Orders",
    columns: [
      { id: "number", title: "Order", kind: "text", sortable: true },
      { id: "placed", title: "Placed", kind: "datetime", sortable: true },
      { id: "total", title: "Total", kind: "number", sortable: true }
    ],
    source: { kind: "host" }, pageSize: 100, selection: "multiple", search: true
  },
  source: {
    async query(query, { signal }) {
      const response = await fetch("/api/orders/query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query), signal
      });
      if (!response.ok) throw new Error(`Orders query failed: ${response.status}`);
      return response.json();
    }
  }
});
await grid.ready;
```

The request is a `gridQuery` with `offset`, `limit`, `search`, `searchMode`, `sort`, `filters`, an optional `filterGroup` and,
after the first answer, the `revision` of the result being read. The answer is a `gridPage`:

```json
{ "protocol": "canopyx/2", "type": "gridPage", "view": "orders", "revision": "2026-10-15T08:00:00Z",
  "offset": 0, "total": 18240, "matched": 312,
  "items": [{ "id": "SO-1001", "cells": { "number": "SO-1001", "placed": "2026-10-14T09:12:00Z", "total": 129.5 } }] }
```

Filter and sort the whole dataset before taking the window. Keep the same `revision`, `total` and `matched` for every window of
one result; if the data changed and you can no longer serve a requested revision, fail the request and the grid offers a
retry. The grid cancels requests it no longer needs through `signal`.

In C#, a .NET endpoint can write the page with the same column mapping it uses for inline pages:

```csharp
var mapper = new CanopyGridMapper<Order>(order => order.Number)
    .AddColumn(new CanopyColumn("number", "Order") { Sortable = true }, order => order.Number)
    .AddColumn(new CanopyColumn("placed", "Placed") { Kind = CanopyColumnKind.DateTime, Sortable = true }, order => order.Placed)
    .AddColumn(new CanopyColumn("total", "Total") { Kind = CanopyColumnKind.Number, Sortable = true }, order => order.Total);
var view = mapper.CreateView("orders", "Orders");
view.Source = CanopyGridSource.HostedOffset();

// In the endpoint, after running the query:
var page = new CanopyGridPage("orders", revision, offset, total, matched);
foreach (var order in window) page.Rows.Add(mapper.MapRow(order));
string json = page.ToJson(view);
```

A page written with `view.ToHtmlFragment()` gets its `source` from `CanopyX.configure("orders", { source })` in a script that
runs before the page loads. Translating the query into SQL or LINQ is your code today; a .NET query adapter is planned (see
the [roadmap](roadmap.md)). For server-side cursors instead of offsets, use `CanopyGridSource.HostedCursor()` and see
[sequential sources](data-protocol.md#sequential-sources-and-unknown-counts).

## Give a cell separate display, sort and search values

A cell's `value` is what sorting, filters and raw exports use. `text` is what the reader sees, `sort` orders the column when
it should differ from the value, and `searchText` adds words the search box finds without showing them.

```javascript
rows: [{ id: "f-17", cells: {
  size: { value: 2048, text: "2 KiB" },                         // sorts and filters as a number
  status: { value: "Warning", sort: 2 },                        // Critical = 1, Warning = 2, Healthy = 3
  customer: { value: "ACME-0042", searchText: "Acme Corporation" }
} }]
```

```csharp
row.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB" };
row.Cells["status"] = new CanopyCell("Warning") { SortKey = 2 };
row.Cells["customer"] = new CanopyCell("ACME-0042") { SearchText = "Acme Corporation" };
```

For a fixed category order across a whole column, the reporting runtime also takes `reporting: { ordering: { status: { text:
"foldedOrdinal", categories: ["Critical", "Warning", "Healthy"] } } }` (C# `column.Ordering = new CanopyGridOrdering(...)`, which
needs `view.Reporting` set and a sortable text column). See
[default formatting and sorting](data-protocol.md#default-formatting-and-sorting).

## Draw a cell yourself

Start with a declarative presenter; it keeps search, sort and export values intact and needs no code:

```csharp
view.GetColumn("site").Presenter = CanopyGridPresenter.Link("siteUrl", newWindow: true);
view.GetColumn("progress").Presenter = CanopyGridPresenter.Progress(maximum: 100);
view.GetColumn("state").Presenter = CanopyGridPresenter.State();
```

```javascript
columns: [{ id: "state", title: "State", kind: "text", presenter: { kind: "state" } }]
```

When you need your own markup, a renderer draws one column. Return `true` when it drew the cell:

```javascript
import { createDataGrid, badge } from "@evotecit/canopyx/grid";

createDataGrid(host, { view, renderers: {
  owner(row, element, context) {
    const cell = row.cells.owner;                                  // a plain value or { value, text, ... }
    const value = cell !== null && typeof cell === "object" ? cell.value : cell;
    if (value == null) return false;                               // keep the default painting
    element.append(badge({ text: String(value), tone: "info" }));
    return true;
  }
} });
```

Release anything the cell holds with `context.onDispose(cleanup)`. See [safe cell presenters](data-protocol.md#safe-cell-presenters)
and the [rendering model](architecture.md#rendering-model).

## Start with a sort and a filter

```csharp
view.Query = new CanopyGridQuery("orders");
view.Query.Sort.Add(new CanopyGridSort("placed", descending: true));
view.Query.Filters.Add(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "Open"));
```

In JavaScript, change the query at any time; it returns the accepted query:

```javascript
await grid.setQuery({
  sort: [{ column: "placed", direction: "desc" }],
  filters: [{ column: "status", operator: "eq", values: ["Open"] }]
});
```

Readers sort by clicking headers (Shift+click adds a column) and filter from each header's ⋮ menu or the Filters builder.

## Show pages instead of continuous scrolling

```csharp
view.Presentation = CanopyGridPresentation.Paged;
view.PageLength = 25;
```

```javascript
view: { ...definition, presentation: "paged", pageLength: 25 }
```

The pager shows the range ("1–25 of 312 rows"), a rows-per-page choice, first/previous/next/last and a page number field.
Drive it with `goToPage(index)`, `setPageLength(length)` and `getPaging()`. `pageSize` stays the fetch size and is
independent of the visible page length.

## Export: CSV, copy and your own formats

The Export menu offers CSV for the filtered, selected or all records, and Ctrl/Cmd+C copies tab-separated text. From code:

```javascript
const csv = await grid.toCsv({ scope: "filtered" });
await grid.copy({ scope: "selected" });
```

Add a file format and it joins the same menu, with the scope choice, progress and cancel:

```javascript
import { registerExportFormat } from "@evotecit/canopyx/grid";

registerExportFormat({
  id: "xlsx", label: "Download Excel", extension: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  async write(capture, { signal, progress }) {
    const sheet = startWorkbook(capture.request.columns);           // your spreadsheet writer
    for await (const row of capture.rows({ signal })) { sheet.add(row.cells); progress(sheet.length); }
    return sheet.toBlob();
  }
});
await grid.exportAs("xlsx", { scope: "filtered" });
```

C# views choose which registered formats their menu offers with `view.ExportFormats.Add("xlsx")`. For very large files built
on the server, configure `onExport` and call `grid.exportToHost("xlsx", { scope: "all" })`. See [export formats](authoring.md#export-formats).

## Fit narrow screens and phones

Tell the grid which columns matter; it hides the rest first when the width runs short and keeps every field in the record
drawer.

```csharp
view.GetColumn("name").ResponsivePriority = 0;        // essential: never hides
view.GetColumn("email").ResponsivePriority = 10000;   // optional: hides first
view.GetColumn("status").AlwaysVisible = true;
```

```javascript
columns: [
  { id: "name", title: "Name", kind: "text", priority: "essential" },
  { id: "email", title: "Email", kind: "text", priority: "optional" },
  { id: "status", title: "Status", kind: "text", alwaysVisible: true }
]
```

At 640 pixels and below the grid switches to its phone layout: a "+N" button shows how many fields are hidden, and tapping a
row opens a full-screen record drawer. Set `onDetails` to open your own view instead. See
[how a width is chosen](column-layout.md#how-a-width-is-chosen).

## Pin columns to the edges

The identity column (the `rowHeader`, or the first column) pins left by default. Pin others left or right:

```csharp
view.GetColumn("actions").Pinned = CanopyGridColumnPin.Right;
```

```javascript
columns: [{ id: "actions", title: "Actions", kind: "text", pinned: "right" }]
```

At run time, `grid.setColumnPinned("owner", "left")` pins a column and `"none"` unpins it.

Readers pin and unpin from each header's ⋮ menu, and pins are part of saved views. See
[identity column and pinning](column-layout.md#identity-column-and-pinning).

## Group rows with totals

**Reporting.** Group by one column and add aggregates to the group rows and the pinned summary row:

```csharp
view.Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("category") };
view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
```

```javascript
reporting: {
  grouping: { column: "category", direction: "asc" },
  aggregates: [{ id: "total", column: "amount", label: "Total amount", operation: "sum" }]
}
```

Inline data computes the totals. A server source adds `source.summary(query, { signal })` returning a `gridSummary`. Collapsing a
group hides its rows without removing them from selection or exports. See
[flat groups](data-protocol.md#flat-groups-and-complete-query-totals).

## Filter by values with counts

For inline data, a text column's filter popover lists its values with counts over the full result, already narrowed by the
other filters. For a server source, declare the columns and answer facet requests:

```csharp
view.Reporting = new CanopyGridReporting();
view.Reporting.FacetColumns.Add("status");
```

```javascript
source: {
  query: queryOrders,
  async facet(request, { signal }) {
    // request.column, request.search, request.limit, request.includeCurrentFilter and request.query (with its revision)
    return await postJson("/api/orders/facet", request, signal);   // a gridFacetPage
  }
}
```

Read the same counts from code with `grid.getFacets("status", { limit: 100 })` (reporting). See the
[flat grid protocol](data-protocol.md#flat-grid-documents).

## Keep a grid up to date while it is open

Apply changes in place instead of reloading: the reader keeps their sort, filters, selection, focus and scroll position.
Rows keep their places while their values change, and an **Order changed · Re-sort** prompt offers to move them.

```javascript
const grid = createDataGrid(element, { view: { ...view, live: { flash: true, batchMs: 250 } } });
socket.onmessage = message => grid.applyTransaction(JSON.parse(message.data));   // { add, update, remove }
grid.element.addEventListener("canopyx:rowsChanged", event => console.log(event.detail.updated.length, "rows changed"));
```

A hosted grid polls its source and refreshes only when the revision changed:

```csharp
view.Live = new CanopyGridLive { PollMilliseconds = 10000, Flash = true };
```

See [live data](live-data.md).

## Remember the reader's view

```csharp
view.StateKey = "orders-reader";                                   // session storage
view.Reporting = new CanopyGridReporting { ViewStorage = CanopyGridViewStorage.Local };  // keep across sessions
```

The Views menu saves named views, renames them and picks a default; Reset view returns to the definition. To keep preferences
on your server, pass `viewStore: { load({ key, view, signal }), save({ key, view, settings, signal }) }` (reporting, with a
`stateKey`). For your own save button, use `grid.getState()` and `await grid.setState(state)`; `getShareState()` leaves out
searches, filters and selection. See [flat data grid](authoring.md#flat-data-grid).

## Translate the controls

```javascript
import pl from "@evotecit/canopyx/locales/pl";

createDataGrid(host, { view: { ...definition, labels: pl } });
createDataGrid(host, { view: definition, labels: { gridResultCount: "{count} / {total}" } });   // one label
```

```csharp
view.Labels = CanopyLabels.German();
view.Labels.GridResultCount = "{count} von {total}";
```

Polish, German, Spanish, French and Italian packs are included; every other label can be set by name. See [label packs](labels.md).
