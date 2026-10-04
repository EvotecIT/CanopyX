# CanopyX - Large Interactive Data Views for .NET

CanopyX renders large interactive data views from .NET without runtime dependencies. Its tree grid supports paged lazy children, path search and details. Its flat data grid queries typed records before paging, with stable identities, multi-column sorting, filters, saved views and bounded virtual rows. Both views provide keyboard navigation and stable-ID selection. Pages work as a single file or against a host data source; trees also support sidecar bundles opened from a file share.

## Install

```powershell
dotnet add package CanopyX.Html
```

Both packages target `net472`, `netstandard2.0`, `net8.0`, and `net10.0`.

| Package | Purpose |
| --- | --- |
| `CanopyX` | View definitions, the `canopyx/2` data protocol, the bundle writer, and the static fallback renderer. No runtime dependencies. |
| `CanopyX.Html` | The tree and flat-grid browser runtimes, data sources and theme CSS, plus the API that writes pages, fragments, tree bundles and asset files. |

## Quick Start

```csharp
using CanopyX;
using CanopyX.Html;

var view = new CanopyView("files", "File shares");
view.Columns.Add(new CanopyColumn("name", "Name") { Width = 320, Sortable = true });
view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });

var projects = new CanopyNode("projects", @"\\files\projects");
projects.Cells["size"] = 5_368_709_120;
projects.Children.Add(new CanopyNode("projects/plans", "plans"));
view.Roots.Add(projects);

view.SaveHtmlPage("files.html");          // single file with inline data
view.SaveHtmlBundle("report");            // sidecar bundle for large trees
```

`CanopyStaticHtml.Render(view)` in `CanopyX.Rendering` returns a script-free outline table for email, print, and Word.

## Flat Data Grid

```csharp
var inventory = new CanopyGridView("inventory", "Inventory");
inventory.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
inventory.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
var record = new CanopyGridRow("record-17");
record.Cells["name"] = "Archive";
record.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB" };
inventory.Rows.Add(record);
inventory.SaveHtmlPage("inventory.html");
```

Raw values drive filtering and sorting; display text remains presentation. The toolbar provides column visibility and ordering, resizing, typed filters and resettable saved views. CSV exports and row copying distinguish filtered results, selected records and all results, independently of rows on screen. Large Office exports and record drawers call host hooks. `CanopyStaticHtml.RenderGrid(inventory)` supplies a script-free fallback.

Optional `CanopyGridView.Reporting` policies add deterministic ordinal, folded and natural text ordering, plus host-defined category order. `CanopyGridOrdering` supplies the same comparer to host queries, and the page writer selects the reporting runtime. Represent exact large identifiers and decimals as text; JSON numbers use binary64 precision and numeric magnitudes are limited to the safe-integer range.

The reporting filter editor provides inclusive numeric/date ranges, category suggestions and translated boolean choices. Set `Reporting.HeaderFilters = true` to open the editor from a column header. Ranges use the existing typed predicates; filtering and exports apply to all accepted results before visible paging. `Reporting.FilterGroups = true` adds nested AND/OR condition groups over those predicates, with atomic Apply validation and saved-query restoration. Inclusive ranges within OR remain a conjunction. Expressions are bounded to eight levels, 64 groups and 64 total predicates.

`Reporting.Presenters` adds safe links, decorative icons with text alternatives, native progress, translated boolean values, compact lists and complete-text dialogs. For example, `inventory.Reporting.Presenters.Add("notes", CanopyGridPresenter.LongText())` expands notes without changing virtual row height. Query and export values remain independent of the display; explicit host renderers take precedence.

Reporting grids support direct pointer/keyboard header moves, per-column minimum/maximum widths and optional flex sizing. Auto-fit explicitly samples up to 200 loaded accepted-query records and applies a bounded width estimate. Manual sizing disables flex until reset or saved-state restoration; column identities continue to govern sorting, visibility and export order.

Reporting layouts also support left/right pins and responsive retention priorities. Pins suspend when space is needed for the scrolling center. Temporary responsive hiding preserves saved visibility intent, full-record details, search and default export columns; the column chooser distinguishes these temporary decisions from explicit user hiding.

## Links

- Repository: https://github.com/EvotecIT/CanopyX
- Issues: https://github.com/EvotecIT/CanopyX/issues
