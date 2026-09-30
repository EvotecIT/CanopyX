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
| `manifest` | Bundle writer | A sidecar view loads; it points at the first top-level page and describes the packs and the search index |
| `pack` | Bundle writer | A node opens whose children page is stored in a pack file next to the pages of other nodes |
| `searchShard` | Bundle writer | A sidecar search needs the words that start with a prefix |
| `searchEntries` | Bundle writer | A sidecar search needs the nodes its matches refer to |

All documents are UTF-8 JSON. The C# writer escapes `<`, `>`, `&`, U+2028, and U+2029 as `\u` sequences, so a document can sit inside an HTML `<script>` element unchanged. Hosts writing documents by hand must do the same before inlining one. The C# writer also escapes the backtick, and a `$` that is followed by `{`, so a document can sit inside a JavaScript template literal unchanged (see [Packs](#packs)).

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
  "items": [ { "id": "projects/plans", "label": "plans" } ], "next": "p/12#3" }
```

- `parent` is the id of the node whose children these are, or `null` for the top level. It must not occur among the page items or their inline descendants.
- `offset` is the index of the first item among all of the parent's children.
- `total` is optional; when present it is at least `offset` plus the number of items. A continuation is required exactly when that sum is below the known total.
- `next` is an opaque continuation. The data source passes it back to get the next page; `null` means the last page. The runtime shows a "show more" row while `next` is set.
- Items may carry inline `children`. A node with a lazy `ref` or positive `childCount` and no inline children must declare `hasChildren: true`; readers reject the otherwise unreachable children before attaching the page.

## Search

A search result lists id paths, so the runtime can expand the tree to each hit without knowing anything else about the data:

```json
{ "protocol": "canopyx/1", "type": "search", "query": "plan", "total": 2, "truncated": false,
  "hits": [ { "path": ["projects", "projects/plans"], "label": "plans", "kind": "folder", "context": "\\\\files\\projects" } ] }
```

The path starts at a top-level node and ends at the hit, with no repeated node ids. A known search total must be at least the number of returned hits, and `truncated` must be true exactly when the total exceeds that count. Choosing a hit expands every node on the path, paging through "show more" until each id is loaded, then selects and focuses the hit. Reaching a child deep in a long list loads its pages one after another; a location hint on hits is a follow-up in `TODO.md`.

Matching is by word prefix: a label matches when every word of the query is the start of some word of the label. "sal rep" matches "Quarterly Sales Report". The bundle writer and the runtime split and fold text the same way:

- A word is a run of characters that are not separators. Separators are every ASCII character other than `A` to `Z`, `a` to `z`, and `0` to `9`; characters above ASCII are always part of a word.
- Folding uses fixed cross-runtime rules for common capitals: `A` to `Z`; Latin-1 U+00C0 to U+00DE except U+00D7; Latin Extended-A U+0100 to U+017F, where each capital is followed by its small letter (capitals are the even code points up to U+0137 and from U+014A to U+0177, the odd ones from U+0139 to U+0148 and from U+0179 to U+017E, and U+0178 folds to U+00FF); Greek U+0391 to U+03A9 except U+03A2, plus the accented capitals U+0386, U+0388 to U+038A, U+038C, U+038E, and U+038F; Cyrillic U+0400 to U+042F; and Armenian U+0531 to U+0556. Remaining single-unit lowercase pairs use one frozen Unicode 16.0 table shared by the C# writer and browser runtime, independent of the host's Unicode version. A lowercase mapping that expands to multiple units, including U+0130, is not applied; U+0131 stays distinct from `i`.
- Lengths are counted in UTF-16 code units of the folded word. A sidecar query needs at least one word of two or more code units, so that it never reads the shards of a whole first letter on its own. The runtime rejects queries made entirely of shorter words, including `a b`; inline and remote search can handle them according to their source.

Exact label matches rank first, then labels that start with the query, then the rest in natural order. Both sides are folded and compared without the separators at their start and end, so `(Default)` is an exact match for `default`. Remote endpoints may rank differently.

## Deep Links

With `deepLink` on, selecting a row writes `#cx.<encoded view id>=<path>` to the URL hash, where the view id is encoded by `encodeURIComponent` and `<path>` is the node's id path with each id encoded by `encodeURIComponent` and joined with `/`. Opening the page with such a hash expands the path and selects the node. Other parameters in the hash, separated by `&`, are kept. Hosts can build these links to point into a report.

## Counts

```json
{ "protocol": "canopyx/1", "type": "counts",
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
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "r/0", { "protocol": "canopyx/1", "type": "page", ... }]);
```

The three array items are the view id, the file's reference (its path under `base` without `.js`), and the document. The queue works whether the file loads before or after the runtime, and the view id keeps two bundles on one page apart.
For sidecar sources, each slash-delimited reference component is a file path component: `.` and `..` are rejected before a script is loaded. Remote-source references remain opaque identifiers.

| Reference | Document | Content |
| --- | --- | --- |
| `manifest` | `manifest` | View id, first top-level page, node count, page size, number of packs, search index description |
| `r/<n>` | `page` | Page `n` of the top-level nodes |
| `p/<n>` | `pack` | Pack `n`: the children pages of many nodes. A page inside it has the reference `p/<n>#<slot>`. |
| `e/<n>` | `searchEntries` | Entry file `n` of the search index: a run of consecutive entries and the ancestors they need |
| `s/k-<key>` | `searchShard` | The words that start with the shard's prefix, each with the entries that have it. The `k-` keeps keys such as `con` or `nul` from becoming Windows device names. |

Every page holds at most the writer's page size and fits the file budget (512 KiB by default), so page sizes vary and `offset` tells where each page starts. Nodes written into pages have no inline children; they carry `hasChildren`, `childCount`, and `ref` pointing at their first children page. File names are numbers, so they are short, safe on case-insensitive file systems, and independent of the characters in ids.

#### Packs

A tree with many small child lists would need one file per list: 150,000 parents make 150,000 files, which is slow to write and impractical to copy or upload. The bundle writer therefore stores the children pages of many nodes together in pack files, each filled up to the file budget:

```js
(self.CanopyXSidecar = self.CanopyXSidecar || []).push(["files", "p/12", { "protocol": "canopyx/1", "type": "pack",
  "pages": [ String.raw`{"protocol":"canopyx/1","type":"page","parent":"projects","offset":0,"total":2,"items":[...],"next":null}`, ... ] }]);
```

- `pages` holds page documents as JSON text, one string per page. The runtime parses only the page a node asks for and keeps the last six packs it read, so a pack costs little to load however many pages it holds.
- The reference `p/<n>#<slot>` names the page at position `<slot>` (from 0) of pack `<n>`. `<n>` and `<slot>` are decimal numbers without leading zeros. A node's `ref` and a page's `next` use this form; the node that owns a child list is therefore what maps it to its file and slice, and no central table has to be loaded first.
- The manifest's `packs` is the number of pack files. The runtime reads a reference as a packed page only when the manifest has `packs` and the reference has exactly this form; it rejects a pack number at or past `packs` and a slot the pack does not have. Every other reference, and every reference in a bundle without `packs`, names a file of its own that holds one `page` document, as in a bundle written by hand.
- The C# writer finishes a node's pages after the pages of its descendants, so the pages of one subtree are next to each other. Opening a small subtree level by level usually reads one pack. The pages of one child list are added last to first, because each page names the next.
- The C# writer puts each page in a `String.raw` template, which keeps the JSON text as it is: the file is not larger than the pages it holds, and the browser scans the text without building objects. This is why the writer escapes the backtick and `${`. A host that writes packs by hand can use ordinary JSON string literals instead; the document is the same.

A bundle of 379,325 nodes under about 150,000 parents (`CanopyX.Examples --pack-bench`) takes 3,460 files this way, 550 of them packs, instead of 152,601.

A runtime from before packs reads `p/<n>#<slot>` as a file name and cannot open a packed bundle. `SaveHtmlBundle` writes the runtime next to the data; a host that serves one shared copy of `canopyx.js` updates it before it serves packed bundles.

The manifest:

```json
{ "protocol": "canopyx/1", "type": "manifest", "view": "files", "root": "r/0", "nodeCount": 700, "pageSize": 250, "packs": 1,
  "search": { "entryCount": 700, "entryFiles": [0, 256, 512], "kinds": ["share", "folder", "file"],
    "shards": { "ab": 81, "ac": 9, "pra": 190, "prb": 12, "pr-": 3, "report-": 410, "report-.2": 230 } } }
```

A manifest exceeding `MaxFileBytes` fails with a named budget error; increase the budget or reduce the index. Default data folders escape Windows device names and include a full SHA-256 suffix of the exact UTF-16LE code units of the view id so distinct views cannot overwrite one another on case-insensitive filesystems. The `search` object is present when the view declares search; all four of its fields are required.

#### Search Index

The index holds every node once, in an entry table, and refers to nodes by entry number everywhere else. A query reads the shards of its words and the entry files of the matches it shows, never the whole index.

**Entries.** The bundle writer numbers all nodes in depth-first order, so a parent always has a smaller number than its children. Every node gets an entry, whether or not its label has a searchable word, because the id path of a hit runs through its ancestors. The files `e/0`, `e/1`, and so on hold consecutive entries, at most 256 per file and fewer when the file budget requires it. `search.entryCount` is the number of entries, and `search.entryFiles` lists the number of the first entry of each file in file order, starting with 0.

```json
{ "protocol": "canopyx/1", "type": "searchEntries", "first": 512,
  "stem": [[0, -1, 0, "share-a", 0, "\\\\files\\share-a", 0], [3, 0, 7, "/d0", 0, "Finance", 1]],
  "entries": [[3, 10, "/p4", 0, "Budget", 1], [512, 13, "/f0", 0, "Budget 1.xlsx", 2]] }
```

An entry is the array `[parent, head, id, tail, label]`, followed by the position of the node's kind in `search.kinds` when the node has one. `parent` is the parent's entry number, or -1 for a top-level node. The id is written relative to the parent's id: `head` and `tail` count the UTF-16 code units the two ids share at the start and at the end, and the array holds only the part between them. In the example, entry 512 has parent 3 (`share-a/d0`), takes the first 10 code units of that id, and adds `/p4`, which makes `share-a/d0/p4`. Path-style ids repeat the parent's id at the start and distinguished names repeat it at the end, so neither is written again on every level. Writers do not split a surrogate pair between the shared and the written part; top-level entries have `head` and `tail` 0; and `head` plus `tail` never exceeds the length of the parent's id.

`stem` lists the ancestors of the file's first entry from the top level down, each as its own entry number followed by the fields of an entry. With depth-first numbers, an ancestor that lies before a file is an ancestor of that file's first entry, so one file is enough to rebuild the id path, label, kind, and context of every entry in it. The context of a hit names its nearest two ancestors (`grandparent / parent`). The stem counts against the file budget: a tree so deep that the ancestors of one node do not fit in a file cannot be written with search, and the writer says so.

**Words.** Each entry is filed under every distinct word of its label (see [Search](#search) for words and folding). Each label with a word is also filed under its label token: U+0000, which no word can contain, followed by the eight lowercase hex digits of the 32-bit FNV-1a hash of the folded label without the separators at its start and end (start with 2166136261; for each UTF-16 code unit, xor it in and multiply by 16777619 modulo 2^32). `Budget (old)` and `budget (OLD` have the token of `budget (old`. The token lets a reader find the labels equal to a query without reading any label. Two labels can share a token, so a reader compares the label with the query.

**Shards.** A shard covers every word that starts with a given prefix of the folded word. A prefix starts at two code units. When a shard would refer to more entries than the bundle writer's limit (20,000 postings by default; 1,000 for the shards of label tokens, because a query reads exactly one token), it splits into prefixes one code unit longer, and the word exactly as long as the old prefix moves to a shard for the old prefix marked with a trailing `-`. Prefixes stop growing at 12 code units. A word of one code unit has a shard of its own, named by that code unit and a trailing `-`. The shard key is the prefix encoded for file names: `a` to `z` and `0` to `9` stay as they are, and any other code unit becomes `_` followed by its four lowercase hex digits (`é` becomes `_00e9`, and the keys of label tokens start with `_0000`).

```json
{ "protocol": "canopyx/1", "type": "searchShard", "key": "pra",
  "words": ["practice", "prague"], "postings": [[14, 3, -5, 120], [7]] }
```

`words` and `postings` run in parallel. A posting list holds the ascending numbers of the entries that have the word: the first value is an entry number, a positive value after it is the gap to the next entry, and a negative value `-n` stands for the `n` entries that follow the previous one without a gap. `[14, 3, -5, 120]` is 14, 17, 18 to 22, and 142.

A shard is stored in numbered parts when it outgrows the file budget. The first part uses its base key; subsequent keys append `.2`, `.3`, and so on (including after a terminal `-`, for example `ab-.2`). A posting list that does not fit continues in the next part under the same word, where it starts again with a plain entry number. The manifest lists every part separately in `search.shards` with the number of entries that file's posting lists refer to, for example `{ "report-": 410, "report-.2": 230 }`. Writers include the base key and use consecutive part numbers starting at two. Readers discover parts from this list, not by probing filenames: resolve the base prefix without treating a part suffix as a longer prefix, then load its base file followed by listed parts in ascending numeric order. Each file's `searchShard.key` and posting count equal its manifest key and count, and no posting refers to an entry at or past `entryCount`; readers reject mismatches. A missing part list means the base file is the complete shard.

**Reading.** To search, the runtime takes each query word and starts with its first two code units. If a shard exists for that prefix, it loads it. If shards exist for longer prefixes that start with it, it adds the next code unit and repeats; if the query word runs out first, it loads every shard under the current prefix, including the `-` shard. A query word of one code unit loads every shard whose prefix starts with it. The entries of a query word are the merged posting lists of the shard words that start with it, and the candidates are the entries that every query word has. A query word that starts another query word is skipped, because the longer one implies it.

The runtime also looks up the label token of the folded query, without the separators at its start and end. It reads the labels equal to the query first and then the other candidates in document order, loading the entry files they fall in, until it has enough matches to fill the result list, and it ranks at most five times the view's `maxResults`. The total is the number of candidates, which is exact. A truncated result holds the labels equal to the query and the first other matches in document order, which are not necessarily the best-ranked of all matches.

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
Fully materialized remote trees can be written as sidecar bundles with local search enabled even when the original remote source has no search endpoint; ordinary remote views still require that endpoint. A node in such a tree may retain its former remote `Ref` beside its complete inline children in memory: the bundle writer replaces that reference with the generated child-page reference. Ordinary `canopyx/1` node documents still reject a `ref` beside inline children.
