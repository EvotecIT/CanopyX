# Dataset comparison

Compare two complete versions of a keyed dataset as one grid. Rows keep the same case-sensitive identity across both
versions. The comparison marks added, removed, changed and unchanged rows, counts changes by column, and carries the
earlier and later values in changed cells. It computes no product-specific facts.

```csharp
using CanopyX;
using CanopyX.Html;
using CanopyX.Rendering;

var earlier = new CanopyGridRow("item-42");
earlier.Cells["name"] = "Atlas";
earlier.Cells["units"] = 24;
var current = new CanopyGridRow("item-42");
current.Cells["name"] = "Atlas";
current.Cells["units"] = 32;

var comparison = CanopyDatasetComparer.Compare(new[] { earlier }, new[] { current });
var view = comparison.ToView("inventory", "Inventory changes", new[] {
    new CanopyColumn("name", "Item") { RowHeader = true, AlwaysVisible = true },
    new CanopyColumn("units", "Units") { Kind = CanopyColumnKind.Number }
});
view.SaveHtmlPage("inventory-changes.html");
var emailTable = CanopyStaticHtml.RenderComparison(view);
```

The browser shows `24 → 32` in the units cell. Its summary reports one changed row, and the Units heading reports one
changed cell. The **Only changes** switch excludes unchanged rows through an ordinary filter on the generated status
column. Searches, saved views, result counts and exports therefore use the same query scope. `getOnlyChanges()` reads
the accepted scope; `await setOnlyChanges(true)` changes it. The summary always describes the complete comparison.
Columns that move into the record drawer on phones retain their values and counts there.

The comparer enumerates each input once and joins by stable key with linear lookup cost. Duplicate keys within either
version are errors. Earlier rows retain earlier source order; added rows follow in later source order. When columns
are omitted, their order follows first occurrence in the earlier and then later cells. Supplying column IDs explicitly
compares only those facts. A generated status ID avoids collisions with source columns.

Comparison uses raw values and structured content, including types and the distinction between an omitted cell and
an explicitly empty cell. Display text, tones and links do not create data changes. Numeric representations follow the
library's raw-value contract. Added and removed rows contribute to row totals; per-column counts describe changes in
matched rows only. Supply complete snapshots, rather than unrelated pages from each dataset.

`ToView` copies the supplied column definitions and makes the resulting grid read-only. Later raw values retain their
typed search, sort and filter meanings. Removed rows have null later values and keep their earlier values in the
before/after payload. Column kinds must describe the later snapshot; the earlier payload can retain a different type.
Source rows are retained by the comparison, so keep them unchanged while consuming it.

The existing `change` presenter has an additive `beforeAfter: true` mode (`CanopyGridPresenter.BeforeAfter()`). It reads
`CanopyCell.Changes`; numeric-delta presenters keep their existing `deltaColumn` behavior. Comparison metadata lives
in the additive `compare` field of `canopyx/2`; see [the protocol](data-protocol.md) and its JSON Schema.

## Hosted queries

`CanopyX.Data` executes two host-owned `IQueryable` queries and maps both into the same comparison engine:

```csharp
using CanopyX.Data;

var comparison = await CanopyQueryableComparison.CompareAsync(
    earlierQuery, currentQuery, MapEarlierRow, MapCurrentRow,
    rowLimit: 100_000, columns: new[] { "name", "units" }, cancellationToken: cancellationToken);
var view = comparison.ToView("inventory", "Inventory changes", columns);
```

The mapping functions return `CanopyGridRow` with stable keys. Queries execute sequentially, including when they share
a provider context. Each reads at most `rowLimit + 1` records; exceeding the limit fails rather than comparing a
truncated dataset. The host supplies authorization, immutable version selection or a consistent transaction, provider
timeouts and an asynchronous executor when available. This API neither chooses a database nor creates a snapshot or
transaction. Mapping runs in memory; project required fields in the queries first. Memory holds both complete rowsets
and their comparison payloads. Cancellation is cooperative; a synchronous provider cannot interrupt an in-flight
enumerator operation. No database writes occur.

## Email, print and loading

`RenderComparison` writes the complete summary, per-column change counts and the existing grid fallback, with encoded
text and inline styles. It requires a complete inline comparison view and performs no queries. Its row limit and
overflow note follow `CanopyStaticHtmlOptions`. Initial changes-only mode also applies to this fallback. The output
uses no script, stylesheet, event handler or external resource and can be passed to an email or document host.

The browser controls ship in the lazy `compare` part, which requires the existing `presenters` part. Ordinary grids do
not load it. `CanopyX.Html` embeds the required payloads in single-file fragments and writes the files for external
hosting. The switch disappears when printing. Summary and status labels use the shipped PL/DE/ES/FR/IT packs.

The gallery's `data-views.html`, `data-views-dark.html` and `dataset-compare-static.html` use invented inventory versions.
