# CanopyX.Data

Server-side execution of the CanopyX remote grid protocol. A hosted CanopyX data grid sends typed queries for pages,
value lists, summaries and exports, and commits edited rows; this package validates them against a column allow-list
and safety limits, runs them against your data and writes the documents the browser runtime accepts.

```csharp
var map = new CanopyColumnMap<Host>(view)
    .Key(x => x.Id)
    .Column("name", x => x.Name)
    .Column("owner", x => x.Owner.Name)
    .Column("lastSeen", x => x.LastSeen);

var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => db.Hosts, map));
string page = await handler.QueryAsync(requestBody, cancellationToken);
```

- `CanopyQueryableProvider<T>` translates requests to `IQueryable<T>` (EF Core, LINQ to objects, any LINQ provider),
  including grouping with up to four levels, nested summaries and distinct counts.
- `ICanopyDataProvider` lets raw SQL back ends implement the same endpoint; `CanopyInMemoryProvider<T>` is the reference implementation.
- `ICanopyDataWriter` saves commits; `CanopyQueryableWriter<T>` writes editable columns through the column map to a store
  you adapt (`ICanopyWriteStore<T>`, a few lines for EF Core), with server-side validation and conflict detection.
- `CanopyRecordMap<T>` serves the record panel's details on demand (fields, paged collections, timelines, changes and
  links) by key through the grid's own query; `ICanopyRecordProvider` lets other back ends answer `gridRecordQuery` too.
- `CanopyRemoteLimits` bounds page size, export rows, filter depth and terms, membership size, value lists, commit batches,
  record answers and request size.
- `CanopyCsvExportFormat` streams CSV; register further `ICanopyExportFormat` writers for other formats.

`CanopyX.AspNetCore` maps the handler to minimal-API endpoints. See `docs/remote-dotnet.md` in the repository.
