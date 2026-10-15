# Tables, Records and URLs in One Call

`CanopyX.enhance` turns an HTML `<table>` that is already in the page into a grid. `CanopyX.grid` builds a grid in any element from plain records or a URL, and enhances a table when it is given one. Both create an ordinary flat grid, so search, filters, sorting, paging, the column menus, saved views, export, the keyboard model and the phone layout work as they do for a grid written by .NET or from a view document.

Both live in the `enhance` part (`canopyx-enhance.js`), which loads on the first call and then loads the `pager` part (`canopyx-pager.js` and `canopyx-pager.css`) once a table has left the page, so the pager's stylesheet never restyles thousands of table rows. They are available on the grid runtimes: `canopyx-grid.js`, `canopyx-reporting.js` and their modules.

```html
<link rel="stylesheet" href="canopyx-grid.css">
<script src="canopyx-grid.js"></script>

<table id="servers" data-page-length="10" data-order='[[3,"desc"]]'>
  <caption>Servers by site</caption>
  <thead>
    <tr><th rowspan="2">Server</th><th rowspan="2">Site</th><th colspan="2">Usage</th><th rowspan="2">Console</th></tr>
    <tr><th>CPU</th><th>Memory</th></tr>
  </thead>
  <tbody>
    <tr id="srv-001">
      <th scope="row">app-warsaw-01</th>
      <td data-search="Warsaw WAW">Warsaw</td>
      <td data-order="37">37 %</td>
      <td data-order="12884901888">12 GB</td>
      <td><a href="/servers/srv-001">Open console</a></td>
    </tr>
    …
  </tbody>
  <tfoot><tr><th scope="row">Average</th><td></td><td>48 %</td><td>34 GB</td><td></td></tr></tfoot>
</table>

<script>
  CanopyX.enhance("#servers").then(grid => grid.on("page", ({ paging }) => console.log(paging.pageIndex)));
</script>
```

There is no build step: the runtime and its part files are served side by side, from a package, a file share or a CDN. Both functions return a promise of the grid's controller; `await` it, or pass handlers in the `on` option.

The table stays in the page source, so readers without script, search engines and print-to-file tools see the table itself. The grid takes its place in the document, and `destroy()` puts the same table element back, unchanged.

## What a table gives the grid

| Table | Grid |
| --- | --- |
| The bottom header row (`<thead>`, or a first row of `<th>` cells) | The columns and their titles. Cells with `colspan` and `rowspan` are laid out as the browser lays them out. |
| Header rows above the bottom one | Header groups (`grid.headerGroups`, levels of `{ title, columns }`). Each column also gets its group as its record-drawer section. A bottom title that repeats under different groups gets its group in front ("Q1 · Sales"), so the columns stay distinguishable until the grid draws multi-level headers. |
| `<td>` text | The cell's display text, with runs of white space collapsed. |
| `data-order` or `data-sort` on a cell | The cell's sort value (a number when it reads as one). The text stays what readers see. |
| `data-search` or `data-filter` on a cell | The cell's search value, which the search box matches instead of the text. |
| `data-tone` on a cell or a row | The cell's or the row's tone (`success`, `warning`, `danger` or a host tone). |
| `class` on a row | The grid row's class. |
| `id` or `data-id` on a row | The row id that selection, saved views and the API use. Rows without one get `r1`, `r2`, … from their position. Ids must be unique. |
| `<th>` cells in every body row | The identity column (`rowHeader`), which stays pinned and names the row for screen readers. A grid has one; with several such columns, the first is it. |
| Links, badges and other markup in a cell | Kept: the grid shows a copy of the cell's content. Sorting, search and export read the text. `markup: false` shows the text only. |
| `<caption>` | Shown above the grid and used as its accessible name (or `aria-label`, `title`, or the `label` option). |
| `<tfoot>` rows | A quiet strip below the rows, each value with its column's title, so it reads well at any width. A view with reporting aggregates (`view: { reporting: { aggregates } }`) shows its summary row instead; `footer: false` drops the strip. |

Rows that equal each other under the sort keep their order from the table. Without a sort, the grid shows the table's order.

### Column kinds

A column's kind comes from `data-type` (`text`, `number`, `datetime`, or `date` for `datetime`) on its header cell, or from the `type` column option. Without one, the grid reads every value of the column:

- **Number** when every non-empty value is a number as people write it: digits grouped by spaces, apostrophes, commas or dots, one decimal mark, a sign (also `−`) or accounting parentheses, up to three currency symbols before or after (`€ 1.234,50`, `-12 %`, `(1,200)`), or a unit of up to three letters after a space (`1,024 MB`). Letters before the digits or right after them make a code (`A12`, `Win10`), which stays text. When only one separator appears once, the page language's decimal mark decides: `1.500` is 1.5 in English and 1500 in German. A sort value in `data-order` settles any doubt.
- **Date and time** when every non-empty value is an ISO date (`2026-10-15`) or date and time; a value without a zone is UTC.
- **Text** otherwise. One value that is neither keeps the column text, so nothing is guessed away.

Number and date columns keep the text as written for display and search; filters, value lists and the status bar read the values.

## Options from attributes

Options can be written on the table and on header cells as `data-*` attributes: the name in kebab case, the value as JSON when it parses (`25`, `true`, `[[1,"desc"]]`) and as text otherwise. Options that are text (`label`, `noun`, `search-text`, `height`, `id`, `title`, `tooltip`, `default-content`, `section`) keep the attribute as written, so `data-id="2024"` is the id "2024". Script options win over attributes.

| On | Attributes |
| --- | --- |
| `<table>` | `data-label`, `data-noun`, `data-paging`, `data-page-length`, `data-page-lengths`, `data-length-menu`, `data-info`, `data-page-numbers`, `data-page-input`, `data-search`, `data-search-text`, `data-search-mode`, `data-order`, `data-sortable`, `data-selection`, `data-state-save`, `data-markup`, `data-footer`, `data-height`, `data-theme`, `data-density`, `data-zebra` |
| `<th>` of the bottom header row | `data-id`, `data-title`, `data-type`, `data-sortable`, `data-searchable`, `data-visible`, `data-hidden`, `data-priority`, `data-width`, `data-min-width`, `data-max-width`, `data-flex`, `data-pinned`, `data-wrap`, `data-always-visible`, `data-tooltip`, `data-auto-size`, `data-default-content`, `data-section`, `data-row-header` |

## Records and URLs

```js
const grid = await CanopyX.grid("#projects", {
  data: projects,                       // arrays or objects
  rowId: "id",                          // a field, or (record, index) => id
  columns: [
    { data: "name", title: "Project" },
    { data: "owner.name", title: "Owner" },  // a dotted path
    { data: "budget", title: "Budget", type: "number",
      render: (value, purpose) => purpose === "display" ? money.format(value) : value },
    { data: "due", title: "Due", type: "date", render: { display: value => formatDate(value) } }
  ],
  order: [["budget", "desc"]],
  pageLength: 10
});
```

Without `columns`, the first record's own fields (or its positions, for arrays) become the columns.

A column's `data` is a field name, a dotted path (`"owner.name"`, also a field whose name contains dots) or an array position, and defaults to the column's position. Its id defaults to the field name (`c0`, `c1`, … for positions). Every [grid column field](data-protocol.md) (`width`, `priority`, `pinned`, `presenter`, `wrap`, `tooltip`, …) can be given too.

### Render functions

`render(data, purpose, record, meta)` receives the column's field value, what the value is for, the whole record and `{ row, column, id }`. It is called for every record and purpose:

| Purpose | The result becomes |
| --- | --- |
| `display` | The text the cell shows (a DOM node gives its text). |
| `sort` | The sort value, when it differs from the value. |
| `filter` | The search value. |
| `type` | The value the column stores; its type decides an automatic kind. |

`render` can also be an object with a function or a field path of the record per purpose, and `_` for the purposes it does not name: `{ display: formatDate, sort: "dueTimestamp" }`. The display is text, never HTML; for markup, give the column a cell renderer (`renderers`, or a plugin's renderer) as on any grid.

### A URL read once

```js
CanopyX.grid("#orders", {
  url: { url: "/api/orders", dataSrc: "items", data: { region: "north" }, headers: { Accept: "application/json" } },
  columns: [{ data: "number", type: "text" }, { data: "total", type: "number" }],
  rowId: "number"
});
```

`url` is an address, or `{ url, method, headers, data, dataSrc, credentials, fetch }`. The request is a GET unless `method` says otherwise; `data` adds query parameters to a GET request and JSON fields to any other. `dataSrc` names where the records are: a property path, `""` for an answer that is the array itself, or a function of the answer; by default the answer itself, its `data` or its `items`. `fetch` replaces the browser's `fetch` for an authenticated client or a test.

When every column declares its type, the grid appears at once with its loading state and fills when the answer arrives; a failed request shows the grid's error with Retry, which asks again. Without declared types, the records are read first so the columns and kinds can come from them.

### Server processing

```js
CanopyX.grid("#events", {
  url: { url: "/api/events/query", serverSide: true, facetUrl: "/api/events/facet" },
  columns: [{ data: "time", type: "datetime" }, { data: "source", type: "text" }, { data: "code", type: "number" }],
  rowId: "id"
});
```

With `serverSide` (on the URL source or as an option), every sort, search, filter and page change posts the canopyx/2 [grid query](data-protocol.md) as JSON, with the `data` fields added (a function of the query can compute them). The server answers a `gridPage` document, which the CanopyX .NET adapter writes, or a plain object `{ total, matched, items, revision? }`; `dataSrc` finds the records in it as for a URL read once, and they are mapped through the columns. `facetUrl` receives the reporting runtime's value-list queries.

- Declare the column types: a server's pages arrive after the grid is built.
- Give `rowId`: generated ids follow the position in the result, so they name other records after a sort, and selection would follow them.
- An answer without a `revision` is taken as the snapshot the grid's query names. A server whose data changes while readers page returns a revision, and a new one when its data changes.
- Requests are sized to the page length the grid starts with.

## Paging

Enhanced grids are paged by default (`paging: false` scrolls every row). The short options set the [pager settings](paging.md):

| Option | Default | Meaning |
| --- | --- | --- |
| `pageLength` | 25 | Rows per page. |
| `pageLengths` | `[10, 25, 50, 100, "all"]` | Page-size choices: numbers, `"all"` (inline rows only), or `{ value, label }`. |
| `lengthMenu` | `true` | The rows-per-page menu. |
| `pageNumbers` | `true` (seven) | Numbered page buttons: `true`, a count from 5 to 15, or `false`. |
| `pageInput` | shown without numbers | The page number field. |
| `firstLast` | `true` | The first-page and last-page buttons. |
| `info` | `"sentence"` | "Showing 1 to 25 of 300 rows (filtered from 1,000)"; `"range"` for the compact range; `false` for none. |

A paged grid is as tall as a page of rows (up to 100) and its chrome, as the table was; `height` sets a CSS height instead.

## Initial sort and search

`order` is a list of `[column, direction]` pairs, where the column is a position or an id, or of `{ column, direction }` objects. `searchText` is the first search, and `searchMode` is `substring` (the default) or `words`. A column is sortable unless it says otherwise; `sortable: false` makes every column unsortable unless a column says so.

## Saving the view

`stateSave: true` keeps what the grid saves (sort, search, filters, page and page length, column widths, order and visibility, selection and named views) in session storage for two hours. An object chooses more:

| Field | Default | Meaning |
| --- | --- | --- |
| `storage` | `"session"` | `"session"` or `"local"`. |
| `duration` | 7200 | Seconds a saved view stays valid; 0 keeps it without a limit. |
| `key` | the page path | Storage key prefix; the grid id is added. |
| `url` | `false` | `"query"` or `"hash"` also keeps the shareable part (sort, search, filters, page and page length) in the address, so a copied link opens the same view. A view in the address wins over a stored one. The hash form uses the fragment only while it is empty or `name=value` pairs; a page with anchors or a hash router uses `"query"`. |
| `parameter` | the grid id | The address parameter. |
| `load({ key, view })`, `save({ key, view, state })` | | The host's own store instead of browser storage; `load` may return a promise. |

## Texts

`labels` takes every CanopyX label ([labels.md](labels.md)). `texts` takes short names for the ones people change most: `search`, `info`, `infoFiltered`, `lengthMenu`, `first`, `previous`, `next`, `last`, `page`, `all`, `empty`, `emptyReason`, `noMatches`, `loading`, `loadFailed` and `retry`. Unknown names are ignored. Placeholders are CanopyX's: `{first}`, `{last}`, `{count}`, `{total}`, `{page}`.

## The controller

The promise resolves with the grid's API ([grid.d.ts](../JavaScript/grid.d.ts), `DataGrid`) plus:

| Member | Meaning |
| --- | --- |
| `on(name, handler)`, `off(name, handler)` | Handlers by event name; `handler(detail, grid, event)`. |
| `getRows(scope)` | Records as they were given (a table row's cell texts): `"all"` in data order, `"filtered"` in the accepted order, `"page"` for the visible page. A server source returns its last loaded rows. |
| `getRow(id)` | One record. |
| `setData(records)`, `addRows(records)`, `removeRows(ids)` | Change inline rows; the sort, search, filters and page stay (the page is clamped). A server source changes on the server, then `reload()`. |
| `headerGroups` | The table's header groups. |
| `table` | The original table, or null. |
| `destroy()` | Removes the grid and puts the table back. |

Events:

| Name | When | Detail |
| --- | --- | --- |
| `init` | The first query was accepted and the grid is ready. | `{ query }` |
| `draw` | Every accepted query. | `{ query, paging }` |
| `order` | The sort changed. | `{ query, paging }` |
| `search` | The search text, the filters or the filter groups changed. | `{ query, paging }` |
| `page` | The page changed. | `{ query, paging }` |
| `length` | The page length changed. | `{ query, paging }` |
| any other | The grid's `canopyx:<name>` event: `select`, `query`, `state`, `error`, `rowActivate`, `link`, `columnResize`, `columnPin`, … | the event's detail |

Every other option of `createDataGrid` passes through: `renderers`, `actions`, `plugins`, `exportFormats`, `toolbar`, `onQuery`, `onSelect` and the rest. `view` merges further grid definition fields (`rowHeight`, `statusBar`, `toolbar`, `reporting`, `timeZone`, …) last.

## Fast first rows

Enhancing a 10,000-row table that the page already shows paints the grid's first page in about 0.2 s in Chromium and 0.4 s in Edge on a desktop, loading the parts on first use included (`tests/browser/specs/enhance-performance.spec.mjs` keeps a 1 s budget). Reading the table and building the rows is one pass; the grid renders only the visible page.

The table itself is visible while scripts load. To skip the part loading, load the part files in the page head with the runtime: `<script src="canopyx-enhance.js"></script>`, `<script src="canopyx-pager.js"></script>` and `<link rel="stylesheet" href="canopyx-pager.css">`; a part that registered itself is used at once.
