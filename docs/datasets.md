# Shared datasets

A report often shows one set of records several ways: a grid of every record, a pivot by region and status, a second grid
grouped by owner, a record panel behind each. Without a dataset every view carries its own copy of the rows, so the page
grows with each view, and the browser parses, validates and keeps each copy. A **dataset** is written once; the views name
it, and the browser reads, decodes and validates its rows once and gives every view the same row objects.

Views share rows, not presentation. Each view keeps its own columns (any of the dataset's, with their own titles, formats,
presenters and widths), its own query, sort, filters, grouping, pivot, layout and saved state. To filter one view from
another as well, use [linked views](linked-views.md).

## Write one from .NET

```csharp
var orders = CanopyDataset.Inline("orders");
orders.Columns.Add(new CanopyColumn("region", "region"));
orders.Columns.Add(new CanopyColumn("status", "status"));
orders.Columns.Add(new CanopyColumn("amount", "amount") { Kind = CanopyColumnKind.Number });
foreach (var order in source) orders.Rows.Add(new CanopyGridRow(order.Id) {
    Cells = { ["region"] = order.Region, ["status"] = order.Status, ["amount"] = order.Amount }
});

var list = new CanopyDataGridView("order-list", "Orders") { Source = CanopyGridSource.FromDataset(orders) };
list.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
list.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });

var pivot = new CanopyDataGridView("order-pivot", "Orders by region") { Source = CanopyGridSource.FromDataset(orders) };
// ... columns, reporting aggregates and a pivot, as in pivot.md

orders.ValidateView(list);                         // optional: early errors for missing or differently typed columns
var document = new CanopyHtmlDocument();
var options = new CanopyHtmlOptions { Document = document };
var html = orders.ToHtmlFragment(options) + list.ToHtmlFragment(options) + pivot.ToHtmlFragment(options);
```

`ToHtmlFragment` writes a hidden `div.cx-dataset` element that the runtime reads when the first view queries and never
mounts. Above `CanopyRowDataOptions.CompactAboveRows` rows it writes [compact row data](large-data.md), as a grid does with
its own rows; `CanopyHtmlOptions.RowData` chooses the format. With inline assets the fragment carries the part that
decodes compact rows. Bundles (`SaveHtmlBundle`) write a grid's own rows into sidecar files; a dataset always travels inside
the page.

`Columns` declares each cell's id and kind, and the rows are validated against them once. A view's columns must be dataset
columns of the same kind; its titles and everything else are its own.

## Kinds of datasets

| Dataset | .NET | Rows |
| --- | --- | --- |
| Inline | `CanopyDataset.Inline(id)` | Carried by the page, as row objects or compact chunks. |
| From an address | `CanopyDataset.FromUrl(id, url, refresh)` | Read once from a JSON address (an array of rows, or an object with a `rows` array) for every view, and again every `refresh` while the page is visible and a view reads them. |
| Hosted | `CanopyDataset.Hosted(id)` | None on the page. The page's script registers one host source, which every view uses for its own queries. |

A hosted dataset shares its source, not its rows: each view still sends its own `gridQuery` with its own view id, so the
host source answers queries for every view that names the dataset. With `CanopyX.Data`, map one endpoint per view over the
same `IQueryable`.

```js
CanopyX.defineDataset({ id: "machines", kind: "host", source: { query: (query, options) => myTransport.query(query, options) } });
```

Call it before the views mount. For a hosted dataset the page declares with `CanopyDataset.Hosted`, the same call gives it
its source.

## From JavaScript

```js
const orders = CanopyX.defineDataset({ id: "orders", columns: [{ id: "region", kind: "text" }, { id: "amount", kind: "number" }], rows });
CanopyX.createDataGrid(listHost, { view: { ...listView, source: { kind: "inline", dataset: "orders" } } });
CanopyX.createDataGrid(pivotHost, { view: { ...pivotView, source: { kind: "inline", dataset: "orders" } } });

await orders.ready();
orders.getRows();            // the shared rows: read them, never change them
await orders.setRows(next);  // every view runs its query again over the new rows, at its place
await orders.refresh();      // an address dataset reads its address again; a hosted one reloads its views
orders.views();              // the mounted grids that read it
```

`CanopyX.dataset(id)` returns the same object for a dataset the page declares. `defineDataset` copies the rows once;
`setRows` validates and copies the new rows once, whatever the number of views. Rows given with `setRows` while an
address is being read again win: that read's answer is dropped, and the next refresh reads the address again.

## What a view over a dataset can do

Everything that reads rows works as on any inline grid: search, sorting, filters, grouping, totals, pivots, facets, the
record panel and record deep links, linked views, layouts, exports and print. Every new set of rows gets a new revision
(`dataset-<n>`), so a selection or summary of the previous rows never carries over.

Views never write into the rows other views read, so an inline view over a dataset refuses:

- calculated columns, which write their results into the rows;
- editable columns and the editing options;
- `setRows`, `addRows`, `updateRows`, `removeRows` and `applyTransaction`: change the dataset with `setRows` instead.

The .NET writer and the runtime both refuse these combinations. A hosted view keeps the live methods of any hosted grid.
