# Server-side data for .NET (`CanopyX.Data`, `CanopyX.AspNetCore`)

A hosted CanopyX data grid never holds the whole dataset. It sends typed queries as the reader scrolls, sorts, searches,
filters, opens a value list or exports, and expects revisioned documents back (see [Flat Grid Documents](data-protocol.md#flat-grid-documents)).
These two packages answer those queries from .NET:

- **`CanopyX.Data`** (`net472`, `netstandard2.0`, `net8.0`, `net10.0`) parses and validates every request against a column
  allow-list and safety limits, executes it, and writes the `gridPage`, `gridFacetPage`, `gridSummary` and
  `gridCommitResult` documents the browser runtime accepts. It runs requests over any `IQueryable<T>` (EF Core, LINQ to
  objects, any LINQ provider), over a provider you write for another back end, streams exports, serves grouping with up to
  four levels, saves edited rows through a writer you choose ([Saving edits](#saving-edits)), and loads one record's details
  for the record panel on demand ([Record details](#record-details)).
- **`CanopyX.AspNetCore`** (`net8.0`, `net10.0`) maps it to minimal-API endpoints and writes the small browser script that
  connects the grid to them.

```text
browser grid ── gridQuery / gridFacetQuery / export request ──▶ endpoint ──▶ CanopyRemoteHandler
                                                                              │ parse + allow-list + limits + revision
                                                                              ▼
                                                                   ICanopyDataProvider
                                                     (CanopyQueryableProvider<T> │ your SQL provider │ CanopyInMemoryProvider<T>)
browser grid ◀── gridPage / gridFacetPage / gridSummary / file ──────────────────┘

browser grid ── gridCommit ──▶ commit endpoint (write policy) ──▶ CanopyRemoteHandler
                                                                   │ editable columns + values checked again
                                                                   ▼
                                                        ICanopyDataWriter (CanopyQueryableWriter<T> │ your writer)
browser grid ◀── gridCommitResult (saved │ error │ conflict per row, new revision) ┘

record panel ── gridRecordQuery ──▶ record endpoint ──▶ CanopyRemoteHandler
                                                         │ fields allowed + readable, revision, limits
                                                         ▼
                                              ICanopyRecordProvider (CanopyQueryableRecordProvider<T> │ your provider)
                                                         │ Where(key == id) on the grid's own query, children through it
record panel ◀── gridRecord (fields, cells, row │ one collection page) ┘
```

## Quick start

```csharp
// 1. The grid definition the browser renders.
var view = new CanopyDataGridView("machines", "Machines") { Source = CanopyGridSource.HostedOffset(), PageSize = 200, Selection = CanopySelectionMode.Multiple };
view.Columns.Add(new CanopyColumn("name", "Machine") { Sortable = true });
view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
view.Columns.Add(new CanopyColumn("memory", "Memory (GB)") { Kind = CanopyColumnKind.Number, Sortable = true });
view.Columns.Add(new CanopyColumn("lastSeen", "Last seen") { Kind = CanopyColumnKind.DateTime, Sortable = true });
view.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true });
view.Reporting = new CanopyGridReporting { HeaderFilters = true, FilterGroups = true };
view.Reporting.FacetColumns.Add("site");

// 2. The allow-list: protocol column ids mapped to expressions. Nothing else is reachable.
var map = new CanopyColumnMap<Machine>(view)
    .Key(machine => machine.Id)
    .Column("name", machine => machine.Name)
    .Column("site", machine => machine.Site)
    .Column("memory", machine => machine.MemoryGb)
    // This store writes UTC whole milliseconds; its indexed timestamp already has the protocol's precision.
    .Column("lastSeen", machine => machine.LastSeen, column => column.SortBy(machine => machine.LastSeen))
    .Column("team", machine => machine.Team!.Name);

// 3. The endpoints. The query callback returns what this caller may see; authorization is required by default.
app.MapCanopyRemote("/api/machines", http => http.RequestServices.GetRequiredService<FleetDb>().Machines, map, options => {
    options.Query.Revision = token => store.GetRevisionAsync(token);
    options.AuthorizationPolicy = "Inventory.Read";
});

// 4. The page: the grid plus the script that points its source at the endpoints.
app.MapGet("/machines", () => Results.Content(
    view.ToHtmlPage(new CanopyHtmlOptions { Title = "Machines" })
        .Replace("</head>", CanopyRemoteScript.Element(map.Schema, "/api/machines") + "</head>"), "text/html"));
```

For a page with a nonce-based Content Security Policy, pass the response's nonce to both `CanopyHtmlOptions.Nonce`
and `CanopyRemoteScript.ElementWithNonce(map.Schema, "/api/machines", nonce)`. The configuration script must run
before the grid mounts. See [Content Security Policy](security.md#content-security-policy).

The default executor already counts through EF Core's asynchronous query provider and enumerates EF queries
asynchronously, without a dependency on EF Core. An executor of your own uses other operators, for example:

```csharp
sealed class EfCoreExecutor : CanopyQueryExecutor {
    public override Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken token) => query.CountAsync(token);
}
```

Pages that are not rendered by .NET configure the same source by hand; this is what `CanopyRemoteScript` writes:

```js
const post = (path, body, signal) => fetch("/api/machines" + path, { method: "POST", signal, credentials: "same-origin",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async response => { if (!response.ok) throw new Error((await response.json()).message); return response; });
CanopyX.configure("machines", { source: {
  query: (query, { signal }) => post("/query", query, signal).then(r => r.json()),
  facet: (request, { signal }) => post("/facet", request, signal).then(r => r.json()),
  summary: (query, { signal }) => post("/summary", query, signal).then(r => r.json()),
  // Views with editable columns save through the commit endpoint.
  commit: (batch, { signal }) => post("/commit", batch, signal).then(r => r.json()),
  // Views whose record panel loads details on demand (CanopyRemoteScript also answers null for a 404 recordNotFound).
  record: (request, { signal }) => post("/record", request, signal).then(r => r.json())
} });
document.addEventListener("canopyx:commit", event => {
  const grid = event.target.canopyx, result = event.detail, revision = result && result.revision;
  if (!grid || grid.view.id !== "machines") return;
  if (revision ? revision !== grid.getQuery()?.revision : result && result.saved > 0)
    grid.reload().catch(() => {}); // The grid displays the reload error and calls onError.
}, true); // grid events do not bubble, so listen in the capture phase
```

The [fleet inventory sample](#sample-application) runs this end to end over 100,000 SQLite rows.

## Adding server-side data to an existing app

Suppose a page renders a table from a list your controller loads in full. To move paging, sorting, searching, filtering
and export to the server without changing what readers see:

1. **Declare the grid once.** Build a `CanopyDataGridView` with `CanopyGridSource.HostedOffset()` and the same columns.
   Mark the columns readers may sort (`Sortable`), list the columns quick search reads (`SearchColumns`), and opt columns
   into value lists (`Reporting.FacetColumns`). This definition is the contract the browser enforces.
2. **Keep your query, drop the `ToList()`.** The `IQueryable<T>` your controller already builds (including its
   authorization `Where`) becomes the callback of `MapCanopyRemote`. The adapter composes search, filters, ordering and
   the window on top and asks the database only for one page.
3. **Map columns explicitly.** One `Column(id, expression)` per grid column. Columns you do not map cannot be sorted,
   filtered, searched or exported, even if a request names them.
4. **Give the data a revision.** Return a value that changes when the data changes (a row version, a change counter, an
   import timestamp). Clients that hold an older revision reload instead of mixing snapshots.
5. **Replace the page's data with the script.** Render the grid with `ToHtmlPage`/`ToHtmlFragment` and add
   `CanopyRemoteScript.Element(...)`. The grid's Export menu gains a server CSV entry that downloads every matching row.
6. **Index for the common orders.** The default order is the key; add indexes for frequently sorted or filtered columns
   (see [Performance](#performance)).
7. **Let readers edit (optional).** Mark the columns readers may change `Editable` (with an `Editor` and `Validation`),
   map a writer and name the policy that may write (see [Saving edits](#saving-edits)). The server repeats the checks,
   writes nothing else, and answers conflicts when another user changed a row first.

## Endpoints

`MapCanopyRemote(pattern, …)` returns a `RouteGroupBuilder` serving:

| Route | Request | Response |
| --- | --- | --- |
| `POST {pattern}/query` | `gridQuery` document | `gridPage` |
| `GET {pattern}/query` (with `AllowGetQueries`) | `?q=<gridQuery JSON>`, or `offset`, `limit`, `search`, `searchMode`, `revision`, `sort` (`name`, `name:desc`, `-name`, repeatable or comma separated), `filters` (JSON array), `filterGroup` (JSON object) | `gridPage` |
| `POST {pattern}/facet` | `gridFacetQuery` document | `gridFacetPage` |
| `POST {pattern}/summary` | `gridQuery` with its accepted `revision` | `gridSummary` |
| `POST {pattern}/export/{format}` | the grid's export request (`scope`, `query`, `revision`, `selection`, `querySelection`, `columns`, `values`, …) | the file, streamed |
| `GET {pattern}/view` | | the `grid` definition document |
| `POST {pattern}/commit` (with `options.Writer`) | `gridCommit` document | `gridCommitResult` |
| `POST {pattern}/record` (with a record map or `options.Records`) | `gridRecordQuery` document | `gridRecord` (404 `recordNotFound` when the caller has no such record) |

The GET form is off by default because query strings reach access logs, proxies and referrers. POST bodies must be `application/json` (or `+json`); other content types get 415, which also means cross-origin pages
cannot post without passing a CORS preflight. Responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
Every handler observes `HttpContext.RequestAborted`; the token flows into the provider and the database command.

Outside ASP.NET Core, use `CanopyRemoteHandler` directly: `QueryAsync(json)`, `FacetAsync(json)`, `SummaryAsync(json)`,
`PrepareExportAsync(json, format)`, with a writer (`new CanopyRemoteHandler(schema, provider, options, writer)`)
`CommitAsync(json)`, and with a record provider (`new CanopyRemoteHandler(schema, provider, options, writer, records)`)
`RecordAsync(json, canRead)` return documents (or an export job) and throw `CanopyRequestException` for client errors.
`CanopyRequestParser` exposes the parsing step on its own, and `CanopyRequestParser.FromQuery(CanopyGridQuery, schema)`
validates a typed C# query with the same rules.

## Column mapping

`CanopyColumnMap<T>` binds each protocol column id to an expression. Every mapped id must be declared by the view, with a
kind that fits the expression type:

| Column kind | Expression types | Wire value |
| --- | --- | --- |
| `Text` | `string`, `bool`, enumerations | text; booleans stay JSON booleans; enumerations are their `[EnumMember(Value = …)]` names, else their member names |
| `Number` | `byte` … `long`, `float`, `double`, `decimal` | number (keep magnitudes within ±2^53−1) |
| `DateTime` | `DateTime` (stored as UTC), `DateTimeOffset`, `DateOnly` (midnight UTC) | ISO 8601 UTC |

Other types throw when you map them; project them to text (`x => x.Id.ToString()`). Navigation chains (`x => x.Team!.Name`)
are fine: EF Core turns them into joins, and in-memory queries are rewritten so a missing reference yields a missing value.

Per-column options (`.Column(id, expr, column => column…)`):

| Option | Effect |
| --- | --- |
| `SortBy(x => key)` | Sorts by another expression, for example a sortable code beside a display name. |
| `SearchBy(x => text)` | Quick search reads this text instead of the value, for example a joined alias list. |
| `Cell(value => new CanopyCell(value) { Text = …, Tone = … })` | Formats the written cell (display text, tone, badges, tooltip). Keep `Value` raw. |
| `NotNull()` | Declares the value never null, so sorting needs no missing-values-last key and can use an index. Detected automatically from non-nullable reference annotations on .NET 6+. |
| `Filterable(false)` | The column can be read and sorted but not filtered. |

`Key(x => x.Id)` maps the stable record identity: row ids are its invariant text, selected exports look records up by it,
and it is the final sort key. `DecorateRows(row => …)` adjusts every written row (a row tone or class). The map freezes when
its `Schema` is first used. Declared view columns that are not mapped remain display-only.
The schema captures its column rules and advertised view at construction. Later changes to the authoring view or copies
returned by the column descriptors do not change the endpoint contract; create a new map/schema to publish a new definition.

## Protocol coverage

| Capability | Wire | Status |
| --- | --- | --- |
| Paging with total and matching counts | `gridQuery` → `gridPage` | Full. `offset`/`limit` (1–10,000, capped by `MaxPageSize`), exact `total` and `matched`, window filled exactly. |
| Multi-column sort | `sort[]` | Full. Missing values last in both directions; record key as final tie-breaker. Grouped views always lead with the grouping column. |
| Text ordering policies | `reporting.ordering` | Categories translate to a rank expression; `natural` orders fall back to the store's text order in databases (exact in memory). Use `SortBy` for a natural key. |
| Column filters | `filters[]` | Every operator: `eq`, `ne`, `contains`, `startsWith`, `in` (≤ 1,000), `gt`, `ge`, `lt`, `le`, `isNull`, `isNotNull`. |
| Filter builder | `filterGroup` | Full nesting of all/any groups (8 levels, 64 groups, 64 predicates, lowered by limits). |
| Text comparison | | Case-insensitive; see [Text, numbers and dates](#text-numbers-and-dates). |
| Quick search | `search`, `searchMode` | Substring and all-words (quoted phrases) over the searchable columns. |
| Value lists | `gridFacetQuery` → `gridFacetPage` | Full: case-insensitive buckets, counts over the complete query, value search, `includeCurrentFilter: false` projection, deterministic order, ≤ 200 buckets. |
| Grouping and aggregates | `source.summary` → `gridSummary` | Full: a fixed grouping or up to four runtime `groupBy` levels (ordered by value or by an aggregate), nested groups with absolute ranges and keys unique across levels, `count`/`distinctCount`/`sum`/`average`/`minimum`/`maximum`; pages and exports read group by group. Custom aggregates need a provider of your own (see [Grouping levels](#grouping-levels)). |
| Editing | `gridCommit` → `gridCommitResult` | Full with a writer: editable columns only, values checked again with the view's validation, rows saved independently (or all or nothing), conflicts from original values, the new revision (see [Saving edits](#saving-edits)). |
| Record details | `gridRecordQuery` → `gridRecord` | Full with a record map or provider: record fields, columns' drawer values (`cells`), the row, collections that page with totals, timelines, change lists and links to related records (see [Record details](#record-details)). |
| Revisions | `revision` | Full: a stale revision answers 409 `staleRevision`. |
| Exports | export request → file | Full: `filtered`, `selected` (ids or all-matching with exclusions) and `all` scopes, chosen columns, raw or display values, streamed. |
| Cursor navigation | `gridCursorQuery` | Not served; rejected with `unsupported`. Offset navigation covers the protocol's hosted grids. |

Return a stable revision that changes when the dataset changes, and keep its lookup cheap. The handler reads it before
and after pages, facets and summaries, and checks exports after counting and around streaming. A provider that always
returns the same revision, such as `live`, does not provide a snapshot guarantee.
## Text, numbers and dates

The protocol defines exact rules (see [Filter semantics](data-protocol.md#flat-grid-documents)): text matching is
case-insensitive with a frozen folding table, a missing value fails every operator except `isNull` (including `ne`),
the empty string is a value, and dates compare as UTC instants at millisecond precision. `CanopyInMemoryProvider<T>` and
LINQ to objects implement them exactly (`CanopyTextFolding` is the shared folding). Databases get the closest translation:

- **Text.** `CanopyQueryOptions.TextComparison`: `Lowercase` (the default for database providers) compares `LOWER(column)`
  with the lowercased operand, which folds ASCII on SQLite and as far as the database's `LOWER` goes elsewhere; `Collation`
  leaves case to a case-insensitive column collation and keeps index seeks; `Canonical` is the exact in-memory rule.
  Wildcard characters (`%`, `_`, `[`) in operands match literally: operands are parameters to `Contains`/`StartsWith`,
  which the LINQ provider escapes.
- **Text order.** Sorting uses the store's order. SQLite's default binary collation matches the protocol's ordinal order;
  a case-insensitive collation interleaves case. Grouping columns need a binary (case-sensitive) collation, because groups
  are exact values.
- **Text value lists.** After applying the effective query, facets search and merge text with the protocol's frozen folding
  table before choosing their ordered prefix and counting distinct values. This includes Unicode spellings the database's
  `LOWER` keeps apart. Query filters and quick search still follow `TextComparison` above. Use a binary collation when raw
  spelling matters: the adapter cannot recover spellings the store already merged into one group.
- **Numeric value lists.** Search reads the protocol's binary64 number text, including exponent spelling and full precision.
  With a nonempty search, the adapter streams the database's ordered numeric groups, merges equivalent values, then counts
  matches and retains the requested prefix. Empty search keeps the database distinct count and limited prefix query.
- **Enumerations and booleans** evaluate every member against the exact rule and send the matching members as an `IN`
  test, so `contains "ux"` on an enumeration becomes `os IN (Linux)`. Enumerations sort by their raw text (an `[EnumMember]` value or the member name).
  Flags include unnamed combinations of up to eight declared bits (at most 256 values). Map larger flag domains to host-projected text.
- **Integers** accept fractional operands as the protocol's binary64 comparison would: `gt 4.5` becomes `> 4`, `eq 4.5`
  matches nothing, and out-of-range operands become always/never true.
- **Decimal numbers.** Cells retain their exact decimal JSON text. Numeric operations use the binary64 value a browser reads
  from it: comparisons, default sorting, group keys, value lists, distinct counts and aggregate inputs round once with ties
  to even. In-memory fractional decimal conversion uses temporary exact integer arithmetic; database expressions use a
  translated binary64 cast. Consider the conversion and cast cost for large decimal datasets.
  On .NET Framework, request readers normalize exactly representable decimal JSON spellings before converting them;
  number texts outside decimal's precision or range retain the platform JSON parser's rounding.
- **Dates** become half-open bounds: `eq t` is `t ≤ v < t + 1 ms`, `gt t` is `v ≥ t + 1 ms`. Store UTC; `DateTime` values
  without a kind are read as UTC. In-memory ordering compares UTC milliseconds and breaks ties by record identity.
  Database ordering requires an explicit `SortBy` mapping whose values have the same ordering and ties, usually an indexed
  UTC millisecond key. Mapping the timestamp itself is appropriate only when the store guarantees whole milliseconds.
  Without that mapping, date sorts return `unsupported` before querying or preparing an export. No client-side full-table sort is used.
  Date facets merge submillisecond values before counting and limiting the list. Exact totals scan and transfer the distinct
  raw date groups while retained memory stays proportional to the requested limit; consider this cost for high-cardinality columns.
- **Large numbers.** Number columns follow the protocol's binary64 range: comparisons are bounded to ±2^53−1, so store
  larger identifiers as text.
- **Search over numbers and dates.** In memory, quick search reads every searchable column's raw text. Databases search
  number columns through the store's text form only when the view lists them in `SearchColumns`; this spelling can differ
  from protocol number text. Use `SearchBy` with a stored canonical text column when quick search needs the exact protocol
  spelling. Databases never search date columns without a `SearchBy` text mapping (there is no portable text form).
  Value-list search on a date column answers `unsupported`.

## Grouping levels

A view with a fixed `Reporting.Grouping` groups by one column the reader cannot change. A view with runtime grouping
(`Reporting.GroupBy` levels and/or `Reporting.Groupable`) carries the levels in every query as `groupBy`, at most four,
outermost first ([data-protocol.md](data-protocol.md#flat-groups-and-complete-query-totals)):

```csharp
view.Reporting = new CanopyGridReporting { Groupable = true };
view.Reporting.Aggregates.Add(new CanopyGridAggregate("machines", "name", CanopyGridAggregateOperation.Count, "Machines"));
view.Reporting.Aggregates.Add(new CanopyGridAggregate("models", "model", CanopyGridAggregateOperation.DistinctCount, "Models"));
view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("site", descending: true, aggregate: "machines")); // busiest sites first
view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("os"));
```

- **Parsing.** `groupBy` levels name allowed sortable columns, once each, with `asc`/`desc` and an optional declared
  aggregate; anything else answers `invalidGroupBy`, and so does `groupBy` on a view without runtime grouping. A query
  without `groupBy` takes the declared levels; `[]` is ungrouped. The parser normalizes the query as the browser does: the
  levels' columns lead the sort (ascending for a level ordered by an aggregate), and a sort entry for a column grouped by
  value turns that level around. `CanopyDataRequest.Levels` and `CanopySummaryRequest.Levels` hold the result
  (`CanopySummaryLevel`: column, direction, aggregate); a fixed grouping is one level.
- **Record order.** Records follow the levels: each level's groups by raw value (ordinal text, numbers and dates, missing
  last), or by the level's aggregate over the group (missing aggregates last, equal values by value ascending), then the
  other sort keys inside the innermost groups and the record key. Pages and exports read innermost group by innermost
  group, so their order always agrees with the summary.
- **Nested summaries.** Each level's groups nest in their outer group with absolute offsets into the complete query. Keys
  are unique across the summary: first-level keys keep the single-level form (`s:North`, `n:4`, `null`), inner keys are
  the depth and the path of level keys (`2:s:North/s:Open`, with `\` and `/` escaped). The 10,000-group limit counts every level.
- **Aggregates.** `distinctCount` counts distinct nonmissing raw values of any column (`COUNT(DISTINCT …)` in a
  database; dates at protocol precision in memory). Custom aggregate operations (a `CanopyGridAggregate` with an operation
  name) reach a provider as `CanopySummaryAggregate.CustomOperation`; the built-in providers answer `unsupported`, so a
  view with a custom aggregate needs an `ICanopyDataProvider` that computes it.
- **Echo.** The summary includes a complete normalized `gridQuery`, even when a direct handler request contains only
  its revision. The offset is zero; the accepted limit, search, predicate shape and operands are retained, and the
  effective grouping levels lead the sort. For code-built requests, an unused summary limit outside 1–10,000 is echoed
  as the view's page size. Ignored input fields do not become part of the response.
  Typed summaries return `unsupported` before provider access for constant filters, identity restrictions, or grouping
  overrides that a fixed or ungrouped view cannot express. These shapes remain supported in ordinary typed queries and
  direct provider requests; use runtime grouping for query-owned grouping levels.

## Safety

Every request passes through `CanopyRequestParser` before a provider sees it:

- **Allow-list.** Only mapped columns are reachable; unknown ids answer `unknownColumn`. Sorting needs a sortable column,
  filtering a filterable one, value lists a declared facet column.
- **Typed operands.** Operands are converted per column kind and rejected when they do not fit (`invalidOperand`):
  numbers must be finite within ±2^53−1, dates ISO 8601 with an explicit zone, text at most `MaxOperandLength`.
- **Parameters only.** The queryable provider passes every operand as a captured value, which LINQ providers send as a
  query parameter; request text never becomes SQL. The tests check the SQL EF Core sends for hostile operands.
- **Limits** (`CanopyRemoteLimits`, protocol caps in brackets):

| Limit | Default | Protocol cap |
| --- | --- | --- |
| `MaxPageSize` | 1,000 | 10,000 |
| `MaxExportRows` | 100,000 | — |
| `MaxFilterDepth` | 8 | 8 |
| `MaxFilterTerms` (flat and nested predicates) | 64 | 64 |
| `MaxFilterGroups` | 64 | 64 |
| `MaxInValues` | 1,000 | 1,000 |
| `MaxValueListSize` | 200 | 200 |
| `MaxSearchLength` | 1,024 | 16,384 |
| `MaxSearchTerms` (all-words search; repeated words count once) | 16 | — |
| `MaxOperandLength` | 4,096 | — |
| `MaxRequestBytes` | 1 MiB | — (JSON nesting is also capped at 64) |
| `MaxSelectedIds` (selected exports, exclusions) | 10,000 | 10,000 |
| `MaxGroups` (across all grouping levels) | 10,000 | 10,000 |
| `MaxCommitRows` | 100 | — |
| `MaxCommitTextLength` (one written text value) | 65,536 | — |
| `MaxRecordPageSize` (rows of a collection page, and first rows of each collection in a whole record) | 200 | 10,000 |
| `MaxRecordItems` (timeline events or changes of one record field) | 200 | 10,000 (changes 512) |
| `MaxRecordBytes` (one serialized record answer; refused, never cut short) | 1 MiB | — |
| `MaxRecordTextLength` (one text value of a record answer, held for every provider; longer text ends with an ellipsis and fits the limit) | 8,192 | — |
| `MaxRecordOffset` (offset of a collection page) | 10,000 | — |
| `MaxRecordRequestBytes` (one record request body, within `MaxRequestBytes`) | 16 KiB | — |

- **Typed errors.** Rejections throw `CanopyRequestException` and answer `{ "error": code, "message": text }` with status 400
  (409 for `staleRevision`, 404 for `recordNotFound`, 413 for an oversized body, 415 for a non-JSON body). Codes: `invalidJson`, `invalidDocument`,
  `unknownColumn`, `invalidSort`, `columnNotFilterable`, `invalidOperator`, `invalidOperand`, `limitExceeded`,
  `offsetOutOfRange`, `staleRevision`, `unsupported`, `notFacetable`, `invalidExport`, `unknownFormat`, `invalidGroupBy`,
  `columnNotEditable`, `unknownField`, `notCollection`, `recordNotFound`. Messages never echo
  request text or server internals. Any other exception is logged and answered with a generic 500 `serverError`.
- **Authorization.** Endpoints require authorization by default (the default policy, or `AuthorizationPolicy`); set
  `AllowAnonymous` only for public data. Row-level restrictions belong in the query callback, which runs per request.
  The commit route requires `WriteAuthorizationPolicy` on top of the read authorization, and mapping a writer without
  one (or with a blank name) fails: the default policy would let every reader write. `AllowAnonymousWrites` exists for
  local samples. A route group opened with `.AllowAnonymous()` makes ASP.NET Core skip every policy, so the commit route
  then refuses with 403 `writeNotAllowed` unless `AllowAnonymousWrites` is set. The record route requires the read
  authorization like the other reads; `CanReadRecordField` decides per request which record fields a caller sees.
- **Rate limiting** belongs to the host: `MapCanopyRemote(...).RequireRateLimiting("grid")` limits every route, and
  `options.RecordEndpoint = route => route.RequireRateLimiting("records")` the record route alone.
- **Writes.** Only columns the view declares editable and the schema allows can be written; any other column fails the
  whole batch with `columnNotEditable`. Every value is checked again (kind, the view's validation, the editor's step and
  choices) before a writer sees it, so a modified client cannot write what the grid would refuse. The reference writer
  also writes only columns mapped to a member of the record, converts values with range and membership checks, and
  answers store failures with a generic message (log them with `CanopyQueryableWriterOptions.Failed`). Commit bodies are
  JSON only, so another site's form cannot post one; cross-origin scripts need a CORS policy you grant.
- **The column map is the access boundary.** Rows carry every mapped column and exports accept hidden columns; a view's
  `Hidden` flag is presentation. Leave out of the map whatever a caller must not read, and leave `Editable` off whatever a
  caller must not write. Commits change the records the writer's store loads by key: restrict that store as you restrict
  the query callback when callers may change only some records.
- **Stale data.** A window that no longer matches its counts (records written between the count and the read) answers
  409 `staleRevision`; an export that reads fewer records than it counted fails, and the endpoint aborts the response
  so the download does not look complete.
- **Exports** are validated and counted before the first byte: an oversized scope answers `limitExceeded`, a missing
  selected record `invalidExport`, a changed count `staleRevision`. CSV cells that would start a spreadsheet formula are
  prefixed with an apostrophe, and file names are reduced to safe characters.

## Provider interface

`ICanopyDataProvider` is the seam for back ends without a LINQ provider, such as raw SQL through a micro-ORM:

```csharp
public interface ICanopyDataProvider {
    ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken);
    ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken);
    ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken);
    IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken);
    ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken);
    ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken);
}
```

Requests arrive validated. A `CanopyDataRequest` carries `Ids`/`ExcludedIds` (selection), `SearchTerms` with the
`Schema.SearchColumns`, a `Filter` tree (`CanopyFilterGroup`, `CanopyFilterCondition`, `CanopyFilterConstant`) whose
conditions hold an allowed `CanopyDataColumn`, an operator and typed operands, the `Sort` keys and the window. An
implementation keeps its own fixed map from column id to SQL expression and binds every operand as a parameter:

```csharp
string Condition(CanopyFilterCondition condition, DbCommand command) {
    var column = Columns[condition.Column.Id];               // your fixed, allow-listed SQL expression
    string P(object value) { var p = command.CreateParameter(); p.ParameterName = "@p" + command.Parameters.Count; p.Value = value; command.Parameters.Add(p); return p.ParameterName; }
    return condition.Operator switch {
        CanopyGridFilterOperator.IsNull => column + " IS NULL",
        CanopyGridFilterOperator.Contains => "LOWER(" + column + ") LIKE '%' || " + P(Escape(((string)condition.Values[0]).ToLowerInvariant())) + " || '%' ESCAPE '\\'",
        CanopyGridFilterOperator.GreaterThan => column + " > " + P(condition.Values[0]),
        // … the remaining operators, with "column IS NOT NULL AND" in front of every value comparison
    };
}
```

Contract details:

- **Order.** Apply the sort keys with missing values last in both directions, then the record key ascending. A grouped
  request (`request.Levels`: the fixed grouping or the `groupBy` levels) orders records level by level first, as
  [Grouping levels](#grouping-levels) describes, then by the sort keys of other columns; its levels' columns also lead
  `request.Sort`, as on the wire.
- **Counts.** `QueryAsync` returns the unfiltered `Total`, the `Matched` count before the window, and exactly
  `min(limit, matched − offset)` rows.
- **Value lists.** Buckets are case-insensitive for text (one bucket per folded value), null last, at most `Limit`, with
  `TotalValues` counted after value search.
- **Summaries.** Return every group of the first level (any order; the endpoint orders them and assigns ranges) with its
  count and the declared aggregates, and inside each group of an outer level the groups of the next level
  (`new CanopySummaryGroup(value, count, aggregates, innerGroups)`); `count` and `distinctCount` count nonmissing values,
  the others are null for a group without values. Group by every prefix of the levels (one `GROUP BY` per level, or a rollup).
- **Rows.** Build `CanopyGridRow`s; `CanopyDataValues.ToCell` converts store values to protocol cells and `FormatId` formats keys.
- **Unsupported capabilities** throw `CanopyRequestException(CanopyRequestError.Unsupported, …)`.

`CanopyInMemoryProvider<T>` is the reference implementation of this contract over records in memory (it evaluates every
rule directly, without LINQ providers) and the oracle the tests compare EF Core and LINQ results with. Register any
provider with `MapCanopyRemote(pattern, schema, http => provider)`, or `new CanopyRemoteHandler(schema, provider)`.

## Export

The browser grid hands its export request to the server: the scope (`filtered`, `selected` or `all`), the accepted query
and revision, selected identities or an all-matching selection with exclusions, the columns in order and raw or display
values. `CanopyRemoteScript` registers one Export menu entry per server format (`CanopyX.registerExportFormat`), so the
menu's scope picker, progress and cancellation apply, and also answers `grid.exportToHost(format, …)`.

On the server, `PrepareExportAsync` validates and counts the scope, then `CanopyExportJob.WriteAsync(stream)` streams the
records from the provider straight to the response, never materializing the result:

- **CSV** (`CanopyCsvExportFormat`, registered by default): UTF-8 with a byte order mark, CRLF, column titles first, quoting
  for delimiters, quotes and line breaks, formula protection, and a comma, semicolon or tab delimiter. Display values use
  the cell's own text or the request locale (numbers with up to three decimals, dates `yyyy-MM-dd HH:mm UTC`, `Yes`/`No`);
  raw values are invariant (ISO dates, plain numbers).
- **Other formats** implement `ICanopyExportFormat` (`Id`, `ContentType`, `Extension`, `WriteAsync(context, stream, token)`)
  and are added to `CanopyRemoteOptions.ExportFormats`. `CanopyExportContext` supplies the ordered records and
  `GetValue`/`GetText` helpers that respect the request's value mode.

A prepared export is checked again before writing. If the revision changes while streaming, the job fails and the
ASP.NET Core host aborts a response that has already started. Other hosts must discard a file whose `WriteAsync` fails.
## Saving edits

A grid with editable columns (`CanopyColumn.Editable`, with an optional `Editor` and `Validation`) keeps changes in its
change set until the reader saves; it then posts one `gridCommit` document with each changed row's new and original
values and the revision it read ([data-protocol.md](data-protocol.md#editing-and-commit)). Map a writer to save them:

```csharp
// What this caller may read: the grid's query, and also the records a commit may change.
IQueryable<Machine> Readable(HttpContext http) => http.RequestServices.GetRequiredService<FleetDb>().Machines
    .Where(machine => machine.Team!.Members.Any(member => member.Login == http.User.Identity!.Name));

app.MapCanopyRemote("/api/machines", Readable, map, options => {
    options.Query.Revision = store.GetRevisionAsync;
    options.AuthorizationPolicy = "Inventory.Read";
    options.WriteAuthorizationPolicy = "Inventory.Write";           // required with a writer, on top of the read policy
    options.Writer = http => {
        var db = http.RequestServices.GetRequiredService<FleetDb>();
        return new CanopyQueryableWriter<Machine>(map, new EfCoreWriteStore<Machine>(db), new CanopyQueryableWriterOptions<Machine> {
            Scope = () => Readable(http),                           // a commit changes only records the caller can read
            Revision = store.GetRevisionAsync,
            Saving = async (context, token) => { await store.BumpRevisionAsync(db, token); return null; } // inside the row's transaction
        });
    };
});
```

**What the endpoint does before a writer sees a batch.** It rejects the whole batch when a row changes a column the view
does not declare editable or the schema does not allow (`columnNotEditable`, `unknownColumn`), when it is malformed or
larger than `MaxCommitRows`. It checks every value against its column's kind (numbers within ±2^53−1, ISO 8601 moments
with a time zone, text or booleans) and the view's rules (`Required`, `Minimum`/`Maximum`, `Earliest`/`Latest`,
`MinLength`/`MaxLength`, `Pattern` anchored as in the browser), the editor's `Step` and its select choices; a row that
fails answers `error` with messages by column (`CanopyCommitMessages`, or the column's `Validation.Message`) and does not
reach the writer. The writer gets typed values (text, booleans, `double`, UTC `DateTime`) and the revision the endpoint
read. Its answer is checked too, but because the writer may already have committed its rows, a faulty answer never fails
the request: rows the writer was not asked about or answered twice, cells that break the page rules or belong to columns
outside the schema, messages for other columns and an invalid revision are left out and reported to
`CanopyRemoteOptions.WriterProblem` (the ASP.NET Core endpoints log them), and messages longer than 4,096 characters
are shortened.

**`ICanopyDataWriter`** is the seam: `ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision,
CancellationToken token)` answers per row with `CanopyCommitRowResult.Saved(id, cells)`, `Failed(id, error, errors)` or
`Conflict(id, error)`, and the revision after the commit (null lets the endpoint read it from the provider). A row the
result leaves out was not saved.

Custom writers declare their transaction boundary with `CanopyCommitTransaction Transaction { get; }`. Return `PerRow`
for independent row saves or `PerBatch` for an atomic batch. If any input row fails endpoint validation, a per-batch
writer is not called and every row answers as not saved; the invalid rows retain their specific validation messages.

**`CanopyQueryableWriter<T>`** is the reference writer over the column map:

- It writes only editable columns mapped to a member of the record itself (`x => x.Cores`); creating it fails when an
  editable column maps a navigation chain such as `x => x.Team!.Name`, the record key, or a member marked
  `[ConcurrencyCheck]` or `[Timestamp]` (tokens configured fluently are not visible to it: keep those columns read-only).
- **Scope.** It changes any record `ICanopyWriteStore<T>.Records` returns. Set `Options.Scope` to the endpoint's query
  callback, as above, so that a row whose record the caller cannot read answers as missing and is not written; or
  restrict `Records` itself.
- Per row it loads the record by the map's key and compares each changed column's original value with the stored one at
  protocol precision: a difference is a `conflict` and nothing is written. A record that no longer exists is a conflict
  too. With a revision source (`Options.Revision`, read inside the row's transaction), the comparison is skipped while the
  revision still equals the batch's; `AlwaysCompareOriginals` compares regardless. Without one, every row is compared.
- **Concurrency.** The comparison is only as strong as the store's transaction: it must serialize the load, the comparison
  and the save (serializable or snapshot isolation, or row locks), or another writer can change the record in between.
  Give the record a concurrency token (EF Core `IsRowVersion()` or `IsConcurrencyToken()`); the store then refuses a save
  over a newer version and the row answers a conflict.
- It converts values to the member types: whole numbers in range for integer members, enumeration members by their raw
  text (`[EnumMember]` value or name), null only for nullable members; a value a member cannot hold answers a cell error.
- It runs `Saving` (stamp an audit column, change the revision, or refuse the row with a message) and saves. A store
  exception stops its row only: the row answers "The row could not be saved." (the exception goes to `Failed` for
  logging), or a conflict when the store reports a concurrency failure (EF Core's `DbUpdateConcurrencyException` for
  concurrency tokens).
- `Transaction = CanopyCommitTransaction.PerRow` (default) saves each row in its own transaction; `PerBatch` writes all
  rows in one transaction and nothing when any row fails: the first failing row stops the batch, and the others answer
  `BatchNotSaved`; a failed commit of the batch answers every row as not saved. After any row that is not saved the
  writer rolls back (a failing rollback does not hide the row's answer) and discards the store's unsaved changes.
- A saved row answers canonical cells of its changed columns, formatted by the map like page rows.

The writer reaches the store through `ICanopyWriteStore<T>`, so `CanopyX.Data` stays free of EF Core. The EF Core adapter:

```csharp
public sealed class EfCoreWriteStore<T>(DbContext db) : ICanopyWriteStore<T> where T : class {
    public IQueryable<T> Records => db.Set<T>().AsTracking();   // tracked, also when the context reads without tracking
    public async ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken token) => new Transaction(await db.Database.BeginTransactionAsync(token));
    public async ValueTask SaveChangesAsync(CancellationToken token) => await db.SaveChangesAsync(token);
    public void DiscardChanges() => db.ChangeTracker.Clear();
    sealed class Transaction(IDbContextTransaction transaction) : ICanopyWriteTransaction {
        public ValueTask CommitAsync(CancellationToken token) => new(transaction.CommitAsync(token));
        public ValueTask RollbackAsync(CancellationToken token) => new(transaction.RollbackAsync(token));
        public ValueTask DisposeAsync() => transaction.DisposeAsync();
    }
}
```

**Revisions.** A commit changes the data, so give the dataset a revision the writer changes (`Saving` above, a row
version, a change counter) and answer it. The grid keeps reading pages at the revision it accepted. `CanopyRemoteScript`
reloads after a commit reports a different revision, or after rows were saved without a revision because the server could
not read it after the write. Reload keeps the reader's latest query and page length. If it fails, the grid displays the
error and offers Retry. Readers of an older revision elsewhere get `staleRevision` and reload too.

## Record details

A grid with a [record panel](record-panel.md) whose details load on demand (`CanopyRecordSource.Host()`) keeps its rows
small: the drawer asks for one record's details when it opens, for the next rows of a collection when the reader presses
Load more, and for the record's row when a deep link or a related record names a record the grid has not loaded. Each is a
`gridRecordQuery` ([data-protocol.md](data-protocol.md#record-details)); the record route answers it with a `gridRecord`.

```csharp
// 1. The record panel the drawer shows: record-only fields, with their details loaded from the server.
view.RowAction = CanopyGridRowAction.Details;
var panel = view.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Host(), DeepLink = true };
panel.Fields.Add(new CanopyColumn("serial", "Serial number"));
panel.Fields.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime });
panel.Fields.Add(new CanopyColumn("replaces", "Replaces"));
panel.Fields.Add(new CanopyColumn("software", "Installed software"));
panel.Fields.Add(new CanopyColumn("maintenance", "Maintenance"));
panel.Fields.Add(new CanopyColumn("changes", "Configuration changes"));
panel.Fields.Add(new CanopyColumn("rack", "Machines in the same rack"));

// 2. The record allow-list, next to the column map: only these fields are read, and only through these expressions.
var records = new CanopyRecordMap<Machine>(map)
    .Field("serial", m => m.SerialNumber)
    .Field("purchased", m => m.PurchasedOn)
    .Link("replaces", m => m.ReplacesId, m => m.Replaces!.Name)   // a link into this grid: empty when the caller cannot read it
    .Collection("software", m => m.Software, list => list.Key(s => s.Id).OrderBy(s => s.Name)
        .Column(new CanopyColumn("name", "Program"), s => s.Name)
        .Column(new CanopyColumn("installed", "Installed") { Kind = CanopyColumnKind.DateTime }, s => s.InstalledOn)
        .PageSize(10))
    .Timeline("maintenance", m => m.Maintenance, events => events.Key(e => e.Id).Time(e => e.At)
        .Summary(e => e.Summary).Actor(e => e.Technician).Kind(e => e.Kind, kind => kind == "Failure" ? CanopyTone.Danger : CanopyTone.Neutral))
    .Changes("changes", m => m.Changes, changes => changes.Key(c => c.Id).Name(c => c.Setting)
        .Before(c => c.Before).After(c => c.After).OrderBy(c => c.At, descending: true))
    // Machines of this grid: by default only those the caller's query reads are shown (and counted).
    .Collection("rack", m => m.Rack!.Machines, list => list.Key(peer => peer.Id).OrderBy(peer => peer.Name)
        .Column(new CanopyColumn("name", "Machine"), peer => peer.Name).Target("machines"));

// 3. The endpoints: the record map carries the column map, and the record route looks records up through the same query
//    callback as the grid.
app.MapCanopyRemote("/api/machines", Readable, records, options => {
    options.AuthorizationPolicy = "Inventory.Read";
    options.CanReadRecordField = (http, field) => field != "serial" || http.User.IsInRole("Inventory.Assets");
    options.RecordEndpoint = route => route.RequireRateLimiting("records");   // limit the record route (see Safety)
});

// 4. The page script: a record schema wires the grid source's record hook to the route.
html = html.Replace("</head>", CanopyRemoteScript.Element(records.Schema, "/api/machines") + "</head>");
```

**Mapping.** Every mapped field must be a record panel field of the view (`CanopyRecordPanel.Fields`), every drawer value a
declared view column; nothing else is reachable.

| Method | Answer | Notes |
| --- | --- | --- |
| `Field(id, value, format?)` | a scalar field | Text, booleans, enumerations, numbers and dates, whose kind fits the field's as column values do; `format` builds the cell (display text, tone, badges). |
| `Link(id, key, text?, view?, withinGrid?)` | `CanopyCell.Link` | A related record: no key is an empty field, no text shows the identity; `view` names another grid on the page. A link into this grid (no `view`, or this grid's) shows only when the related record belongs to the caller's query, otherwise it is an empty field, and its key must have the grid key's type. `withinGrid: false` opts out and reveals related records outside the caller's scope; links into other grids show what they reach. |
| `Cell(column, value, format?)` | `cells` | A fuller value of a grid column for the drawer, for example a whole list whose grid cell shows a count. |
| `Collection(id, items, list => …)` | `CanopyRecordList` | `Key` (unique among the rows, the row identity and the last order key), `Column(column, value, format?)`, `OrderBy` (missing values last), `PageSize` (default 50), `PageLength`, `Target(view, column?)` so rows open their records and "Open all in grid" filters that grid. Rows of the grid's own record type are kept to those the caller's query reads (and so is the total); `Unscoped()` opts out and reveals records outside the caller's scope. Rows of other types show what the navigation reaches. Rows without a key are left out. |
| `Timeline(id, items, events => …)` | `CanopyCell.Timeline` | `Key`, `Time`, `Summary` (blank shows an em dash), `Actor`, `Kind` with a tone, newest first unless `OldestFirst`, missing times last, `Limit` (default 50). |
| `Changes(id, items, changes => …)` | `CanopyCell.Diff` | `Key`, `Name`, `Before`, `After`, `OrderBy`, `Limit` (default 50, at most 512). |

The record's `row` is the row the page route writes for it: the column map's columns, cell formats and `DecorateRows`.
Records are found by the column map's key, which must be text, a GUID or an integer up to 64 bits.

**How a request is answered.**

1. **Parsing** (`CanopyRequestParser.ParseRecord`, or `FromRecordQuery` for a `CanopyGridRecordQuery` built in C#): the
   `view` must be the grid's; `id` is 1 to 4,096 characters of well-formed text that is never interpreted as an expression;
   `revision` and `row` are optional. A collection page names its `field`, an `offset` (default 0) and a `limit` (1 to 10,000,
   at most `MaxRecordPageSize`; default the field's page size) and an `offset` of at most `MaxRecordOffset`. `offset` or
   `limit` without `field`, and `row` with `field`, are `invalidDocument`; a field the endpoint does not serve is
   `unknownField`, and one that is not a collection `notCollection`. The body may hold at most `MaxRecordRequestBytes`.
2. **Read check.** `CanReadRecordField(http, id)` (`canRead` outside ASP.NET Core) runs for every record field and drawer
   value; one the caller may not read is left out of the answer, which the drawer shows as an empty field, and is not queried.
   A collection page of such a field answers `unknownField`, exactly as a field the endpoint does not serve. The check hides
   whole fields only, never single collection rows, events or changes: restrict those in the field's mapping.
3. **Revision.** A stale `revision` answers 409 `staleRevision` before the record is looked up, so it reveals nothing about
   the record; the answer echoes the revision it was read at.
4. **Lookup.** `CanopyQueryableRecordProvider<T>` runs `Where(key == id)` on the query callback (the caller's scope) with
   the identity converted to the key type as a parameter, and reads every readable value field, drawer value and, when asked,
   the row in one projection. An identity converts only when it is the key's own invariant text: `007`, `+7`, ` 7`, an
   upper-case or braced GUID, or a number the key type cannot hold find nothing, without a query. A store collation that
   matches other spellings of a text key finds nothing either: the found key's text must equal the identity. A record that is
   missing, outside the caller's scope or whose identity is not a key answers the same 404 `recordNotFound`, with the same
   message, so callers cannot tell them apart.
5. **Children.** Collections, timelines and change lists read the rows of the record found (`SelectMany` over its
   navigation), never a table of their own: a collection costs a count and a window, a timeline or change list one window, in
   the same order every time (the order keys, then the child key). A whole record carries each collection's first
   `PageSize` rows (at most `MaxRecordPageSize`) with its total, and each timeline or change list its first `Limit` items (at
   most `MaxRecordItems`). A collection page checks that the record exists, then answers its rows from `offset` and the total;
   past the end it answers an empty page. Rows written between the count and the window answer 409 `staleRevision`, as pages
   do. The `pageSize` a collection carries (what Load more asks for) is its page size within `MaxRecordPageSize`. Text orders
   by the column's collation in a database and ordinally in memory; the child key decides every tie. Child rows without a key
   (null, or empty text) are left out of the rows and the total.
6. **Text.** Text in record fields, drawer values, collection cells, timelines and changes longer than `MaxRecordTextLength`
   (8,192 by default) is shortened so that it ends with an ellipsis (…) and, ellipsis included, fits the limit, never inside
   a surrogate pair; a database reads at most one character more, enough to tell longer text apart. The handler applies the
   same bound to every provider's answer, custom `ICanopyRecordProvider` implementations included (values, display text,
   tooltips, badges, list items, object fields, collection rows, events and changes). Identities, link keys and the row are
   never shortened.
7. **Answer.** The handler checks the provider's answer and fails the request (500) instead of sending a field or drawer
   value that was not asked for, more rows or items than allowed, a collection whose total is below its rows or whose page
   size the endpoint would refuse, or a row of another record; then it writes the document with
   `CanopyGridRecord.ToJson(view)`, which checks it against the view, and refuses one larger than `MaxRecordBytes` with
   `limitExceeded` instead of cutting it short.

**In the browser.** `CanopyRemoteScript.Element(records.Schema, endpoint)` (a record schema instead of the column schema)
wires the source's `record` hook to `{endpoint}/record`; rejected requests carry the HTTP `status` and the error `code`. A
404 `recordNotFound` answers `null`: the drawer shows the row without details, and a deep link or related record the grid
has not loaded stays unopened (the runtime rejects `openRecord` with "not available"). A 409 `staleRevision` (the data
changed since the grid read its rows, for example after a save here or elsewhere) reloads the grid at the current revision
and opens the same record again there: details always belong to the rows they open from, so the drawer never mixes two
revisions. Any other error
rejects, so the drawer shows the message with Retry; a failed Load more says so and keeps its button.

**Safety.**

- **Scope.** The lookup composes on the query callback, so a record a caller cannot see in the grid cannot be opened, and
  child rows come only through it. A navigation that reaches *other* records of the grid (related records, rack peers, a
  replaced record's name) is kept within the grid by default: a collection of the grid's own record type keeps its rows
  (and its total) to records the caller's query reads, and a link into this grid answers an empty field for a related
  record outside it. Both test `source.Any(visible => visible.Key == key)` on the query callback (an `EXISTS` key lookup per
  row or link in a database). Opting out is explicit and named: `Unscoped()` on a collection and `withinGrid: false` on a
  link answer records outside the caller's scope, so use them only when every caller may see every record they reach.
  Navigations to records of other kinds (links into other grids, collections of other types) show what they reach: when
  those records have a scope of their own, restrict them in their expression, with `CanReadRecordField`, or leave the field
  out of the map.
- **Keys.** The column map's key must be unique under the store's own comparison: a text key in a case-insensitive column
  needs values that differ beyond case, or two records answer one identity and the request fails as a server error.
- **Fields.** Only mapped fields are read; `CanReadRecordField` hides whole fields and drawer values per caller (record
  field identities never equal column identities). Grid columns, and so the record's `row`, follow the column map exactly
  as page rows do: leave out of the map what a caller must not read.
- **Bounds.** Record request bodies are bounded by `MaxRecordRequestBytes` (16 KiB); answers by `MaxRecordPageSize`,
  `MaxRecordItems`, `MaxRecordTextLength` and `MaxRecordBytes`. An answer is built in memory before `MaxRecordBytes` is
  checked, so the largest answer the endpoint builds is the mapped collections' rows times their columns of bounded text
  (an answer whose text alone exceeds `MaxRecordBytes` is refused before it is serialized). Keep `MaxRecordTextLength`
  and `MaxRecordPageSize` near what the drawer shows. A record request is a key lookup plus one count and one window per
  collection, so its cost does not grow with the table; offsets into one record's collection cost their distance, up to
  `MaxRecordOffset`.
- **Rate limiting.** Rate-limit the record route in production: it is cheap per request but answers on demand, so an
  unthrottled caller can make the server build many bounded answers. Register a policy with `AddRateLimiter` and
  `UseRateLimiter`, then apply it with `options.RecordEndpoint = route => route.RequireRateLimiting("records")`.
- **Errors** never echo the identity, the field or other request text.

**Other back ends.** `ICanopyRecordProvider` is the seam for stores without a LINQ provider: describe the served fields with
a `CanopyRecordSchema` and answer each `CanopyRecordRequest` with a `CanopyGridRecord` (null when the caller has no such
record), following the contract above; `CanopyInMemoryRecordProvider<T>` is the reference implementation the tests compare
EF Core and LINQ to objects with. The handler checks the answer's shape and shortens its text to `MaxTextLength` whatever
the provider, but it cannot scope it: a custom provider keeps related records within the caller's scope itself. A
hand-built `CanopyRecordSchema` refuses a record field whose identity is a column's, as the record map does.

```csharp
var schema = new CanopyRecordSchema(map.Schema, new[] { CanopyRecordField.Value("serial"), CanopyRecordField.Collection("software", 10) });
app.MapCanopyRemote("/api/machines", map.Schema, http => new SqlMachineProvider(http), options => {
    options.Records = http => new SqlMachineRecords(schema, http);   // WHERE Id = @id AND <the caller's scope>, children by machine
});
```

## Performance

Each page request runs two counts (dataset and matches; one when there are no criteria) and one windowed query that
selects only the key and mapped columns. Measured with the sample on SQLite (EF Core 10, Release, in process, median of
five runs after warm-up, on a shared 16-core workstation, so treat the numbers as orders of magnitude):

| Request | 100,000 rows | 1,000,000 rows |
| --- | ---: | ---: |
| First page, default order (key) | 3 ms | 25–55 ms |
| First page, sorted by an indexed column | 3–14 ms | 26–30 ms |
| Middle / last page, indexed sort (offset 500,000) | 6–10 ms | 80–160 ms |
| First page, sorted by an unindexed column | 15 ms | 125–320 ms |
| Quick search over four text columns | 65–110 ms | 0.8–1.8 s |
| Filter group (`cores ≥ 64 or site is null`) | 15–20 ms | 120–290 ms |
| Value list (site / model, filtered) | 50–140 ms | 0.7–1.4 s |
| Summary, three aggregates | 40–70 ms | 310–430 ms |
| Grouped summary by site (one grouped scan) | 0.3 s | 2–2.8 s |
| Grouped page in the middle | 20–25 ms | 120–230 ms |
| Two-level summary (site by machine count, then operating system; five aggregates with a distinct count) | 0.4 s | 4 s |
| Three-level summary with a distinct count | 0.6 s | 7 s |
| Two-level page in the middle (index on site, operating system, name) | 15–20 ms | 115–120 ms |
| CSV export of every row | 0.75 s, 7 MiB | 7 s, 72 MiB, flat 130 MiB working set |
| Record details with the row (key lookup, a count and a window per collection, one window per timeline and change list, rack peers and a link checked against the caller's query) | 1.5 ms | — |
| Collection page of one record (offset 10) | 0.6 ms | — |

Notes:

- **Index the orders readers use.** The default order is the key. With an index on a sorted column (and non-nullable
  annotations or `NotNull()`, so no missing-values key is added), deep pages stay cheap; an unindexed sort scans the matches.
- **Offsets cost their distance.** `OFFSET n` walks n index entries; at a million rows the last page of an indexed order
  takes about 150 ms. The browser asks only for the pages the reader reaches.
- **Counts scan.** `COUNT(*)` over the filtered set runs per request. For very large tables, keep filters selective or
  give the query callback a pre-filtered set.
- **Search and lowercased comparisons scan.** `LOWER(column)` prevents plain index use; with a case-insensitive collation
  choose `TextComparison.Collation`. Consider full-text search behind `SearchBy` for large text columns.
- **Value lists and summaries group the complete query**; they run when a reader opens a value list or the query changes.
  Text value lists stream every raw text group so nonadjacent Unicode spellings can merge before search, counts and the
  prefix are finalized. They retain one canonical key per distinct matching value and at most the requested prefix's
  values and counts; they do not buffer records or the complete grouped result. For high-cardinality columns, consider
  host-normalized text with suitable indexes, or a host provider that groups and counts indexed canonical keys in the store.
  Nonempty numeric value-list search also transfers every distinct numeric group to search its canonical text; retained
  values/counts stay proportional to the requested limit. Empty numeric search retains the database-limited prefix path.
- **Large parameter lists.** Selected exports send up to 10,000 identities and a membership filter up to 1,000 values as
  one parameterized collection. On SQL Server, whose limit is 2,100 parameters per command, configure EF Core to send
  parameterized collections as one JSON parameter, or lower `MaxSelectedIds` and `MaxInValues`.
- **Grouped views** read the group counts with each page request (one grouped scan per level over each prefix of the
  grouping columns, with the aggregate a level orders by; summaries and pages build the same group tree, so they agree
  also under case-insensitive collations) and then fetch the window: up to eight innermost groups slice by slice through
  `WHERE level1 = value AND level2 = value …` (an index on the grouping columns and the sort column serves it), more in
  queries ordered by a rank over at most 64 groups each; a page may span at most 1,000 groups. Exports read the same way,
  so their rows follow the group ranges. Summaries run one grouped scan per level, plus one for complete-query totals
  when a distinct count is declared.
  Grouping values must be distinct at protocol precision (instants that differ below a millisecond cannot be two groups).
- **Commits** load each changed record by key and save it in its own transaction (or one for the batch); a batch is
  bounded by `MaxCommitRows`.
- Run the measurements yourself: `FleetInventory --bench --rows 1000000 --database <path>` (`--sql` prints the SQL).

## Sample application

`samples/FleetInventory` serves a generic fleet inventory (machines with site, operating system, model, cores, memory,
online state, last seen and team, and record details: serial number, purchase date, notes, the machine each replaces,
installed software, maintenance visits, configuration changes and racks) from SQLite through EF Core, seeded with 100,000
deterministic machines on first start (about 130 MB with their details; a database from an earlier sample version is rebuilt):

```powershell
dotnet run --project samples/FleetInventory -- --urls http://127.0.0.1:5199 --rows 100000
```

`/` shows every machine with value lists, the filter builder, selection, aggregates and the server CSV export, and opens
each machine in a record panel (Overview, Software, History and Related tabs, deep links such as `/#record=machines:42`)
whose details load from the record route;
`/by-site` shows the same data grouped by site; `/by-site-os` groups by site (busiest sites first, ordered by the machine
count) and operating system with a distinct count of models, and readers can regroup; `/edit` edits names, sites,
operating systems, models, cores, memory and the online state and saves them to SQLite through `CanopyQueryableWriter`
and an EF Core store. Every saved row increments a revision counter in the database inside its transaction, and the
page's *Simulate another user's change* button changes the selected machine behind the reader's back, so saving shows a
conflict. Add `?theme=dark` for the dark theme. The browser tests `tests/browser/specs/remote-dotnet.spec.mjs`,
`remote-dotnet-commit-groups.spec.mjs` and `remote-dotnet-records.spec.mjs` start the built sample against a temporary
database and check paging, sorting, searching, filtering, value lists, exports, grouping (one and two levels), commits,
conflicts, record details (Load more, related records, deep links, Retry) and error answers against the real endpoints.
