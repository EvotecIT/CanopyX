# CanopyX Data Protocol (`canopyx/2`)

Grid columns optionally declare `wrap` and `maxLines` (integer 1–12, default 2).
Wrapped columns enable measured rows, as do `autoRowHeight: true` and
`rowHeight: "auto"`. Explicit JavaScript `autoRowHeight: false` keeps a fixed
one-line preview. Cards reserve a label line and up to two whole value lines.
Clamped text retains its full
tooltip and the record drawer shows complete text. Settings belong to the view,
so hosts can give two views over the same records different line limits.

Columns may supply `headerDescription` (`CanopyColumn.HeaderDescription`) as the
full header tooltip and accessibility description while `title` remains the
visible label. Without it, the tooltip uses the title. Flat-grid header labels
show at most two lines. Wrapped `longText` previews use the existing record
drawer for complete reading, without an inline expansion button. An explicit
cell `{ "value": null, "text": "" }` stays blank; an absent value without an
explicit display text keeps the missing-value marker.
Record-only wrapped fields also accept `maxLines` (1–12, default 2); their
authored preview limit stays separate from full grid-column text in the drawer.

Text columns may declare `valueLabels` (raw token to authored display label),
`valueOrder` (unique raw tokens in ascending order), and `valueTones` (raw token
to semantic tone). Each supports at most 512 tokens of at most 4096 characters.
These declarations target string tokens. Boolean values in text columns keep
their own labels, tones and typed identities; string `"true"` does not match boolean `true`.
Labels appear in cells, filter choices, group headings, the drawer, and display
exports. Predicates, group identities and raw exports retain raw tokens.
Declared order takes precedence over reporting text order and cell sort keys:
declared tokens precede unknown tokens, which sort by ordinal UTF-16 text.
Descending reverses value order; null stays last in either direction. Hosts
author localized labels in their chosen culture; CanopyX does not translate them.
Tree siblings use the same declared ordering before inline paging and when
exporting nodes that have not loaded. Category and numeric tones apply to default
tree and grid cells, scalar record fields and static tables. A host renderer
that handles a cell retains control of its presentation.
Nonempty `valueLabels` or `valueOrder` opts text into exact category-token
predicates and facet identities: `A` and `a` remain independent. Unconfigured
text keeps its existing case folding. Quick search and searching displayed
filter labels remain case-insensitive. Remote database hosts must preserve the
same raw-token distinction with a suitable store collation or query translation;
CanopyX's queryable provider leaves opted-in text operands unfolded.

Number columns may declare up to 32 ordered `numericTones` rules:

```json
{"id":"days","title":"Days remaining","kind":"number","numericTones":[
  {"operator":"below","value":0,"tone":"danger","label":"Overdue"},
  {"operator":"atMost","value":14,"tone":"warning","label":"Review soon"},
  {"operator":"atLeast","value":30,"tone":"success","label":"Time available"}
]}
```

Operators are `atMost` (≤), `atLeast` (≥), `below` (<), and `above` (>), with a
finite numeric threshold. The **first matching rule wins**, including its tone
and label: place the negative rule before `atMost: 14` to distinguish overdue
values. A rule colors plain numeric text without adding a filled chip. Its label
appears in the tooltip and drawer; the number remains numeric in captures and
XLSX-provider input. CSV never substitutes threshold words for the number.
Unmatched values retain their cell tone; null never matches. Rule tones take
precedence over cell tones. Host renderers remain authoritative, and filters
and sorts keep the raw number.

This is the wire format between hosts and the CanopyX browser runtime. The C# types in the `CanopyX` package write it; the runtime in `CanopyX.Html` reads it. A host that is not .NET can produce the same documents by hand. The JSON schema is [schema/canopyx-2.schema.json](schema/canopyx-2.schema.json).

Flat grids optionally declare `density` (`compact`, `default`, `comfortable`) and `zebra` (boolean, default false). Density supplies spacing; the required numeric wire `rowHeight` remains authoritative. The .NET writer resolves an unassigned height to 28, 34 or 42 pixels respectively. These optional fields remain in `canopyx/2`. Optional `autoHeight` (default true) makes a grid whose rows all fit exactly as tall as its chrome, header and rows; the host height stays the bound for longer results, and `false` keeps a fixed-height panel. Optional `rowAction` (`none`, the default, `details` or `link`) chooses what a plain row click does: nothing beyond focus, opening the record details, or following the first link in the row with its modifier keys. A plain click never selects.

## Versioning

Every top-level document carries two fields:

```json
{ "protocol": "canopyx/2", "type": "view" }
```

- `protocol` is `canopyx/2` for every document described here. The runtime rejects a document with another value and reports it, instead of guessing.
- Optional fields may be added within `canopyx/2`. Readers ignore fields they do not know, so a document from a newer writer still loads.
- A change that would break an existing reader (removing or renaming a field, changing its meaning or type, making an optional field required) needs a new protocol version.
- The schema lists every field of the current revision and rejects unknown ones, so it doubles as a check on writers. Update it in the same change that adds a field.

Version 2 introduces packed child pages and the word/posting search index with separate entry files. Version 1 readers cannot consume those references or search documents. Regenerate bundles with the version 2 writer and deploy the matching browser runtime together. The runtime rejects version 1 documents explicitly.

## Documents

| `type` | Written by | Read when |
| --- | --- | --- |
| `view` | `CanopyTreeView.ToJson()`, or `CanopyTreeView.WriteJson(stream)` for the same bytes without the whole string | The page loads; it defines columns, behavior, the data source, and inline nodes |
| `grid` | `CanopyDataGridView.ToJson()` | A flat-grid definition supplies columns and inline rows or a host source |
| `gridPage` | `CanopyGridPage.ToJson()` | A host supplies a revisioned page of ordered matching rows |
| `gridQuery` | `CanopyGridQuery.ToJson(view)` | A host receives a typed query and requested result window |
| `gridRangeQuery` | The browser; `CanopyGridRangeQuery.ToJson(view)` | A calendar or timeline asks a host for the records that overlap a period ([Date ranges](#date-ranges)) |
| `gridRangePage` | `CanopyGridRangePage.ToJson(view)` | A host answers a range request with the overlapping records in start order |
| `gridCommit` | The editing part | A grid asks its writer to save changed rows ([Editing and commit](#editing-and-commit)) |
| `gridCommitResult` | The host's writer | The writer answers per row: saved, error or conflict |
| `gridRecordQuery` | The browser; `CanopyGridRecordQuery.ToJson()` | A record's drawer opens and its details load on demand ([Record details](#record-details)) |
| `gridRecord` | `CanopyGridRecord.ToJson(view)` | A host answers a record request |
| `gridRecordPack` | `CanopyRecordSidecar.Write` | A record's drawer opens and its details are in a record pack beside the page |
| `gridTransaction` | `CanopyGridTransaction.ToJson(view)` | A host sends rows to add, update or remove to an open grid ([Live data](#live-data)) |
| `matrix` | `CanopyMatrix.ToJson()` | A status matrix: two axes of items, states, one string of state digits per row and sparse notes ([matrix.md](matrix.md#the-document)) |
| `diff` | `CanopyTextDiff.ToJson()` | A text diff of one file: hunks as unified-diff lines, or both texts for the browser to compare ([changes.md](changes.md#the-text-diff)) |
| `changes` | `CanopyChangeList.ToJson()` | A change list: changed files or items with versions, flags, facts, diffs and actions ([changes.md](changes.md#the-change-list)) |
| `propagation` | `CanopyPropagation.ToJson()` | How one change reached its replicas: a state, first and last sighting per replica ([changes.md](changes.md#the-propagation-view)) |
| `page` | `CanopyPage.ToJson()`, bundle writer | A node opens, or the user asks for more children |
| `search` | `CanopySearchResult.ToJson()` | A remote search endpoint answers |
| `counts` | `CanopyCounts.ToJson()` | A live host refreshes counts and rollups without reloading rows |
| `manifest` | Bundle writer | A sidecar view loads; it points at the first top-level page and describes the packs and the search index |
| `pack` | Bundle writer | A node opens whose children page is stored in a pack file next to the pages of other nodes |
| `searchShard` | Bundle writer | A sidecar search needs the words that start with a prefix |
| `searchEntries` | Bundle writer | A sidecar search needs the nodes its matches refer to |

All documents are UTF-8 JSON. The C# writer escapes `<`, `>`, `&`, U+2028, and U+2029 as `\u` sequences, so a document can sit inside an HTML `<script>` element unchanged. Hosts writing documents by hand must do the same before inlining one. The C# writer also escapes the backtick, and a `$` that is followed by `{`, so a document can sit inside a JavaScript template literal unchanged (see [Packs](#packs)).

## Flat Grid Documents

Flat grids use their own document types, without parents, child references, or a special tree column. Existing tree documents and readers retain their contracts. A host uses a grid-capable runtime to consume `grid` and `gridPage` documents; a tree-only runtime does not reinterpret them as trees.

### Column defaults, ordering hooks and footer rows

Flat grids accept `columnDefaults`, an ordered list of rules with `targets` and optional column settings. Selectors are `*` (every column), `#id` (the exact column identity), `.class` (an authored class token), or `index:N` (zero-based declaration position). Each setting comes from the first matching rule, then an explicit column property overrides it. Selectors match the authored columns; a class added by a rule does not change which later rules match.

Columns accept `className` (space-separated CSS class tokens), `alignment` (`start`, `center`, `end`), `orderData` (one or more raw column identities), `orderSequence` (a nonempty cycle drawn from `asc`, `desc`, `none`) and `sortComparator` (a named plugin comparator). An explicit null class/alignment/comparator clears an inherited setting; empty `orderData` or `orderSequence` restores the built-in behavior. Class and alignment apply to headers, record cells and footers. `orderData` changes the raw keys of that column's sort without changing the visible sort indicator. `preSort` is an ordered list of fixed `{column,direction}` keys that lead every reader query. Grouping keys retain their existing priority and raw-value grouping semantics.

The optional `grid-options` part implements query hooks and footer rendering. Plugins register `filterOperators` and `sortComparators` maps. A filter receives `(rawValue, operands, {column, signal})` and returns a boolean; a comparator receives `(leftSortValue, rightSortValue, {column, signal})` and returns a finite number for ascending order. Names are a lowercase letter followed by up to 31 ASCII letters or digits. Built-in filters cannot be replaced. Custom filters use one non-null operand and can occur in flat or nested filter groups. Missing sort values remain last in both directions. Hooks are scoped to the grid's resolved plugins. A host source owns its server equivalents and receives the accepted query; browser hooks never silently filter one cached server page.

`footers` contains at most 16 rows with unique `id`, a plain-text `label`, `scope` (`page` or `all`) and up to 32 existing [aggregate descriptors](#flat-groups-and-complete-query-totals). `page` means the visible page of matching records; `all` means every matching record after filtering. A continuous grid has one matching result rather than visible pages, so both scopes cover it. Counts ignore missing values, numeric operations use raw number cells, empty numeric inputs yield null, and custom operations reuse the plugin `aggregates` extension point.

```js
view.footers = [
  { id: "page", label: "Current page", scope: "page",
    aggregates: [{ id: "cost", column: "cost", operation: "sum", label: "Cost" }] },
  { id: "total", label: "All matching records", scope: "all",
    aggregates: [{ id: "cost", column: "cost", operation: "sum", label: "Cost" }] }
];
```

A host `gridPage` can supply `footerValues: {rowId: {aggregateId: numberOrNull}}` for its accepted revision and window. The browser computes built-in page values only when the returned records cover that entire scope. An unavailable full-result or custom server value is shown as unavailable; cached records never stand in for a complete result. Footer rows require offset navigation. The script-free fallback renders footer text and supplied values as part of its table, using inline alignment styles.

Fixed grouping accepts an optional, nonblank `headerTemplate` of at most 512 characters with `{column}`, `{value}` and `{count}` tokens. The result is plain text in browser group headings. Markup is never interpreted; unknown tokens remain literal text. The static fallback does not render group headers.

### Export, clipboard and record details

Prepared exports retain an immutable request and a fresh `rows({ signal })` factory. `request.recordCount` is the exact captured scope count (including selected-query exclusions), or null when unknown. Each enumeration links its signal with the invocation signal, requests serial pages from the captured revision and validates counts, unique record identities and cursor transitions. The host export event includes `capture`, the already-prepared export, as well as `request`, `signal` and reporting progress. A host can pass this capture directly to a format writer without rebuilding queries.

`GridExportCell` carries both `value` and resolved `text`. Datetime values preserve the original ISO string, explicit time zone and fractional precision; the .NET writer emits UTC seconds or milliseconds. A format adapter must preserve or explicitly reject precision beyond its typed representation. Raw CSV retains the original value, while display CSV uses captured text.

The ordinary runtime marks `request.presentation` as `text`. The optional reporting runtime marks it as `semantic` and resolves first-match row/cell highlight precedence, presenter display text and tone, and safe absolute HTTP(S)/mailto links. Semantic columns include presenter descriptors, wrapping/alignment intent and width bounds explicitly measured in `css-px`. Hosts translate semantic tones into a supplied output palette and CSS pixels into format-specific width units. CanopyX does not infer output colors from CSS or treat a custom DOM renderer as an export renderer. Diagnostics identify custom renderers/classes, badges, histories, partial text coloring and unsupported links; strict adapters reject unsupported presentation unless the caller explicitly selects text-only output. A nonzero change delta carries `partial-tone` because only its marker has a good/bad color, which a whole-cell tone cannot preserve. Relative/offline links need an explicit host delivery-base policy.

Export rows are records. Group headings, collapsed display ranges and summary rows are not fabricated as records. Each enumeration reads fresh serial windows without materializing the result, but duplicate-ID and cursor-token checks retain identity state proportional to the enumeration. Total pipeline memory is therefore not constant. Client text exports and materialized print snapshots keep their documented limits; large exports use a host writer.


A later UI query does not change an export already prepared. A source must continue to serve its captured revision or reject it. Counts, duplicate identities and revision changes fail the export rather than silently mixing data.

Choose `filtered` for the accepted search and predicates, `selected` for selected stable IDs across the full dataset, or `all` for the full dataset. All three retain the accepted sort order. Selected and all exports clear search and predicates; a selected ID absent from that revision is an error. Columns default to visible exportable columns in their current order, or an explicit ordered list of declared exportable IDs. An explicit request for a column with `exportable: false` is rejected; when no visible column supports export, the menu disables delivery actions and explains why. `values: "display"` retains display text and date formatting; `values: "raw"` exports underlying typed values. The request's `matched` records the accepted filtered count even when its effective export query clears the filters.

`await grid.toCsv({ scope })` produces CSV with quoted fields and spreadsheet formula protection for text. The client limit is 50,000 rows by default; exceeding it fails without truncation. `await grid.copy({ scope })` produces tab-separated text with a default 10,000-row limit and rejects unavailable or denied clipboard access. Clipboard delivery observes cancellation, destruction and the configured host deadline; a write already handed to the browser may still finish after the operation is retired. Ctrl/Command+C copies selected records, or the focused cell or row when there is no selection; native controls and selected text keep their copying behavior.

For large Office exports, configure `onExport` and call `grid.exportToHost("xlsx", { scope })`. The host receives the immutable request and a cancellation signal, and owns authorization, query replay, document generation and delivery. CanopyX does not load an Office engine or materialize the result first. Source requests have the `requestTimeoutMs` deadline (30 seconds by default) per page; the `onExport` hook is a writer and runs under the separate export safety timeout, `exportTimeoutMs` (600,000 ms by default, 1 to 2,147,483,647, or `timeoutMs` per call). Caller cancellation and grid destruction settle operations even when a source or hook ignores its signal.

#### Export formats

An export format is a browser writer `{ id, label, extension, mime?, showInMenu?, values?, write(capture, context) }`. `id` is 1–32 lowercase ASCII letters, digits and hyphens starting with a letter; `csv` is reserved for the built-in CSV. `label` is the Export menu button text, `extension` 1–16 ASCII letters or digits without a dot, and `mime` the type given to bytes a writer returns (default `application/octet-stream`). Optional boolean `showInMenu` defaults to `true`; `false` omits the provider's menu button while keeping it callable through `exportAs`, for hosts with their own controls. Optional `values` (`raw` or `display`) supplies the writer's capture default; a call's explicit value wins. `write` returns a `Blob`, an `ArrayBuffer` or typed array, or a promise of one. `CanopyX.registerExportFormat(format)` (also a named module export) registers a format for the page, replacing an earlier one with the same id, and returns a disposer for this registration; invalid formats throw.

Explicit `exportFormats: ["xlsx", "pdf"]` enables the lazy offline OfficeIMO writers and the flat-grid Print menu action.
The equivalent C# opt-in is `CanopyExportFormats.Office()`. These writers do not register themselves for every view. Host,
plugin and global providers take precedence. The document engines ship only in `canopyx-office-export.js`, outside base bundles;
single-file C# output carries their inert payload only when the view opts in. See [export formats](authoring.md#export-formats).

A grid offers, in this order: the host's `exportFormats` option (ids of registered formats and provider objects; an empty array offers none), else the view's `exportFormats` (ids only), else every registered format in registration order. An id nobody registered is skipped, so a view may declare formats a page provides only sometimes. Optional view field `exportFormats` (flat grids and trees) is an array of unique format ids; the C# `CanopyDataGridView.ExportFormats` and `CanopyTreeView.ExportFormats` write it. The Export menu lists the formats after Download CSV and before Copy, resolving them each time it opens, and runs them with its scope picker, progress, Cancel export action and status. `grid.exportAs(id, { scope, columns?, values?, signal?, onProgress?, timeoutMs?, download? })` runs one from host code.

`exportAs` captures synchronously, exactly as `prepareExport` with the same scope, columns and values, so invalid capture options throw before a promise is returned (as `toCsv`, `copy` and `exportToHost` do); an unknown format, invalid writer options or an invalid `timeoutMs`/`exportTimeoutMs` reject the promise when the writer would start; the reporting runtime's `fileName`, `locale` and `timeZone` options apply as well. The writer receives that capture (its `rows()` reads count toward progress) and a frozen context: `signal`, `fileName` (the suggested basename: the reporting file name, else the view id with characters outside `A–Z a–z 0–9 _ -` replaced by `_`), `format` (the id) and `progress(completed)`. Progress reports `reading` while records are read, `generating` when reading finishes or the writer reports written records, and `ready` at the end, with `total` the captured `recordCount`. Phases and counts only advance (a count is capped at a known total); a report that advances nothing, or a writer count that is not a nonnegative integer, is dropped. The signal aborts on cancellation, the export timeout and grid destruction; the export then rejects with an `AbortError` (or "CanopyX: export timed out.") even when the writer ignores it, and a later result is discarded. The file name is the name of a returned `File`, else `fileName + "." + extension`. With `download` not false CanopyX downloads the file; the promise resolves to `{ blob, fileName, format }`.

Tree grids on every runtime offer `prepareExport({ scope?, columns?, values?, signal? })` and `exportAs(id, options)` with the same writers, the `exportFormats` and `exportTimeoutMs` options, and the same Export menu (scopes Visible rows, Selected rows and All rows, Download CSV, the formats, progress, Cancel export and status). They come with the tree tools part, so they work once the tree's `ready` has resolved. Scope `visible` (the default) captures the rows the reader can see in display order, without loading, status or detail rows; `selected` captures the loaded selected nodes in tree order, including those in collapsed branches; `all` captures every node in the current sort order: the whole tree of an inline source, collapsed branches included, and the loaded nodes of a sidecar or remote source (nodes a lazy source has not loaded are not read). Columns default to the shown columns in their current order, including columns hidden only for width. Tree CSV indents the tree column by two spaces a level. The request carries `kind: "tree"`, `scope`, `presentation: "text"`, `values`, `revision` (the accepted dataset revision or null), `recordCount`, `columns`, `locale` and `timeZone`. Each record is `{ id, level, path, cells }`: `level` 1 is a root, `path` is the id path from the root ending with the record's id, and each cell has `value`, the display `text` and `tone` when the cell declares one. The capture holds the rows and their node data at invocation; enumeration formats them and observes the grid's lifetime and the linked signals.

Every runtime loads the Export menu body, CSV, copy, record enumeration and writers from the companion `canopyx-export.js` on first use (inline payload type `application/x-canopyx-export`, or the plain or content-hashed file beside the runtime). First use is the Export menu opening, an export method (`toCsv`, `copy`, `exportToHost`, `exportAs`, reporting `materializeExport` and `print`), Ctrl/Command+C on the grid, or the first read of a capture's `rows()`. Tree captures are in the tree tools part (see [View](#view)); a tree loads this part for its Export menu and writers. Hosts that serve runtime files therefore serve `canopyx-export.js` beside them, also when the Export menu is switched off. The methods are available before it loads; they capture first and complete once it is installed.

The reporting runtime also captures `fileName`, `locale` and an optional `timeZone` override in an export request. A file name is a suggested basename of 1–100 UTF-16 units, without paths, controls, bidi overrides, trailing dots/spaces or reserved Windows device names; hosts append a format extension. A locale must be supported by the browser. These options affect this delivery, without changing the view. Display exports use the captured locale and time zone; raw exports keep typed values. The optional synchronous `onProgress` callback receives `phase` (`reading`, `generating`, `ready`), `completed` records and `total` records or `null` when unknown. Selected-query totals account for exclusions. A callback that throws rejects its operation.

`await grid.materializeExport({ scope, maxRows: 1000 })` on the reporting runtime reads a complete immutable `{ request, rows }` snapshot for a host renderer. The maximum is 10,000 records and 4 Mi UTF-16 units of serialized snapshot text. Known oversized results fail before fetching; unknown counts are bounded during enumeration. An oversized result is an error, never a truncated successful report. Every flat grid offers `await grid.print({ scope })` with those same bounds. It renders a script-free static table with repeating headings, captured group headings and totals, or stacked records with literal card templates. An optional `onPrint({ snapshot, signal, layout })` hook replaces the default renderer and delivery; `layout` is `stacked` for cards and `table` otherwise. Print honors cancellation before delivery and removes its temporary frame afterwards. It reads the captured query/revision and columns; collapsed groups and the mounted viewport do not change its record scope. Large reports use `exportToHost` so the host can stream without browser materialization.

Reporting export columns retain their fitted CSS-pixel width in `width.preferred` and their effective `pinned` state (`left`,
`right` or `null`). The request also captures the current `formatRules` and an ISO UTC `generatedAt` instant. These values are
immutable at invocation, alongside column number formats, semantic links, grouping ranges and full-query totals.

Export controls expose progress and cancellation for CSV, copy, export formats and, on the reporting runtime, an optional host print action; CSV and copy report record progress on the reporting runtime. Hosted Office generation receives an optional `reportProgress(phase, completed)` callback; its counts and phases must advance monotonically. Retired callbacks cannot update UI after cancellation, timeout or destruction. Offline reports retain bounded CSV/copy, and may link host-prepared Office files or script-free print artifacts. An offline report does not imply that an HTTP export service exists.

Enter on a row, double click, the Record details overflow action, and Ctrl/Command+Enter open a record drawer. F2 enters cell navigation. The built-in drawer shows every declared field (except columns with `drawer: false`) as its cell shows it: its presenter, its host or plugin renderer, or its text with tone, tooltip and badges; a view's [record panel](#record-panel) structures it further. It supports previous/next records with Up/Down, and restores focus when Escape closes it. Its title is the identity column's text; its subtitle is that column's secondary text (a cell's `secondary`, or the presenter's `secondaryColumn`), and without one the drawer has no subtitle (it never shows the raw row id). Focus moves to the title; its focus ring shows when the drawer was opened from the keyboard, not by pointer. It docks beside the grid on wide screens and becomes a modal full-screen sheet on phones. Configure `onDetails` to supply a host-owned record view instead; its context retains an immutable raw row, accepted query, cancellation signal and `returnFocus`. A newer details request or query cancels an unfinished opening operation. Hosts own their completed view and focus restoration. On phones a plain row click also opens the drawer.

Row activation (a double click, Enter on a focused row, Ctrl/Command+Enter in a cell, and a plain click when `rowAction` is `details` or `link` or on a phone) first dispatches the cancelable `canopyx:rowActivate` event on the host element with `{ id, row, keyboard }` (`row` a frozen copy of the loaded record, `keyboard` true for Enter) and calls the `onRowActivate(detail)` option. Calling `preventDefault()` on the event, or returning `false` from the callback, keeps the row's own action (the drawer or `onDetails`, or the row's link) from running, so a host can open its own drawer for the row; otherwise the action runs as before. The Record details action, the phone "+N" button and `openDetails(id)` open details directly. On a row whose `rowAction` is `link`, Enter follows the link like a click (Ctrl/Command+Enter still opens details). Trees offer the same activation hook (see [View](#view)).

Following a link presenter cell (a click, Enter on the link, or the row's link action) first dispatches the cancelable `canopyx:link` event on the host element with `{ id, row, column, href }` and calls `onLink(detail)`. Cancelling the event or returning `false` keeps the browser from following the link, so a host can route an address of its own (an entity link inside a report, for example) without matching resolved URLs. Trees have no link presenter, so they send no `canopyx:link`.

Linked views add two events on grids and trees ([Linked views](linked-views.md)): `canopyx:externalfilter` with `{ filters, reason }` whenever another view's external filters change (reason `user` when the reader removed one), and, on a view created with `linkEvents`, `canopyx:linkchange` with `{ view, action, scope, keys, values, label }` for the reader's selection and own conditions. External filters reach a host source as ordinary `eq`, `in`, `ge` and `le` predicates after the reader's own `filters`; the wire format does not change.

A `grid` definition contains `id`, `label`, `rowHeight`, `pageSize`, `selection`, `search`, `columns`, and `source`. Column definitions and cells have the same value, display text, tooltip, tone, and badge contract as tree views. Any column can start hidden, but at least one must remain visible. Flat-grid definitions do not expose tree edit proposals. Optional `stateKey`, `timeZone`, and `labels` retain their shared meanings.

Flat-grid columns can declare `filterable: false` or `exportable: false` (C# `CanopyColumn.Filterable` and `Exportable`); both default to true and the C# writer emits only false overrides. A non-filterable column stays visible and available in the record drawer, but does not appear in filter controls and is rejected in flat or nested query predicates. Search, supported read-only facet enumeration, formatting, highlights and direct cell access keep their own contracts. Exportability governs grid export captures, including CSV, selected-record copy, format writers and print snapshots; it is an operation capability, not a way to conceal values already supplied to the browser. Trees retain their existing column contract.

Optional `toolbar` switches toolbar controls off: `{ "filters": false, "columns": false, "views": false, "export": false, "more": false, "count": false, "columnMenus": false }`, each optional and boolean. An absent switch keeps its control. A control switched off is removed: it is not built, or is taken out before the grid appears, so no hidden element, focus stop or listener of it stays in the page. The matching API methods stay available. `more` covers host actions, Record details and Print: with it off those entries are dropped, and the reporting runtime's print hook is reached through `api.print()`. With `export` off, a reporting grid that has an `onPrint` hook keeps a Print entry in the more menu for the filtered result. `count` is the result count shown with the query chips; `columnMenus` is each header's column menu button (switched off, column fitting keeps no room for it; an active header filter keeps its button, and readers start filters from the Filters menu); `views` includes Reset view; with `filters` off, header filters keep working and a condition too complex for its column popover is removed through the query chips. The search box keeps its own `search` property. Browser hosts can override any switch, including `search`, with the `toolbar` option of `createDataGrid`; `toolbar: false` still hides the whole toolbar. The runtime rejects an unknown switch name or a non-boolean value in either object.

Optional `presentation` is `continuous` (the default) or `paged`. `pageLength` is the visible page length from 1 to 10,000, defaulting to 50. `pageSize` remains the independent source fetch size. Both presentations filter/sort the full source, retain global row indices and use the same selection, revision and export contracts. Paged presentation bounds the shared virtual viewport to one page; neither cached adjacent records nor retained focus can render outside that page.

Optional `pager` changes a paged view's pager: `lengths` (page-size choices in menu order, at most 16: integers from 1 to 10,000, `"all"` for every row of inline data, or `{ "value", "label" }`), `lengthMenu` (boolean, default true), `numbers` (numbered page buttons, 0 or 5 to 15, default 0), `pageInput` (boolean; absent shows the page number field unless numbered pages show), `firstLast` (boolean, default true) and `info` (`range`, the default, `sentence` or `none`). The browser reads it with the pager part; continuous views ignore it, and an absent object keeps the built-in pager. See [paging.md](paging.md).

The source's optional `navigation: "offset"` makes its known-count offset capability explicit; absent preserves the original offset contract. Offset sources support arbitrary offsets and exact `total`/`matched` counts. A hosted paged view can instead declare `navigation: "cursor"` and use the sequential documents below. Hosts own database traversal; CanopyX takes no database dependency.

`goToPage(index)` uses a zero-based page index and clamps to the last accepted page. `setPageLength(length)` retains the prior first-record position within the new page boundaries. Queued search input is accepted before navigation and starts from the first page. Counts/range/length remain accepted state while a replacement loads or fails. A fresh nonzero offset query first obtains current counts from offset zero, then requests its clamped page using that revision. Filtering controls reset to zero. Empty results display `0–0 of 0 rows`.

Paged version-1 browser state adds optional `paging: { pageLength, offset }`, separately from the revision-free query and page-relative `scrollTop`. Older snapshots restore the definition's page length and first page; saved offsets clamp against refreshed results. A paged snapshot restored into a continuous definition translates the page offset and relative scroll into a global position, bounded by the restored result. Row navigation crosses page boundaries before restoring row/cell focus. `scrollToRow(index)` returns `Promise<void>`; hosts that need navigation to finish await it. Row positions refer to the accepted query: navigating across pages retires pending search text without applying it, while unfinished IME composition remains available to complete. Hosts may hide both built-in toolbar and pager with `toolbar: false` and use the same controller to compose their controls. Query-backed export remains independent of presentation and visible page.

#### Row and cell highlight rules

`gridRow` accepts optional `tone` and `className`. Tones use the existing named `--hfx-color-status-<name>-fg` system and set `data-cx-tone` on the row for host styling. Classes contain visible text, at most 1,024 UTF-16 units, and no controls. By default a row tone draws nothing and never colours the row's cells: the coloured bar at the row start is reserved for the selected row, and cells carry colour only through their own `tone`. Optional view-level `rowAccents: true` restores the bar for row tones.

Optional `highlightRules` holds at most 64 ordered rules with the same `column`, `operator` and `values` as a grid filter, plus `tone` and/or `className`. `target` defaults to `row`; `cell` means the condition column's cell. Operators, operand arity, numeric/date typing and deterministic text folding match the existing query contract. Missing values match only null tests. The first matching rule wins independently for the row and each cell. A row rule overrides its supplied tone and adds its class to host row classes; omitted tone retains the default. Cell rules retain an existing tone when they only add classes. Rules do not alter filtering, paging, selection, raw exports or host data. Raw row metadata is retained in immutable export snapshots; computed rule decoration remains presentation policy.

The .NET writer exposes `CanopyGridRow.Tone`, `ClassName` and `CanopyDataGridView.HighlightRules`. `CanopyGridHighlightRule` wraps a `CanopyGridFilter` and a row/cell target. The static renderer evaluates these conditions with the same raw-value folding and millisecond date semantics, emits encoded classes and inline tone colours, and retains script-free output.

#### Conditional formatting rules

Optional `formatRules` holds at most 64 ordered rules, `{ id, label?, description?, enabled?, when?, column?, target?, columns?, details?, style, stopIfTrue? }`, and optional `formatting` is `{ legend?, editor? }`. `when` is a filter group with a third junction, `none`; its predicates add `notContains`, `endsWith`, `like`, `notLike`, `matches`, `notMatches`, `notIn`, `between`, `betweenExclusive`, `olderThan` and `withinLast` to the filter operators, and optional `valueColumn`, `type` (`text`, `number`, `boolean`, `date`), `caseSensitive` and `culture`. `target` is `cell` (the rule's `column`), `row`, or `columns` with `columns`. `style` holds a theme `tone` with `emphasis` (`fill`, `text`, `strong`), `icon`, `badge` and `cue`, or one of `bar`, `scale` (two or three stops) and `bands` (rising, the last open), plus the `className` and `css` escape hatch. For each target the first matched rule that sets an aspect wins it; `stopIfTrue` ends a row's rules. A style that only colours gets its tone's icon unless `icon` is `none`. Rules change no data, query, selection or CSV. [Conditional formatting](conditional-formatting.md) describes the semantics, the editor and the parts that evaluate rules; the .NET `CanopyFormatRule` family writes the same schema and the static renderer evaluates it.

The grid state carries `formatRules` when the grid's rules differ from the view's, and export records carry a cell's resolved `format` (`rules`, `tone`, `icon`, `badge`, `cue`, `band`, `bar: { fraction, tone }`, `color`, `description`) beside its value and text, and a row rule's `format` on the record.

#### Wrapped cells and measured grid rows

Grid columns accept `wrap: true` to retain line breaks and wrap long text. The wire document retains numeric `rowHeight`, an integer from 20 to 64. Wrapped columns or optional `autoRowHeight: true` enable measured records and use that height as both the minimum and the estimate for unseen rows. Unconfigured columns retain fixed rows; explicit JavaScript `autoRowHeight: false` keeps wrapped text to a one-line preview. The JavaScript API also accepts `rowHeight: "auto"` with optional `estimatedRowHeight` (20 to 64, default 32 in compact density, 40 otherwise) as shorthand. In .NET, use `CanopyColumn.Wrap` or `CanopyDataGridView.AutoRowHeight`; `RowHeight` supplies the estimate. Automatic height applies to continuous, paged and grouped grids. Group/status rows retain the minimum height. Cards use fixed geometry with room for the field label and up to two whole wrapped value lines, even when the corresponding table uses measured rows.

Optional `dragRows: true` (default false; .NET `CanopyDataGridView.DragRows`) lets readers drag rows out of the grid to a calendar that accepts drops (`calendar.drop`), or pick a row up with F2 from row focus and drop it with Enter (`gridRowPicked` is announced).

Measurements preserve the first visible row and its offset while overscan rows grow or shrink. ResizeObserver also measures host-rendered content that changes later. Page Up/Down moves by the viewport's pixel height. Logical offsets remain independent of the native scrollbar's 8,000,000-pixel cap. Previously measured offscreen rows retain their last height as an estimate after a column width changes and are remeasured when recycled into view. Automatic mode retains sparse height information for visited rows; fixed mode avoids that work.

#### Search highlighting and layout modes

Optional `searchHighlight` (`true` or `{ enabled, search, filters, matchCase, ignoreAccents, minLength, filterTones }`) marks
search and filter hits in cells and the record drawer, with a match count and next/previous navigation
([search highlighting](search-highlight.md)). Optional `layout` (`{ mode, modes, density }`, modes `fit`, `scroll` and
`cards`, densities `compact`, `default` and `comfortable`) adds the Layout menu ([layout modes](layout-modes.md)); a
grid's `layout.density` takes the place of its `density`. Toolbar switches `matches` and `layout` leave their controls out.
Grid state carries the reader's choices as optional `layout: { mode, density }` and `highlight` (a boolean); a saved mode
the view no longer offers falls back to the declared one, and state from a view without the option ignores them. Tree
documents take the same two fields, with the fit and scroll modes, and tree state the same two choices. A flat grid's
`onPrint` hook receives `layout: "stacked"` from a grid in the card layout and `"table"` otherwise. These fields are
additive; readers without them keep the fit layout and unmarked cells.

#### Sequential sources and unknown counts

Cursor views require a host source and paged presentation. They send `gridCursorQuery` documents with the same search, sort, predicate, limit and optional revision fields as `gridQuery`, but no offset. An absent `cursor` requests the first page. A supplied cursor requires its issuing revision; the host binds tokens to the complete criteria and requested limit and rejects stale or unauthorized tokens. Cursors contain at most 4,096 well-formed UTF-16 code units. They are opaque positions, never authorization or client-interpreted offsets.

The host returns `gridCursorPage`, preserving the existing offset documents unchanged:

```json
{ "protocol": "canopyx/2", "type": "gridCursorPage", "view": "inventory", "revision": "r1",
  "offset": 25, "total": null, "matched": null, "previousCursor": "opaque-previous", "nextCursor": "opaque-next",
  "items": [{ "id": "record-25", "cells": { "name": "Record 25" } }] }
```

`offset` is the actual ordinal position in the ordered matching result, supplied by the host for range and ARIA indices. It does not permit random access. `total` and `matched` are required and independently nullable: null means unknown. Known counts retain their usual bounds and stay consistent through one accepted snapshot. Rows cover at most the requested limit; the next page starts at the end of these rows and the previous page ends at their start. Empty results use offset zero without a next cursor; offset zero cannot declare a previous cursor. When `matched` is known, a next cursor exists exactly when the page ends before that count. A host can omit previous navigation when its source cannot provide it.

The pager offers First, Previous, Next and page length, disabling unsupported directions. `firstPage()`, `previousPage()` and `nextPage()` work for both navigation kinds. Cursor `getPaging()` reports null `pageIndex`/`pageCount`, nullable counts, the actual returned range and `hasNext`/`hasPrevious`. It offers neither numbered jumps nor Last; `goToPage` rejects cursor sources. Cursor queries fetch one complete visible page using `pageLength`; `pageSize` remains the serial export request limit. Changes to criteria or page length start from the first page. Repeated pending navigation coalesces; superseded requests, failures, timeouts and destruction use the existing accepted-query lifetime.

Arrow, Page, Ctrl/Command+Home and Ctrl/Command+End navigation stays in the accepted cursor page. The pager is keyboard reachable. `scrollToRow` accepts only positions in that page; it rejects unsupported random traversal. Logical `aria-rowindex` uses the host ordinal, and `aria-rowcount` is -1 when the matching count is unknown. Saved cursor views omit cursor/revision tokens and restore the first page; their paging offset is always zero.

Cursor exports capture the accepted criteria and revision, then request the first page and follow next tokens independently of the viewport. Each page must advance contiguously and retain its snapshot; repeated tokens, identities and missing selected records fail the operation. Unknown counts never become zero: CSV/copy enforce their limit during enumeration when no preflight count exists. Host export requests expose nullable counts. JavaScript cursor controllers use `DataGrid<GridCursorQuery>`; offset controllers retain the default `DataGrid` types and numeric counts. The `cursor-grid.html` example is a standalone numeric host fixture; production hosts execute queries in their owning data layer.

The source is `{ "kind": "inline" }` or `{ "kind": "host" }`. Inline definitions contain the complete `rows` array. A row is `{ "id": "stable-key", "cells": { "column-id": 123 } }`; omitted cells and null entries are empty values. Identities are unique throughout the dataset and survive ordering, filtering, paging, and reloads. Display text never replaces the raw value used for sorting. Host definitions omit `rows`; a host hook owns query execution, transport, and authorization and can read an in-memory dataset, a sidecar dataset, or a remote service.

A `gridPage` contains `view`, `revision`, `offset`, `total`, `matched`, and `items`, alongside its protocol envelope. `total` is the full unfiltered dataset size; `matched` is its size after filtering and search, before paging. `offset` is measured in the ordered matching rows. The host filters and sorts the full dataset before slicing a result page, using stable row identity as the final tie-breaker. All pages in one accepted query share a dataset revision. A changed revision invalidates retained pages and selection assumptions rather than mixing snapshots.

Counts satisfy `0 <= offset <= matched <= total`, and returned rows cannot extend beyond `matched`. A result page contains at most 10,000 rows. Empty pages are valid only at the end of matching rows. Writers and readers also reject duplicate row identities. Inline definitions check declared columns; `CanopyGridPage.ToJson(view)` also checks page columns against its definition. Readers perform that check when accepting host pages. JSON Schema alone cannot express all cross-field and dataset-wide invariants.

A `gridQuery` contains `view`, `offset`, `limit`, `search`, `sort`, and `filters`, with an optional expected `revision`. A definition can contain an initial `query`. Search uses the protocol's canonical case folding over raw values of declared columns, independent of display text. A grid's optional `searchColumns` array restricts search to unique declared column IDs; absent searches all columns, including hidden columns. A cell's optional `searchText` replaces only its text-search input, without changing display, typed filtering, sorting or exports. An empty `searchText` contributes no searchable text. Tree search indexes retain their existing semantics.

An absent `searchMode` means `substring`: the complete search text must be a substring of one searchable cell. `words` requires every whitespace-separated word or double-quoted phrase to match at least one searchable cell; different words may match different columns. A phrase matches within one cell, empty quoted phrases are ignored, and an unfinished quote extends to the end of the input. Words are partial matches, not regular expressions. Hosts implement the same folding and matching semantics and receive the resolved search mode in query documents. `CanopyTextFolding.Fold` is the folding in C#, and `CanopyX.Data` implements the hosted grid documents on the server (see [remote-dotnet.md](remote-dotnet.md)).

`searchMode: "regex"` additionally requires `allowRegexSearch: true` on the owning grid. It uses the existing bounded condition
pattern grammar: literals, character classes and at most one variable repetition anchored at `^`; groups, alternatives and
backreferences are rejected. Matching is case-insensitive, without accent folding, against each searchable raw/search-text cell.
Patterns are limited to 256 UTF-16 code units, cell inputs to 4,096; oversized input is rejected rather than truncated. Empty
search still matches all rows. The browser allows 50 ms of regex evaluation per query and retains the previous accepted query
when validation or execution fails. The input reports an invalid pattern and uses the translated `gridRegexSearch` label.
C# uses `AllowRegexSearch`, `CanopyGridSearchMode.Regex` and `CanopyGridRegexSearch`; the in-memory provider implements the same
grammar with a 100 ms query budget and native match timeout. The portable IQueryable provider rejects regex execution explicitly;
it never downloads a database result to simulate matching. Other hosts implement or reject regex queries themselves.

The optional grid properties `stickyHeader` and `cardTemplate` configure page-scroll headers and literal card token slots
respectively. They use the lazy layouts part; see [layout modes](layout-modes.md). Both default to the ordinary grid behavior.

The optional grid definition field `searchDelayMs` sets the search-input debounce from 0 to 5,000 milliseconds; browser options of the same name override it. Without a setting, inline sources apply input immediately and host sources wait 300 ms. Enter applies immediately except during input-method composition, whose partial input is never submitted. Sorting, filter edits and chip actions include queued search text in the same immediate request; they never include unfinished composition. Explicit `setQuery`, view restoration and reset replace queued text. Accepted-result counts and removable search, flat-predicate and grouped-filter chips update only after a query succeeds; pending or failed queries retain the previous summary. Clear search and filters removes both predicate forms, resets the offset and cancels any queued text.

All flat `filters` combine with AND. An optional `filterGroup` adds a nested expression, also combined with search and flat predicates using AND. A group is `{ "operator": "and" | "or", "filters": [...], "groups": [...] }`: `and` requires every predicate and child group to match; `or` requires at least one. Both arrays are required and their combined length cannot be zero. Queries allow eight group levels, 64 groups and 64 total predicates including flat predicates. The .NET writer and browser enforce these semantic bounds in addition to schema shape validation. Operands and column rules are identical at every depth. Invalid or incompatible grouped state is rejected rather than restored with silently broadened filters.

The Filters sentence editor presents that expression with All/Any switches, typed conditions and indented groups. Flat predicates retain their outer AND semantics. The reporting editor folds adjacent lower/upper bounds into a range only inside an AND group, and emits an inner AND group when a range is used within OR. Independent bounds originally authored in OR remain independent. The UI offers two nesting levels; deeper saved expressions remain read-only until Edit as text enables their JSON representation. Empty draft groups are omitted until they have a condition, while saved and submitted expressions retain the engine's nonempty-group validation. Edits apply after 200 ms; Done flushes the latest valid draft, and Clear all filters clears both forms. These controls add no query operator or protocol version.

`reporting.facetColumns` opts declared column IDs into full-query value/count facets. Inline sources count their complete dataset through the existing search/predicate evaluator, ignoring the result window and sort. A hosted source supplies an explicit `facet(request, { signal })` capability; the runtime never estimates counts from cached pages. The column popover shows presenter-rendered values and counts with the current column's predicates excluded. It adds value search above twelve values, applies choices after 200 ms, and cancels superseded or closed requests. Other accepted criteria changes close an outdated list. Hosted columns without a facet capability retain typed conditions.

`api.getFacets(column, { search, limit, includeCurrentFilter, signal })` sends a `gridFacetQuery`: `{ protocol: "canopyx/2", type: "gridFacetQuery", query, column, search, limit, includeCurrentFilter }`. The query includes its accepted revision. Defaults are empty value search, 100 returned buckets, and `includeCurrentFilter: true`; the bound is 1..200 buckets and 16,384 search code units. False replaces every predicate targeting that column with true, including inside nested groups. In particular, an OR containing such a predicate becomes true; removing just that term would incorrectly narrow the expression. Search and all other predicates remain in force. The host keeps its independent authorization constraints when applying this projection.

A grid's optional `facets` field declares a facet panel: `{ columns, position, open, collapsible, width, label }`, where each column is an id or `{ column, kind, label, limit, bins, sort, collapsed }` (`gridFacetPanel` in the schema). Its choices are ordinary column conditions (`in`, `isNull`, `ge`, `le`) of the query. A hosted grid's facets must be declared `reporting.facetColumns`; each sends a `gridFacetQuery` with `includeCurrentFilter: false` and a limit of 200. The grid state keeps the panel's open state as `facets: { open }`. See [facet panel](facets.md).

A `gridFacetPage` echoes `view`, `revision`, `column`, `search` and `includeCurrentFilter`, and contains `matched`, `totalValues`, `truncated` and `items: [{ value, count }]`. `matched` counts projected matching records before value search. `totalValues` counts distinct buckets after value search and before truncation. Items form a bounded nonempty prefix when values exist; `truncated` is exactly `items.length < totalValues`. Counts are positive, their sum cannot exceed `matched`, and an unsearched complete page accounts for every matching record. Invalid or mismatched responses are rejected. The C# `CanopyGridFacetQuery`, `CanopyGridFacetPage` and `CanopyGridFacetValue` writers validate this contract.

The browser also checks known accepted dataset counts: an inclusive facet retains the accepted matching count; excluding its predicates can widen that count but cannot shrink it or exceed a known dataset total. If the column has no predicates to exclude, the matching count stays equal to the accepted count. Unknown cursor counts impose no fabricated equality. Numeric choice labels show their exact raw binary64 string representation, while bucket counts remain localized, so distinct small values are distinguishable.

Bucket values are raw scalars, never display-cell objects: missing values form one null bucket; text uses the frozen search folding; booleans remain distinct from text such as `"true"`; dates use UTC millisecond identity; numbers use the existing binary64 rules. Inline text buckets choose an ordinal-minimum representative, order folded text deterministically, put boolean buckets before text and missing values last. Value search is a folded substring match. Hosted sources retain equivalent bucket identity and a deterministic prefix order. Inline aggregation uses a temporary map proportional to distinct matching values; hosted sources own large-data aggregation and return at most the requested bound. No persistent facet cache grows with the dataset.

Changing the accepted search, filters or revision invalidates completed choices. New queries, replacement value searches, closing/removing controls and disposal cancel active facet requests; stale responses cannot replace newer choices even when a host ignores cancellation. The controls use `gridFacetValues`, `gridFacetSearch`, `gridFacetIncludeCurrent`, `gridFacetLoad`, `gridFacetChoose`, `gridFacetCounts` and `gridFacetReload` labels. Ordinary grids without `facetColumns` retain their existing filter controls.

Sort keys are `{ "column": "amount", "direction": "asc" }` or `desc`, applied in array order; keys identify unique declared sortable columns. Missing values sort last in either direction, and row identity breaks final ties ([Row identity order](#row-identity-order)), including when no explicit sort is requested. The source applies the result window last. Filtered exports capture the nested group and search mode; explicit-ID selected and all exports clear filtering while retaining snapshot identity and sort order. All-matching selection exports retain their captured filters and exclusions.

An optional `reporting.ordering` object binds policies to declared sortable text-column IDs. Each policy has `text: "ordinal" | "foldedOrdinal" | "natural" | "foldedNatural"` and optional ordered `categories`. Ordinal compares UTF-16 code units; folded modes use the same frozen single-unit folding as search, without platform culture or Unicode-version-dependent collation. Natural modes compare ASCII digit runs by magnitude without numeric conversion; leading zeroes tie. At most 512 categories are allowed, each at most 4,096 code units and distinct after selected folding. Declared categories precede other values in ascending order; other values follow the selected text comparison. Descending reverses nonmissing value order, and stable IDs still break ties. These policies change sorting only: display, search, typed predicates and raw exports retain their existing meanings.

Reporting definitions also accept `headerFilters: true` for existing hosts. Every column menu offers Filter…, and a filled accent filter button appears only on headers whose column has an active filter. The reporting editor offers numeric/date ranges as adjacent inclusive `ge` and `le` predicates on the same column; there is no additional range query operator. Each unedited date bound retains its original ISO offset and fractional digits, including when the other bound changes. Edits to date inputs use UTC. Reversed ranges leave the accepted query intact and display an error. Text columns with declared category ordering offer suggestions for equality/inequality while retaining free text for other values; choosing a boolean raw type offers translated true/false choices whose operands remain JSON booleans. Missing-value and membership operators retain their existing meanings. These controls use the reporting entry point, including when a host supplies reporting-only label translations.

Include the reporting runtime for these definitions: `CanopyRuntime.ReportingGrid` in C# or `@evotecit/canopyx/reporting` in JavaScript. `CanopyHtmlAssets.GetRuntime(view)` selects it for fragment hosts, and complete-page writers select it automatically. A host source executes the same policy before paging; `CanopyGridOrdering` supplies the dependency-free C# text comparer. Policy definitions are fixed view configuration, not user-editable saved-state query fields. A host still validates column IDs, revision, authorization and query limits.

Numeric cells use JavaScript binary64 arithmetic. Native writers and browser grid readers reject magnitudes outside ±9,007,199,254,740,991; the boundary does not make fractional decimals exact. Use text cells for larger exact integers, exact decimal representations and identifiers, or keep exact arithmetic/order in the host with an explicitly defined result contract. Display text is separate from the raw query value. Date comparison uses UTC instants at millisecond precision, independent of display time zone. Native date cells serialize that precision; externally supplied ISO strings may retain finer text in raw export, but submillisecond differences tie during inline sorting and filtering. Hosts normalize to the same precision for equivalent query behavior.

A filter is `{ "column": "amount", "operator": "ge", "values": [10] }`. Operators are `eq`, `ne`, `contains`, `startsWith`, `in`, `gt`, `ge`, `lt`, `le`, `isNull`, and `isNotNull`. Equality and text matching are case-insensitive for text values. Numeric and date operands use their raw numeric and ISO 8601 UTC values; localized display strings do not enter the query. Text matching is for text columns; range comparisons are for number and date columns. A null or missing cell fails value predicates, including `ne`; use `isNull` to include it explicitly. An empty string is a value, not a null. Null predicates take no operands, `in` takes 1 to 1,000, and other predicates take one. A query has at most 64 predicates. The C# filter API accepts `CanopyCell` operands but serializes only their raw values, without display text or decorations.

Flat-grid view snapshots are browser presentation state, separate from the wire query and tree snapshots. `getState()` returns `{ version: 1, view, columns, query, timeZone, selection, scrollTop }`. Columns appear in display order and carry `id`, `width` and `hidden`, plus optional `pin`, `sized` (the width is a user choice; without it the column keeps automatic sizing and the saved width is informational) and `priority`; selection contains stable row IDs independently of cached pages. The query omits a dataset revision and starts at offset zero, so restoration obtains a fresh accepted snapshot before applying presentation. Invalid state leaves the current query and layout intact. A newer query or restoration supersedes an older restore. Removed column/filter/sort references are skipped, while at least one known column must remain visible.

`stateKey` scopes the current snapshot and at most 20 named snapshots in session storage, together with the view ID. Unavailable storage leaves the in-memory controls usable. `resetView()` restores the original definition; removing a named view is a separate explicit action. The `grid*` label names localize flat-grid controls and require the data-grid entry point.

Reporting grids add durable preferences through `reporting.viewStorage: "local"` and an explicit `stateKey` of 1 to 512 characters. The default remains session storage. Local storage is scoped to the origin and browser profile, and retains searches, filters and selected record identities. Hosts choose keys that separate users and inventories and clear retained settings according to their privacy policy; preferences never grant data access.

Saved queries use a strict boundary: unknown query, sort, predicate or nested group fields reject the snapshot before restoration. This prevents autosave from discarding settings whose semantics belong to a newer client. Live `canopyx/2` view and query documents still accept unknown additive fields.

The canonical preference envelope is `gridViewSettings` in the schema: `{ version: 1, view, current?, views: [{ name, state }], defaultView? }`. Each `gridState` retains column ID/order/visibility/width/flex/pin, query settings, time zone, selected IDs, page length/offset and scroll position. Dataset revisions and cursor tokens are omitted and queried afresh; `GridPreferenceQuery` also excludes them from the typed durable contract. Envelopes are bounded to 1,048,576 UTF-16 code units and 20 unique trimmed names of 1 to 100 characters. Existing unversioned session envelopes without either envelope-level version or view identity remain readable; their snapshots still carry the view identity. Partially versioned or invalid envelopes are rejected. Incompatible snapshots are skipped in memory with a persistent warning, and persistence pauses so the original envelope remains recoverable until an explicit reset. Added columns use their declared defaults; removed columns leave the layout and flat sort/filter arrays. A nested query referring to a removed column rejects that snapshot rather than silently broadening its condition group.

`renameSavedView(oldName, newName)` rejects collisions and preserves the default marker. `setDefaultView(name)` chooses the snapshot applied on the next mount, ahead of the last current snapshot; `setDefaultView(null)` clears it. Removing that snapshot clears the marker. `resetView()` restores the original definition for the current session while retaining named views and the default choice. `getViewSettings()` returns an owned frozen envelope.

Local-storage presentation saves refresh named-view metadata from the latest envelope before writing. Flushes and autosaves with no local changes refresh that metadata without writing, leaving a newer tab's current snapshot intact. An older tab's delayed query/layout save preserves another tab's named edits without importing its query. Named edits also refresh that metadata before applying their change. Browser storage provides no transaction across simultaneously editing tabs; hosts needing governed concurrent edits use a host store.

A host can supply `viewStore: { load({ key, view, signal }), save({ key, view, settings, signal }) }` when constructing an explicitly keyed reporting grid. It replaces browser storage. Loading and saving use the grid's bounded host-operation timeout and lifetime. A delayed load cannot overwrite a newer query or preference action. Saves run serially and coalesce waiting changes into the newest complete envelope; `flushViewSettings()` waits for acknowledgement. Identical content shares an active or completed acknowledgement. A failed or timed-out host operation pauses persistence for that grid instance, leaves its in-memory controls usable, and displays the error. Hosts must honor cancellation and govern authentication, concurrent writers and atomic persistence; an ignored timed-out save is never followed by another save from that instance. Destroy cancels pending work, so hosts flush before destroying when delivery is required.

TypeScript host-store options carry the keyed reporting `view` declaration. This also applies to `configure(viewId, options)`: hosts supply the declaration used to create that fragment. Mounting uses and validates the actual fragment definition, rather than comparing it with this type-level declaration. Ordinary grids cannot declare a host preference store.

Named preference edits wait for the initial host load to complete, so saving before reading cannot erase existing views. Query controls remain usable during that load. An invalid browser envelope is retained with persistence paused; an explicit `resetView()` restores the definition and replaces that rejected envelope. Browser quota failures remain visible and leave the in-memory view usable.

`getShareState()` returns layout, sorting, time zone and page length with search/filters/group conditions, selection, revision/cursor, page offset and scroll position removed. It writes nothing to the address bar. To share a query-bearing view, use a host-authorized opaque identifier rather than putting its search or record IDs in a URL. Applying any snapshot queries the current data source and remains subject to its authorization.

### Date ranges

A calendar or timeline presentation of a hosted flat grid reads the records of a visible period through the optional source
capability `range(request, { signal })`, as value lists use `facet`. Without the capability the runtime falls back to
`query()` with equivalent predicates. The request is a `gridRangeQuery`:

```json
{ "protocol": "canopyx/2", "type": "gridRangeQuery", "view": "maintenance",
  "query": { "protocol": "canopyx/2", "type": "gridQuery", "view": "maintenance", "offset": 0, "limit": 100, "search": "",
             "revision": "r1", "sort": [], "filters": [] },
  "from": "2026-10-01T00:00:00Z", "to": "2026-11-01T00:00:00Z",
  "start": "starts", "end": "ends", "recurrence": "rule", "seriesEnd": "seriesEnd",
  "resource": "host", "resources": ["host-1", "host-2"], "calendarView": "month", "limit": 5000 }
```

- `query` is a complete `gridQuery` (offset zero). Its search, predicates and filter group select the records; its window,
  sort and grouping do not apply. Its optional `revision` follows the `gridQuery` rules: a stale revision is rejected
  (`staleRevision`, HTTP 409).
- `from` < `to` are ISO 8601 UTC instants ending in `Z`, compared at millisecond precision, at most 3,700 days apart.
- `start` (a date column, required), `end` and `seriesEnd` (date columns), `recurrence` and `resource` (text columns) are
  column ids of the view. A server accepts only columns on its allow-list that it allows filtering on, with the right kind.
- `resources` (optional, 1..1,000 unique nonempty strings of at most 4,096 code units) requires `resource` and keeps the
  records whose resource is one of them, with the semantics of an `in` predicate on that column.
- `calendarView` (optional: `month`, `week`, `day`, `days`, `agenda`, `year`, `timeline`, `mini`, `weekList`, `dayList` or `months`) is informational; servers never
  let it change the answer.
- `limit` is 1..10,000; a server lowers it to its own maximum.

After the query's criteria and the resource restriction, a record without a recurrence (no `recurrence` column, or a null or
empty value) overlaps when `start < to` and (`start >= from` or `end > from`); a null end, or no `end` column, is a
zero-length marker at its start. A record with a recurrence overlaps when `start < to` and, when `seriesEnd` is given, its
series end is null or after `from`. A record without a start never overlaps. Overlapping records are ordered by start
ascending, then by record identity (ordinal in memory; a database orders equal starts by the key column in its own collation);
the query's sort is ignored.

The answer is a `gridRangePage`:

```json
{ "protocol": "canopyx/2", "type": "gridRangePage", "view": "maintenance", "revision": "r1",
  "from": "2026-10-01T00:00:00Z", "to": "2026-11-01T00:00:00Z",
  "matched": 1234, "truncated": false, "items": [ { "id": "evt-1", "cells": { "starts": "2026-10-02T08:00:00Z" } } ] }
```

`view`, `revision`, `from` and `to` echo the accepted request. `matched` counts every overlapping record; `items` are the
first `limit` of them in order, written as `gridPage` rows; `truncated` is exactly `items.length < matched`. Every item
starts before `to`, and no item starts before the one it follows. The C# `CanopyGridRangeQuery` and `CanopyGridRangePage`
writers validate this contract, and `CanopyX.Data` answers it ([Range queries](remote-dotnet.md#range-queries)).
### Record selection scopes

`reporting.selectionControls: true` adds native row checkboxes, selected counts and explicit page/all-matching/clear commands. It also enables `getSelectionDescriptor`, `setRowSelected`, `selectPage`, `selectRange` and `selectAllMatching`; views without this flag retain the existing ID-list selection API. Single selection supports record toggles; page, range and all-matching commands require multiple selection. These controls use existing columns and logical ARIA indices, without a synthetic data column. Space toggles the focused record; Shift+Space and Shift-click extend from the selection anchor, and Ctrl/Command-click toggles a record. Ctrl/Command adds a range to existing identities. Without these controls, selection comes from Space and the API; a plain row click never selects.

`getSelectionDescriptor()` returns an owned frozen `{ kind: "ids", revision, ids }` or `{ kind: "query", query, revision, matched, excludedIds }`. Explicit selections and query exclusions are bounded to 10,000 identities. `setRowSelected(id, selected)` changes a loaded accepted record. `selectPage(selected = true)` reads the whole accepted page, including records outside the mounted viewport; it adds/removes that page independently of other pages. `selectRange(start, end, { selected, additive, signal })` reads at most 10,000 accepted ordinal positions atomically. Offset sources can read across pages; cursor sources stay within the accepted page. Query changes, caller cancellation and destruction cancel unfinished ranges without partial selection changes.

`selectAllMatching()` captures the complete accepted query and revision without fetching or materializing its identities. Loaded records can be excluded. Paging retains this scope; changed search, filtering, sorting or revision clears it. Explicit identities survive changes to criteria in the same revision, including when a record leaves the current filter; a new revision clears them. Unknown cursor counts stay unknown. `getSelection()` throws in query mode so hosts cannot mistake an empty materialized list for an empty selection. Selection events include the descriptor alongside the legacy explicit `ids` array.

Selected exports add `request.querySelection` when this mode is active. They retain the captured query, revision, exclusions, columns and ordering even if the UI changes later. CSV/copy enumerate the captured source, verify excluded identities and enforce client limits; large Office exports use the host hook. Hosts validate query-selection descriptors, dataset revisions, authorization and exclusions before executing an export or a governed action. Query selection is ephemeral: preference snapshots save no query-selection descriptor or exclusions, and restoring a view returns to explicit selection.

### Flat groups and complete-query totals

Reporting definitions opt in through a fixed `grouping: { column, direction }`, runtime grouping (`groupBy` and/or `groupable`), `aggregates`, or a combination of grouping and aggregates; a fixed grouping cannot be combined with `groupBy` or `groupable`. A fixed grouping uses one declared sortable raw column. Runtime grouping uses up to four ordered levels `{ column, direction, aggregate? }` of declared sortable columns, declared in `groupBy` and changed by readers when `groupable` is true (see [grouping.md](grouping.md)). Grouping keys lead every query sort, outermost first; user sorts follow, with stable record identity last. Missing/null cells form one final group in either direction. Folded or natural ordering uses exact raw text and type to break equivalent-value ties, so distinct raw categories never interleave. Date groups normalize explicit-zone timestamps to UTC milliseconds. One level gives flat-grid headings, with no tree hierarchy or tree keyboard semantics; two or more levels make the grid a `treegrid` whose rows carry `aria-level`.

Queries of a runtime-grouping definition always carry `groupBy`, the ordered levels (an empty array when ungrouped); input without it takes the declared levels. The levels' columns lead `sort`, each with its level's direction, or ascending for a level ordered by an aggregate; a sort entry for a grouped column that the reader sets turns that level's groups around. A level with `aggregate` orders its groups by that declared aggregate's value in `direction`, missing values last and equal values by raw value ascending; its records stay contiguous by value. Fixed-grouping queries keep their earlier shape, without `groupBy`.

Each aggregate declares `{ id, column, operation, label }` and an optional `format`. Explicit aggregate formats take precedence over the column format; counts and distinct counts without their own format use whole numbers. Without an explicit format, the existing compact labels and inferred precision apply. `count` counts nonmissing cells and `distinctCount` distinct nonmissing raw values in any raw column; `sum`, `average`, `minimum` and `maximum` require a number column. Any other operation name (a lowercase letter and up to 31 letters and digits) is a custom aggregate: a browser plugin computes it for inline data and a host source computes it itself; its value is a finite number or null. Display text and mounted cells do not supply values. Inline complete datasets compute binary64 aggregates using compensated summation; empty noncount aggregates are null. Values must remain finite and within `±Number.MAX_SAFE_INTEGER`. Monetary or other domain-specific calculations remain host-owned.

Groups optionally carry `cells`, a map of declared column IDs to ordinary display cells. These cells use the column presenter; numeric aggregates and the first-column group label take precedence. Hosts supply complete-group states or other display facts. Inline summaries choose the worst semantic tone from each group's `state` and `enum` columns across the complete query, including records outside the current page. The severity order is danger, warning, info, success, neutral; unknown host tones rank with info. Display cells never become records or alter filtering, sorting, selection or export.

Hosted sources provide `source.summary(query, { signal })`. A source's `query` hook receives the same `groupBy` and must return records in the level order, as the summary describes it. The request is the complete normalized accepted query with offset zero, the definition's `pageSize` as its limit, and the page's accepted revision. That limit identifies the request; it never limits aggregate evaluation. Return a `gridSummary` document echoing that query:

```json
{ "protocol": "canopyx/2", "type": "gridSummary", "view": "inventory", "revision": "r1",
  "query": { "protocol": "canopyx/2", "type": "gridQuery", "view": "inventory", "revision": "r1",
    "offset": 0, "limit": 100, "search": "", "sort": [{ "column": "category", "direction": "asc" }], "filters": [] },
  "matched": 3, "aggregates": { "total": 12 },
  "groups": [{ "key": "category-a", "value": "A", "offset": 0, "count": 3, "aggregates": { "total": 12 } }] }
```

With several levels, every group of an outer level lists the next level's groups in `groups`, covering its records in contiguous ranges (absolute `offset`s into the complete query); groups of the innermost level omit `groups`:

```json
"groups": [{ "key": "north", "value": "North", "offset": 0, "count": 3, "aggregates": { "total": 30 },
  "groups": [{ "key": "north/open", "value": "Open", "offset": 0, "count": 2, "aggregates": { "total": 20 } },
             { "key": "north/closed", "value": "Closed", "offset": 2, "count": 1, "aggregates": { "total": 10 } }] }]
```

Groups cover every matching record in contiguous declared order, level by level. Keys are unique across the whole summary (an inner key usually extends its outer group's key), so collapse state names a group of any level. Keys are stable host identities, bounded to 4,096 well-formed UTF-16 code units; they are independent of labels and page-local indices. Raw values have no display-cell wrapper. Each group and the complete result supply exactly the union of reporting aggregates and all-matching footer aggregates. Continuous grids also include page-footer aggregates in this union because both footer scopes cover the complete matching result. A reused aggregate ID must refer to the same column and operation everywhere, including the same custom operation name; the union contains at most 32 unique IDs. Ungrouped summaries return an empty `groups` array. Metadata is bounded to 10,000 groups across all levels and 4,194,304 serialized UTF-16 code units. `CanopyGridSummary.ToJson(view)` checks native responses; `CanopyGridGrouping.CreateComparer(view)` supplies equivalent raw group ordering for hosts. The browser checks query/revision ownership, ranges at every level, level order, aggregate bindings and page-to-group membership (each record's value at each level) before accepting metadata. Cancellation, bounded hook deadlines and stale-response protection retain the existing source lifetime.

Summaries require known-count offset sources; cursor sources reject them. Paging, `matched`, selection ranges and `scrollToRow` count records. A page crossing a group boundary repeats its relevant headings. A heading displays the full group's count and totals, and the toolbar displays totals for the complete accepted query. Each aggregate cell names its function through the `gridAggregateCount`, `gridAggregateSum`, `gridAggregateAverage`, `gridAggregateMinimum`, `gridAggregateMaximum` and `gridAggregateDistinct` labels (a custom aggregate through the `{value}` label its plugin registers) (`{value}` is the formatted number, for example `avg 36.2`). Values use the column's precision (the most fraction digits among its loaded raw values, at most three; averages one more, counts none) and a compact form from one million (`sum 12.7M`); the cell's tooltip gives the aggregate's label and the full value. Collapse hides the group's records in the current presentation without changing the query, page count, selected records or exports. Metadata and a sparse viewport projection support large hosted results without constructing a wrapper for every record.

`getSummary()` returns the accepted immutable metadata, or null before acceptance. `setGroupCollapsed(key, boolean)`, `setGroupLevelCollapsed(level, boolean)`, `expandAllGroups()`, `collapseAllGroups()` and `getCollapsedGroups()` manage presentation; `setGroupBy(levels)` and `getGroupBy()` change and read runtime levels. Group rows support expand/collapse with Left/Right and Enter/Space; Up/Down and Page keys traverse headings and records. Ctrl/Command+Home/End retains record navigation. Version-1 preference snapshots add bounded `collapsedGroups`; default reset expands groups, and sharing omits these query-specific keys. Generic CSV/copy exports remain record exports: they contain no synthetic heading identities or total rows. Exports of the filtered result add `request.grouping` (`levels` with titles, `aggregates`, `totals` and the nested `groups` with ranges, values, display `text` and aggregates) so a format writer can produce outline levels; selected and all-record exports carry none. Hosts that compose grouped Office output evaluate its explicit export scope and revision rather than borrowing filtered totals for a selected or all-record export.

#### What a server adapter implements for multi-level grouping

A summary endpoint that serves only a fixed grouping keeps working for definitions that declare `grouping`. For runtime
grouping, an adapter such as `CanopyX.Data` (which serves single-level `gridSummary` today) adds:

1. **Request parsing.** Read `groupBy` from `gridQuery` (absent for fixed-grouping definitions, always present otherwise):
   up to four `{ column, direction, aggregate? }` levels of distinct declared sortable columns, allowed by the column
   allow-list, with `aggregate` naming a declared aggregate. Reject a `groupBy` the definition does not allow.
   `CanopySummaryRequest` exposes the ordered levels (for example `IReadOnlyList<CanopySummaryLevel> Levels` with the column,
   descending flag and optional aggregate) in place of the single `GroupColumn`/`GroupDescending`.
2. **Record order.** Page queries order records level by level before the remaining sorts and identity: by the level's
   value, missing values last, with the protocol's raw-value ties (`CanopyGridGrouping.CreateComparer` for each level), or,
   for an aggregate level, by the group's aggregate (a grouped subquery or window aggregate joined back to the records),
   missing aggregates last and ties by value ascending.
3. **Nested summaries.** The provider groups by every level prefix (for example `GROUP BY region` and
   `GROUP BY region, status`, or one `GROUP BY` with rollup) and returns each group's count and aggregates; the handler
   orders sibling groups by the level's order, assigns contiguous absolute offsets parent by parent, nests inner groups
   under `groups`, and emits keys unique across levels (`GroupKey` of the outer key and the value, for example
   `s:North/s:Open`). The 10,000-group limit counts every level; ungrouped requests (`groupBy: []`) return no groups.
4. **Aggregates.** Add `distinctCount` (count of distinct nonmissing values in any column) and accept custom operation names
   only when a registered provider computes them; reject unknown ones as unsupported.
5. **Echo and checks.** Echo the normalized query including `groupBy`; validate sibling order, contiguity and
   `sum(count) == matched` at every level before writing, as `CanopyGridSummary.ToJson` does for native responses.

### Grid detail rows

`reporting.detail` gives reporting grids expandable detail rows (see [grouping.md](grouping.md#detail-rows)). It holds at
most one content source: `template` (the id of a page `<template>`), `renderer` (a plugin detail renderer name) or `view`
(a nested `grid` or tree `view` document whose inline data comes from each record). Without one, records carry their own
payloads. `print: false` leaves details out of exports and print snapshots; `label` describes the content.

A grid row's optional `detail` is a table, properties or html payload (as on tree [detail rows](#detail-rows), without
`height`: grid detail rows always measure their content), `{ "type": "grid", "rows": [...] }` for the nested grid or
`{ "type": "tree", "roots": [...] }` for the nested tree. Detail payloads never join queries, sorting, search or record
counts. Exports that include details add `details: true` to the request, and each exported record a `detail` table,
properties or html payload (nested rows become a table of the nested view's visible columns).

### Row data

An inline grid can carry its rows as compact row data, `rowData`, instead of `rows` (never both; host grids have neither). Each row is an array in a declared column order rather than an object with repeated keys, and the rows come in chunks that the runtime decodes one at a time, so a large dataset costs fewer bytes and the page stays responsive while it loads. Use [large-data.md](large-data.md) to choose between row objects, row data and a bundle.

```json
"rowData": { "version": 1, "columns": ["name", "size", "status"], "count": 250000, "ordered": true, "encoding": "gzip", "chunks": 50 }
```

| Field | Meaning |
| --- | --- |
| `columns` | Declared column ids, unique, in the order of each row's cells. Columns not listed have no cells. |
| `count` | The number of rows in all chunks; the runtime fails the load when the chunks hold another number. |
| `ordered` | Optional. `true` declares ordinal string order for version-1 reader compatibility; display [identity order](#row-identity-order) may differ for numeric keys. The runtime answers early windows only while the decoded rows also follow display identity order; otherwise it waits for all chunks before finalizing numeric order. Invalid declared ordering fails the load. Without it, every query waits for all rows. |
| `encoding` | Optional. `gzip`: each chunk given as a string is the base64 text of the gzip-compressed UTF-8 JSON of the chunk. The runtime inflates it with `DecompressionStream` (every current browser); a browser without it fails the load with a message. |
| `base` | Optional. The folder, relative to the page, of the chunk files of a bundle; requires a chunk count. |
| `chunks` | A count, or the chunks themselves. With a count and no `base`, the chunks are that many `<script type="application/x-canopyx-rows">` elements that are direct children of the grid's host element, in order. With `base`, they are the sidecar files `rows/0.js`, `rows/1.js` and so on under it, which register `[view id, "rows/<n>", chunk text]` as other sidecar files do (see [Sidecar](#sidecar)). As an array, each item is a chunk: an array of rows, or a string (the chunk's JSON text, or base64 gzip text with `encoding`). |

A row is `[key, cell, cell, ...]`. `key` is the row id, or `{ "id": "...", "tone": "...", "className": "..." }` for a row with a tone or classes. The cells follow in the order of `columns`, in the cell format of [Cell](#cell); `null` is an empty cell, as is a cell after the end of a shorter array, so writers leave trailing empty cells out. A decoded row is exactly the row object with the same id, cells, tone and class; the runtime validates every chunk as it validates `rows`, including unique ids across chunks.

```json
[["a0000001", "Asset 1", 120, { "value": "Faulty", "tone": "danger" }], [{ "id": "a0000002", "tone": "warning" }, "Asset 2"]]
```

The order of the rows in the data never changes what the grid shows: it orders rows by their sort keys and then by id. `CanopyGridRowData` writes version-1 chunks in ordinal string order and declares `ordered`, preserving compatibility with existing readers. When that wire order differs from numeric display order, the current reader waits for every chunk before finalizing numeric windows. While chunks are decoding, `view.rows` of the grid's API holds the rows decoded so far; reporting grids (which total and group the complete rows) and every sorted, filtered or searched query wait until all rows are decoded. Destroying the grid stops the decoding. A chunk that fails to load or decode fails the queries waiting for it, and a retry decodes from the first chunk again; the host request deadline (`requestTimeoutMs`) does not bound decoding unless the host sets it. The value lists of column filters and the facets of reporting grids wait for all rows.

#### Row identity order

The grid's width allocation and auto-height policy are described in [Grid column fitting](column-fitting.md), including preferred widths, content floors, header slack and measured scrollbar gutters.

Grid definitions may opt in to `rowIdentity: "ordinal"` for a materialized dataset without a key column. The default is `stableKey`. An ordinal row id is its zero-based position in the source snapshot, formatted as invariant digits. Assign it once before querying, and keep it attached to the record while sorting, filtering, paging, exporting or opening the drawer. Equal records still have distinct positions. Hosted materialized snapshots return the original source positions, never the offsets of the sorted or filtered result.

In C#, `new CanopyDataGridView<Event>("events", "Events", CanopyGridRowIdentity.Ordinal)` assigns positions as records are added; the untyped view exposes `RowIdentity`. See `ordinal-grid.html` in the generated examples. No synthetic key column is needed.

Ordinal identities are local to one immutable snapshot. Saved views retain query and presentation but write an empty `selection`; applying state with a nonempty selection fails with a diagnostic requiring stable row keys. Current-snapshot selection and selected export remain available. A hosted snapshot changing its revision clears local selection. Keyed live updates, including the lazy-loaded live APIs, and record deep links require stable keys and reject ordinal datasets with a diagnostic. Drawers remain available without deep links. Replace the whole report to show a new ordinal snapshot.

Selection controls are explicit: `reporting.selectionControls: true` enables reporting checkboxes for a selectable grid. Read-only hosts use `selection: "none"` (`CanopySelectionMode.None`) and leave selection controls off when no selected export scope or row action needs them. Drawers, sorting, filtering and exports of all or filtered records remain available. CanopyX does not infer host actions from enabled file formats; the host knows which selection scopes it offers.

Every grid uses its row ids as the last sort key. Ids order by UTF-16 code unit, except canonical integers (`0`, `42`: ASCII digits without a sign or a leading zero), which order as numbers and before every other id: `2`, `10`, `100`, `a7`, `b`. A dataset keyed by numbers therefore shows in its natural order without padding its keys. C# writes numeric keys with `new CanopyGridRow(long)`, `CanopyRowIdentity.Format`, or a typed grid keyed by a number, and compares ids with `CanopyRowIdentity.Compare`; the CanopyX.Data in-memory provider orders the same way. A host that pages from its own store orders by its key column.

Every compact descriptor keeps `version: 1` within `canopyx/2`, so independently deployed or cached readers can decode newly generated row data. C# fragments and pages write row data by themselves for inline grids of more than 5,000 rows, compressed above 5 MiB of JSON (`CanopyHtmlOptions.RowData` and its `Format` choose otherwise; see [large-data.md](large-data.md#how-canopyx-chooses)), and carry the chunks inside the host element and the row data part, `canopyx-data.js`. Hosts also write it through `CanopyDataGridView.SaveHtmlBundle` (sidecar files), or `CanopyGridRowData` directly (`ToJson(base)`, `GetChunk(index)` and `WriteFiles(directory)`). JavaScript hosts pass `rowData` with chunk arrays in the view, or write the same script elements. A compact row has no place for a detail payload or record fields: `CanopyGridRowData` refuses rows that carry them, which stay row objects. A JSON chunk inside an HTML script element must escape `<` (the C# writer escapes `<`, `>` and `&`), and inside a `String.raw` template the backtick and `${`.

### Live data

A grid's optional `live` object turns on live data ([live-data.md](live-data.md)): `{ stableOrder?, flash?, batchMs?,
pollMs?, announce?, pauseWhenHidden? }`. `stableOrder` (default true) keeps rows whose sort keys change in their places until
the reader re-sorts; `flash` is `true` or `{ durationMs }` (100 to 10,000); `batchMs` (0 to 60,000) applies changes arriving
within that time together; `pollMs` (0, or 250 to 86,400,000) polls the source; `announce` and `pauseWhenHidden` default to
true. A view with `live` loads the `live` part (payload `application/x-canopyx-live`, or `canopyx-live.js` and `.css`); the
browser API loads it on first use in any grid.

A `gridTransaction` carries changes to an open grid: `add` (complete rows; a row whose id the grid has replaces it), `update`
(rows whose cells are merged into the existing row's; a `null` cell clears it, and `tone`, `className`, `fields` and
`detail` replace the row's when given) and `remove` (row ids), at most 100,000 rows in all. Removes apply first, then adds,
then updates; an update or removal of an id the grid lacks is skipped and reported as missing. Rows are validated against the
grid's columns as inline rows are, and a transaction with an invalid row changes nothing.

```json
{ "protocol": "canopyx/2", "type": "gridTransaction", "view": "endpoints",
  "add": [{ "id": "ep-41", "cells": { "name": "edge-41", "latency": 88 } }],
  "update": [{ "id": "ep-07", "cells": { "latency": 212, "errors": null } }], "remove": ["ep-12"] }
```

Hosted grids keep the existing revision contract: a refresh asks for its pages without a revision and compares the answer's
revision with the accepted one, so a source that changes its revision when its data changes needs nothing new. A hosted grid
applies only updates of loaded rows; its rows are added and removed at the source. The wire format of queries and pages does
not change.

### Calendar

The optional `calendar.resourceIds` names a text column containing a JSON array of resource ids, added to `resource`.
Sources may declare `url`, `fetchParams` (string query parameters), `color` (`#RRGGBB`) and `hidden`; JSON feeds use the
visible start/end/timeZone and return basic calendar events. Feeds are read-only and same-origin. See [calendar sources](calendar.md#sources-and-icalendar).

A grid's optional `calendar` object presents its records as events ([calendar.md](calendar.md)): month, week, day, N-day
(`days`), agenda, year, mini month (`mini`), week and day lists (`weekList`, `dayList`) and stacked months (`months`) views, and a timeline. Only `start` is required; every other key is written only when it
differs from its default. Column references are ids of the same grid: `start`, `end`, `recurrenceId` and `seriesEnd` name
date-and-time columns; `allDay` (booleans), `resource`, `recurrence` (rule text), `exceptions` (ISO instants or `yyyy-MM-dd`
dates), `series`, `display`, `description`, `tone` (tone names), `source` (source ids) and `editable.allowedResources` name text columns; `title`, `subtitle` and `status` may name any
column. `series` and `recurrenceId` (an override record replacing one occurrence) go together.

```json
"calendar": { "start": "starts", "end": "ends", "resource": "host", "recurrence": "rule", "seriesEnd": "seriesEnd",
  "views": ["month", "week", "agenda", "timeline"], "slotMinutes": 15, "workingHours": { "start": "08:00", "end": "17:00" },
  "editable": { "commit": "manual" }, "resources": { "view": { "protocol": "canopyx/2", "type": "view", "...": "..." } } }
```

The presentation keys are `view` (first view; default the first of `views`), `views` (default `month`, `week`, `day`,
`agenda`, plus `timeline` with `resources`), `date` (`yyyy-MM-dd`), `days` (2 to 14), `firstDay` and `hiddenDays` (0 is
Sunday), `slotMinutes` (5, 10, 15, 20, 30 or 60), `minTime`, `maxTime` and `scrollTime` (`HH:mm`, the visible hours on slot
boundaries), `workingHours`, `nowIndicator`, `eventLimit` (1 to 20 or `auto`), `eventStyle` (`quiet` or `strong`), `timeZone`
(`utc`, `local` or an IANA zone; default the grid's) and `phone` (the view phones start in). `editable` is `true` or an object
of `move`, `resize`, `resources`, `overlap`, `workingHours`, `allowedResources`, `snapMinutes` and `commit` (`auto` or
`manual`); without it the calendar is read-only. `resources` holds a complete tree `view` document (inline roots or a remote
source) whose node ids are the resource ids, with `width` (120 to 800), `label` and per-column `aggregates` (`count`, `busy`,
`overlap`); without it the timeline packs the events into rows by overlap. `zoom` and `zooms` choose the timeline's scale (`hour` to `quarter`), `capacity` adds a
concurrency lane with rising tone `thresholds`, `ranges` (at most 1,000) draws static background or unavailable ranges (`inverse: true` shades everything outside the inverse ranges of the same resource instead),
`availability` (at most 10,000) sets business hours per resource, and `limit` (1 to 100,000, default 20,000) caps the
occurrences one range shows.

The chrome and interaction keys are `toolbar` (`true`, `false` for the calendar's own bar only, or the grid toolbar controls
to show: `search`, `filters`, `columns`, `views`, `export`, `more`), `details` (`drawer` or `popover`), `print` (a Print
button), `sources` (1 to 50 `{ id, label, tone?, color?, ics?, url?, fetchParams?, hidden? }` with a legend; `ics` is a relative or same-origin URL of an
iCalendar file read within the limits of [icalendar.md](icalendar.md); without `ics` or `url` on every source, `source` is required),
`create` (`true` or `{ minutes, allDay }`, minutes 5 to 1,440, default 60) and `drop` (external drops), both needing editable
start and title columns and saved as inserts ([Editing and commit](#editing-and-commit)), `occurrence` (`ask`, `this`,
`following` or `all`; default `ask` with `series` and `recurrenceId`, else `all`; `this` and `following` need them),
`weekNumbers` (`false`, `iso` or `locale`), `navLinks`, `validRange` (`{ start?, end? }` dates, end exclusive),
`fixedWeeks`, `outsideDays`, `span` (`{ count: 1..366, unit: day|week|month }` for the timeline), `menu`, `hover`,
`yearEvents`, `agendaSpan` (`day`, `week`, `month` or `year`; default `month`) and `months` (2 to 24, default 6). The
C# presets (`CanopyCalendarPreset`) and basic calendars built from events (`new CanopyCalendar(events)`) only write these keys.

Recurrence rules are the RRULE subset of RFC 5545 that `CanopyRecurrence` (C#) and the browser share: `FREQ` (`DAILY`,
`WEEKLY`, `MONTHLY`, `YEARLY`), `INTERVAL`, `COUNT` or `UNTIL`, `BYDAY` (numbered weekdays only in monthly and yearly rules),
`BYMONTHDAY` (not in weekly rules), `BYMONTH`, `BYSETPOS` and `WKST`; any other part is an error. The series start always counts
as the first occurrence, occurrences keep its wall-clock time in the series zone (the calendar's IANA `timeZone`, otherwise UTC;
a skipped time moves forward by the daylight saving gap, a repeated time is its first occurrence), and all-day series expand in
UTC. `exceptions` values are separated by commas, semicolons or white space (at most 1,000): instants with `Z` or an offset,
wall times without one in the series zone, or `yyyy-MM-dd` dates. `tests/fixtures/recurrence-cases.json`
holds the cases both implementations check. A view with `calendar` loads the `calendar` part; the `calendar-recurrence` part
with a `recurrence` column, a recurring range or an iCalendar source; the `calendar-edit` part with `editable`, `create` or
`drop`; the `calendar-ics` part with an iCalendar source or the Export control in the toolbar (otherwise on first export); and
the `timeline` part with `resources` or the `timeline` view.

### Record panel

A grid's or tree view's optional `record` is its record panel ([record-panel.md](record-panel.md)): the record drawer with
record-only fields, sections, tabs, a pinned summary, structured values, related records, deep links and record actions. A view
that declares one, a column with a `structured` presenter, or a structured cell loads the `record-panel` part (payload
`application/x-canopyx-record-panel`, or `canopyx-record-panel.js` and `.css` beside the runtime).

| Field | Meaning |
| --- | --- |
| `fields` | Record-only fields `{ id, title, kind?, presenter?, wrap?, section? }`; ids differ from the column ids. Rows carry their values in `fields` (nodes too); they never join queries, search, sorting, the Columns menu, exports or saved views. Presenters apply on flat grids. |
| `header` | `{ status?, facts? }`: the field shown first in the pinned summary, and up to six key facts. |
| `sections` | `{ id, label, fields?, collapsed?, renderer?, sections? }`, nested up to three levels. A field shows in the first section that lists it; every other field joins a trailing "Other fields" section. Without sections, fields group by their section label. `renderer` names a plugin's `drawerSections` entry or the host's `recordSections`. |
| `tabs` | `{ id, label, sections }` listing top-level sections; unlisted sections join the last tab. |
| `hideEmpty` | Empty fields hide until the reader shows them. Default true. |
| `jumpList` | A jump list of a tab's sections; absent shows it from four sections. |
| `deepLink` | `true` or `{ key }`: the open record is written to the address as `#<key>=<view>:<id>` (key `record`; a tree writes the node's id path joined by `/`) and opened from it. |
| `source` | `{ kind: "inline" }` (default), `{ kind: "host" }` or `{ kind: "sidecar", base, shards }`: where record details load from (below). |
| `actions` | `{ copy?, print?, export?, link? }`: `false` switches a built-in record action off. |

Columns accept `drawer: false`, which keeps a column out of the drawer and the record panel. Tree columns accept `section`,
the drawer section of the column. Writers and readers check that every id is unique and that sections, tabs and the summary
name declared fields and sections.

#### Record details

A record's details load when its drawer opens: from the host's `loadRecord(request, { signal })` option (whatever the
declared source), from a hosted grid source's `record(request, { signal })` hook, or from record packs. The request is a
`gridRecordQuery`:

```json
{ "protocol": "canopyx/2", "type": "gridRecordQuery", "view": "certificates", "id": "cert-0042", "revision": "r7" }
{ "protocol": "canopyx/2", "type": "gridRecordQuery", "view": "certificates", "id": "cert-0042", "field": "sameName", "offset": 5, "limit": 50 }
{ "protocol": "canopyx/2", "type": "gridRecordQuery", "view": "certificates", "id": "cert-0042", "row": true }
```

`revision` is the accepted dataset revision of a hosted grid or query-aware tree; ordinary inline sources omit it.
`field`, `offset` and `limit` ask for the next rows of a collection field ("Load more"); `row: true` asks for the record's row
too, because the browser has not loaded it (a deep link or a related record outside the loaded rows). The answer is a `gridRecord` (a plain object with the same
members is accepted from browser hooks; `null` means no details):

```json
{ "protocol": "canopyx/2", "type": "gridRecord", "view": "certificates", "id": "cert-0042", "revision": "r7",
  "fields": { "thumbprint": "A1B2…", "contacts": { "records": { "columns": [...], "rows": [...], "total": 4 } } },
  "cells": { "names": { "value": "a, b, c", "items": ["a", "b", "c"] } },
  "row": { "id": "cert-0042", "cells": { ... } } }
```

`fields` holds record field values; `cells` holds values of grid columns that replace the row's cells in the drawer only;
`row` is the record's row. An answer to a field page holds that field alone: `{ "fields": { "sameName": { "records": { "rows":
[...], "total": 12 } } } }`, whose rows the panel appends (an empty page ends the list). The panel caches 64 records per view;
a failed load shows Retry and reports the error.

Record packs (`kind: "sidecar"`) are scripts beside the page, `<base>r<n>.js`, where `n` is the FNV-1a hash of the record id's
UTF-16 code units (from 2166136261, multiplying by 16777619, unsigned 32-bit) modulo `shards`. Each registers, like the tree
sidecar files, `[viewId, "r<n>", document]` with a `gridRecordPack`:

```json
{ "protocol": "canopyx/2", "type": "gridRecordPack", "view": "certificates", "shard": 3,
  "records": [{ "id": "cert-0042", "fields": { ... }, "cells": { ... } }] }
```

`CanopyRecordSidecar.Write(pageFolder, view, records)` writes them, streaming one record at a time; `CanopyGridRecord` and
`CanopyGridRecordQuery` write the two exchange documents. Packs load from `file://`; the browser keeps 16 of them.

#### What a server adapter implements for gridRecord

A remote adapter adds a record endpoint and routes the browser source's `record` hook to it (`CanopyX.Data` does, see
[Record details](remote-dotnet.md#record-details)):

1. **Request parsing.** Read `gridRecordQuery`: `view` (a configured grid), `id` (a record identity; bounded, not interpreted
   as a key expression), optional `revision`, `field` with `offset` and `limit` (1 to 10,000), and `row`.
2. **Authorization.** Check the caller may read the record and every field it returns; leave out fields the caller may not
   see (a missing field is an empty field) and apply the field allow-list the adapter has for columns to record fields too.
3. **Revision.** Answer from the requested revision or reject a stale one, as page requests do; echo `revision`.
4. **Record lookup.** Find the record by its stable identity (an indexed key lookup, never a scan of the query result), map its
   detail columns or joined tables to `fields` and fuller column values to `cells`, and include `row` when asked.
5. **Collection pages.** For `field`, page that collection with the same ordering every time (a stable key last), return the
   rows from `offset` (at most `limit`) and the collection's `total`; reject a field that is not a collection.
6. **Limits.** Bound the answer's size (rows per page, serialized bytes) and the request rate per caller, and stream large
   answers. Write the answer with `CanopyGridRecord.ToJson(view)`, which checks it against the definition.

### Safe cell presenters

Flat-grid number columns optionally declare `format: { minimumFractionDigits, maximumFractionDigits, prefix, suffix }`. Digits are 0 to 10 (defaults 0 and 3, minimum not above maximum; a minimum above 3 requires an explicit maximum); `prefix` and `suffix` are literal text of 1 to 16 code units, and the prefix follows any minus sign. The format applies to raw numbers without cell `text` in cells, presenters, facets, record details, copy, exports, group headings of a numeric grouping column, selection totals and summaries. Readers format the digits in the page `lang`; the static outline uses the invariant culture. Explicit formats round the binary64 value once, halfway away from zero, matching JavaScript fixed-point formatting. For example, `2.675` is represented just below the decimal midpoint and shows `2.67` with two digits; exact `0.125` shows `0.13`. A value that rounds to zero shows no minus sign. Raw values still drive search, filters, sorting and raw exports. Server display exports use the trusted schema column format and the request locale, rather than accepting a client-supplied format override.

Flat-grid columns optionally declare `presenter`; `reporting.presenters` remains supported. The column declaration takes precedence over the reporting map, and an explicit trusted host renderer takes precedence over both. These descriptors preserve raw values, display/export text, search aliases, typed predicates and sorting:

Graphite also provides `enum` and `state` with an optional raw-value `tones` map, `change` with a numeric `deltaColumn` and `higherIsGood`, `statusStrip`, `sparklineBars`, `sparklineLine`, `identifier` with `secondaryColumn` and `mono`, `tags` with a literal `separator`, and `missing`. Booleans accept `inverted`. Progress and sparklines accept up to 32 ascending `thresholds` (`upperBound`, `tone`); the first inclusive bound wins, and unmatched values use the cell tone. Sparkline `minimum` and `scaleMaximum` must be supplied together for a shared scale; otherwise each cell scales independently. `mark: "last"` selects the last point; the default marks the worst tone, then the least healthy value according to `higherIsGood`.

Cell objects optionally include `secondary` and up to 4096 ordered `series` periods (`period`, optional numeric `value`, text `state`, and `tone`). This visual metadata does not become the raw value. Strips shrink to two-pixel segments and then merge adjacent periods into worst-state buckets, with the complete range in the tooltip. Bar histories also combine adjacent periods when needed to retain the complete history and its worst or last-period marker within the column width. Static output uses check/dash, state and pill text, numeric deltas and compact history summaries. These additive fields remain in `canopyx/2`.

| Kind | Fields | Presentation |
| --- | --- | --- |
| `link` | Optional `hrefColumn` and `newWindow` | Text column with an HTTP(S), mailto or relative offline-file destination from that column or another declared text column. Invalid destinations remain plain text. New windows use `noopener noreferrer`. Explicit file, UNC, JavaScript, data and blob URLs are rejected. |
| `icon` | Required plain-text `glyph`, 1–32 nonblank code units | Decorative glyph beside the existing text alternative; no markup is interpreted. |
| `progress` | Positive finite `maximum` within the safe-integer magnitude; optional `thresholds` | Numeric column with a slim threshold-coloured track and its formatted value, visually clamped from zero to maximum. The raw value is retained. |
| `boolean` | Optional `inverted` | Boolean values show a check or muted dash, with translated accessible yes/no text. Inverted true values use the danger tone. |
| `enum` / `state` | Optional raw-value `tones` map; optional `quietTones`; optional `quietStyle` (`muted` or `plain`) | Enums use compact pills, each with a tinted fill and a border in its tone (a host tone takes its `--hfx-color-status-<name>-bg` fill when the theme defines one, otherwise a tint of its ink); state columns use a dot and text, with quiet healthy styling for the `success` tone. Tones listed in `quietTones` (at most 16) render as plain text, for example `["success"]` so passing values read quietly and chips remain for values that need attention. Quiet text is muted unless `quietStyle` is `plain`, which keeps the normal text colour (for values without a tone that are ordinary, not secondary). In an enum column quiet values keep the pills' inline start, so both line up. |
| `change` | Numeric `deltaColumn`; optional `higherIsGood` | A directional delta beside the original formatted value; the column declares which direction is healthy. |
| `statusStrip` | None | One segment per period, shrinking to two pixels before adjacent periods merge into worst-state buckets. Tooltips name the original period or merged range. |
| `sparklineBars` / `sparklineLine` | Optional `thresholds`, paired `minimum` / `scaleMaximum`, `higherIsGood`, and `mark` | Compact history with a per-cell or declared shared scale and a marked worst or last point. |
| `identifier` | Optional `secondaryColumn` and `mono` | Identifier text with secondary text from another column or the cell's `secondary` field. |
| `tags` | Literal `separator` | Up to three tags, then a `+N` complete-text action. |
| `missing` | None | Empty values use a muted em dash. |
| `list` | Required literal `separator`, 1–16 code units, and integer `limit`, 1–16 | Text column with a bounded delimiter-separated preview and a complete-text dialog when truncated. |
| `longText` | Optional `mono` | Wrapped text is clamped to four lines with a fade and Show more; explicit fixed-height rows retain a one-line preview. The complete text opens in a dialog. |
| `structured` | Optional `display` (`count`, `chips`, `first`), `limit` (1–16) and `countText` (with `{count}`, at most 256 code units) | A structured value's summary ([Cell](#cell)): a count, the first chips and +N, or the first item and +N; without `display` a list shows chips, an object its first value and the rest a count, and a cell's own `text` wins. Comes with the record panel part. |

Links are limited to 8,192 code units and reject control characters. Long-text previews use a bounded estimate of five lines at the current column width and preserve surrogate pairs. Complete values remain available to queries and exports. Long-text and list dialogs retain text literally, return focus on ordinary close, and close when the accepted query retires or the grid is destroyed. The dialog follows the grid's resolved theme. `gridExpandCell` and `gridCloseCell` provide translated control labels; boolean values reuse `yes` and `no`.

### Reporting column layout

Wire columns retain numeric `width`. Columns size to their content and fill the width as described in [column-layout.md](column-layout.md): an assigned width is preferred unless `fixed: true`, optional `minWidth`, `maxWidth`, `flex` (0 to 100), `autoSize` (`content`, `header`, `none`), `priority` (`essential`, `normal`, `optional`, or an integer where 0 and 1 are essential and 10000 and above optional), `pinned` (`left`, `right` or `null`) `rowHeader` and `alwaysVisible` describe intent, and the identity column (the row header, or the first column) defaults to essential and pinned left. Optional `autoWidth: true` marks a width the .NET writer did not assign; the JavaScript API also accepts an omitted width. Measuring reads the header and up to 200 loaded records, never fetches additional pages, and runs again when an accepted query arrives, on resize and when visibility changes, but not while scrolling. Saved user widths and manual resize choices take precedence. Hidden grids wait until revealed. These optional fields preserve existing `canopyx/2` documents.

`autoFitColumn(id)` and `autoFitColumns()` are available on ordinary and reporting grid controllers. Fit-all returns a frozen map from column ID to `{ width, sampled, scope: "loaded" }`, including hidden columns. Both methods require an accepted query and a measurable grid, and set a sticky user width (disabling flex). `autoSizeColumns(ids?)` drops user widths so columns return to automatic sizing; `setColumnPriority(id, priority)` and `setColumnPinned(id, side)` change priority and pins; `resetColumns()` restores the declared order, visibility, widths and pins while keeping the query. `canopyx:columnResize` reports `{ column, width }` and `canopyx:columnPin` reports `{ column, pin }`. The Columns menu lists each column with a drag handle, a checkbox and an ellipsized label; Alt+Up/Down or dragging reorders, a "Find a column…" field appears above eight columns, and Show all and Reset columns close the list (`gridFindColumn`, `gridShowAllColumns`, `gridResetColumns`, `gridReorderColumn`, `gridPinnedLeft`, `gridPinnedRight`). Fitting and pinning a single column live in each header menu (`gridFitContent`, `gridFitAllColumns`, `gridPinLeft`, `gridPinRight`, `gridUnpin`).

`reporting.columnReorder: true` adds header move controls. Pointer dragging shows a label and insertion edge before committing one ID-based order at release. Escape, pointer cancellation, loss of window focus, query-driven header replacement and destruction retire the drag. Left/Right on a move handle provide the same ordering and keep focus on that column. API moves retain the focused record and column.

`reporting.layout` maps declared IDs to `{ "minimum": 120, "maximum": 600, "flex": 1 }`. Bounds are integral CSS pixels with `40 <= minimum <= initial width <= maximum <= 2147483647`; flex is a finite weight from zero to 100. The bounds and flex weight feed the shared column layout. Visible flex columns share unused viewport space in proportion to their weights before the identity column, redistributing any space left by maximum-width caps. Saved base widths remain separate from this transient rendered width. A manual pointer/keyboard/API resize or auto-fit disables flex for that column. Grid state includes an optional boolean `columns[].flex`; reset and saved-state restoration restore that intent. Older states without it use the declared policy. Widths restored under changed constraints are clamped to those constraints.

The reporting runtime adds `api.autoFitColumn(id)`, returning `{ width, sampled, scope: "loaded" }`. It samples at most 200 accepted-query cached records, measures up to 512 display code units per value with the grid font and presenter allowances, and caps the estimate at 420 CSS pixels or the declared maximum. It includes header/control allowance, never fetches additional pages and does not scrape mounted/custom DOM. Hosted grids therefore fit the cached sample rather than claim to fit the complete result. Enter or double-click on a resize separator invokes the same operation. Pending queries and destroyed grids reject auto-fit. `gridMoveColumn`, `gridResizeHelp` and `gridColumnMoved` translate these controls and announcements.

Layout policies also accept `pin: "none" | "left" | "right"`, nonnegative integral `priority` (at most 2,147,483,647), and boolean `alwaysVisible`. Absent pin means the column's own `pinned` value, or the default that pins the identity column left; absent priority uses the maximum. The header menu and `api.setColumnPinned(id, pin)` change saved pin intent. Columns share one DOM and visual order: left group, scrolling center, right group, preserving the requested order within each group. Moving a header or chooser item across a group boundary adopts the target's pin. `setColumnOrder` keeps the requested order and unpins a pinned column that it places after a scrolling column (or, for a right pin, before one). Saved columns carry optional `pin`; older states use the declared policy.

Effective pins leave `reporting.minimumCenterWidth` CSS pixels (default 128, range 40..4096) for the center. If an edge cannot fit, its pins suspend from that edge's first oversized column inward; requested placement and widths remain saved. `api.getColumnLayout()` distinguishes `requestedPin`, effective `pin`, `visible`, `hiddenReason` (`null`, `"user"`, `"priority"` or `"phone"`), `responsiveHidden` and rendered `width`; `visible` is false for every column out of view, including those hidden by priority or the phone layout (see [column layout](column-layout.md#api-and-events)). Header and cell keyboard focus reveal the scrolling center without being covered by effective pins. Ordinary trees retain their existing pinned-tree behavior.

`reporting.responsive: true` temporarily hides requested columns until their base widths fit, hiding larger priorities first and equal priorities from the end of current order. It retains at least one requested field and all `alwaysVisible` fields; protected fields wider than the viewport use horizontal scrolling. Explicit user visibility remains separate and survives viewport changes. Responsive hiding changes neither search/filter/sort meanings nor full record details. Default export columns include every user-visible column in the grouped display order, including temporarily hidden fields; an explicit export column list retains its caller-defined order. The chooser marks temporarily hidden fields and provides translated pin controls through `gridPinColumn`, `gridPinNone`, `gridPinLeft`, `gridPinRight` and `gridResponsiveHidden`.

### Editing and commit

Grid columns may declare `editable: true`, an `editor` and `validation`; the grid may declare `editing` (`readOnly`, `mode`
`cell` or `row`, `drawer` `phone`, `always` or `never`, `editBar`). The fields are optional additions to `canopyx/2`;
[editing.md](editing.md) describes the behaviour and `$defs/gridEditor`, `$defs/gridValidation` the shapes. `editor` is an
editor name (`text`, `number`, `date`, `datetime`, `time`, `select`, `toggle`, `lookup`, or a name a plugin or the host
registers) or `{ type, min?, max?, step?, placeholder?, options?, lookup? }`. `validation` is `{ required?, min?, max?,
minLength?, maxLength?, pattern?, message? }`; `min` and `max` are numbers, or ISO 8601 moments for date-and-time columns.
Edited values follow the cell rules of this document: numbers within the safe integer magnitude, ISO 8601 moments with an
explicit time zone (the runtime writes UTC with `Z`), text and booleans.

A grid saves changed rows by sending a `gridCommit` document to its writer: the host's `editing.commit(batch, { signal })`,
or the source's `commit(batch, { signal })`. A remote source posts it, for example to `POST {pattern}/commit` beside its
`query` and `facet` endpoints.

```json
{ "protocol": "canopyx/2", "type": "gridCommit", "view": "assets", "revision": "r41",
  "rows": [
    { "id": "asset-003", "values": { "cost": 1250, "status": "Repair" }, "original": { "cost": 1180.5, "status": "In use" } },
    { "id": "asset-007", "values": { "owner": "Chen Wu" }, "original": { "owner": "Ada Park" } } ] }
```

- `revision` is the dataset revision the grid read (the accepted query's), or `null` before one was accepted.
- `rows` holds at least one row: its `id`, the raw `values` of its changed columns, and the raw `original` values the reader
  started from for those columns (`null` for a missing value). Only rows whose checks passed are sent.
- A row may carry `op`: `update` (the default) or `insert`. An insert adds a record (a calendar's created or dropped event, for
  example): `{ "op": "insert", "id": "new-1", "values": { ... } }` with every value of the new record and no `original`. Its
  `id` is a client id the runtime chooses, always starting with `new-` (`new-1`, `new-2`, ...), so it can never name a stored
  record; only editable columns may be written, as for updates.

The writer answers with a `gridCommitResult`, one entry per row it handled:

```json
{ "protocol": "canopyx/2", "type": "gridCommitResult", "view": "assets", "revision": "r42",
  "rows": [
    { "id": "asset-003", "status": "saved", "cells": { "cost": { "value": 1250, "text": "1,250.00" } } },
    { "id": "asset-007", "status": "conflict", "error": "Someone else changed the owner." } ] }
```

- `status` is `saved`, `error` or `conflict`. A saved row may carry canonical `cells` (grid cells, validated like page rows)
  that replace the shown ones; other rows may carry an `error` message and `errors` by column. A row the answer leaves out
  was not saved.
- A saved insert may carry `newId`, the stored identity of the new record (an identifier); the runtime then replaces the
  client id with it. Without `newId` the row keeps the client id, which a later session may issue again for another new row,
so a writer that stores records under its own identities should always answer `newId`. Only saved rows carry `newId`; an
identity another row of the grid already has is refused (the row keeps its client id and the grid reports an error).
- `revision` is optional: the dataset revision after the commit. The grid reports it in the commit result and keeps
  reading pages at the revision it accepted; a host whose source no longer serves that revision reloads the grid.
- A transport failure (a non-success status, invalid JSON, a document that does not answer the batch: another view, an
  unknown or repeated row, an unknown status, `cells` on a row that was not saved) fails every row of the batch with the
  reason. The grid keeps their changes.

**What a writer does.** It authorizes the caller and every changed column (editable columns are a presentation contract,
not authority), validates the values with its own rules (the view's `validation` mirrors them), and executes each row
independently, so one row's failure does not discard the others. It authorizes inserts as updates (every written column must
be one the caller may write; fields the caller must not choose, such as the key, owner or tenant, come from the writer), and
checks the required values an insert leaves out. For concurrency it checks the batch `revision` against
its current one and, where they differ, compares each row's `original` values with what it stores: a row whose stored
values differ is a `conflict` and is not written. A writer that cannot check rows individually may answer every row of a
stale batch with `conflict`. It answers with the revision after the commit. Writes are the writer's own, governed by its
write policy; CanopyX only raises the request.

### Column groups

Optional `columnGroups` draws header rows above a grid's columns ([column-groups.md](column-groups.md)). Each group is `{ id, title, columns?, groups?, pinned? }`: a unique identifier, a title of 1 to 256 characters, the declared columns directly below it and nested groups, at least one of the two. Groups nest at most three levels; a column belongs to one group at most; `pinned` (`left`, `right` or `null`) is the initial pin of every column of a top-level group and is refused on nested groups. The .NET writer requires a group's columns to be adjacent in `columns`; the runtime gathers scattered ones where most of them are. Grid state needs no new field: saved column order and pins restore the groups.

The header holds one `row` per group level above the column headers. Group cells are `columnheader`s with `aria-colindex` and `aria-colspan` over their visible columns; body rows' `aria-rowindex` and the grid's `aria-rowcount` count the extra header rows. `getColumnGroups()` returns `{ id, title, columns, visibleColumns, pin, groups }` in the current order and `setColumnGroupVisible(id, visible)` shows or hides a group's columns. The script-free fallback writes the same rows with `colspan` and `rowspan`.

### Cell ranges and the clipboard

Optional `rangeSelection` (`true`, or `{ enabled?, multiple?, fillHandle? }`) and `clipboard` (`{ copyHeaders?, copyValues?: "display" | "raw", paste? }`) turn on cell ranges ([cell-ranges.md](cell-ranges.md)); the host options of the same names override them. A range is `{ startRow, endRow, startColumn, endColumn }`: inclusive row positions in the shown order and column ids. `canopyx:cellRangeChange` reports `{ ranges }`. A new query clears the ranges; a reload of the same query keeps them.

Copies write tab-separated text (with spreadsheet formula protection for text, as CSV) and an HTML table with typed cells. Pastes and fills raise the cancelable `canopyx:paste` with `{ source: "clipboard" | "api" | "fill", cells, refused, respondWith(result) }`, where each cell is `{ id, column, row, text, value, previous }` and `value` is the text read as the column's kind. A grid with the editing part applies the cells through editing (read-only rules, checks, one undo step); without it the grid applies nothing and a host answers with `respondWith({ refused: [{ id, column, reason }] })` or `false`. A copy or paste covers at most 200,000 cells.

## View

Every tree runtime loads the **tree tools part** (`canopyx-tree-tools.js` and `.css`) when a tree mounts: the toolbar's
Columns, Views, Export and more menus, column fitting, auto height, named views and tree exports, from the same sources
as the flat grid's menus and fit. Single-file pages carry it as inert payloads (`application/x-canopyx-tree-tools` and
`application/x-canopyx-tree-tools-style`, `CanopyHtmlAssets.TreeToolsMarkup`); otherwise the runtime loads the plain or
content-hashed files beside itself, so hosts serve them beside every entry point. A tree's Export menu body and writers
come from the export part (`canopyx-export.js`, `application/x-canopyx-export`), loaded on first use, which single-file tree
pages carry and hosts serve the same way. The runtime finds a payload anywhere in
the document by its type and `data-cx-version`, so several trees on one page share one payload: fragments written with
the same `CanopyHtmlOptions.Document` (a `CanopyHtmlDocument`) embed the part once, in the first fragment, and so do the
export part and the filter editor part of flat grids. The tree reports ready once the part is installed; a tree whose part
cannot load keeps its rows, search and filter switches and reports a `canopyx:error`.

Tree columns other than the tree column pin left (after it) or right (`pinned`), as on flat grids; `setColumnPinned(id, pin)` changes a pin once the part is installed, and remembered state keeps the pins. A column's optional `tooltip` is `"auto"` (a cut-off cell shows its full value on hover) or the id of a declared column whose text the tooltip shows, on trees and flat grids alike; a cell's own `title` wins.

The part also brings the print outline and `toOutline()` (empty until it is installed, so call it once `ready` has resolved), and row activation: Enter on a node
row (which selects and toggles) and a double click (which toggles) first dispatch the cancelable `canopyx:rowActivate` event
with `{ id, node, keyboard }` and call `onRowActivate(node, { keyboard })`; `preventDefault()` or a `false` return keeps the
tree's own action from running, so a host can open its own view of the node. Space, the expander and the status rows keep
their actions.

CanopyX menus (the toolbar menus, a flat grid's column popover, a tree's actions menu and the reporting header selection
menu) close on a pointer press or focus outside them, and when another CanopyX menu opens: an opening menu dispatches
`canopyx:closemenus` on the document with itself as `detail.source`. A host closes them the same way, dispatching
`canopyx:closemenus` on the document (every view) or, with `bubbles: true`, on an element that holds views (those views); `closeMenus()` on a grid
or tree closes its own. A host can listen to the event to close its own popovers when a CanopyX menu opens.

Tree columns declare their initial `width` and may include `minWidth` and `maxWidth` in CSS pixels. The bounds are
integers from 40 through 2,147,483,647, with the minimum no greater than the maximum; absent bounds use that full
range. The runtime clamps the initial width, pointer and keyboard resizing, `setColumnWidth()` and restored widths
to the declared range. Resize separators expose the same range through `aria-valuemin` and `aria-valuemax`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique within a page. Scopes element ids, remembered state, sidecar files, and deep links. |
| `label` | string | Accessible name of the tree grid. |
| `rowHeight` | integer 20 to 64 | Height of every row in CSS pixels. |
| `pageSize` | integer 1 to 10,000 | For inline sources, how many children show before a "show more" row. |
| `selection` | `single` or `multiple` | Selection mode. |
| `checkboxes` | `independent` or `hierarchical` | Optional. Checking is separate from selection and requires the interactive tree entry point. Absent means no checkboxes. |
| `checkIntents` | array of `{ path, checked }` | Optional when checkboxes are enabled. Complete node-ID paths and boolean values; paths are unique and may name unloaded descendants. |
| `dragDrop` | boolean | Optional. Enables internal move proposals when the host supplies a drop hook. |
| `contextActions` | array of `{ id, label }` | Optional. Unique action IDs and visible menu labels; the host supplies execution and authorization. |
| `columns` | array of columns | The first column is the tree column. At least one. |
| `icons` | object | Optional. Icon key to trusted SVG markup, declared once and referenced by nodes. |
| `search` | object | Optional. Shows the search box. When present it has `minLength` (1 to 16; at least 2 for sidecar sources) and `maxResults` (1 to 500), and optionally `placeholder` (the box's placeholder and accessible name; `labels.searchPlaceholder` when absent) and `kinds`: the node kinds search can find. Without `kinds` every node can be found. |
| `filters` | array of filters | Optional. "Only matching" switches. |
| `timeZone` | `utc` or `local` | Optional. The time zone `datetime` columns show at first: UTC (the default), or the reader's own. A host can switch it at run time. |
| `pinTreeColumn` | boolean | Optional. The tree column stays in view while the other columns scroll sideways. With the tree tools part it is pinned by default, so only `pinned: null` on the tree column unpins it. A host can change it at run time with `grid.setTreeColumnPinned(pinned)`. |
| `toolbar` | object | Optional. Per-control switches `filters`, `columns`, `views`, `export` and `more` (booleans); an absent switch keeps its control, and a control switched off is not built. The host's `toolbar` option overrides them and also takes `search`; `toolbar: false` hides the toolbar. |
| `exportFormats` | array of strings | Optional. Ids of registered export formats the Export menu offers after CSV (see [Export](#export-clipboard-and-record-details)). |
| `autoHeight` | boolean | Optional. A tree whose visible rows fit is as tall as its toolbar, header and rows; longer trees keep the host's height and scroll inside it. The height follows expanding and collapsing, and is measured again when the width changes the toolbar (a resize, or crossing the 640-pixel phone layout), as on flat grids: a host gives trees and flat grids the same rule, a height that caps long lists. `false` keeps the host height. Default true. |
| `stateKey` | string | Optional. Session storage key for remembered view state: expansion, selection, columns, sorting, declared filters, timezone, focus, and scroll. |
| `deepLink` | boolean | Optional. Selection writes the id path to the URL hash; a hash expands it on load. |
| `labels` | object | Optional. Translations of the texts the runtime writes itself (see [Labels](#labels)); English where a name is absent. |
| `source` | object | Where nodes come from (see [Sources](#sources)). |
| `roots` | array of nodes | Top-level nodes; present only for inline sources. |

A column has `id`, `title`, `width` (at least 40), `kind` (`text`, `number`, or `datetime`), and optional `sortable`, `hidden`, `editable` and `renderer`. `editable` enables edit proposals when the host supplies an edit hook. `renderer` (1 to 64 ASCII letters, digits, hyphens or underscores, starting with a letter; flat-grid columns too) names a cell renderer a browser plugin registers (see [plugins.md](plugins.md)): the plugin draws the column's live cells, a host renderer for the column wins, and a name no plugin on the page registers keeps the built-in painter. Exports, print outlines and the static fallback keep the cell text. The tree column cannot be hidden. Tree columns fit as flat-grid columns do (see [column-layout.md](column-layout.md)): `autoWidth: true` measures the visible rows' content and leaves `width` as the fallback until the tree tools part has measured; without it `width` is preferred (the column grows to its content and takes spare width). The layout fields `fixed`, `flex`, `autoSize`, `priority` and `alwaysVisible` mean what they mean on flat-grid columns, and the tree column alone may declare `pinned: null` to scroll sideways with the others. A width the reader drags, types or sets stays (`sized` in remembered state) until Reset columns. A filter has `id`, `label`, `flag`, an optional `ancestorFlag`, and an optional `hidden`.

### Host Interaction Proposals

In tree views, optional `editable` columns, `dragDrop`, and `contextActions` use the interactive runtime. These definitions describe available controls, not executable domain operations. Static outlines remain readonly. Flat grids edit through the editing part instead ([Editing and commit](#editing-and-commit)).

| Proposal | Fields |
| --- | --- |
| Edit | `nodeId`, complete `path`, `column`, `previous`, `value`; values are finite JSON scalars. |
| Drop | `nodes: [{ nodeId, path }]`, `target: { nodeId, path }`, `placement: "inside" | "before" | "after"`. A root target has `nodeId: null` and an empty path. |
| Context action | `nodeId`, complete `path`, `action`; the action ID comes from `contextActions`. |

The runtime freezes proposals and nested paths before invoking `onEdit`, `onDrop`, or `onAction`. The second argument contains `signal`, `reason`, and accepted `query` and dataset `revision` when the source is query-aware. Hooks return a boolean or a promise of one. The cancelable `canopyx:beforeedit`, `canopyx:beforedrop`, and `canopyx:beforeaction` events can veto execution. Completion events carry `{ proposal, accepted, reason }`. Host hooks authorize and execute against current source data; UI eligibility is an additional presentation constraint.

One proposal owns pending interaction work. Supersession, caller cancellation, destruction, affected data replacement, and the configured deadline settle it. A drop rejects a loaded destination beneath its source and removes descendant sources already covered by a moved ancestor. It does not fetch unloaded data or prove domain eligibility. Refresh accepted data after returning from the hook; a refresh inside the hook retires an operation whose data snapshot changed.

When an accepted children, count, or query update cancels an interaction, its abort listeners run after the synchronous replacement is attached. A listener that opens another proposal or editor therefore reads current data, accepted query, and revision; a removed node is unavailable. Page and transport cancellation retain their own data lifetime.

Starting a count refresh cancels a pending proposal for an affected node before the read changes ownership. Unrelated count reads leave it intact. Local row layout or column changes close editors and menus; abort listeners run after the complete sort or column visibility change, so a replacement editor uses the committed layout. Cancelling an editor clears its pending announcement.

Number columns use numeric editors even when their current cell is empty; an accepted first value reaches the host as a finite number. Move menus, keyboard moves, and pointer indicators evaluate `canDrop` against the same immutable proposal as the drop request, including its actual placement and ancestor-normalized source paths. A rejected keyboard move leaves the command available to the host.

Interaction control translations use the view's `labels`: `actions`, `editValue`, `saveEdit`, `cancelEdit`, `invalidEdit`, `interactionPending`, `interactionRejected`, `interactionFailed`, `markMove`, `moveHere`, `moveBefore`, `moveAfter`, and `cancelMove`. `editValue` and `invalidEdit` accept `{column}`; `interactionFailed` accepts `{error}`. Include the interactive entry point when overriding these labels.

### Checking Intent

An enabled `checkboxes` mode is independent of `selection`. In `independent` mode each rule applies only to its exact path. In `hierarchical` mode a rule applies to the path's branch, including unloaded descendants; a deeper rule overrides it. The default is unchecked. A branch with a checked descendant or an exception to its own checked rule is mixed. Complete loaded sibling sets can combine into one branch intent; partially loaded lists and server-filtered lists never imply a choice for unseen siblings.

```json
"checkboxes": "hierarchical",
"checkIntents": [
  { "path": ["project-a"], "checked": true },
  { "path": ["project-a", "task-1"], "checked": false }
]
```

Paths are complete, nonempty, and contain no repeated IDs. An intent array cannot contain the same path twice. Rules may name unloaded nodes and require no reads. Readers normalize redundant hierarchical rules without changing their meaning. Node IDs retain their exact Unicode and case. Detail rows have no checking control.

The schema rejects repeated identical intent objects. Path uniqueness across different `checked` values is an additional semantic constraint enforced by C# writers and browser readers; JSON Schema's `uniqueItems` compares whole items rather than one property. Hosts validating hand-written documents apply both structural and semantic validation.

The interactive tree entry point reads these fields. C# HTML writers select it automatically; hosts writing fragments include that entry point once for the whole page. Standard readers ignore these optional fields. Version 1 saved views may additionally carry `checkboxes` and `checkIntents`; a mismatched checkbox mode or malformed rules reject the whole restore before changes. Legacy expansion-only state preserves current checks. A modern saved view without checking fields restores the unchecked default. Restoration reports `onCheck` and `canopyx:check` when it accepts the checking presentation. These accepted rules can survive cancellation of later path loading; a restore rejected before presentation changes reports no checking change.

Checkbox state is a presentation intent. The library does not enumerate an unloaded branch, authorize its members, or perform a write. A host interprets rules against its own data and governs the resulting operation.

### Labels

Optional UI components also accept the shared label packs. Tabs use `tabsPause` and `tabsPlay` for the automatic-progression control, and `tabsMotionDisabled` for its explanation when reduced motion disables progression. These optional names are accepted by the view label schema; they load with the UI overlay part and stay outside the ordinary grid and tree runtimes.

The runtime writes some text of its own: the search box's hints and announcements, the "show more", loading, and error rows, the toolbar menus, the names of the column resize handles, the announcements after a page of children, `true` and `false` without display text, the UTC mark on dates and the local-time tooltip, and the notice of a view that failed to mount. `labels` translates them. Every name is optional and English applies where it is missing; a value is a string with visible text. `{name}` placeholders are replaced, numbers formatted in the page language. A runtime accepts only the names it carries. The tree toolbar menus (from the tree tools part) use the flat grid's names for the same controls, and every tree runtime carries them with the same English texts: `gridViews`, `gridViewName`, `gridSaveView`, `gridRemoveView`, `gridResetView`, `gridChooseView`, `gridApply`, `gridFindColumn`, `gridShowAllColumns`, `gridResetColumns`, `gridReorderColumn`, `gridPinnedLeft`, `gridPinnedRight`, `gridResponsiveHidden`, `gridExport`, `gridVisibleRows`, `gridSelectedRows`, `gridAllRows`, `gridDownloadCsv`, `gridCopy`, `gridExportProgress`, `gridExportReading`, `gridExportCancelled`, `gridCancelExport`, `gridMore` and `gridPrint`. A tree translates them in its own `labels` on the core and interactive runtimes too. The other `grid*` names belong to flat grids and stay errors on the tree runtimes; a C# tree view writes only the names the tree runtimes read, so a complete label pack keeps a tree on a tree runtime (the interactive one when it translates interaction texts).

| Name | English | Placeholders |
| --- | --- | --- |
| `searchPlaceholder` | Search (when `search.placeholder` is absent) | |
| `searchResultCount` | {count} results | `count` |
| `searchResultCountOfTotal` | {count} of {total} results | `count`, `total` |
| `searchResultCountOfMany` | {count} of many results | `count` |
| `searchNoResults` | No results | |
| `searchTooShort` | Type at least {min} characters | `min` |
| `searchFailed` | Search failed: {error} | `error` |
| `columns` | Columns | |
| `visibleColumns` | Visible columns | |
| `hiddenColumns` | `[one]+{count} column[other]+{count} columns` | `count` |
| `resizeColumn` | Resize {column} | `column` |
| `columnWidth` | {width} pixels | `width` |
| `loading` | Loading… | |
| `loadError` | Could not load: {error} (Enter to retry) | `error` |
| `queryFailed` | Could not update the view: {error} | `error` |
| `showMore` | Show more ({loaded} of {total} loaded) | `loaded`, `total` |
| `showMoreUnknownTotal` | Show more ({loaded} loaded) | `loaded` |
| `pageLoaded` | {loaded} of {total} loaded | `loaded`, `total` |
| `itemsLoaded` | {count} items | `count` |
| `yes`, `no` | Yes, No | |
| `utcTime` | {time} UTC | `time`, required |
| `localTime` | {time} local time | `time`, required |
| `mountError` | This view could not be displayed: {error} | `error` |

`{error}` is the technical message of what failed, which stays in English. The first `{time}` of a date label is where the date goes. A host that builds pages from C# sets `CanopyTreeView.Labels` once, and the view document carries the names that differ from English; the static outline reads its own texts (the overflow note, the unknown total, the hidden-rows tooltip, and the full-report link) from the same object. A browser host can also pass `labels` to `createTreeGrid` or `CanopyX.configure`, on top of the view's; `CanopyX.labels` holds the English texts by name, and a name the runtime does not know is an error. Count labels accept catalogue forms such as `[one]+{count} column[other]+{count} columns`, selected through the plural rules of the page language. `hiddenColumns` names only responsive fields remaining beyond the phone record line; its tooltip lists their full column titles. Host data (node labels, column titles, cells, badges) is the host's own text and is never translated by CanopyX.

### Filter Semantics

A node matches a filter when its `flags` contain the filter's `flag`; a matching node keeps its whole subtree. A node that does not match stays visible, with its children filtered, when a loaded descendant matches or when it carries the `ancestorFlag`. The runtime never walks data it has not loaded, so a host that wants a collapsed branch to stay visible under a filter marks it with the ancestor flag. Rollup flags like these are always computed by the host.

The toolbar draws a switch for every filter that is not `hidden`. A C# host that writes pages with and without a filter bar of its own from one view names the filters to hide per page in `CanopyHtmlOptions.HiddenFilterIds` (or `CanopyTreeView.ToJson(hiddenFilterIds)`), which writes them as `hidden` without changing the view. A hidden filter is for a host that draws its own control, for example one "only changed" button in front of a filter per time window: it declares the filters, turns one on or off with `grid.setFilterActive(id, active)` or sets the whole active set at once with `grid.setActiveFilters(ids)` (one row rebuild and at most one event, for a control that switches from one filter to another), reads `grid.getActiveFilters()`, and listens for the `canopyx:filter` event on the host element, whose `detail.active` lists the ids of the active filters. The event fires only when the set changes, also when the grid itself turns the filters off: when a search hit or a deep link leads to a row the filters hide, and when the host sets a predicate of its own with `grid.setFilter`, which replaces the declared filters. `setFilterActive` and `setActiveFilters` reject an id the view does not declare, before they change anything.

To replace one group of alternatives while preserving other selections, use `grid.updateActiveFilters({ remove: ["day", "week"], add: ["week"] })`. Both arrays are optional. The method applies removals before additions, validates every named filter before changing state, and commits one transaction. It uses the latest pending filter set on query-backed views, so a choice made while another query is loading retains that query's unrelated selections. `getActiveFilters()` continues to report accepted filters until the replacement succeeds.

For a query-aware remote source, the host applies declared filters before paging and supplies the ancestor rows needed to reach matches. Filter methods return promises, and local predicates do not turn those server filters off. See [Queries Before Remote Paging](#queries-before-remote-paging).

## Node

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique within the view. Search hits, deep links, and remembered state use id paths. |
| `label` | string | Text of the tree column; also used for type-ahead, search, and the outline. |
| `kind` | string | Optional host category, written to the row as `data-kind`. |
| `icon` | string | Optional key into the view's `icons`. |
| `group` | boolean | Optional. The row is a group header (for example a department above its teams). |
| `cells` | object | Optional. Column id to cell. The first column shows `label` unless it has a cell. |
| `badges` | array of badges | Optional. Shown after the label. |
| `flags` | array of strings | Optional. Host flags used by filters. |
| `data` | object of strings | Optional. Facts the host's own scripts need that are not cells, badges, or flags, by name. The runtime does not show or search them; host callbacks (`renderers`, `renderDetail`, a `setFilter` predicate, `onSelect`) read them as `node.data`. Names are not empty and not `__proto__`. A counts document does not change them. |
| `hasChildren` | boolean | Optional. The node has children, loaded inline or on demand. |
| `childCount` | integer, at least 1 | Optional. Total number of children, including those not loaded. Drives `aria-setsize` and "100 of 1,234 loaded". With inline `children` it equals their count. |
| `ref` | non-empty string | Optional. Opaque reference a data source uses to load the first page of children. Defaults to `id`. |
| `children` | array of nodes | Optional. Inline children. |
| `expanded` | boolean | Optional. Starts expanded; lazy children load on mount. |
| `detail` | object | Optional. Makes the node a detail row (see below). A detail row has no children. |
| `className` | string | Optional. Extra CSS class names for host styling. |

A node declares lazy children with `hasChildren: true` and no `children` array. The runtime draws an expander, and when the node opens it asks the data source for the page at `ref` (or `id`). Inline `children` are always complete: a node that has them carries all of them. An inline view has nowhere to load children from, so its nodes cannot declare lazy children or a `ref`.

## Cell

Numeric cells use JavaScript binary floating-point semantics and must be within -9,007,199,254,740,991 to 9,007,199,254,740,991. Fractional decimals may round in the browser. Use a text cell for larger integers or values requiring exact decimal precision; writers reject numbers outside that range.

A cell is either a bare value (string, number, boolean, or null) or an object:

```json
{ "value": 1048576, "text": "1 MB", "title": "1,048,576 bytes", "tone": "warning", "badges": [{ "text": "stale", "tone": "muted" }] }
```

- `value` is used for sorting and, when `text` is absent, for display. Dates are ISO 8601 UTC strings, `yyyy-MM-ddTHH:mm:ssZ` or with milliseconds `yyyy-MM-ddTHH:mm:ss.fffZ`.
- `sort` (text of at most 4,096 code units, or a finite number from −9,007,199,254,740,991 to 9,007,199,254,740,991) is the key the cell sorts by when it differs from its value.
  This is a magnitude bound; fractions within it are valid. For example,
  a run named "Nightly 42" sorts by its ISO start time while its
  column filter, value list and search read the name. Only sorting reads it (inline flat grids, which reject a malformed key, and trees, which ignore one;
  a host source sorts on its own). The grouping column of a grouped grid orders by its values, so groups stay whole, and a column with a text
  `ordering` policy orders by its values through that policy. Give every cell of a column a key of the same type; keys of
  mixed types order numbers before text when ascending. `CanopyCell.SortKey` writes it from C# (dates as ISO 8601 UTC text
  with milliseconds, `yyyy-MM-ddTHH:mm:ss.fffZ`).
- `text` replaces the formatted value. Hosts use it for units, localisation, and phrases like "not collected".
- `tone` is a name: a lowercase letter followed by lowercase letters, digits, and hyphens, at most 32 characters, not ending in `-bg`. The theme maps tones to colours; hosts never send colours. See [Tones](#tones).
- Every string is inserted as text, never as HTML.

A badge has `text`, an optional `tone`, and an optional `title` (tooltip).

A cell object may hold one structured value, which the record panel shows whole and the `structured` presenter summarises
([record-panel.md](record-panel.md#structured-values)): `items` (a list of cells: values with their own tone, tooltip or link;
at most 4,096), `fields` (an object: `{ name, value, kind? }` entries, at most 512), `records` (a collection: `{ columns, rows
| roots, total?, pageLength?, pageSize?, target? }`), `events` (a timeline: `{ time?, summary, actor?, kind?, tone?, ref?,
changes? }`, at most 10,000) or `changes` (`{ name, before, after, kind? }`, at most 512). Values nest up to eight levels;
list items are plain values. Any cell may carry `ref`, a link `{ id, view?, path? }` to another record of its own view or of the
grid or tree whose view id it names (`path` is a tree record's id path). Search, sorting, filters and exports keep reading
`value` and `text`; structured members never join queries.

### Tones

The CanopyX stylesheet has colours for six tones: `neutral`, `info`, `success`, `warning`, `danger`, and `muted`. Six are not enough for every host: a severity scale alone has five steps, next to states such as passing, neutral, or under maintenance. So any other tone name is the host's own, and its colours come from the host's theme:

| Custom property | Used for |
| --- | --- |
| `--hfx-color-status-<name>-fg` | Text colour of cells and badges with the tone |
| `--hfx-color-status-<name>-bg` | Background of badges with the tone. Optional; without it the badge gets a tint of the text colour. |

```css
.cx-host {
  --hfx-color-status-critical-fg: #8f1d1d;  --hfx-color-status-critical-bg: #fde8e8;
  --hfx-color-status-high-fg: #9a3412;      --hfx-color-status-medium-fg: #854d0e;      --hfx-color-status-low-fg: #3f6212;
  --hfx-color-status-maintenance-fg: #3730a3;
}
```

A host maps its states onto names once, for example `critical`, `high`, `medium`, `low`, and `info` for a severity scale, `success` for passing, `neutral` for no state, and `maintenance` for planned work, and sets the properties from its design tokens for the light and the dark theme. An element with a host tone has the classes `cx-tone-<name>` and `cx-toned`, so a host stylesheet can also style it directly. A cell with a tone the theme has no colour for is shown as normal text (a badge with one gets a tint of the text colour), and a value that is not a valid name is ignored. The contrast of a host tone, also on a selected row, is the host's to check. For print the stylesheet resets its own colours to the light theme, because paper is white; a host whose theme can be dark does the same for its tones under `@media print`. The static outline takes host tone colours as literals from `CanopyStaticHtmlOptions.ToneColors`, and with `UseThemeVariables` also from these properties (see "Theming the Outline" in architecture.md).

### Default Formatting and Sorting

The runtime and the static outline show a cell without `text` the same way:

| Value | `number` column | `datetime` column | `text` column |
| --- | --- | --- | --- |
| number | thousands separators, up to 3 decimals, or the flat-grid column `format` | as written | as written |
| string | as written | ISO date shown as `yyyy-MM-dd HH:mm UTC`, or as `yyyy-MM-dd HH:mm` in the reader's time zone | as written |
| boolean | `Yes` or `No` | `Yes` or `No` | `Yes` or `No` |
| null or absent | empty | empty | empty |

The runtime uses the page's `lang` for separators; the static outline uses the invariant culture.

The runtime shows a date in UTC or in the reader's own time zone, as the view's `timeZone` says and as the host sets at run time with `grid.setTimeZone("local" | "utc")` (`grid.getTimeZone()` returns the current one). A date the runtime formats gets the other time zone as its tooltip (`2026-09-27 12:15 local time` next to a UTC time, `2026-09-27 10:15 UTC` next to a local one), unless the cell has a `title` of its own. A cell with `text` is shown as written in both modes. The static outline has no reader's time zone and always shows UTC.

Sorting a column compares cell values, falling back to the display text when a cell has no value. `datetime` values are parsed before comparing, so both ISO forms sort correctly. Numbers sort before strings, strings compare naturally ("file2" before "file10"), and empty cells sort last. Sorting reorders siblings only; it never moves a node to another parent.

## Detail Rows

A detail row sits under its parent and holds one of three payloads:

```json
{ "type": "table", "caption": "Changed settings", "columns": ["Setting", "Before", "After"], "widths": [2, 3, 3],
  "rows": [["Retention", { "value": "30 days", "tone": "danger" }, { "value": "90 days", "tone": "success" }]] }
{ "type": "properties", "height": 4, "items": [{ "name": "Owner", "value": "Engineering" }] }
{ "type": "html", "html": "<div class=\"host-widget\">...</div>" }
```

- `height` is optional. Without it the row is as tall as its content: the runtime starts from an estimate, measures the row when it is shown, measures it again when its content or the width of the grid changes, and keeps the rows the reader is looking at in place. With `height` (1 to 40) the row spans that many row slots and content that needs more scrolls inside it.
- The content of a detail row stays inside the visible width of the grid. It does not scroll away sideways with the columns, however wide they are together.
- A table's `widths` are optional: one share of the table width per column, each 1 to 1,000 (`[2, 3, 3]` makes the first column a quarter). Without them the columns are equally wide. Text that does not fit its column wraps.

Table and property cells follow the cell rules above. In the interactive browser view, `html` is trusted host markup, inserted without sanitising unless the host gives a `sanitizeHtml` option; hosts must encode any user-supplied text in it (see [security.md](security.md)). The static fallback and print outline encode HTML detail payloads as text to remain script-free; use table or property details for formatted fallback output. JavaScript hosts can also render detail rows themselves through the runtime's `renderDetail(node, element)` callback; `element` is the body of the row, which has the visible width of the grid, and a row without `height` takes the height of what the host puts into it. Host renderer callbacks own the safety of any markup they produce. Static overflow links allow relative, HTTP, HTTPS, and mailto URLs; other schemes are omitted.

## Page

```json
{ "protocol": "canopyx/2", "type": "page", "parent": "projects", "offset": 0, "total": 1234,
  "items": [ { "id": "projects/plans", "label": "plans" } ], "next": "p/12#3" }
```

- `parent` is the id of the node whose children these are, or `null` for the top level. It must not occur among the page items or their inline descendants.
- `offset` is the index of the first item among all of the parent's children.
- `total` is optional; when present it is at least `offset` plus the number of items. A continuation is required exactly when that sum is below the known total.
- `next` is an opaque continuation. The data source passes it back to get the next page; `null` means the last page. The runtime shows a "show more" row while `next` is set.
- `revision` is an optional nonempty identifier for the dataset snapshot. Query-aware sources require it on every page, search result, and counts document; ordinary inline, sidecar, and remote sources do not require it.
- Items may carry inline `children`. A node with a lazy `ref` or positive `childCount` and no inline children must declare `hasChildren: true`; readers reject the otherwise unreachable children before attaching the page.

## Search

A search result lists id paths, so the runtime can expand the tree to each hit without knowing anything else about the data:

```json
{ "protocol": "canopyx/2", "type": "search", "query": "plan", "total": 2, "truncated": false,
  "hits": [ { "path": ["projects", "projects/plans"], "label": "plans", "kind": "folder", "context": "\\\\files\\projects" } ] }
```

The path starts at a top-level node and ends at the hit, with no repeated node ids. A known search total must be at least the number of returned hits, and `truncated` must be true exactly when the total exceeds that count. Choosing a hit expands every node on the path, paging through "show more" until each id is loaded, then selects and focuses the hit. The index of a bundle also says where the pages on the path of each hit are, so the runtime asks for all of them at once, instead of level after level (see [Search Index](#search-index)). The hits of a remote endpoint carry no such locations: a hosted path loads one level after another.

Matching is by word prefix: a label matches when every word of the query is the start of some word of the label. "sal rep" matches "Quarterly Sales Report". The bundle writer and the runtime split and fold text the same way:

- A word is a run of characters that are not separators. Separators are every ASCII character other than `A` to `Z`, `a` to `z`, and `0` to `9`; characters above ASCII are always part of a word.
- Folding uses fixed cross-runtime rules for common capitals: `A` to `Z`; Latin-1 U+00C0 to U+00DE except U+00D7; Latin Extended-A U+0100 to U+017F, where each capital is followed by its small letter (capitals are the even code points up to U+0137 and from U+014A to U+0177, the odd ones from U+0139 to U+0148 and from U+0179 to U+017E, and U+0178 folds to U+00FF); Greek U+0391 to U+03A9 except U+03A2, plus the accented capitals U+0386, U+0388 to U+038A, U+038C, U+038E, and U+038F; Cyrillic U+0400 to U+042F; and Armenian U+0531 to U+0556. Remaining single-unit lowercase pairs use one frozen Unicode 16.0 table shared by the C# writer and browser runtime, independent of the host's Unicode version. A lowercase mapping that expands to multiple units, including U+0130, is not applied; U+0131 stays distinct from `i`.
- Lengths are counted in UTF-16 code units of the folded word. A sidecar query needs at least one word of two or more code units, so that it never reads the shards of a whole first letter on its own. The runtime rejects queries made entirely of shorter words, including `a b`; inline and remote search can handle them according to their source.

When the view's `search.kinds` lists node kinds, only nodes whose `kind` is one of them are found; a node without a kind is then never a hit. The other nodes still open as ancestors on the path to a hit. Inline search applies the list in the browser and the bundle writer applies it to the index; a remote endpoint applies it itself.

Exact label matches rank first, then labels that start with the query, then the rest in natural order. Both sides are folded and compared without the separators at their start and end, so `(Default)` is an exact match for `default`. Remote endpoints may rank differently.

## Deep Links

With `deepLink` on, selecting a row writes `#cx.<encoded view id>=<path>` to the URL hash, where the view id is encoded by `encodeURIComponent` and `<path>` is the node's id path with each id encoded by `encodeURIComponent` and joined with `/`. Opening the page with such a hash expands the path and selects the node. Other parameters in the hash, separated by `&`, are kept. Hosts can build these links to point into a report. A change of the fragment while the page is open opens its row the same way: a link followed inside the page, a fragment typed into the address bar, Back and Forward, and a router that announces its own address change with a `popstate` event (the grid listens for `hashchange` and `popstate`). `history.replaceState` and `pushState` fire neither event, so a host whose own code writes the fragment calls `grid.readLocation()` afterwards: it reads the address again and opens the row the fragment names, and returns a promise that settles when the row is open or the fragment names none (while the view is still loading, once it has loaded; when the fragment is already being opened, once that is done; when a newer fragment replaces it, without opening its row). A navigation that fires both `popstate` and `hashchange` is read once. Reading an address the grid has already opened, or wrote itself, does nothing. Deep links come with the links part (`canopyx-links.js`, application/x-canopyx-links), which a view with `deepLink` loads when it is created: hosts that serve runtime files serve it beside them, and single-file fragments of such a view carry its payload. A view whose links part cannot load keeps its rows and reports the error.

A host with a link scheme of its own passes two callbacks to the runtime and then owns the whole fragment:

- `formatLink(path, node)` returns the fragment for a selected row, without the `#`, for example `record/42` or `record/42/rev/3`. Returning `null` leaves the URL as it is, for a row the scheme has no link for. When the selection becomes empty it is called with an empty path and `null`; an empty string then clears the fragment.
- `parseLink(fragment)` returns the id path the fragment names, or a promise of it when the host has to look the path up, or `null` when the fragment is not a link into this view. It also gets the empty fragment of a page opened without one.

The two callbacks are given together. One view per page can own the fragment this way; views with the default scheme share it through their `cx.<view id>` parameters. A newer fragment cancels one that is still being opened, and a fragment that could not be opened can be tried again. Cancellation covers asynchronous parsing as well as path loading: a replacement query or destruction settles the old caller even when the host's parser never returns. A retired parser cannot navigate the replacement snapshot; an explicit `readLocation()` can retry the same fragment against it.

The fragment is written onto the page's own address (`location`), replacing the current history entry. A `<base href>` in the page, which some hosts inject so that the relative links of an uploaded report resolve against its library, does not change where a deep link points. It does change where relative data URLs resolve: a relative sidecar `base` and relative remote endpoint templates follow the document's base URL, like every other relative URL of the page.

## Counts

```json
{ "protocol": "canopyx/2", "type": "counts",
  "items": [ { "id": "projects", "childCount": 13, "cells": { "changed": 3 }, "flags": ["changed-below"] } ] }
```

Each entry updates a loaded node: `childCount` replaces the total, `cells` replace cells with the same column ids, and `flags` (when present) replace the node's flags. Nodes that are not loaded are ignored. A counts document contains at most one entry per node id; writers and readers reject duplicate ids before applying updates.

## Sources

The view's `source` object selects one of three sources.

### Inline

```json
{ "kind": "inline" }
```

The view's `roots` carry the whole tree with inline `children`. Long child lists are paged on the client by `pageSize`. Search scans all inline nodes, including ones that are not shown yet.

### Sidecar

```json
{ "kind": "sidecar", "base": "data/files/" }
```

The bundle writer splits the tree into script files under `base`. Script files are used instead of JSON files because browsers block `fetch` of local files on `file://`; a script tag loads from a file share, a web server, or SharePoint alike. Document files preserve dictionary keys by parsing their JSON text. Pack files retain their fixed-key envelope, with page JSON text parsed lazily by the reader:

```js
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "r/0", JSON.parse(String.raw`{"protocol":"canopyx/2","type":"page",...}`)]);
```

The three array items are the view id, the file's reference (its path under `base` without `.js`), and the document. The queue works whether the file loads before or after the runtime, and the view id keeps two bundles on one page apart.
For sidecar sources, each slash-delimited reference component is a file path component: `.` and `..` are rejected before a script is loaded. Remote-source references remain opaque identifiers.

| Reference | Document | Content |
| --- | --- | --- |
| `manifest` | `manifest` | View id, first top-level page, node count, page size, number of children packs, search index description |
| `r/<n>` | `page` | Page `n` of the top-level nodes |
| `p/<n>` | `pack` | Pack `n`: the children pages of many nodes. A page inside it has the reference `p/<n>#<slot>`. |
| `e/<n>` | `searchEntries` | Entry file `n` of the search index: a run of consecutive entries and the ancestors they need |
| `s/k-<key>` | `searchShard` | The words that start with the shard's prefix, each with the entries that have it. The `k-` keeps keys such as `con` or `nul` from becoming Windows device names. |
| `q/<n>` | `pack` | Index pack `n`: entry files or shards stored together (see [Index Packs](#index-packs)). A packed index has no `e/` or `s/` files. |

Every page holds at most the writer's page size and fits the file budget (512 KiB by default), so page sizes vary and `offset` tells where each page starts. Nodes written into pages have no inline children; they carry `hasChildren`, `childCount`, and `ref` pointing at their first children page. File names are numbers, so they are short, safe on case-insensitive file systems, and independent of the characters in ids.

#### Packs

A tree with many small child lists would need one file per list: 150,000 parents make 150,000 files, which is slow to write and impractical to copy or upload. The bundle writer therefore stores the children pages of many nodes together in pack files, each filled up to the children pack size (128 KiB by default, `CanopyBundleOptions.ChildPackBytes`):

```js
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "p/12", { "protocol": "canopyx/2", "type": "pack",
  "pages": [ String.raw`{"protocol":"canopyx/2","type":"page","parent":"projects","offset":0,"total":2,"items":[...],"next":null}`, ... ] }]);
```

- `pages` holds page documents as JSON text, one string per page. The runtime parses only the page a node asks for and keeps the last six packs it read, so a pack costs little to load however many pages it holds.
- The reference `p/<n>#<slot>` names the page at position `<slot>` (from 0) of pack `<n>`. `<n>` and `<slot>` are decimal numbers without leading zeros. A node's `ref` and a page's `next` use this form; the node that owns a child list is therefore what maps it to its file and slice, and no central table has to be loaded first.
- The manifest's `packs` is the number of pack files. The runtime reads a reference as a packed page only when the manifest has `packs` and the reference has exactly this form; it rejects a pack number at or past `packs` and a slot the pack does not have. Every other reference, and every reference in a bundle without `packs`, names a file of its own that holds one `page` document, as in a bundle written by hand.
- The C# writer finishes a node's pages after the pages of its descendants, so the pages of one subtree are next to each other. Opening a small subtree level by level usually reads one pack. The pages of one child list are added last to first, because each page names the next.
- The pages of one child list stay together: a list that does not fit what is left of the open pack starts a new one, and its pages fill packs up to the file budget, not the pack size. Reaching a node far down a long list reads pages one after another, and this way they come from one file (or, for a list larger than the file budget, a few) instead of one file per page; a search hit also names the file of the page that holds it, which is read together with the first one. The pack size never changes where a page ends: pages are split by the page size and the file budget only.
- The C# writer puts each page in a `String.raw` template, which keeps the JSON text as it is: the file is not larger than the pages it holds, and the browser scans the text without building objects. This is why the writer escapes the backtick and `${`. A host that writes packs by hand can use ordinary JSON string literals instead; the document is the same.

A bundle of 379,325 nodes under about 150,000 parents (`CanopyX.Examples --pack-bench`) takes 2,568 files this way, 2,196 of them packs, instead of 152,601. With the pack size at the 512 KiB file budget it takes 917, but a cold search to an expanded hit then loads 1.3 to 1.7 MB instead of 0.6 to 1.2 MB and the page keeps about a third more heap. The time of that query is the same for 64 KiB to 512 KiB packs within the noise of the measurement: it goes to the search, to attaching and painting the rows, not to reading packs (a 512 KiB pack loads and runs in about 14 ms with the CPU slowed four times). The numbers for each size are in `TODO.md`.

A runtime from before packs reads `p/<n>#<slot>` as a file name and cannot open a packed bundle. This is one case of a general rule: the runtime and the data it reads come from the same build. `SaveHtmlBundle` writes the runtime next to the data under a name that carries the hash of its content (`canopyx.<hash>.js`), and the page references that name, so a page loads the runtime it was written for, whatever a cache holds and whatever newer bundles put into a shared asset folder. The data folder is not named by content, so a page and its data are published together (see "Assets and Caching" in architecture.md). A host that serves one shared copy under the plain name `canopyx.js` republishes every page and its data with each new build.

The manifest:

```json
{ "protocol": "canopyx/2", "type": "manifest", "view": "files", "root": "r/0", "nodeCount": 700, "pageSize": 250, "packs": 1,
  "search": { "entryCount": 700, "entryFiles": [0, 256, 512], "kinds": ["share", "folder", "file"],
    "shards": { "ab": 81, "ac": 9, "pra": 190, "prb": 12, "pr-": 3, "report-": 410, "report-.2": 230 } } }
```

A manifest exceeding `MaxFileBytes` fails with a named budget error; increase the budget or reduce the index. Default data folders escape Windows device names and include a full SHA-256 suffix of the exact UTF-16LE code units of the view id so distinct views cannot overwrite one another on case-insensitive filesystems. The `search` object is present when the view declares search; all four of its fields are required.

#### Search Index

The index holds every node search can find once, together with its ancestors, in an entry table, and refers to nodes by entry number everywhere else. A query reads the shards of its words and the entry files of the matches it shows, never the whole index. Browsers read the index with the search part (`canopyx-search.js`, application/x-canopyx-search), which a sidecar source loads on its first query with a word of at least two units; the runtime checks the manifest's `search` object when the manifest loads.

**Entries.** The bundle writer numbers the nodes of the index in depth-first order, so a parent always has a smaller number than its children. A node gets an entry when search can find it (every node, or the nodes of the view's `search.kinds`) and when it is an ancestor of such a node, whether or not its own label has a searchable word, because the id path of a hit runs through its ancestors. A node that cannot be found and has no descendant that can is left out, so `search.entryCount` can be smaller than `nodeCount`. The files `e/0`, `e/1`, and so on hold consecutive entries, at most 256 per file and fewer when the file budget requires it. `search.entryCount` is the number of entries, and `search.entryFiles` lists the number of the first entry of each file in file order, starting with 0.

```json
{ "protocol": "canopyx/2", "type": "searchEntries", "first": 512,
  "stem": [[0, -1, 0, "share-a", 0, "\\\\files\\share-a", 0, "p/9#12"], [3, 0, 7, "/d0", 0, "Finance", 1, "p/6#4"]],
  "entries": [[3, 10, "/p4", 0, "Budget", 1, "p/3#2", "p/5#7"], [512, 13, "/f0", 0, "Budget 1.xlsx", 2]] }
```

An entry is the array `[parent, head, id, tail, label, kind, children, page]`. A field without a value is `null`, and trailing nulls are left out, so most entries end at `label` or `kind`. `parent` is the parent's entry number, or -1 for a top-level node. The id is written relative to the parent's id: `head` and `tail` count the UTF-16 code units the two ids share at the start and at the end, and the array holds only the part between them. In the example, entry 512 has parent 3 (`share-a/d0`), takes the first 10 code units of that id, and adds `/p4`, which makes `share-a/d0/p4`. Path-style ids repeat the parent's id at the start and distinguished names repeat it at the end, so neither is written again on every level. Writers do not split a surrogate pair between the shared and the written part; top-level entries have `head` and `tail` 0; and `head` plus `tail` never exceeds the length of the parent's id.

`kind` is the position of the node's kind in `search.kinds`. `children` and `page` say which files the pages on a hit's path are in, with references as the pages themselves write them, and only where a reader could not know it otherwise:

- `children` is the reference of the node's first children page, the `ref` of its item, when that page is in another file than the page that holds the node and one of the node's children has an entry (only then does the path of a hit open the node).
- `page` is the reference of the page that holds the node, among its parent's children pages or the top-level pages, when that page is in another file than the first page of the list.

A packed page `p/<n>#<slot>` is in the file `p/<n>`; any other reference is a file of its own. So the first page of every list on a hit's path is in the file of the page that holds the node above it, unless that node names another in `children` (at the top, the manifest's `root`), and the page that holds each node is in the file of that first page, unless the node names another in `page`. A reader asks for all these files at once before it opens the path. The pages of a list that lie between its first page and the one that holds the node follow `next` as before, and come from those files unless the list is larger than the file budget; the top-level pages are files of their own, so a node on a later top-level page reads the ones before it one after another. The fields are hints: a reader that ignores them opens the same path level by level. In the example, `Finance` (3) is in the file its parent's children start in and names its own children, which start in `p/6`; `Budget` (512) is on a later page of that list, in another file, `p/5` (the pages of a list are written last to first), and its children start in `p/3`. The bundle writer knows the pages of a list only once the list is complete, so it holds the entries of a top-level node's subtree until that node is finished. The two fields add about 1% to the index of the large bundle example, the directory-shaped tree, and the packing benchmark (20.3 MiB instead of 20.1 MiB there, in 371 files instead of 370), and 17% to that of the adversarial deep tree.

`stem` lists the ancestors of the file's first entry from the top level down, each as its own entry number followed by the fields of an entry. With depth-first numbers, an ancestor that lies before a file is an ancestor of that file's first entry, so one file is enough to rebuild the id path, label, kind, context, and page locations of every entry in it. The context of a hit names its nearest two ancestors (`grandparent / parent`). The stem counts against the file budget: a tree so deep that the ancestors of one node do not fit in a file cannot be written with search, and the writer says so.

**Words.** Each entry is filed under every distinct word of its label (see [Search](#search) for words and folding). Each label with a word is also filed under its label token: U+0000, which no word can contain, followed by the eight lowercase hex digits of the 32-bit FNV-1a hash of the folded label without the separators at its start and end (start with 2166136261; for each UTF-16 code unit, xor it in and multiply by 16777619 modulo 2^32). `Budget (old)` and `budget (OLD` have the token of `budget (old`. The token lets a reader find the labels equal to a query without reading any label. Two labels can share a token, so a reader compares the label with the query.

**Shards.** A shard covers every word that starts with a given prefix of the folded word. A prefix starts at two code units. When a shard would refer to more entries than the bundle writer's limit (20,000 postings by default; 1,000 for the shards of label tokens, because a query reads exactly one token), it splits into prefixes one code unit longer, and the word exactly as long as the old prefix moves to a shard for the old prefix marked with a trailing `-`. Prefixes stop growing at 12 code units. A word of one code unit has a shard of its own, named by that code unit and a trailing `-`. The shard key is the prefix encoded for file names: `a` to `z` and `0` to `9` stay as they are, and any other code unit becomes `_` followed by its four lowercase hex digits (`é` becomes `_00e9`, and the keys of label tokens start with `_0000`).

```json
{ "protocol": "canopyx/2", "type": "searchShard", "key": "pra",
  "words": ["practice", "prague"], "postings": [[14, 3, -5, 120], [7]] }
```

`words` and `postings` run in parallel. A posting list holds the ascending numbers of the entries that have the word: the first value is an entry number, a positive value after it is the gap to the next entry, and a negative value `-n` stands for the `n` entries that follow the previous one without a gap. `[14, 3, -5, 120]` is 14, 17, 18 to 22, and 142.

A shard is stored in numbered parts when it outgrows the file budget. The first part uses its base key; subsequent keys append `.2`, `.3`, and so on (including after a terminal `-`, for example `ab-.2`). A posting list that does not fit continues in the next part under the same word, where it starts again with a plain entry number. The manifest lists every part separately in `search.shards` with the number of entries that file's posting lists refer to, for example `{ "report-": 410, "report-.2": 230 }`. Writers include the base key and use consecutive part numbers starting at two. Readers discover parts from this list, not by probing filenames: resolve the base prefix without treating a part suffix as a longer prefix, then load its base file followed by listed parts in ascending numeric order. Each file's `searchShard.key` and posting count equal its manifest key and count, and no posting refers to an entry at or past `entryCount`; readers reject mismatches. A missing part list means the base file is the complete shard.

**Reading.** To search, the runtime takes each query word and starts with its first two code units. If a shard exists for that prefix, it loads it. If shards exist for longer prefixes that start with it, it adds the next code unit and repeats; if the query word runs out first, it loads every shard under the current prefix, including the `-` shard. A query word of one code unit loads every shard whose prefix starts with it. The entries of a query word are the merged posting lists of the shard words that start with it, and the candidates are the entries that every query word has. A query word that starts another query word is skipped, because the longer one implies it.

The runtime also looks up the label token of the folded query, without the separators at its start and end. It reads the labels equal to the query first and then the other candidates in document order, loading the entry files they fall in, until it has enough matches to fill the result list, and it ranks at most five times the view's `maxResults`. The total is the number of candidates, which is exact. A truncated result holds the labels equal to the query and the first other matches in document order, which are not necessarily the best-ranked of all matches.

#### Index Packs

An index has an entry file per 256 entries and a shard per word prefix, so a large tree has thousands of small index files: 2,910 of the 3,457 files of the packing benchmark. The bundle writer therefore packs them by default, into `q/<n>` files that hold up to 64 KiB of documents each (`CanopyBundleOptions.SearchPackBytes`; 0 writes separate files). A pack is a `pack` document like the children packs: `pages` holds the documents as JSON text, and a reader parses only the one it needs.

```json
"search": { "entryCount": 700, "entryFiles": [0, 256, 512], "kinds": ["share", "folder", "file"],
  "shards": { "ab": 81, "ac": 9, "pra": 190, "prb": 12 }, "entryPacks": [0, 2], "shardPacks": ["ab", "prb"] }
```

- The entry files come first, in file order, then the shards in ordinal order of their keys (UTF-16 code units, the order of `Object.keys(shards).sort()`); an entry file and a shard never share a pack.
- `entryPacks` lists the number of the first entry file in each entry pack, starting with 0; `shardPacks` lists the first shard key of each shard pack, starting with the smallest key. Entry packs are `q/0` up to `q/<entryPacks.length - 1>`, and the shard packs follow them.
- Entry file `n` is in the last entry pack whose first file is at most `n`, at the position `n` minus that first. Shard `key` is in the last shard pack whose first key is at most `key`, at its position among the ordinal sorted keys minus the position of that pack's first key. In the example, `e/2` is page 0 of `q/1`, and `prb` is page 0 of `q/3`.
- The two lists come together or not at all; readers reject lists that are not ascending, that name a file or a key the index does not have, or that do not start at the first file and the first key.

A pack is filled up to its size and a document larger than that gets a pack of its own; every file stays within the file budget. On the packing benchmark (380,000 rows), 64 KiB packs turn the 2,910 index files into 370 (with 512 KiB children packs, the bundle's 3,457 files into 917). A cold query then reads about twice the bytes it read from separate files (1.5 MB instead of 0.7 MB for "identity gateway") in fewer files, and its search part stays at 44 to 81 ms with the CPU slowed four times (61 to 94 ms before); 512 KiB packs leave 589 files but read 3 to 6 MB per cold query. The numbers of each size are in `TODO.md`. As with children packs, a runtime from before index packs asks for `e/0` and cannot search a packed bundle: the runtime and the data come from the same build.

### Remote

```json
{ "kind": "remote", "children": "api/files/children?ref={ref}&cursor={cursor}",
  "search": "api/files/search?q={query}&limit={limit}", "counts": "api/files/counts?ids={ids}" }
```

The runtime fills the placeholders with URL-encoded values and sends `GET` requests with `Accept: application/json`:

- `children`: `{ref}` is empty for the top level and otherwise the node's `ref` (or `id`); `{cursor}` is empty for the first page and otherwise the previous page's `next`. The response is a `page` document.
- `search` (optional): `{query}` is the query, `{limit}` the view's `maxResults`. The response is a `search` document whose `query` must echo the request exactly; a mismatched response is rejected before its hits are shown. Without the endpoint, the search box is hidden for remote views and view-level search options must be omitted.
- `counts` (optional): `{ids}` is the node ids, each encoded twice with `encodeURIComponent`, joined with a literal comma and inserted without further encoding. After normal query-parameter decoding, split on commas and decode each component once more; for example, the id `a,b` arrives as `a%2Cb` in the decoded parameter, so it remains one id. The runtime sends at most 50 ids per request and splits larger sets. The response is a `counts` document.

A response with a non-success status, invalid JSON, or the wrong `protocol` or `type` shows an error row with a retry action in place of the children. Authorization, page-size limits, and query-time limits belong to the host's endpoints.

### Queries Before Remote Paging

`CanopySource.RemoteQuery` declares `queryAware: true`. Every endpoint it provides contains `{viewQuery}` before any fragment. The placeholder carries URL-encoded JSON, separate from the search text in `{query}`:

```json
{ "version": 1, "sort": { "column": "value", "direction": "desc" }, "filters": ["flagged"] }
```

`sort` is `null` or one sortable column ID and `asc` or `desc`. `filters` holds unique IDs declared by the view. Its schema is `$defs/viewQuery`; it is a request parameter, not a document envelope. The host validates these IDs against its own allowlist and applies the query to the complete dataset before paging. It supplies ancestors needed to reach filtered descendants. The runtime preserves the order and membership it receives, including inline children inside remote pages.

`grid.getQuery()` returns the accepted query. `await grid.setQuery(query, { signal })`, `await grid.sort(column, direction)`, and the declared-filter methods stage a new root page. Accepted rows, selection, and sort indicators remain until validation succeeds. Failure rejects the promise and emits `canopyx:error`; caller cancellation, destruction, or a newer query returns `false`. An equivalent query returns `true` without fetching. On acceptance, `canopyx:query` reports `{ query, revision }`, and changed declared filters emit `canopyx:filter`. A local `setFilter` predicate can further narrow the accepted rows without changing the host query or its filter switches.

Every page, search result, and counts document carries the same `revision` for one accepted snapshot. `{revision}` is an optional URL placeholder: empty for a new root query, otherwise the accepted revision. Hosts bind continuations to the query and revision and reject stale cursors. A mismatched revision is rejected before rows, hits, or counts are applied. Use `grid.reload()` to accept a new root revision; it stages through the loaded root range. Child reloads stay in the accepted revision.

A query replacement retires old page, search, counts, reload, and navigation consumers. A custom source receives `query` as a frozen snapshot and `revision` alongside `signal` in its request argument for `page(node, cursor, request)`, `search(text, limit, request)`, `counts(ids, request)`, and optional `prefetch(opens, finds, request)`. Its transport still owns cancellation and deadlines; the grid can release a consumer even if that transport ignores its signal. Custom page results and search results include `revision`; custom counts return a counts document with that field.

Loaded roots and complete inline descendants preserve surviving identities. Old lazy child lists are discarded because their membership and order may have changed; open surviving parents load their new children. Row selection is pruned when its data leaves the loaded snapshot. A saved view applies its query before restoring columns, paths, selection, and position. The generated `query-records.html` example demonstrates host ordering, filtering, failures, and reloads from a source that also works from disk.

## Security Notes

- Labels, cells, badges, tooltips, search context, and table and property values are inserted with `textContent`, never as HTML.
- Icon SVG and `html` detail payloads are trusted host markup. Do not build them from user input without encoding. The `sanitizeHtml` host option and Trusted Types handling are described in [security.md](security.md).
- Sidecar files are scripts. Serve a bundle only from a location the host controls, the same as the page itself.

Inline tree serialization uses an iterative traversal, so deep valid hierarchies do not consume the .NET call stack. A node reference requires an explicit lazy-child declaration and cannot accompany inline children. The search placeholder is also its accessible name and must contain non-whitespace text.

Accessible grid, column, filter, and search names contain non-whitespace text. Cell keys identify a non-empty column ID. Expandable nodes with inline children contain at least one child; lazy nodes omit the children array. Search-shard keys contain at least two encoded UTF-16 units (`a-z`, `0-9`, or `_` plus four lowercase hexadecimal digits), or one such unit followed by `-`, with the documented terminal and part suffixes.

A nonempty inline `children` array cannot declare `hasChildren: false`; an omitted flag remains valid for readers that infer expandability from the array.

Structural counters (`offset`, totals, child counts, manifest node counts, entry counts, and shard posting counts) range from their declared minimum through 2,147,483,647, matching the C# integer properties and remaining exact in browser JSON. Column widths have the same upper bound; view and manifest page sizes range from 1 through 10,000.

Readers attach a wire page only when `parent` equals the requested node ID, or `null` for the top level; a node reference is a file/endpoint locator, not its identity. A mismatched parent is a load error for remote and sidecar sources. Sidecar readers also require the manifest's `view` to equal the requested view ID before using its root page or search index.

Identifiers and URL-bound references (node/view IDs, search paths, parent IDs, and continuations) contain well-formed Unicode: unpaired UTF-16 surrogates are rejected. Valid supplementary characters remain supported. Hosts producing earlier invalid identifiers must map them to stable valid IDs before serialization. Required remote URL placeholders appear before any `#` fragment, because fragments do not reach HTTP endpoints. Icon markup starts with the SVG tag name followed by an HTML whitespace character, `/`, or `>`.

Sidecar bases name a folder, end in `/`, and contain no query or fragment. Inline `children` arrays are complete; an optional `childCount` must equal the array length. C# writers and browser readers enforce that semantic equality in addition to the schema's structural constraints. Readers reject an unexpected page offset before appending items: zero initially, then the number of children already loaded.

Known page totals require a continuation exactly when the loaded range ends before the total. Browser search normalization removes only ASCII separators; non-ASCII word characters remain part of the query. A multi-selection deep link names a currently selected row and is removed when the grid selection becomes empty. Browser outlines honor host detail rendering callbacks; their default HTML-detail fallback escapes markup for script-free output.

Local external assets in an HTML bundle use a separate directory tree from its sidecar data. `AssetBaseUrl` normalizes backslashes to URL slashes, so a relative Windows-style asset folder is written at the same path used by the page. Bundle folders cannot occupy `index.html` or a runtime asset file path. Local asset and data folder components use portable ASCII names of at most 255 characters without internal `.` or `..` segments; a leading `./` is allowed for local assets. These layout checks run before any bundle files are written. URLs outside the bundle remain host-served.
Fully materialized remote trees can be written as sidecar bundles with local search enabled even when the original remote source has no search endpoint; ordinary remote views still require that endpoint. A node in such a tree may retain its former remote `Ref` beside its complete inline children in memory: the bundle writer replaces that reference with the generated child-page reference. Ordinary `canopyx/2` node documents still reject a `ref` beside inline children.
