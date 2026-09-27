# CanopyX Data Protocol (`canopyx/1`)

This is the wire format between hosts and the CanopyX browser runtime. The C# types in the `CanopyX` package write it; the runtime in `CanopyX.Html` reads it. A host that is not .NET can produce the same documents by hand. The JSON schema is [schema/canopyx-1.schema.json](schema/canopyx-1.schema.json).

## Versioning

Every top-level document carries two fields:

```json
{ "protocol": "canopyx/1", "type": "view" }
```

- `protocol` is `canopyx/1` for every document described here. The runtime rejects a document with another value and reports it, instead of guessing.
- Optional fields may be added within `canopyx/1`. Readers ignore fields they do not know, so a document from a newer writer still loads.
- A change that would break an existing reader (removing or renaming a field, changing its meaning or type, making an optional field required) needs `canopyx/2`.
- The schema lists every field of the current revision and rejects unknown ones, so it doubles as a check on writers. Update it in the same change that adds a field.

## Documents

| `type` | Written by | Read when |
| --- | --- | --- |
| `view` | `CanopyView.ToJson()` | The page loads; it defines columns, behavior, the data source, and inline nodes |
| `page` | `CanopyPage.ToJson()`, bundle writer | A node opens, or the user asks for more children |
| `search` | `CanopySearchResult.ToJson()` | A remote search endpoint answers |
| `counts` | `CanopyCounts.ToJson()` | A live host refreshes counts and rollups without reloading rows |
| `manifest` | Bundle writer | A sidecar view loads; it points at the first top-level page and the search shards |
| `searchShard` | Bundle writer | A sidecar search needs the index entries for a prefix |

All documents are UTF-8 JSON. The C# writer escapes `<`, `>`, `&`, U+2028, and U+2029 as `\u` sequences, so a document can sit inside an HTML `<script>` element unchanged. Hosts writing documents by hand must do the same before inlining one.

## View

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique within a page. Scopes element ids, remembered state, sidecar files, and deep links. |
| `label` | string | Accessible name of the tree grid. |
| `rowHeight` | integer 20 to 64 | Height of every row in CSS pixels. |
| `pageSize` | integer 1 to 10,000 | For inline sources, how many children show before a "show more" row. |
| `selection` | `single` or `multiple` | Selection mode. |
| `columns` | array of columns | The first column is the tree column. At least one. |
| `icons` | object | Optional. Icon key to trusted SVG markup, declared once and referenced by nodes. |
| `search` | object | Optional. Shows the search box. When present it has all of `minLength` (1 to 16; at least 2 for sidecar sources), `maxResults` (1 to 500), and `placeholder`. |
| `filters` | array of filters | Optional. "Only matching" switches. |
| `stateKey` | string | Optional. Session storage key for remembered expanded paths. |
| `deepLink` | boolean | Optional. Selection writes the id path to the URL hash; a hash expands it on load. |
| `source` | object | Where nodes come from (see [Sources](#sources)). |
| `roots` | array of nodes | Top-level nodes; present only for inline sources. |

A column has `id`, `title`, `width` (at least 40), `kind` (`text`, `number`, or `datetime`), and optional `sortable` and `hidden`. The tree column cannot be hidden. A filter has `id`, `label`, `flag`, and an optional `ancestorFlag`.

### Filter Semantics

A node matches a filter when its `flags` contain the filter's `flag`; a matching node keeps its whole subtree. A node that does not match stays visible, with its children filtered, when a loaded descendant matches or when it carries the `ancestorFlag`. The runtime never walks data it has not loaded, so a host that wants a collapsed branch to stay visible under a filter marks it with the ancestor flag. Rollup flags like these are always computed by the host.

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
- `tone` is one of `neutral`, `info`, `success`, `warning`, `danger`, `muted`. The theme maps tones to colours; hosts never send colours.
- Every string is inserted as text, never as HTML.

A badge has `text`, an optional `tone`, and an optional `title` (tooltip).

### Default Formatting and Sorting

The runtime and the static outline show a cell without `text` the same way:

| Value | `number` column | `datetime` column | `text` column |
| --- | --- | --- | --- |
| number | thousands separators, up to 3 decimals | as written | as written |
| string | as written | ISO date shown as `yyyy-MM-dd HH:mm UTC` | as written |
| boolean | `Yes` or `No` | `Yes` or `No` | `Yes` or `No` |
| null or absent | empty | empty | empty |

The runtime uses the page's `lang` for separators; the static outline uses the invariant culture.

Sorting a column compares cell values, falling back to the display text when a cell has no value. `datetime` values are parsed before comparing, so both ISO forms sort correctly. Numbers sort before strings, strings compare naturally ("file2" before "file10"), and empty cells sort last. Sorting reorders siblings only; it never moves a node to another parent.

## Detail Rows

A detail row spans `height` row slots (1 to 40) under its parent and holds one of three payloads:

```json
{ "type": "table", "height": 6, "caption": "Changed settings", "columns": ["Setting", "Before", "After"],
  "rows": [["Retention", { "value": "30 days", "tone": "danger" }, { "value": "90 days", "tone": "success" }]] }
{ "type": "properties", "height": 4, "items": [{ "name": "Owner", "value": "Engineering" }] }
{ "type": "html", "height": 8, "html": "<div class=\"host-widget\">...</div>" }
```

Table and property cells follow the cell rules above. In the interactive browser view, `html` is trusted host markup inserted without sanitising; hosts must encode any user-supplied text in it. The static fallback and print outline encode HTML detail payloads as text to remain script-free; use table or property details for formatted fallback output. JavaScript hosts can also render detail rows themselves through the runtime's `renderDetail` callback. Host renderer callbacks own the safety of any markup they produce. Static overflow links allow relative, HTTP, HTTPS, and mailto URLs; other schemes are omitted.

## Page

```json
{ "protocol": "canopyx/1", "type": "page", "parent": "projects", "offset": 0, "total": 1234,
  "items": [ { "id": "projects/plans", "label": "plans" } ], "next": "c/3f/3f2a9c01d4e5b6a7-1" }
```

- `parent` is the id of the node whose children these are, or `null` for the top level. It must not occur among the page items or their inline descendants.
- `offset` is the index of the first item among all of the parent's children.
- `total` is optional; when present it is at least `offset` plus the number of items. A continuation is required exactly when that sum is below the known total.
- `next` is an opaque continuation. The data source passes it back to get the next page; `null` means the last page. The runtime shows a "show more" row while `next` is set.
- Items may carry inline `children`.

## Search

A search result lists id paths, so the runtime can expand the tree to each hit without knowing anything else about the data:

```json
{ "protocol": "canopyx/1", "type": "search", "query": "plan", "total": 2, "truncated": false,
  "hits": [ { "path": ["projects", "projects/plans"], "label": "plans", "kind": "folder", "context": "\\\\files\\projects" } ] }
```

The path starts at a top-level node and ends at the hit, with no repeated node ids. A known search total must be at least the number of returned hits, and `truncated` must be true exactly when the total exceeds that count. Choosing a hit expands every node on the path, paging through "show more" until each id is loaded, then selects and focuses the hit. Reaching a child deep in a long list loads its pages one after another; a location hint on hits is a follow-up in `TODO.md`.

Matching is by word prefix: a label matches when every word of the query is the start of some word of the label. "sal rep" matches "Quarterly Sales Report". The bundle writer and the runtime split and fold text the same way:

- A word is a run of characters that are not separators. Separators are every ASCII character other than `A` to `Z`, `a` to `z`, and `0` to `9`; characters above ASCII are always part of a word.
- Folding uses a fixed table, not a platform's lowercase data (which differs between .NET Framework, .NET, and browsers). Capitals fold to small letters in these ranges: `A` to `Z`; Latin-1 U+00C0 to U+00DE except U+00D7; Latin Extended-A U+0100 to U+017F, where each capital is followed by its small letter (capitals are the even code points up to U+0137 and from U+014A to U+0177, the odd ones from U+0139 to U+0148 and from U+0179 to U+017E, and U+0178 folds to U+00FF); Greek U+0391 to U+03A9 except U+03A2, plus the accented capitals U+0386, U+0388 to U+038A, U+038C, U+038E, and U+038F; Cyrillic U+0400 to U+042F. Every other code unit, including U+0130 and U+0131, stays as it is.
- Lengths are counted in UTF-16 code units of the folded word. Query words shorter than two code units cannot pick a shard; a sidecar search whose words are all that short returns no hits.

Exact label matches rank first, then labels that start with the query, then the rest in natural order. Remote endpoints may rank differently.

## Deep Links

With `deepLink` on, selecting a row writes `#cx.<encoded view id>=<path>` to the URL hash, where the view id is encoded by `encodeURIComponent` and `<path>` is the node's id path with each id encoded by `encodeURIComponent` and joined with `/`. Opening the page with such a hash expands the path and selects the node. Other parameters in the hash, separated by `&`, are kept. Hosts can build these links to point into a report.

## Counts

```json
{ "protocol": "canopyx/1", "type": "counts",
  "items": [ { "id": "projects", "childCount": 13, "cells": { "changed": 3 }, "flags": ["changed-below"] } ] }
```

Each entry updates a loaded node: `childCount` replaces the total, `cells` replace cells with the same column ids, and `flags` (when present) replace the node's flags. Nodes that are not loaded are ignored.

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

The bundle writer splits the tree into small script files under `base`. Script files are used instead of JSON files because browsers block `fetch` of local files on `file://`; a script tag loads from a file share, a web server, or SharePoint alike. Every file has the same wrapper:

```js
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "r/0", { "protocol": "canopyx/1", "type": "page", ... }]);
```

The three array items are the view id, the file's reference (its path under `base` without `.js`), and the document. The queue works whether the file loads before or after the runtime, and the view id keeps two bundles on one page apart.

| Reference | Document | Content |
| --- | --- | --- |
| `manifest` | `manifest` | View id, first top-level page, node count, page size, search shard list |
| `r/<n>` | `page` | Page `n` of the top-level nodes |
| `c/<hh>/<hash>-<n>` | `page` | Page `n` of one node's children. `<hash>` is the first 16 hex digits of the SHA-256 of the exact UTF-16LE code units of the node id (all 64 digits when another id in the bundle already has those 16), `<hh>` its first two digits. |
| `s/k-<key>` | `searchShard` | Search index entries whose words start with the shard's prefix. The `k-` keeps keys such as `con` or `nul` from becoming Windows device names. |

Every page holds at most the writer's page size and stays within its file budget (512 KiB by default), so page sizes vary and `offset` tells where each page starts. Nodes written into pages have no inline children; they carry `hasChildren`, `childCount`, and `ref` pointing at their first children page. Hashing keeps file names short, safe on case-insensitive file systems, and independent of the characters in ids. The two-digit folder keeps any one folder from holding tens of thousands of files.

The manifest:

```json
{ "protocol": "canopyx/1", "type": "manifest", "view": "files", "root": "r/0", "nodeCount": 120000, "pageSize": 250,
  "search": { "prefix": "k-", "shards": { "ab": 812, "ac": 90, "pra": 1900, "prb": 12, "pr-": 3, "report": 2000, "report.2": 640 } } }
```

`search.prefix` is optional: `k-` selects the portable `s/k-<key>` layout, while an absent or empty prefix selects the original `s/<key>` layout. A manifest exceeding `MaxFileBytes` fails with a named budget error; increase the budget or reduce the index. Default data folders escape Windows device names and include a full SHA-256 suffix of the exact UTF-16LE code units of the view id so distinct views cannot overwrite one another on case-insensitive filesystems. The portable prefix and fixed folding table define the v1 bundle format.

`search.shards` maps each shard key to its entry count. Search entries have the shape of search hits (`path`, `label`, `kind`, `context`, where the bundle writer's context names the nearest two ancestors), and each entry is filed under every distinct word of its label that has at least two code units.

A shard covers every word that starts with a given prefix of the folded word. A prefix starts at two code units. When a shard would hold more entries than the bundle writer's limit, it splits into prefixes one code unit longer, and words exactly as long as the old prefix move to a shard for the old prefix marked with a trailing `-`. The shard key is the prefix encoded for file names: `a` to `z` and `0` to `9` stay as they are, and any other code unit becomes `_` followed by its four lowercase hex digits (`é` becomes `_00e9`).

A shard can be stored in numbered parts when it exceeds an entry or file budget. The first part uses its base key; subsequent keys append `.2`, `.3`, and so on (including after a terminal `-`, for example `ab-.2`). The manifest lists every part separately in `search.shards`, with that file's entry count, for example `{ "report": 2000, "report.2": 640 }`. Writers include the base key and use consecutive part numbers starting at two. Readers discover parts from this list, not by probing filenames: resolve the base prefix without treating a part suffix as a longer prefix, then load its base file followed by listed parts in ascending numeric order. Each file's `searchShard.key` equals its manifest key. A missing part list means the base file is the complete shard.

To search, the runtime takes the longest query word (the first one on a tie) and starts with its first two code units. If a shard exists for that prefix, it loads it. If shards exist for longer prefixes that start with it, it adds the next code unit and repeats; if the query word runs out first, it loads every shard under the current prefix, including the `-` shard. It loads the shards and their parts in order, a few files at a time, and stops once it has five times the view's `maxResults` in matches, reporting the result as truncated; a truncated result is not guaranteed to hold the best-ranked matches. Entries are matched against the whole query as described in [Search](#search).

### Remote

```json
{ "kind": "remote", "children": "api/files/children?ref={ref}&cursor={cursor}",
  "search": "api/files/search?q={query}&limit={limit}", "counts": "api/files/counts?ids={ids}" }
```

The runtime fills the placeholders with URL-encoded values and sends `GET` requests with `Accept: application/json`:

- `children`: `{ref}` is empty for the top level and otherwise the node's `ref` (or `id`); `{cursor}` is empty for the first page and otherwise the previous page's `next`. The response is a `page` document.
- `search` (optional): `{query}` is the query, `{limit}` the view's `maxResults`. The response is a `search` document. Without it, the search box is hidden for remote views and view-level search options must be omitted.
- `counts` (optional): `{ids}` is the node ids, each encoded with `encodeURIComponent`, joined with a literal comma and inserted without further encoding, so a comma inside an id arrives as `%2C`. The runtime sends at most 50 ids per request and splits larger sets. The response is a `counts` document.

A response with a non-success status, invalid JSON, or the wrong `protocol` or `type` shows an error row with a retry action in place of the children. Authorization, page-size limits, and query-time limits belong to the host's endpoints.

## Security Notes

- Labels, cells, badges, tooltips, search context, and table and property values are inserted with `textContent`, never as HTML.
- Icon SVG and `html` detail payloads are trusted host markup. Do not build them from user input without encoding.
- Sidecar files are scripts. Serve a bundle only from a location the host controls, the same as the page itself.

Inline tree serialization uses an iterative traversal, so deep valid hierarchies do not consume the .NET call stack. A node reference requires inline children or an explicit lazy-child declaration. The search placeholder is also its accessible name and must contain non-whitespace text.

Accessible grid, column, filter, and search names contain non-whitespace text. Cell keys identify a non-empty column ID. Expandable nodes with inline children contain at least one child; lazy nodes omit the children array. Search-shard keys contain at least two encoded UTF-16 units (`a-z`, `0-9`, or `_` plus four lowercase hexadecimal digits), with the documented terminal and part suffixes.

A nonempty inline `children` array cannot declare `hasChildren: false`; an omitted flag remains valid for readers that infer expandability from the array.

Structural counters (`offset`, totals, child counts, manifest node counts, and shard entry counts) range from their declared minimum through 2,147,483,647, matching the C# integer properties and remaining exact in browser JSON. Column widths have the same upper bound; view and manifest page sizes range from 1 through 10,000.

Readers attach a wire page only when `parent` equals the requested node ID, or `null` for the top level; a node reference is a file/endpoint locator, not its identity. A mismatched parent is a load error for remote and sidecar sources.

Identifiers and URL-bound references (node/view IDs, search paths, parent IDs, and continuations) contain well-formed Unicode: unpaired UTF-16 surrogates are rejected. Valid supplementary characters remain supported. Hosts producing earlier invalid identifiers must map them to stable valid IDs before serialization. Required remote URL placeholders appear before any `#` fragment, because fragments do not reach HTTP endpoints. Icon markup starts with the SVG tag name followed by an HTML whitespace character, `/`, or `>`.
