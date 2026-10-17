# CanopyX - Interactive Trees and Data Grids

Turn application data into searchable trees, sortable tables and standalone HTML reports. Use C# to write a report you can open in a browser, or mount the JavaScript runtime in your own page.

📦 **.NET packages**

[![CanopyX NuGet](https://img.shields.io/nuget/v/CanopyX?label=CanopyX)](https://www.nuget.org/packages/CanopyX)
[![CanopyX.Html NuGet](https://img.shields.io/nuget/v/CanopyX.Html?label=CanopyX.Html)](https://www.nuget.org/packages/CanopyX.Html)


## What you can build

- **File and folder explorers** with expandable branches, lazy loading, search and multi-selection.
- **Inventory and results tables** with typed sorting, filters, column resizing and saved views.
- **HTML reports** that include their own runtime and data and can be opened from disk or a file share.
- **Application views** backed by paged or cursor-based data sources, with selection and detail callbacks.
- **Email and print tables** rendered from the same .NET view without JavaScript.

## Features

| | Tree grid | Data grid |
| --- | --- | --- |
| Navigation | Expandable branches, path search and lazy children | Continuous or paged records, offset or cursor navigation |
| Querying | Search, sibling sorting and named filters | Search, multi-column sorting, typed filters and condition groups |
| Columns | Resize and hide | Resize, hide, reorder, pin and fit to content |
| Selection | Single/multiple selection and hierarchical checkboxes | Single/multiple selection with stable record IDs |
| Presentation | Badges, details, custom cells and light/dark themes | Links, progress, wrapped text, row highlighting and light/dark themes |
| Delivery | Single HTML file, sidecar bundle or hosted data | Single HTML file or hosted data |

Both views use virtual rows and support keyboard navigation. Reporting grids also provide grouping, aggregates, saved views, CSV export and row copying. English labels are built in; Polish, German, Spanish, French and Italian packs are included.

## Installation

```shell
dotnet add package CanopyX.Html
```

`CanopyX.Html` includes the browser assets and brings in `CanopyX` for the view definitions. Install `CanopyX` alone when you only need the model, tree bundle writer or script-free table renderer.

| Target | Support |
| --- | --- |
| .NET 8 and .NET 10 | Windows, Linux and macOS |
| .NET Standard 2.0 | Compatible .NET applications |
| .NET Framework 4.7.2 | Windows |

Neither .NET package adds third-party runtime dependencies. Generating a report from C# needs no Node.js, npm or JavaScript build step.


## Usage in .NET

### Create a file explorer

```csharp
using CanopyX;
using CanopyX.Html;

var files = new CanopyTreeView("files", "Project files");
files.Search = new CanopySearchOptions();
files.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
files.Columns.Add(new CanopyColumn("size", "Size")
{
    Kind = CanopyColumnKind.Number,
    Sortable = true
});

var projects = new CanopyNode("projects", "Projects");
var report = new CanopyNode("quarterly-report", "Quarterly report.pdf");
report.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB" };
projects.Children.Add(report);
files.Roots.Add(projects);

files.SaveHtmlPage("files.html");
```

Open `files.html` in a browser and expand Projects. The first column displays the node label; the Size column displays the matching cell. Numeric values control sorting while `Text` controls the displayed value.

For a larger tree, write a bundle that loads branches on demand:

```csharp
files.SaveHtmlBundle("file-report");
```

Keep the generated page, assets and data files together. The bundle can be opened directly from disk or a file share.

### Create an inventory table

```csharp
using CanopyX;
using CanopyX.Html;

var inventory = new CanopyDataGridView("inventory", "Inventory");
inventory.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
inventory.Columns.Add(new CanopyColumn("size", "Size")
{
    Kind = CanopyColumnKind.Number,
    Sortable = true
});

foreach (var (name, bytes) in new[] { ("Archive", 2048L), ("Documents", 512L) })
{
    var row = new CanopyGridRow(name);
    row.Cells["name"] = name;
    row.Cells["size"] = new CanopyCell(bytes) { Text = $"{bytes:N0} bytes" };
    inventory.Rows.Add(row);
}

inventory.SaveHtmlPage("inventory.html");
```

Open `inventory.html` to search the records, sort by name or size, and adjust the columns. Record IDs stay stable when the order changes.

### Render a table for email or print

```csharp
using CanopyX.Rendering;

string treeTable = CanopyStaticHtml.Render(files);
string inventoryTable = CanopyStaticHtml.RenderGrid(inventory);
```

These methods return HTML tables with no scripts. Insert the returned HTML into your email, print layout or document-generation workflow.

## Working with larger datasets

Virtual rows keep the rendered DOM small. Tree bundles split data into sidecar files, and hosted sources let your application fetch records as the reader navigates. Flat-grid queries filter and sort the complete dataset before paging; loading one page does not mean the rest of the results are available in the browser.

CSV export and copying distinguish filtered results, selected records and all records. For Office files, large exports or application actions, connect your own callbacks to the view.

## Community and license

CanopyX is an Evotec project, licensed under MIT. Questions and feedback are welcome in the [Evotec community on Discord](https://evo.yt/discord). You can find more Evotec projects and articles at [evotec.xyz](https://evotec.xyz/hub).
