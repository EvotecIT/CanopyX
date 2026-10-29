# Pivot analysis

A reporting grid can cross-tabulate its complete accepted query by row and column fields. Both axes retain their
prefixes, so readers can collapse groups, compare totals and open the records behind an intersection. Search, ordinary
filters, nested filter groups and atomic tuple predicates apply before the pivot. The current page and presentation
collapse do not limit the records being aggregated.

Pivots use the reporting entry point and the optional `pivot` part. Enable an initial `reporting.pivot`, or set
`reporting.pivotable: true` to let readers configure one. Both require offset navigation and declared reporting
aggregates. Every axis field must be sortable and filterable. Pivot values name aggregate IDs, rather than column IDs.

## Declare a pivot

```csharp
var view = new CanopyDataGridView("orders", "Orders") {
    Reporting = new CanopyGridReporting { Pivotable = true }
};
view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true });
view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
view.Reporting.Aggregates.Add(new CanopyGridAggregate(
    "total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));

var pivot = new CanopyGridPivot { MaxColumns = 200, SortByTotal = "total" };
pivot.Rows.Add(new CanopyGridGroupLevel("region"));
pivot.Columns.Add(new CanopyGridGroupLevel("status"));
pivot.Values.Add("total");
view.Reporting.Pivot = pivot;
```

For a computed C# result, pass the accepted matching records to
`CanopyPivot.Compute(view, pivot, matchingRows)`. This function aggregates the supplied records; it does not fetch or
apply a host query. `result.ToJson()` writes data-only `gridPivot` JSON.
`CanopyStaticHtml.RenderGridPivot(view, result)` renders a script-free, inline-styled table for print, email and
document hosts. Hosts retain responsibility for selecting and authorizing the input records.

The browser API uses the same definition:

```typescript
import type { GridPivotDefinition } from "@evotecit/canopyx/grid";

const definition: GridPivotDefinition = {
  rows: [{ column: "region", direction: "asc" }],
  columns: [{ column: "status", direction: "asc" }],
  values: ["total"],
  maxColumns: 200,
  topNColumns: 12,
  sortByTotal: { aggregate: "total", direction: "desc" }
};
await grid.setPivot?.(definition);
const result = grid.getPivotResult?.();
```

An axis level is `{ column, direction, bucket? }`. Calendar and numeric buckets use the same definitions and keys as
[grouping](grouping.md). Raw datetime paths contain ISO instants with an explicit time zone; bucketed paths contain
numeric keys. Null remains an explicit missing category. Axis ordering follows the declared field order; use
`sortByTotal` to order sibling rows by one selected aggregate's total. Null totals sort last, with axis values breaking
ties. Display transformations use the aggregate's `showAs` mode and keep raw aggregates unchanged.

| Bound | Limit |
| --- | --- |
| Row levels | 0–4 |
| Column levels | 0–2 |
| Selected aggregate IDs | 1–32, unique and declared |
| `maxColumns` | 1–200 leaf columns, including Other; default 200 |
| `topNColumns` | Optional 1–200 highest-total complete paths |
| Inline input | At most 100,000 accepted records; larger datasets need a hosted pivot |
| Result metadata | At most 10,001 row prefixes, 402 column prefixes and 100,000 populated intersections |
| Display-cell budget | Row-prefix count × column-prefix count × value count must not exceed 100,000, including total nodes and all prefixes |
| Opaque prefix keys | At most 65,536 UTF-16 code units |
| Result JSON | At most 4,194,304 UTF-16 code units |

Empty axes produce their total node. An empty accepted query still has a grand-total intersection. Counts are zero;
numeric operations without values yield null. Limits reject oversized metadata rather than return a partial total. The separate display-cell budget also rejects a sparse result whose populated intersections fit the metadata cap but whose full table or export would be too large.

## Top columns, Other and prefix subtotals

When the number of complete column paths exceeds `topNColumns` or the column cap, paths rank by the first selected
aggregate's total, descending, with axis ordering breaking ties. The result retains at most `maxColumns - 1` complete
paths and reserves one column for **Other**. A cap of one therefore produces Other alone when limiting is needed.
`distinctColumns` counts complete paths before limiting; `columnsLimited` records that limiting occurred.

Other contains the omitted **complete** column paths. A retained parent prefix keeps its full raw scope, including
descendants that now appear in Other. This makes that prefix's subtotal and drill-through exact, and preserves the
correct input for averages and distinct counts. A collapsed prefix subtotal can therefore overlap Other.

For example, let the complete paths be `2026 / Q1 = 100`, `2026 / Q2 = 40` and `2027 / Q1 = 20`. Retaining only
`2026 / Q1` produces:

| Scope | Sum |
| --- | ---: |
| Retained leaf `2026 / Q1` | 100 |
| Other: `2026 / Q2` and `2027 / Q1` | 60 |
| Full-prefix subtotal `2026` | 140 |
| Grand total | 160 |

The expanded leaf columns partition the records: 100 + 60 = 160. Collapsing `2026` shows its full-prefix subtotal of
140 beside Other's 60; those visible scopes overlap by 40 and must not be added as if they were disjoint leaves.
Label such a collapsed column as a **full-prefix subtotal** when presenting or exporting a custom layout. Averages
and distinct counts always come from the underlying records, not from adding or averaging displayed child values.

## Drill-through and atomic tuples

Opening an intersection adds at most two `query.tupleFilters`: membership in its row prefix and membership in its
column prefix. Opening Other instead adds one exclusion predicate over all retained complete column paths. Existing
query criteria remain AND-combined with those predicates. Return to pivot restores the preceding query.

```json
{
  "columns": [{ "column": "year" }, { "column": "quarter" }],
  "values": [["2026", "Q1"], ["2027", "Q2"]],
  "exclude": true
}
```

Each tuple is an atomic correlated condition. This exclusion removes exactly the two listed pairs, while keeping
`2026 / Q2`, `2027 / Q1` and unlisted pairs containing null. It must not become separate year and quarter exclusions.
Tuple strings compare exactly, including case; dates compare normalized instants. Operands are raw scalar values or
explicit null, and bucketed fields use numeric keys. Queries allow at most eight tuple predicates, each with one to
six fields and one to 200 equally wide operand tuples. Empty optional `tupleFilters` is omitted.

For `includeCurrentFilter: false`, a facet drops an entire tuple if any field references that facet's column. This
replaces the atomic condition by true; it does not project the tuple onto its remaining fields. Other independent
predicates stay active. The single-column editor and facet selection controls lock a referenced tuple field through
the composite-condition message. Remove the whole tuple chip or clear the filters to replace that atomic constraint.

## Hosted query and result

A hosted source supplies `pivot(request, { signal })`. The request is:

```json
{
  "protocol": "canopyx/2",
  "type": "gridPivotQuery",
  "query": {
    "protocol": "canopyx/2", "type": "gridQuery", "view": "orders", "revision": "r1",
    "offset": 0, "limit": 100, "search": "", "sort": [], "filters": []
  },
  "definition": {
    "rows": [{ "column": "region", "direction": "asc" }],
    "columns": [{ "column": "status", "direction": "asc" }],
    "values": ["total"], "maxColumns": 200
  }
}
```

`CanopyRequestParser.ParsePivot` binds this request to the endpoint's column and aggregate allow-lists.
`ICanopyPivotProvider` computes the full accepted scope. `CanopyRemoteHandler.PivotAsync` answers a `gridPivot`
document; the ASP.NET Core remote endpoint serves it at `POST /pivot`. Its generated client maps that capability to
`source.pivot`. Cancellation follows the source hook's signal.

A result carries `view`, `definition`, `matched`, `distinctColumns`, `columnsLimited`, `rows`, `columns`,
`retainedColumns` and `cells`. Axis nodes are `{ key, parent?, path, other }`, total first and then parent-before-child
prefixes. Cells are `{ row, column, count, aggregates }`; aggregate values are numbers or null. Missing intersections
have zero counts and operation-specific empty aggregates. `retainedColumns` contains complete paths for exact Other
drill-through. Treat node keys as opaque identities.

Direct `CanopyPivotResult.ToJson()` omits `query` and `revision`. A hosted response adds both and echoes the accepted
query with its revision. The schema accepts these two result forms. The browser's hosted reader requires ownership:
view, revision, normalized query, definition and matched count must agree with the accepted page. It also validates
typed paths, prefix links, unique intersections, declared aggregates and grand totals before accepting the result.
Attach the exact accepted query and revision when adapting a direct computed result for a browser source hook.

### Store semantics and provider proof

An `IQueryable` provider uses its mapped expressions and the store's native collation for grouping and tuple equality.
For exact parity with inline results, hosts must use ordinal/binary text comparison on axis fields, tuple fields and
distinct-count inputs. A case-insensitive store collation can merge paths that the inline engine keeps separate.
That distinction must be preserved before the store groups records; it cannot be recovered from an already merged
contribution.

A host using EF Core can project `EF.Functions.Collate` through its existing column mapping where its provider supports
that expression. Collation names and database configuration remain host choices. CanopyX takes no EF Core dependency.
Grouped contributions normalize datetime values to millisecond precision and numeric values to binary64 after store
grouping; this normalization does not change the store's preceding collation and equality rules.

The provider tests execute SQLite queries with binary string comparison. SQL Server pivot coverage checks SQL
translation; it does not establish executed SQL Server parity. Qualify the target database, mapping and collation
when validating a hosted integration.

## State and export

`getPivot()` returns the definition plus `active`, `collapsedRows`, `collapsedColumns` and an optional `columnKey`
for the compact-screen picker. Saved and shared pivot state retains this presentation intent. `setPivot(false)`
shows flat records while retaining the configured definition. `setPivotCollapsed(axis, key, collapsed)` accepts
`"rows"` or `"columns"` and an accepted non-total prefix with children. Collapse changes presentation, not totals.
These optional controller methods are installed only on grids that enable pivots.

Optional reporting parts in the same runtime reuse `GRID_REPORTING.pivotDefinition(view, input)` for canonical
definition validation and normalization. It returns the frozen definition. Intent envelopes handle omission and
`false` before calling this hook; saved-state readers continue to validate the complete state through `readGridState`.

Embedded pivots honor their host's height. On phones, the toolbar's **Pivot settings** action opens the shared editor;
the configuration chips are hidden so data rows retain the remaining height. **Show records** in the editor returns to the flat view. All column groups stay in a horizontal
scroll area, with frozen row labels. The shared **Choose column** menu in the row-field corner jumps to a column
group without hiding the other groups. The corner names the row fields, column-group headings span their measures,
and each measure names its aggregation. Static tables and print use the same grouped header structure. Print adds
the view caption and axis/value configuration, and repeats table headers across pages.

Pivot, display-mode and calculated-column forms use the shared Cancel / Apply footer. Cancel leaves the accepted
view unchanged. Aggregate display text uses the declared aggregate or source-column format, with two decimals by
default and integer counts; percent modes use two decimals without a space before `%`. Dialogs, grid totals, pivot
cells, static tables and exported display text use that precision consistently.

`await grid.setState(savedState)` requests the saved pivot or flat mode in the same query restore. Axis and value
changes are validated before requesting their result; switching back to records fetches the flat page and its summary.
The pivot presentation changes only after that query succeeds. A rejected or superseded request retains the accepted
pivot intent and result, and a successful restore emits one accepted query without a second presentation query.

`await grid.getPivotExport?.()` returns a frozen snapshot of the accepted `query` and `definition`. Its `rowAxis` and
`columnAxis` retain the result's opaque keys, parent links, typed paths and synthetic `other` identity. Rows and
numeric columns name their `axisKey`; numeric columns also name their `aggregate`. A text label such as “Other” never
identifies the synthetic group by itself.

The projected `rows` and `columns` include every prefix and descendant in depth-first order, with prefix summaries
before their descendants and grand totals last. Both carry `outlineLevel`, `summary`, `grandTotal`, `collapsed` and
`hidden`. Collapsing retains all values and hides descendants; the prefix summary stays available. Earlier snapshots
projected only leaf columns. Adapters now select `!column.summary` for leaves and `column.grandTotal` for totals when
they need that presentation.

`columnGroups` describes contiguous descendant ranges with `key`, optional `parent`, `firstColumn`, `columnCount`,
`depth`, `collapsed` and `hidden`. `firstColumn` is a zero-based physical index into `columns`, including the row-label
column. The range excludes its own leading prefix summary columns; `depth` starts at one. A collapsed group hides
the range while retaining that summary. These ranges describe outlines, separately from merged heading labels.

The row-axis label cell contains `{ value, text }`; numeric cells contain `{ value, text, mode, numberFormat }`.
Percentages stay numeric fractions with a format such as `0.00%`. `matched` counts underlying accepted records, not
projected prefix rows. `distinctColumns`, `retainedColumns` and `columnsLimited` retain the accepted cap metadata:
omitted complete column paths are combined in synthetic Other, while the full accepted record scope and exact totals
remain available. A retained prefix total includes all of its raw descendants and can overlap Other; do not sum
prefix summaries and Other as if they were disjoint leaves.

Use those numeric values and formats in spreadsheet/document adapters. The flat grid's `prepareExport` scopes remain
record exports: filtered exports keep tuple criteria, while all-record and selected-record exports clear query
filters. See the [data protocol](data-protocol.md) for wire definitions and [row grouping](grouping.md) for ordinary
single-axis groups.

The reporting delivery bridge uses `prepareExport({ scope: "filtered", pivot: true })` for an explicit pivot-table
capture. The default remains a record capture, including CSV and clipboard exports. An explicit pivot request needs
an accepted active pivot and its complete projected columns; unsupported scopes, missing bridge support and inactive
pivots fail clearly. Delivery methods such as `materializeExport`, `exportAs` and `print` accept the same option.

`request.pivot` carries the definition, typed axes, column outlines and cap metadata without duplicating the matrix.
The ordinary `columns` and row enumeration carry the projected table and presentation flags. `recordCount` counts
those physical table rows; `matched` still counts source records. Pivot captures have no ordinary record grouping or
raw-grid formatting rules to reapply. Locale and time-zone options format the captured labels and numeric text through
the same formatting owner as record exports. Bounded materialization, cancellation and revision checks remain active;
a changed data or calculated-column revision requires a fresh capture. Moving between records and pivot presentation
does not rewrite an already captured table.
