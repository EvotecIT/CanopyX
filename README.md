# CanopyX - Interactive Trees and Data Grids

Turn application data into searchable trees, sortable tables and standalone HTML reports. Use C# to write a report you can open in a browser, or mount the JavaScript runtime in your own page.

📦 **.NET packages**

[![CanopyX NuGet](https://img.shields.io/nuget/v/CanopyX?label=CanopyX)](https://www.nuget.org/packages/CanopyX)
[![CanopyX.Html NuGet](https://img.shields.io/nuget/v/CanopyX.Html?label=CanopyX.Html)](https://www.nuget.org/packages/CanopyX.Html)

🌐 **JavaScript package**

[![npm version](https://img.shields.io/npm/v/@evotecit/canopyx)](https://www.npmjs.com/package/@evotecit/canopyx)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/license/mit)

## What you can build

- **File and folder explorers** with expandable branches, lazy loading, search and multi-selection.
- **Inventory and results tables** with typed sorting, filters, column resizing and saved views.
- **HTML reports** that include their own runtime and data and can be opened from disk or a file share.
- **Application views** backed by paged or cursor-based data sources, with selection and detail callbacks.
- **Email and print tables** rendered from the same .NET view without JavaScript.

![File explorer in the light theme, with sizes, dates, owners and an expanded detail row](https://cdn.jsdelivr.net/npm/@evotecit/canopyx@0.1.1/docs/images/tree-grid-light.png)

The same explorer in the dark theme, alongside its script-free output for email and print:

| Dark theme | Static outline |
| --- | --- |
| ![File explorer in the dark theme](https://cdn.jsdelivr.net/npm/@evotecit/canopyx@0.1.1/docs/images/tree-grid-dark.png) | ![Static outline table](https://cdn.jsdelivr.net/npm/@evotecit/canopyx@0.1.1/docs/images/static-outline.png) |

## Features

| | Tree grid | Data grid |
| --- | --- | --- |
| Navigation | Expandable branches, path search and lazy children | Continuous or paged records, offset or cursor navigation |
| Querying | Search, sibling sorting and named filters | Search, multi-column sorting, typed filters and condition groups |
| Columns | Resize and hide | Resize, hide, reorder, pin and fit to content |
| Selection | Single/multiple selection and hierarchical checkboxes | Single/multiple selection with stable record IDs |
| Presentation | Badges, details, custom cells and light/dark themes | Links, progress, wrapped text, row highlighting and light/dark themes |
| Delivery | Single HTML file, sidecar bundle or hosted data | Single HTML file or hosted data |

Both views use virtual rows and support keyboard navigation. Reporting grids also provide grouping, aggregates, saved views, CSV export and row copying. English labels are built in; Polish, German and Spanish packs are included.

## Installation

### .NET

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

### JavaScript

```shell
npm install @evotecit/canopyx
```

The package includes ES modules, classic scripts, stylesheets and TypeScript declarations, with no runtime package dependencies.

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

## Usage in JavaScript

Add a container to your page:

```html
<div id="files" style="height: 360px"></div>
```

Then mount a tree grid:

```javascript
import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Project files",
    rowHeight: 28, pageSize: 100, selection: "single",
    search: { minLength: 1, maxResults: 50 },
    columns: [{ id: "name", title: "Name", kind: "text", width: 320 }],
    source: { kind: "inline" },
    roots: [{
      id: "projects", label: "Projects",
      children: [{ id: "quarterly-report", label: "Quarterly report.pdf" }]
    }]
  }
});

await grid.ready;
```

The stylesheet import uses your application's asset pipeline. For a page without a bundler, serve `classic.js` and `styles.css` from the installed package and load them with `<script>` and `<link>` elements; the script exposes `window.CanopyX`. Use one matching runtime and stylesheet per page.

### Choose a runtime

| Import | Use it for | Stylesheet |
| --- | --- | --- |
| `@evotecit/canopyx` | Interactive tree grids | `@evotecit/canopyx/styles.css` |
| `@evotecit/canopyx/grid` | Flat data grids | `@evotecit/canopyx/grid.css` |
| `@evotecit/canopyx/reporting` | Flat grids with reporting controls | `@evotecit/canopyx/reporting.css` |

Module imports are safe on the server; mounting a view requires a browser. The included TypeScript declarations describe the view, data-source and event APIs.

### Translate the controls

Import labels from `@evotecit/canopyx/locales/pl`, `/locales/de` or `/locales/es` and pass them as `labels` in your view definition. In C#, set the view's `Labels` to `CanopyLabels.Polish()`, `German()` or `Spanish()` before writing the page.

## Working with larger datasets

Virtual rows keep the rendered DOM small. Tree bundles split data into sidecar files, and hosted sources let your application fetch records as the reader navigates. Flat-grid queries filter and sort the complete dataset before paging; loading one page does not mean the rest of the results are available in the browser.

CSV export and copying distinguish filtered results, selected records and all records. For Office files, large exports or application actions, connect your own callbacks to the view.

## Community and license

CanopyX is an Evotec project, licensed under MIT. Questions and feedback are welcome in the [Evotec community on Discord](https://evo.yt/discord). You can find more Evotec projects and articles at [evotec.xyz](https://evotec.xyz/hub).
