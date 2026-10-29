# CanopyX

Interactive views of your own records, written in C#: tree grids, data grids, pivots, boards, calendars, plans, status matrices, change reviews and guided flows. Save a report that opens from disk, serve the view from your app, or render it as a script-free table for email and print.

**[Live demos](https://canopyx.dev/views/)** · **[Documentation](https://canopyx.dev/docs/)** · **[Getting started](https://canopyx.dev/docs/getting-started/)** · **[GitHub](https://github.com/EvotecIT/CanopyX)**

![A CanopyX data grid of 1,200 devices grouped by site, with health strips, patch-level bars, sign-in sparklines and a grand total](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-light.png)

## Pick a view

| | | |
| :-- | :-- | :-- |
| [![Tree grid](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/files-light.png)](https://canopyx.dev/views/files/)<br>**Tree grid**<br>`CanopyTreeView` | [![Data grid](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-light.png)](https://canopyx.dev/views/inventory/)<br>**Data grid**<br>`CanopyDataGridView` | [![Pivot](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/pivot-light.png)](https://canopyx.dev/views/pivot/)<br>**Pivot**<br>`CanopyGridPivot` |
| [![Board](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/board-light.png)](https://canopyx.dev/views/board/)<br>**Board**<br>`CanopyBoard` | [![Calendar](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/calendar-light.png)](https://canopyx.dev/views/calendar/)<br>**Calendar**<br>`CanopyCalendar` | [![Plan](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/plan-light.png)](https://canopyx.dev/views/plan/)<br>**Plan**<br>`CanopyPlan` |
| [![Resource timeline](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/timeline-light.png)](https://canopyx.dev/views/timeline/)<br>**Resource timeline**<br>`CanopyCalendarResources` | [![Status matrix](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/matrix-light.png)](https://canopyx.dev/views/matrix/)<br>**Status matrix**<br>`CanopyMatrix` | [![Change review](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/changes-light.png)](https://canopyx.dev/views/changes/)<br>**Change review**<br>`CanopyChangeList`, `CanopyTextDiff` |
| [![Dataset compare](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/compare-light.png)](https://canopyx.dev/views/compare/)<br>**Dataset compare**<br>`CanopyDatasetComparer` | [![Time slider](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/time-light.png)](https://canopyx.dev/views/time/)<br>**Time slider**<br>`CanopyTimeSlider` | [![Guided flow](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/flow-light.png)](https://canopyx.dev/views/flow/)<br>**Guided flow**<br>`CanopyFlow` |
| [![Approval path](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/path-light.png)](https://canopyx.dev/views/path/)<br>**Approval path**<br>`CanopyPath` | [![Layer stack](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/stack-light.png)](https://canopyx.dev/views/stack/)<br>**Layer stack**<br>`CanopyStack` | [![Script-free table](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/email-light.png)](https://canopyx.dev/views/email/)<br>**Script-free table**<br>`CanopyStaticHtml` |

## Get started

```shell
dotnet add package CanopyX.Html
```

`CanopyX.Html` brings in `CanopyX` and the browser assets. Install `CanopyX` alone when you only need the model, the bundle writer or the script-free renderer.

### A report that opens from disk

```csharp
using CanopyX;
using CanopyX.Html;

var inventory = new CanopyDataGridView("inventory", "Inventory");
inventory.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
inventory.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });

foreach (var (name, bytes) in new[] { ("Archive", 2048L), ("Documents", 512L) })
{
    var row = new CanopyGridRow(name);
    row.Cells["name"] = name;
    row.Cells["size"] = new CanopyCell(bytes) { Text = $"{bytes:N0} bytes" };
    inventory.Rows.Add(row);
}

inventory.SaveHtmlPage("inventory.html");
```

Open `inventory.html` in any browser. It carries its own runtime and data, so you can attach it to a ticket or put it on a file share. Numeric values drive sorting; `Text` is what the reader sees.

### A file explorer

```csharp
var files = new CanopyTreeView("files", "Project files") { Search = new CanopySearchOptions() };
files.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
files.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });

var projects = new CanopyNode("projects", "Projects");
var report = new CanopyNode("quarterly-report", "Quarterly report.pdf");
report.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB" };
projects.Children.Add(report);
files.Roots.Add(projects);

files.SaveHtmlPage("files.html");     // one file
files.SaveHtmlBundle("file-report");  // or a folder that loads branches on demand
```

### A table for email and print

```csharp
using CanopyX.Rendering;

string table = CanopyStaticHtml.RenderGrid(inventory);
```

The result is an HTML table with inline styles and no scripts, ready for a mail body, a print layout or Word.

## Choose a delivery

| You want | Write | What you get |
| --- | --- | --- |
| One file to attach or archive | `view.SaveHtmlPage("report.html")` | Data and runtime in a single page |
| A big tree or grid on a file share | `view.SaveHtmlBundle("report")` | A folder whose branches and rows load as the reader scrolls |
| Millions of database rows | `CanopyX.Data` + `CanopyX.AspNetCore` | Paging, filters, summaries, export and edits answered by your server |
| A table in an email | `CanopyStaticHtml.Render(view)` | A script-free table that survives mail clients |

## Guides

- [Getting started](https://canopyx.dev/docs/getting-started/): a file explorer and an inventory table, step by step.
- [Reporting grids](https://canopyx.dev/docs/reporting/): grouping, filters, aggregates, presenters and export.
- [Email and print](https://canopyx.dev/docs/static-tables/) and [delivery modes](https://canopyx.dev/docs/delivery/).
- [Server-side data for .NET](https://github.com/EvotecIT/CanopyX/blob/main/docs/remote-dotnet.md): `CanopyX.Data` and `CanopyX.AspNetCore`.
- [Calendar](https://github.com/EvotecIT/CanopyX/blob/main/docs/calendar.md), [board](https://github.com/EvotecIT/CanopyX/blob/main/docs/board.md), [plan](https://github.com/EvotecIT/CanopyX/blob/main/docs/plan.md), [matrix](https://github.com/EvotecIT/CanopyX/blob/main/docs/matrix.md), [change views](https://github.com/EvotecIT/CanopyX/blob/main/docs/changes.md) and [guided flows](https://github.com/EvotecIT/CanopyX/blob/main/docs/flow.md).
- [Editing](https://github.com/EvotecIT/CanopyX/blob/main/docs/editing.md), [conditional formatting](https://github.com/EvotecIT/CanopyX/blob/main/docs/conditional-formatting.md), [label packs](https://github.com/EvotecIT/CanopyX/blob/main/docs/labels.md) and [security](https://github.com/EvotecIT/CanopyX/blob/main/docs/security.md).

## Requirements

| Target | Support |
| --- | --- |
| .NET 8 and .NET 10 | Windows, Linux and macOS |
| .NET Standard 2.0 | Compatible .NET applications |
| .NET Framework 4.7.2 | Windows |

The packages add no third-party runtime dependencies, and generating a report needs no Node.js, npm or build step.

## Community and license

CanopyX is an Evotec project, licensed under MIT. Questions and feedback are welcome in the [Evotec community on Discord](https://evo.yt/discord). More Evotec projects are at [evotec.xyz](https://evotec.xyz/hub).
