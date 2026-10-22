# Typed grids

Typed grids expose column labels, category ordering, numeric text tones, and
wrapping on their existing `CanopyColumn` configuration:

```csharp
grid.Column(row => row.State, "Outcome", column => {
    column.ValueLabels.Add("needs-review", "Needs review");
    column.ValueOrder.Add("needs-review");
    column.ValueOrder.Add("verified");
    column.ValueTones.Add("needs-review", CanopyTone.Warning);
    column.Presenter = CanopyGridPresenter.Enum();
});
grid.Column(row => row.Days, "Days remaining", column => {
    column.NumericTones.Add(new CanopyNumericToneRule(
        CanopyNumericToneOperator.Below, 0, CanopyTone.Danger, "Overdue"));
    column.NumericTones.Add(new CanopyNumericToneRule(
        CanopyNumericToneOperator.AtMost, 14, CanopyTone.Warning, "Review soon"));
});
grid.Column(row => row.Notes, "Observation", column => {
    column.Wrap = true;
    column.MaxLines = 3; // 1–12, default 2
    column.Tooltip = CanopyColumn.AutoTooltip;
});
grid.View.AutoRowHeight = true;
```

Labels keep raw filter values and group identities. Category ordering uses
declared tokens followed by unknown ordinal tokens; numeric rules use the first
match and color plain text. The generated `report-grid-value-policies.html` and
`report-grid-ten-cards.html` examples show these policies with mixed row heights
and ten phone cards.

A grid can be written from your own record type, in C# and in TypeScript, so that a renamed member, a misspelt column id or a
cell of the wrong type is caught by the compiler instead of in the browser. The untyped API stays as it is: typed grids are
a layer over it, and every typed grid is also an ordinary grid.

## C#: columns from members

`CanopyDataGridView<T>` takes columns from member expressions and rows from `IEnumerable<T>`:

```csharp
var grid = new CanopyDataGridView<Server>("servers", "Servers", server => server.HostName);
grid.Column(x => x.HostName, "Server", column => column.RowHeader = true);
grid.Column(x => x.Owner.Team);                       // id "ownerTeam", title "Owner team", text
grid.Column(x => x.Cores);                            // a number column
grid.Column(x => x.LastSeenUtc, "Last seen");         // a date column
grid.Column(x => x.Health, configure: column => column.Presenter = CanopyGridPresenter.State(tones));
grid.Column(x => x.DiskBytes, "Disk", cell: bytes => new CanopyCell(bytes) { Text = bytes / 1_000_000_000 + " GB" });
grid.Field(x => x.Notes);                             // a record panel value, not a column
grid.View.FacetPanel = new CanopyFacetPanel().Add(grid.ColumnId(x => x.Health));
grid.AddRows(servers).View.SaveHtmlPage("servers.html");
```

| Member | What it does |
| --- | --- |
| `new CanopyDataGridView<T>(id, label, x => x.Key)` | The identity is a string, or a number (`Func<T, long>`), written as invariant digits; numeric keys keep their natural order (2 before 10) when no sort applies. A `null` identity now needs a cast to pick the overload. |
| `Column(x => x.Member, title, configure, cell)` | Adds a column. Its id is the member path in camel case (`x => x.Owner.Team` is `ownerTeam`), its title the path as words unless you give one, and its kind follows the member type: numbers are number columns; `DateTime`, `DateTimeOffset` and `DateOnly` are date columns; everything else is text. `configure` sets any other column option; `cell` writes a value's cell (display text, tone) instead of the raw value. |
| `Column("id", x => …, …)` | The same with an explicit id, for any expression of the record. |
| `StatusStrip(x => x.Hours, title, configure, state)` | A status strip column for a member holding `CanopyCellPeriod`s (one toned segment per period). It is a text column whose raw value is the latest period's state, or the summary `state` returns ("3 of 24 failing"), so it sorts, filters, searches and exports by that. |
| `Sparkline(x => x.Latency, title, presenter, configure, value)` | A sparkline column for a member holding numeric `CanopyCellPeriod`s: `SparklineBars()` by default, or `SparklineLine()`, with their thresholds and scale. It is a number column whose raw value is the latest sample, or the number `value` returns. |
| `Field(x => x.Member, …)`, `Field("id", x => …, …)` | A record panel field (drawer only); its id may not be a column's. |
| `ColumnId(x => x.Member)` | The id a member's column has, for settings that name columns: facets, search columns, sorts, formatting rules. |
| `Row(record)`, `AddRows(records)` | One record as a row, or the records as the grid's inline rows. A null value, or a null link of a member chain (`x => x.Owner.Team` with no owner), leaves its cell empty; dates without a kind are UTC; `DateOnly` (on .NET 6 or later) is UTC midnight; enumerations write their names. |
| `View` | The untyped `CanopyDataGridView` underneath, where every other setting lives; a typed grid converts to it implicitly. |

A renamed or removed member fails the build. A member chain must start at the record (`x => x.Owner.Team`); any other expression
needs an explicit id. Ids keep acronyms readable (`URL` is `url`, `IPAddress` is `ipAddress`), and two paths that would share an
id (`Owner.Team` and `OwnerTeam`) are refused: give one an explicit id. `CanopyGridMapper<T>` remains for columns you declare
yourself with a selector per column; it validates the view as it creates it, while a typed grid's view is validated when it
is written. Values are read through the compiled member expressions (interpreted under native AOT).

Explicit conversions keep their C# behavior: `grid.Column("load", x => (double)x.Cores)` writes a double, and a checked
conversion reports overflow when a row is read. The result type determines the column kind; boxing a member as `object`
keeps its underlying kind. Member chains with converted receivers still leave null links empty.

### History columns from other models

A host or a bridge that writes rows without a typed record builds the same cells with `CanopyCell.StatusHistory(periods,
state)` and `CanopyCell.ValueHistory(periods, value)`, and declares the column with `CanopyGridPresenter.StatusStrip()` (a text
column) or `SparklineBars()` / `SparklineLine()` (a number column). A dataset column type such as "status history" maps onto
exactly these two calls, so the strip renders, sizes, sorts and falls back to text in static output like any other column.

`TypedGridExample` in `CanopyX.Examples` writes `typed-grid.html` (and a dark palette).

## TypeScript: a row type

Name a row type and `createDataGrid` checks the view's columns, rows, facets and search columns, the column methods, the host
source's pages, renderers, `onDetails`, `onRowActivate`, `onLink`, the detail callbacks, the column events and the live data
methods against it (editing callbacks keep plain rows):

```typescript
import { createDataGrid, type GridRow, type InlineGridView } from "@evotecit/canopyx/grid";

interface ServerRow extends GridRow { cells: { host: string; load: number; site: string | null } }

const view: InlineGridView<ServerRow> = { /* … */ columns: [{ id: "host", title: "Host", kind: "text" }, /* … */], rows };
const grid = createDataGrid<ServerRow>(element, { view, onDetails: ({ row }) => open(row.cells.host) });
grid.setColumnVisible("load", false);                              // checked: "load" is a column of ServerRow
await grid.updateRows([{ id: "s2", cells: { load: 3 } }]);         // checked: load is a number
```

Without a row type, `createDataGrid(element, options)` works as before: rows are plain `GridRow` and any column id goes. The
row type is never inferred from the options, so an untyped grid never ends up with a narrow row type by accident.
`GridColumnId<Row>` names a row type's column ids. Declare the cells as a type literal (as above) or a type alias: an
interface of cells does not satisfy `GridRow`'s cell map.

Live updates respect that row type's nullability. A cell declared as `string | null`, such as `site` above, can be cleared
with `null`; a required `string` cell cannot. A specialized detail payload also keeps its declared type during an update.
Untyped rows support clearing any cell. These checks apply to row objects; compact row encodings and JSON text retain
their runtime serialization boundary, and editing callbacks use plain rows.

## API safety

The public C# and TypeScript APIs are checked against baselines on every build, and changes follow a short versioning and
deprecation policy: see [versions, compatibility and deprecation](versioning.md).
