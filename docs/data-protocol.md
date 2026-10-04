# CanopyX Data Protocol (`canopyx/2`)

This is the wire format between hosts and the CanopyX browser runtime. The C# types in the `CanopyX` package write it; the runtime in `CanopyX.Html` reads it. A host that is not .NET can produce the same documents by hand. The JSON schema is [schema/canopyx-2.schema.json](schema/canopyx-2.schema.json).

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
| `view` | `CanopyView.ToJson()` | The page loads; it defines columns, behavior, the data source, and inline nodes |
| `grid` | `CanopyGridView.ToJson()` | A flat-grid definition supplies columns and inline rows or a host source |
| `gridPage` | `CanopyGridPage.ToJson()` | A host supplies a revisioned page of ordered matching rows |
| `gridQuery` | `CanopyGridQuery.ToJson(view)` | A host receives a typed query and requested result window |
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

### Export, clipboard and record details

`grid.prepareExport({ scope })` captures the accepted dataset revision, query, selected IDs, column order and time zone immediately. Its immutable `request` describes the operation; `rows()` enumerates fresh serial source windows, independently of the viewport and its cache. A later UI query does not change an export already prepared. A source must continue to serve that revision or reject it. Counts, duplicate identities and revision changes fail the export rather than silently mixing data.

Choose `filtered` for the accepted search and predicates, `selected` for selected stable IDs across the full dataset, or `all` for the full dataset. All three retain the accepted sort order. Selected and all exports clear search and predicates; a selected ID absent from that revision is an error. Columns default to visible columns in their current order, or an explicit ordered list of declared IDs. `values: "display"` retains display text and date formatting; `values: "raw"` exports underlying typed values. The request's `matched` records the accepted filtered count even when its effective export query clears the filters.

`await grid.toCsv({ scope })` produces CSV with quoted fields and spreadsheet formula protection for text. The client limit is 50,000 rows by default; exceeding it fails without truncation. `await grid.copy({ scope })` produces tab-separated text with a default 10,000-row limit and rejects unavailable or denied clipboard access. Ctrl/Command+C copies selected records, or the focused cell or row when there is no selection; native controls and selected text keep their copying behavior.

For large Office exports, configure `onExport` and call `grid.exportToHost("xlsx", { scope })`. The host receives the immutable request and a cancellation signal, and owns authorization, query replay, document generation and delivery. CanopyX does not load an Office engine or materialize the result first. Source requests and host hooks have bounded deadlines; caller cancellation and grid destruction settle operations even when a source ignores its signal.

Configure `onDetails` to open a host-owned drawer for a loaded record. Its context contains an immutable raw row, accepted query, cancellation signal and `returnFocus`. The toolbar, double click and Ctrl/Command+Enter invoke the hook; Enter and F2 retain their cell-navigation behavior. A newer details request or query cancels an unfinished opening operation. The host owns the completed drawer, its content and focus restoration when it closes.

A `grid` definition contains `id`, `label`, `rowHeight`, `pageSize`, `selection`, `search`, `columns`, and `source`. Column definitions and cells have the same value, display text, tooltip, tone, and badge contract as tree views. Any column can start hidden, but at least one must remain visible. Flat-grid definitions do not expose tree edit proposals. Optional `stateKey`, `timeZone`, and `labels` retain their shared meanings.

Optional `presentation` is `continuous` (the default) or `paged`. `pageLength` is the visible page length from 1 to 10,000, defaulting to 50. `pageSize` remains the independent source fetch size. Both presentations filter/sort the full source, retain global row indices and use the same selection, revision and export contracts. Paged presentation bounds the shared virtual viewport to one page; neither cached adjacent records nor retained focus can render outside that page.

The source's optional `navigation: "offset"` makes its known-count offset capability explicit; absent preserves the original offset contract. Offset sources support arbitrary offsets and exact `total`/`matched` counts. A hosted paged view can instead declare `navigation: "cursor"` and use the sequential documents below. Hosts own database traversal; CanopyX takes no database dependency.

`goToPage(index)` uses a zero-based page index and clamps to the last accepted page. `setPageLength(length)` retains the prior first-record position within the new page boundaries. Queued search input is accepted before navigation and starts from the first page. Counts/range/length remain accepted state while a replacement loads or fails. A fresh nonzero offset query first obtains current counts from offset zero, then requests its clamped page using that revision. Filtering controls reset to zero. Empty results display `0–0 of 0 rows`.

Paged version-1 browser state adds optional `paging: { pageLength, offset }`, separately from the revision-free query and page-relative `scrollTop`. Older snapshots restore the definition's page length and first page; saved offsets clamp against refreshed results. Row navigation crosses page boundaries before restoring row/cell focus. `scrollToRow(index)` returns `Promise<void>`; hosts that need navigation to finish await it. Hosts may hide both built-in toolbar and pager with `toolbar: false` and use the same controller to compose their controls. Query-backed export remains independent of presentation and visible page.

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

An absent `searchMode` means `substring`: the complete search text must be a substring of one searchable cell. `words` requires every whitespace-separated word or double-quoted phrase to match at least one searchable cell; different words may match different columns. A phrase matches within one cell, empty quoted phrases are ignored, and an unfinished quote extends to the end of the input. Words are partial matches, not regular expressions. Hosts implement the same folding and matching semantics and receive the resolved search mode in query documents.

The optional grid definition field `searchDelayMs` sets the search-input debounce from 0 to 5,000 milliseconds; browser options of the same name override it. Without a setting, inline sources apply input immediately and host sources wait 300 ms. Enter applies immediately except during input-method composition, whose partial input is never submitted. Sorting, filter edits and chip actions include queued search text in the same immediate request; they never include unfinished composition. Explicit `setQuery`, view restoration and reset replace queued text. Accepted-result counts and removable search, flat-predicate and grouped-filter chips update only after a query succeeds; pending or failed queries retain the previous summary. Clear search and filters removes both predicate forms, resets the offset and cancels any queued text.

All flat `filters` combine with AND. An optional `filterGroup` adds a nested expression, also combined with search and flat predicates using AND. A group is `{ "operator": "and" | "or", "filters": [...], "groups": [...] }`: `and` requires every predicate and child group to match; `or` requires at least one. Both arrays are required and their combined length cannot be zero. Queries allow eight group levels, 64 groups and 64 total predicates including flat predicates. The .NET writer and browser enforce these semantic bounds in addition to schema shape validation. Operands and column rules are identical at every depth. Invalid or incompatible grouped state is rejected rather than restored with silently broadened filters.

Sort keys are `{ "column": "amount", "direction": "asc" }` or `desc`, applied in array order; keys identify unique declared sortable columns. Missing values sort last in either direction, and ordinal row identity breaks final ties, including when no explicit sort is requested. The source applies the result window last. Filtered exports capture the nested group and search mode; selected/all exports clear both flat and nested filtering while retaining snapshot identity and sort order.

A filter is `{ "column": "amount", "operator": "ge", "values": [10] }`. Operators are `eq`, `ne`, `contains`, `startsWith`, `in`, `gt`, `ge`, `lt`, `le`, `isNull`, and `isNotNull`. Equality and text matching are case-insensitive for text values. Numeric and date operands use their raw numeric and ISO 8601 UTC values; localized display strings do not enter the query. Text matching is for text columns; range comparisons are for number and date columns. A null or missing cell fails value predicates, including `ne`; use `isNull` to include it explicitly. An empty string is a value, not a null. Null predicates take no operands, `in` takes 1 to 1,000, and other predicates take one. A query has at most 64 predicates. The C# filter API accepts `CanopyCell` operands but serializes only their raw values, without display text or decorations.

Flat-grid view snapshots are browser presentation state, separate from the wire query and tree snapshots. `getState()` returns `{ version: 1, view, columns, query, timeZone, selection, scrollTop }`. Columns appear in display order and carry `id`, `width` and `hidden`; selection contains stable row IDs independently of cached pages. The query omits a dataset revision and starts at offset zero, so restoration obtains a fresh accepted snapshot before applying presentation. Invalid state leaves the current query and layout intact. A newer query or restoration supersedes an older restore. Removed column/filter/sort references are skipped, while at least one known column must remain visible.

`stateKey` scopes the current snapshot and at most 20 named snapshots in session storage, together with the view ID. Unavailable storage leaves the in-memory controls usable. `resetView()` restores the original definition; removing a named view is a separate explicit action. The `grid*` label names localize flat-grid controls and require the data-grid entry point.

## View

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
| `pinTreeColumn` | boolean | Optional. The tree column stays in view while the other columns scroll sideways. A host can change it at run time with `grid.setTreeColumnPinned(pinned)`. |
| `stateKey` | string | Optional. Session storage key for remembered view state: expansion, selection, columns, sorting, declared filters, timezone, focus, and scroll. |
| `deepLink` | boolean | Optional. Selection writes the id path to the URL hash; a hash expands it on load. |
| `labels` | object | Optional. Translations of the texts the runtime writes itself (see [Labels](#labels)); English where a name is absent. |
| `source` | object | Where nodes come from (see [Sources](#sources)). |
| `roots` | array of nodes | Top-level nodes; present only for inline sources. |

A column has `id`, `title`, `width` (at least 40), `kind` (`text`, `number`, or `datetime`), and optional `sortable`, `hidden`, and `editable`. `editable` enables edit proposals when the host supplies an edit hook. The tree column cannot be hidden. Widths are initial: the reader drags a column edge, and a host sets one with `grid.setColumnWidth(columnId, pixels)`, for example to narrow the tree column on a small screen. A filter has `id`, `label`, `flag`, an optional `ancestorFlag`, and an optional `hidden`.

### Host Interaction Proposals

Optional `editable` columns, `dragDrop`, and `contextActions` use the interactive runtime. These definitions describe available controls, not executable domain operations. Static outlines remain readonly.

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

The runtime writes some text of its own: the search box's hints and announcements, the "show more", loading, and error rows, the column chooser, the names of the column resize handles, the announcements after a page of children, `true` and `false` without display text, the UTC mark on dates and the local-time tooltip, and the notice of a view that failed to mount. `labels` translates them. Every name is optional and English applies where it is missing; a value is a string with visible text. `{name}` placeholders are replaced, numbers formatted in the page language.

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

`{error}` is the technical message of what failed, which stays in English. The first `{time}` of a date label is where the date goes. A host that builds pages from C# sets `CanopyView.Labels` once, and the view document carries the names that differ from English; the static outline reads its own texts (the overflow note, the unknown total, the hidden-rows tooltip, and the full-report link) from the same object. A browser host can also pass `labels` to `createTreeGrid` or `CanopyX.configure`, on top of the view's; `CanopyX.labels` holds the English texts by name, and a name the runtime does not know is an error. For a language with plural forms, phrase a label so that its number stands on its own, for example `Wyniki: {count}`. Host data (node labels, column titles, cells, badges) is the host's own text and is never translated by CanopyX.

### Filter Semantics

A node matches a filter when its `flags` contain the filter's `flag`; a matching node keeps its whole subtree. A node that does not match stays visible, with its children filtered, when a loaded descendant matches or when it carries the `ancestorFlag`. The runtime never walks data it has not loaded, so a host that wants a collapsed branch to stay visible under a filter marks it with the ancestor flag. Rollup flags like these are always computed by the host.

The toolbar draws a switch for every filter that is not `hidden`. A C# host that writes pages with and without a filter bar of its own from one view names the filters to hide per page in `CanopyHtmlOptions.HiddenFilterIds` (or `CanopyView.ToJson(hiddenFilterIds)`), which writes them as `hidden` without changing the view. A hidden filter is for a host that draws its own control, for example one "only changed" button in front of a filter per time window: it declares the filters, turns one on or off with `grid.setFilterActive(id, active)` or sets the whole active set at once with `grid.setActiveFilters(ids)` (one row rebuild and at most one event, for a control that switches from one filter to another), reads `grid.getActiveFilters()`, and listens for the `canopyx:filter` event on the host element, whose `detail.active` lists the ids of the active filters. The event fires only when the set changes, also when the grid itself turns the filters off: when a search hit or a deep link leads to a row the filters hide, and when the host sets a predicate of its own with `grid.setFilter`, which replaces the declared filters. `setFilterActive` and `setActiveFilters` reject an id the view does not declare, before they change anything.

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
- `text` replaces the formatted value. Hosts use it for units, localisation, and phrases like "not collected".
- `tone` is a name: a lowercase letter followed by lowercase letters, digits, and hyphens, at most 32 characters, not ending in `-bg`. The theme maps tones to colours; hosts never send colours. See [Tones](#tones).
- Every string is inserted as text, never as HTML.

A badge has `text`, an optional `tone`, and an optional `title` (tooltip).

### Tones

The CanopyX stylesheet has colours for six tones: `neutral`, `info`, `success`, `warning`, `danger`, and `muted`. Six are not enough for every host: a severity scale alone has five steps, next to states such as passing, neutral, or under maintenance. So any other tone name is the host's own, and its colours come from the host's theme:

| Custom property | Used for |
| --- | --- |
| `--cx-tone-<name>` | Text colour of cells and badges with the tone |
| `--cx-tone-<name>-bg` | Background of badges with the tone. Optional; without it the badge gets a tint of the text colour. |

```css
.cx-host {
  --cx-tone-critical: #8f1d1d;  --cx-tone-critical-bg: #fde8e8;
  --cx-tone-high: #9a3412;      --cx-tone-medium: #854d0e;      --cx-tone-low: #3f6212;
  --cx-tone-maintenance: #3730a3;
}
```

A host maps its states onto names once, for example `critical`, `high`, `medium`, `low`, and `info` for a severity scale, `success` for passing, `neutral` for no state, and `maintenance` for planned work, and sets the properties from its design tokens for the light and the dark theme. An element with a host tone has the classes `cx-tone-<name>` and `cx-toned`, so a host stylesheet can also style it directly. A cell with a tone the theme has no colour for is shown as normal text (a badge with one gets a tint of the text colour), and a value that is not a valid name is ignored. The contrast of a host tone, also on a selected row, is the host's to check. For print the stylesheet resets its own colours to the light theme, because paper is white; a host whose theme can be dark does the same for its tones under `@media print`. The static outline takes host tone colours as literals from `CanopyStaticHtmlOptions.ToneColors`, and with `UseThemeVariables` also from these properties (see "Theming the Outline" in architecture.md).

### Default Formatting and Sorting

The runtime and the static outline show a cell without `text` the same way:

| Value | `number` column | `datetime` column | `text` column |
| --- | --- | --- | --- |
| number | thousands separators, up to 3 decimals | as written | as written |
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

Table and property cells follow the cell rules above. In the interactive browser view, `html` is trusted host markup inserted without sanitising; hosts must encode any user-supplied text in it. The static fallback and print outline encode HTML detail payloads as text to remain script-free; use table or property details for formatted fallback output. JavaScript hosts can also render detail rows themselves through the runtime's `renderDetail(node, element)` callback; `element` is the body of the row, which has the visible width of the grid, and a row without `height` takes the height of what the host puts into it. Host renderer callbacks own the safety of any markup they produce. Static overflow links allow relative, HTTP, HTTPS, and mailto URLs; other schemes are omitted.

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

With `deepLink` on, selecting a row writes `#cx.<encoded view id>=<path>` to the URL hash, where the view id is encoded by `encodeURIComponent` and `<path>` is the node's id path with each id encoded by `encodeURIComponent` and joined with `/`. Opening the page with such a hash expands the path and selects the node. Other parameters in the hash, separated by `&`, are kept. Hosts can build these links to point into a report. A change of the fragment while the page is open opens its row the same way: a link followed inside the page, a fragment typed into the address bar, Back and Forward, and a router that announces its own address change with a `popstate` event (the grid listens for `hashchange` and `popstate`). `history.replaceState` and `pushState` fire neither event, so a host whose own code writes the fragment calls `grid.readLocation()` afterwards: it reads the address again and opens the row the fragment names, and returns a promise that settles when the row is open or the fragment names none (while the view is still loading, once it has loaded; when the fragment is already being opened, once that is done; when a newer fragment replaces it, without opening its row). A navigation that fires both `popstate` and `hashchange` is read once. Reading an address the grid has already opened, or wrote itself, does nothing.

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

The bundle writer splits the tree into script files under `base`. Script files are used instead of JSON files because browsers block `fetch` of local files on `file://`; a script tag loads from a file share, a web server, or SharePoint alike. Every file has the same wrapper:

```js
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "r/0", { "protocol": "canopyx/2", "type": "page", ... }]);
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

The index holds every node search can find once, together with its ancestors, in an entry table, and refers to nodes by entry number everywhere else. A query reads the shards of its words and the entry files of the matches it shows, never the whole index.

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
- Icon SVG and `html` detail payloads are trusted host markup. Do not build them from user input without encoding.
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
