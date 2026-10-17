# Linked views

A grid or tree can follow another view on the same page: a chart, a list, another grid. The other view applies an **external filter**, which joins the reader's own filters and shows as a removable chip, or a **highlight**, which marks rows without filtering them. In the other direction, a view with `linkEvents` reports its selection and its own conditions as neutral `canopyx:linkchange` payloads that any other view can follow.

CanopyX knows nothing about the views it is linked to. A host (a page script, or a report library such as HtmlForgeX) listens to one view and calls the link methods of another. The code ships in the `link` part, which loads on the first link call, so pages without links pay for nothing beyond a few method stubs.

The `linked-views.html` example (and `linked-views-dark.html`) shows a site picker that filters a flat grid and a host-sourced grid and highlights a tree, and follows the grid's selection back.

## External filters

```js
const grid = document.querySelector("#services").canopyx;
await grid.setExternalFilter("sites-chart", { field: "site", values: ["Berlin"], sourceLabel: "Sites chart" });
await grid.setExternalFilter("latency-band", { field: "latency", range: [50, 120], sourceLabel: "Latency" });
await grid.setExternalFilter("sites-chart", null);   // removes that source's filter
await grid.clearExternalFilters();                     // removes every external filter
grid.getExternalFilters();                             // [{ source, field, values | range, label?, sourceLabel, persist }]
```

| Member | Meaning |
| --- | --- |
| `source` | Who applies the filter: 1 to 128 letters, digits, `.`, `:`, `_` or `-`. A source replaces its own filters each time and leaves other sources' filters alone. |
| `field` | A declared column; it may be hidden. On a tree, the first column's id matches the node label unless the node has a cell of that id. |
| `values` | 1 to 1000 raw values: numbers for number columns, ISO dates with a time zone for date columns, strings or booleans otherwise. One value filters with `eq`, more with `in`. |
| `range` | `[from, to]` on a number or date column, inclusive; either end may be `null`. It filters with `ge` and `le`. |
| `label` | What the chip says instead of the values, for example `"Q3"` for a date range. A labelled range's tooltip and accessible name also include its exact raw bounds. |
| `sourceLabel` | The name the chip and the announcements use, for example `"Sites chart"`. Defaults to the source id. |
| `persist` | Keep the filter in the state saved views and the remembered state store. Off by default: a link describes the page, not the reader's view. |

A source may pass an array of up to eight filters; a view takes at most 32. An invalid filter is refused with an error and nothing changes.

**How they combine.** External filters join the reader's search, column filters and filter groups with AND. Sources combine with AND as well, so a chart of sites and a chart of statuses narrow the same grid together (cross-filtering).

**Flat grids** put the predicates into their query, after the reader's own filters. An inline grid filters its rows; a host source receives them in `gridQuery.filters` like any other condition, so a server applies them with no extra code. Exports, summaries, facets and paging read the same query, so they all honour the link.

**Trees** match external filters against their loaded nodes. A node shows when it matches both the external filters and the tree's own filter (a host predicate or the declared filters); its ancestors stay as the path to it, and branches open to show the matches. A query-aware tree source keeps its declared filters in its query and the external filter is applied again to the rows of each new query; nodes it has not loaded cannot match, so a host that needs server-side filtering of a lazy tree also listens to `canopyx:externalfilter` and narrows its own data.

**What the reader sees.** One chip per source, "Filtered by Sites chart: Berlin ×", sits before the reader's own conditions on a flat grid's query line and on a line of its own under a tree's toolbar. The chip's accessible name says what it removes ("Remove the filter from Sites chart: Berlin"), and the view announces the change through its live region ("Filtered by Sites chart: 12 rows", "Linked filters removed"). The reader's controls (search, column menus, the filter editor, the Filters badge) show only the reader's own conditions; the filtered column's header keeps its filter marker. Removing the chip, or Clear all on a flat grid's query line or in its empty state, removes external filters too. The empty state's count of active filters includes them, since they are why no rows match.

**Telling the host.** Every change dispatches `canopyx:externalfilter` on the host element with `{ filters, reason }`. `reason` is `"user"` when the reader removed a chip or used Clear all, so the view that applied the filter can clear its own selection; `"api"` otherwise.

`getQuery()` returns the query with the external predicates, as the source receives it. `getState()` leaves out the ones that do not persist, and `setState`, `setQuery`, saved views and `resetView` keep the current external filters applied. The predicates always come last, so a host's `setQuery` whose filters end with them is read as carrying them; a condition the reader adds through the grid's own controls stays the reader's even when it equals an external one.

**When it shows.** `setExternalFilter` resolves `true` once the view shows the result. On a flat grid the filters commit with the query that carries them: a query that fails rejects the call and puts back the filters the grid showed, and a call a newer query replaced resolves `false` (the newer query carries the filters). A persisted filter comes back from saved state as a plain reader condition, without its chip; trees do not persist external filters.

## Highlights

```js
await grid.setHighlight(["svc-04", "svc-11"], { source: "Topology" });   // resolves with the number of keys
await grid.clearHighlight();
grid.getHighlight();                                                      // ["svc-04", "svc-11"]
```

Highlighted rows carry `data-cx-linked="true"`. The call resolves with the number of distinct keys. The stylesheet tones them with the info tone and a bar at the row start, distinct from selection; forced-colours mode draws a dashed outline instead. Keys are row ids (node ids on a tree); keys of rows that are not loaded or not in the result are kept and marked when those rows paint. Up to 10000 keys.

Unless `scroll: false`, the first highlighted row scrolls into view: a loaded row at once, an ungrouped local grid's first matching row in the complete accepted sorted and filtered result, and a loaded tree node after its branch opens (a node the reader's tree filter hides stays hidden: the filter is never cleared for a highlight). Local grids include inline and compact rows and complete datasets loaded through `CanopyX.grid` or `CanopyX.enhance`. A host-supplied query source is never asked for rows it did not send, even when its view definition says `inline`. A grid that is loading keeps the marks without scrolling. The view announces "2 rows highlighted from Topology".

## Link events

A view created with the `linkEvents` option loads the link part at once and dispatches `canopyx:linkchange` on its host element:

```js
CanopyX.configure("services", { linkEvents: true });          // before the fragment mounts
host.addEventListener("canopyx:linkchange", event => {
  const { view, action, scope, keys, values, label } = event.detail;
  // action "select": the reader selected rows; keys are their ids and values.site their distinct sites
  // action "filter": a flat grid's own eq and in conditions changed; values maps each column to its values
  // action "clear": the selection (scope "select") or the own conditions (scope "filter") became empty
});
```

| Field | Meaning |
| --- | --- |
| `view` | The view id. |
| `action` | `select`, `filter` or `clear`. |
| `scope` | `select` or `filter`: which stream the payload belongs to. |
| `keys` | Selected row or node ids (up to 10000); empty for `filter`. |
| `values` | Column id to distinct raw values: across the selected loaded rows for `select` (up to 1000 rows and 100 values per column), from the reader's `eq` and `in` conditions for `filter`. |
| `label` | A short text for another view's chip: the first column of up to three selected rows, or the filtered values. |
| `range` | On a [calendar](calendar.md#linked-views): the selected day, slots or resource's span as `{ column, from, to }` (instants on the start column, `to` exclusive), which another view can apply as a date range filter. Absent elsewhere. |

A host that links views after they mounted calls `api.startLinkEvents()` instead of passing the option.

Selecting every matching record (a query, not a set of keys) and repeating the same selection are not reported. External filters and highlights never dispatch `canopyx:linkchange`, so two views that follow each other do not echo. A selection a host sets with `setSelection` does dispatch it; a host that maps one view's selection onto another view's selection guards against its own changes.

## Single-file pages and bundles

The runtime loads the part like every other part (see [Plugins and Parts](plugins.md#parts)): from an inert payload in the page, or from `canopyx-link.js` and `canopyx-link.css` beside the runtime. `CanopyHtmlAssets.WriteTo` and `SaveHtmlBundle` write the files. No view needs the part by itself, so a single-file page asks for it:

```csharp
var options = new CanopyHtmlOptions { Document = document };
options.Parts.Add("link");
var html = grid.ToHtmlFragment(options);      // carries the link payload once for the document
```

## Labels

| Label | Default |
| --- | --- |
| `linkFilteredBy` | Filtered by {source}: {values} |
| `linkRemoveFilter` | Remove the filter from {source}: {values} |
| `linkFiltered` | Filtered by {source}: {count} rows |
| `linkHighlighted` | {count} rows highlighted from {source} |
| `linkHighlightedRows` | {count} rows highlighted |
| `linkCleared` | Linked filters removed |

The Polish, German, Spanish, French and Italian packs translate them (`CanopyLabels.LinkFilteredBy` and the rest in .NET).

## TypeScript

`LinkedView` (which `TreeGrid` and `DataGrid` extend), `ExternalFilterInput`, `ExternalFilter`, `HighlightOptions`, `ExternalFilterEvent`, `LinkChange` and `LinkValue` come from `@evotecit/canopyx`; `linkEvents` is a host option of trees and grids.
