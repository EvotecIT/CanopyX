# Live data

Rows can change while a grid is open: a stream sends new readings, a server finishes jobs, a reader elsewhere edits a
record. CanopyX applies those changes in place, without reloading the grid. The reader's sort, filters, search, selection,
focus, scroll position, an open record drawer and pending edits all stay as they are.

- **Transactions:** `addRows`, `updateRows`, `removeRows`, `setRows` and `applyTransaction({ add, update, remove })`.
- **A batched update rate:** changes that arrive within `batchMs` apply together, so a busy source does not repaint the page
  for every message.
- **A stable order:** rows keep their places while their values change. When the sort would move them, an **Order changed ·
  Re-sort** prompt appears in the toolbar instead of moving rows under the reader.
- **Flashing cells:** changed cells can flash briefly (a still outline with reduced motion).
- **Polling** with pause and resume, skipped while the page is hidden.
- **Hosted grids:** a revision-aware refresh. An unchanged revision changes nothing; a new one updates the rows in place.
- **The `canopyx:rowsChanged` event** after every change.

Live data works on every grid runtime and ships as the lazy `live` part (`canopyx-live.js` and `.css`). A grid loads it with
its first query when its view or options declare `live`, and otherwise on the first live call.

## A first live grid

```javascript
const grid = createDataGrid(element, {
  view: {
    protocol: "canopyx/2", type: "grid", id: "endpoints", label: "Endpoints", pageSize: 100, selection: "multiple", search: true,
    columns: [
      { id: "name", title: "Endpoint", kind: "text", sortable: true },
      { id: "latency", title: "Latency (ms)", kind: "number", sortable: true }
    ],
    source: { kind: "inline" }, rows,
    query: { sort: [{ column: "latency", direction: "desc" }] },
    live: { flash: true, batchMs: 250 }
  }
});

stream.onmessage = message => grid.updateRows(JSON.parse(message.data));   // [{ id, cells: { latency: 212 } }, ...]
```

The same settings in C#:

```csharp
var view = new CanopyDataGridView("endpoints", "Endpoints") {
    Live = new CanopyGridLive { Flash = true, BatchMilliseconds = 250 }
};
```

`LiveDataExample` in `CanopyX.Examples` writes `live-data.html`: an endpoint monitor fed by a simulated stream, and a job queue
that polls a simulated server.

## Changing rows

| Method | What it does |
| --- | --- |
| `addRows(rows)` | Adds complete rows. A row whose id the grid already has replaces that row. |
| `updateRows(updates)` | Merges each update into its row: `{ id, cells: { latency: 212 } }` changes one cell and keeps the others. A cell set to `null` is cleared. `tone`, `className`, `fields` and `detail` replace the row's when given. |
| `removeRows(ids)` | Removes rows by id (or by row objects). |
| `setRows(rows)` | Replaces every row of an inline grid, applying only the differences: rows the grid lacks are added, changed rows replace theirs, the others are removed. Unchanged rows keep everything. |
| `applyTransaction({ add, update, remove })` | All three at once. Removes apply first, then adds, then updates. |

Every method returns a promise of the result: `{ added, updated, removed, missing, orderChanged, newData, revision,
source }`. An update or removal of an id the grid does not have is skipped and listed in `missing`, so a stream that races a
removal keeps going. A row with an undeclared column or a value its column cannot hold rejects the whole transaction, and
nothing changes. A transaction changes at most 100,000 rows.

Clearing a cell keeps its column key with a `null` value in row data and host callbacks.

A host can also send a `gridTransaction` document, which the C# `CanopyGridTransaction` writes and `applyTransaction` accepts
as it is:

```csharp
var change = new CanopyGridTransaction();
change.Update.Add(new CanopyGridRow("ep-07") { Cells = { ["latency"] = 212 } });
change.Remove.Add("ep-12");
await hub.Clients.All.SendAsync("rows", change.ToJson(view));   // checked against the grid's columns
```

### What stays

- **Sort, filters and search.** The accepted query does not change. New rows join where the sort puts them, rows that stop
  matching the search or filters leave, and the result counts follow at once.
- **Selection.** Selected rows stay selected. On an inline grid removed rows leave the selection (a `select` event reports it),
  and an "all matching" selection follows the new count; a hosted grid keeps its selection by id, since a row it no longer
  shows may only have moved out of the loaded pages.
- **Focus.** The focused row keeps focus as it changes; when it is removed, focus moves to the row that takes its place.
- **Scroll position.** The row at the top of the view stays where it is, also when rows arrive above it. A grid scrolled to
  its very start, without focus inside it, shows new rows that sort to the top.
- **An open record drawer.** It paints the record again with its new values and at its new place (so previous and next stay
  right), keeping its tab. When the record is removed, the drawer stays open with the last values, previous and next turn
  off, and a screen reader hears "This record was removed."
- **Pending edits.** Values the reader changed but has not saved stay on top of the new data, and an open editor stays open.
- **The page** of a paged grid, unless rows were removed until the page no longer exists.

Conditional formatting re-evaluates the changed rows (and the bounds of data bars and colour scales), and search
highlighting counts and marks again.

## The batched update rate

```javascript
live: { batchMs: 250 }
```

With `batchMs`, changes wait up to that many milliseconds and apply together. Later changes to a queued row merge with it (an
update after an add becomes part of the add; a removal cancels earlier changes), and every call's promise settles with the
result of the batch it joined. `getLiveState().pending` counts the queued rows; `flushTransactions()` applies them at once.
Without `batchMs` (the default) each change applies as it comes.

## The stable order

By default (`stableOrder: true`) a row whose sort keys change keeps its place. The grid marks the order as changed and the
toolbar shows **Order changed** with a **Re-sort** button; a screen reader hears the prompt once. Re-sort (or `resort()`)
moves the rows to their sorted places, keeping selection, focus and the open drawer. Any new query (another sort, search or
filter) also starts from the sorted order.

Membership is always exact: new matching rows go where the sort puts them, and rows that stop matching leave. Only rows that
are already shown keep their places.

`stableOrder: false` moves a changed row to its sorted place at once. A grid without a sort orders rows by id, so its order never
changes.

Views whose rows are projected into groups, summaries or detail rows (reporting grouping, aggregates, detail rows) run their
query again after a change; the open drawer stays open and the scroll position and the focused row are restored.

## Flashing cells

```javascript
live: { flash: true }                    // 1.2 seconds
live: { flash: { durationMs: 600 } }     // 100 to 10,000 ms
```

Changed cells, and every cell of a new row, show a tint that fades out. With reduced motion they show a still outline for the
same time; in forced colours, a system-colour outline. Flashing never changes the data or the order, and an inset tint keeps
pinned cells opaque.

## Hosted grids

A hosted grid's rows live with its source. `refreshRows()` asks the source again for the pages the grid holds (the first page,
and the pages the reader sees, at most four requests) without a revision:

- an unchanged revision changes nothing;
- a new revision replaces the rows in place, keeping the reader's place, and the grid reads further pages at that revision;
- with the stable order, when the rows the reader sees would change places, they keep their places with their new values and
  the prompt offers Re-sort. Re-sort, or scrolling to rows the grid has not loaded, shows the new order.

A cursor grid (`navigation: "cursor"`) checks its first page: a newer revision shows **New data** with **Refresh**, which reads
the first page again.

`applyTransaction` with `update` changes the loaded rows of a hosted grid in place, for a host that pushes changes (a socket, a
server event stream). Rows are added to and removed from a hosted grid at its source, which then answers `refreshRows()` with a
newer revision; `addRows` and `removeRows` reject on a hosted grid. When an update touches a sorted or filtered column, the
prompt offers Re-sort, which refreshes from the source.

The .NET adapter already answers revisions (`options.Query.Revision`, see [remote-dotnet.md](remote-dotnet.md)); a
`CanopyRemoteScript` page gets polling by setting `PollMilliseconds` on the view's `Live`.

## Polling

```javascript
live: { pollMs: 5000 }                   // in the view, or C# Live = new CanopyGridLive { PollMilliseconds = 5000 }
const poller = await grid.poll({ intervalMs: 5000, immediate: true });
poller.pause(); poller.resume(); await poller.refresh(); poller.stop();
```

A poll is a hosted grid's `refreshRows()`, or an inline grid's load function:

```javascript
createDataGrid(element, { view, live: { pollMs: 10000, load: async ({ signal }) => (await fetch("/rows.json", { signal })).json() } });
```

`load({ signal, query, rows })` answers complete rows (a full replacement, as `setRows`), a transaction, or nothing. A poll
is skipped while the previous one runs and while the page is hidden; when the page shows again, a poll that came due runs
at once (`pauseWhenHidden: false` keeps polling). `refresh()` polls now, also while paused or hidden. Errors are reported through the grid's `error` event and polling goes on.
Manual refreshes and polls load and apply their answers in request order. An API update requested while a load is pending
applies after that answer.
Destroying the grid stops it; `getLiveState().polling` tells whether a poller runs.

## Events

`canopyx:rowsChanged` (and the `onRowsChanged` option) follow every change that did something:

```javascript
element.addEventListener("canopyx:rowsChanged", event => {
  const { added, updated, removed, missing, orderChanged, newData, revision, source } = event.detail;   // source: "api", "poll" or "refresh"
});
```

An accepted hosted revision also raises this event, so complete-source consumers such as facets can refresh even when the
held rows have the same cells. Its identity arrays describe observed changes; they can be empty when membership or values
changed outside the loaded pages. Refreshing an unchanged revision raises no event.

## Options

| Field (`live`) | C# (`CanopyGridLive`) | Default | Meaning |
| --- | --- | --- | --- |
| `stableOrder` | `StableOrder` | `true` | Keep rows in place when their sort keys change; offer Re-sort. |
| `flash` | `Flash`, `FlashMilliseconds` | off | Flash changed cells (`true`, or `{ durationMs }`). |
| `batchMs` | `BatchMilliseconds` | `0` | Apply changes arriving within this time together (0 to 60,000). |
| `pollMs` | `PollMilliseconds` | `0` | Poll every this many milliseconds (250 to 86,400,000; 0 for none). |
| `announce` | `Announce` | `true` | Announce added and removed rows, at most every two seconds. |
| `pauseWhenHidden` | `PauseWhenHidden` | `true` | Skip polls while the page is hidden. |
| `load` (option only) | | | An inline grid's source of fresh rows for `refreshRows` and polling. |

The host's `live` option overrides the view's settings field by field; `live: true` turns live data on with the defaults, and
`live: false` keeps the view's settings (its polling, for example) from applying, while the live methods still work.

## Accessibility

The prompt sits in the toolbar, before Export and More in the Tab order, with a Re-sort button whose description is the
prompt's text; on phones it keeps a 44 pixel target and the words stay for screen readers. A polite live region announces the prompt once, re-sorting, a removed open
record, and added and removed rows (coalesced, at most every two seconds; updates alone are not announced, so a stream does
not flood a screen reader). Flashing is never the only signal: the values themselves change, and the result count follows.

## Enhanced tables and simple setup

Controllers of `CanopyX.enhance` and `CanopyX.grid` own their records: change them with the controller's `setData(records)`,
`addRows(records)` and `removeRows(ids)`, which keep the sort, search, filters and page. The grid's own transactions reject
on these grids, because the records belong to the controller's source.

## Labels

`gridLiveOrderChanged`, `gridLiveResort`, `gridLiveNewData`, `gridLiveRefresh`, `gridLiveOrderHint`, `gridLiveChanged`,
`gridLiveSorted` and `gridLiveRecordRemoved` (`CanopyLabels.GridLive…`), with Polish, German, Spanish, French and Italian
translations.
