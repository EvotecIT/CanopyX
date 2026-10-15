# Server-side data for .NET (`CanopyX.Data`, `CanopyX.AspNetCore`)

A hosted CanopyX data grid never holds the whole dataset. It sends typed queries as the reader scrolls, sorts, searches,
filters, opens a value list or exports, and expects revisioned documents back (see [Flat Grid Documents](data-protocol.md#flat-grid-documents)).
These two packages answer those queries from .NET:

- **`CanopyX.Data`** (`net472`, `netstandard2.0`, `net8.0`, `net10.0`) parses and validates every request against a column
  allow-list and safety limits, executes it, and writes the `gridPage`, `gridFacetPage` and `gridSummary` documents the
  browser runtime accepts. It runs requests over any `IQueryable<T>` (EF Core, LINQ to objects, any LINQ provider), over
  a provider you write for another back end, and streams exports.
- **`CanopyX.AspNetCore`** (`net8.0`, `net10.0`) maps it to minimal-API endpoints and writes the small browser script that
  connects the grid to them.

```text
browser grid ── gridQuery / gridFacetQuery / export request ──▶ endpoint ──▶ CanopyRemoteHandler
                                                                              │ parse + allow-list + limits + revision
                                                                              ▼
                                                                   ICanopyDataProvider
                                                     (CanopyQueryableProvider<T> │ your SQL provider │ CanopyInMemoryProvider<T>)
browser grid ◀── gridPage / gridFacetPage / gridSummary / file ──────────────────┘
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
    .Column("lastSeen", machine => machine.LastSeen)
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
  summary: (query, { signal }) => post("/summary", query, signal).then(r => r.json())
} });
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

The GET form is off by default because query strings reach access logs, proxies and referrers. POST bodies must be `application/json` (or `+json`); other content types get 415, which also means cross-origin pages
cannot post without passing a CORS preflight. Responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
Every handler observes `HttpContext.RequestAborted`; the token flows into the provider and the database command.

Outside ASP.NET Core, use `CanopyRemoteHandler` directly: `QueryAsync(json)`, `FacetAsync(json)`, `SummaryAsync(json)`
and `PrepareExportAsync(json, format)` return documents (or an export job) and throw `CanopyRequestException` for client errors.
`CanopyRequestParser` exposes the parsing step on its own, and `CanopyRequestParser.FromQuery(CanopyGridQuery, schema)`
validates a typed C# query with the same rules.

## Column mapping

`CanopyColumnMap<T>` binds each protocol column id to an expression. Every mapped id must be declared by the view, with a
kind that fits the expression type:

| Column kind | Expression types | Wire value |
| --- | --- | --- |
| `Text` | `string`, `bool`, enumerations | text; booleans stay JSON booleans; enumerations are their member names |
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
| Grouping and aggregates | `source.summary` → `gridSummary` | Full: one grouping column, `count`/`sum`/`average`/`minimum`/`maximum`, groups ordered and ranged as the runtime checks; pages read group by group. |
| Revisions | `revision` | Full: a stale revision answers 409 `staleRevision`. |
| Exports | export request → file | Full: `filtered`, `selected` (ids or all-matching with exclusions) and `all` scopes, chosen columns, raw or display values, streamed. |
| Cursor navigation | `gridCursorQuery` | Not served; rejected with `unsupported`. Offset navigation covers the protocol's hosted grids. |

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
- **Enumerations and booleans** evaluate every member against the exact rule and send the matching members as an `IN`
  test, so `contains "ux"` on an enumeration becomes `os IN (Linux)`. Enumerations sort by member name.
- **Integers** accept fractional operands as the protocol's binary64 comparison would: `gt 4.5` becomes `> 4`, `eq 4.5`
  matches nothing, and out-of-range operands become always/never true.
- **Dates** become half-open bounds: `eq t` is `t ≤ v < t + 1 ms`, `gt t` is `v ≥ t + 1 ms`. Store UTC; `DateTime` values
  without a kind are read as UTC.
- **Large numbers.** Number columns follow the protocol's binary64 range: comparisons are bounded to ±2^53−1, so store
  larger identifiers as text.
- **Search over numbers and dates.** In memory, quick search reads every searchable column's raw text. Databases search
  number columns through their text form only when the view lists them in `SearchColumns`, and never search date columns
  (there is no portable text form). Value-list search on a date column answers `unsupported`.

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
| `MaxGroups` | 10,000 | 10,000 |

- **Typed errors.** Rejections throw `CanopyRequestException` and answer `{ "error": code, "message": text }` with status 400
  (409 for `staleRevision`, 413 for an oversized body, 415 for a non-JSON body). Codes: `invalidJson`, `invalidDocument`,
  `unknownColumn`, `invalidSort`, `columnNotFilterable`, `invalidOperator`, `invalidOperand`, `limitExceeded`,
  `offsetOutOfRange`, `staleRevision`, `unsupported`, `notFacetable`, `invalidExport`, `unknownFormat`. Messages never echo
  request text or server internals. Any other exception is logged and answered with a generic 500 `serverError`.
- **Authorization.** Endpoints require authorization by default (the default policy, or `AuthorizationPolicy`); set
  `AllowAnonymous` only for public data. Row-level restrictions belong in the query callback, which runs per request.
- **The column map is the access boundary.** Rows carry every mapped column and exports accept hidden columns; a view's
  `Hidden` flag is presentation. Leave out of the map whatever a caller must not read.
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

- **Order.** Apply the sort keys with missing values last in both directions, then the record key ascending. For a
  grouped view the first key is the grouping column, and records must follow the group order the endpoint reports
  (the protocol's order: ordinal text, numbers and dates ascending or descending, missing last).
- **Counts.** `QueryAsync` returns the unfiltered `Total`, the `Matched` count before the window, and exactly
  `min(limit, matched − offset)` rows.
- **Value lists.** Buckets are case-insensitive for text (one bucket per folded value), null last, at most `Limit`, with
  `TotalValues` counted after value search.
- **Summaries.** Return every group (any order; the endpoint orders them and assigns ranges) with its count and the
  declared aggregates; `count` counts nonmissing values, the others are null for a group without values.
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
| CSV export of every row | 0.75 s, 7 MiB | 7 s, 72 MiB, flat 130 MiB working set |

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
  A truncated value list is the store's first buckets in its own collation, re-sorted in the protocol's order, so with a
  case-insensitive collation its prefix can differ slightly from an in-memory list.
- **Large parameter lists.** Selected exports send up to 10,000 identities and a membership filter up to 1,000 values as
  one parameterized collection. On SQL Server, whose limit is 2,100 parameters per command, configure EF Core to send
  parameterized collections as one JSON parameter, or lower `MaxSelectedIds` and `MaxInValues`.
- **Grouped views** read the group counts with each page request (one grouped scan) and then fetch the window: up to
  eight groups slice by slice through `WHERE group = value` (an index on group column and sort column serves it), more in
  one query ordered by a rank over the groups the window spans. A window that spans more than 1,000 groups is rejected.
  Grouping values must be distinct at protocol precision (instants that differ below a millisecond cannot be two groups).
- Run the measurements yourself: `FleetInventory --bench --rows 1000000 --database <path>` (`--sql` prints the SQL).

## Sample application

`samples/FleetInventory` serves a generic fleet inventory (machines with site, operating system, model, cores, memory,
online state, last seen and team) from SQLite through EF Core, seeded with 100,000 deterministic rows on first start:

```powershell
dotnet run --project samples/FleetInventory -- --urls http://127.0.0.1:5199 --rows 100000
```

`/` shows every machine with value lists, the filter builder, selection, aggregates and the server CSV export;
`/by-site` shows the same data grouped by site. Add `?theme=dark` for the dark theme. The browser test
`tests/browser/specs/remote-dotnet.spec.mjs` starts the built sample against a temporary database and checks paging,
sorting, searching, filtering, value lists, exports, grouping and error answers against the real endpoints.
