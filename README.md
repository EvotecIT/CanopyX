# CanopyX

Interactive views of your own records for .NET and the browser: tree grids, data grids, pivots, boards, calendars, plans, status matrices, change reviews and guided flows. Write the view in C# and save a report that opens from disk, or mount the same runtime in your web app from npm.

[![CanopyX.Html on NuGet](https://img.shields.io/nuget/v/CanopyX.Html?label=CanopyX.Html)](https://www.nuget.org/packages/CanopyX.Html)
[![CanopyX on NuGet](https://img.shields.io/nuget/v/CanopyX?label=CanopyX)](https://www.nuget.org/packages/CanopyX)
[![npm](https://img.shields.io/npm/v/@evotecit/canopyx?label=npm)](https://www.npmjs.com/package/@evotecit/canopyx)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/license/mit)

**[Live demos](https://canopyx.dev/views/)** · **[Documentation](https://canopyx.dev/docs/)** · **[Getting started](https://canopyx.dev/docs/getting-started/)** · **[Discord](https://evo.yt/discord)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-dark.png">
  <img alt="A CanopyX data grid of 1,200 devices grouped by site, with health strips, patch-level bars, sign-in sparklines and a grand total" src="https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-light.png">
</picture>

## Pick a view

Every view runs on the same records, search, filters, saved views and themes. Click a picture to try it live.

| | | |
| :-- | :-- | :-- |
| [![Tree grid](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/files-light.png)](https://canopyx.dev/views/files/)<br>**[Tree grid](https://canopyx.dev/views/files/)**<br>Lazy branches, path search and checkboxes over 100,000 nodes. | [![Data grid](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/inventory-light.png)](https://canopyx.dev/views/inventory/)<br>**[Data grid](https://canopyx.dev/views/inventory/)**<br>Typed filters, facets, grouping with totals, editing and export. | [![Pivot](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/pivot-light.png)](https://canopyx.dev/views/pivot/)<br>**[Pivot](https://canopyx.dev/views/pivot/)**<br>Totals by row and column, with drill-through to the records. |
| [![Board](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/board-light.png)](https://canopyx.dev/views/board/)<br>**[Board](https://canopyx.dev/views/board/)**<br>Cards in status lanes, swimlanes and WIP limits. | [![Calendar](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/calendar-light.png)](https://canopyx.dev/views/calendar/)<br>**[Calendar](https://canopyx.dev/views/calendar/)**<br>Month to year, recurrence, time zones and iCalendar export. | [![Plan](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/plan-light.png)](https://canopyx.dev/views/plan/)<br>**[Plan](https://canopyx.dev/views/plan/)**<br>Tasks per team with a baseline, dependencies and conflicts. |
| [![Resource timeline](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/timeline-light.png)](https://canopyx.dev/views/timeline/)<br>**[Resource timeline](https://canopyx.dev/views/timeline/)**<br>Events on a resource tree with capacity per group. | [![Status matrix](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/matrix-light.png)](https://canopyx.dev/views/matrix/)<br>**[Status matrix](https://canopyx.dev/views/matrix/)**<br>A state for every pair, with totals on both axes. | [![Change review](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/changes-light.png)](https://canopyx.dev/views/changes/)<br>**[Change review](https://canopyx.dev/views/changes/)**<br>Change lists, text diffs and how a change reached its replicas. |
| [![Dataset compare](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/compare-light.png)](https://canopyx.dev/views/compare/)<br>**[Dataset compare](https://canopyx.dev/views/compare/)**<br>Added, removed and changed rows between two snapshots. | [![Time slider](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/time-light.png)](https://canopyx.dev/views/time/)<br>**[Time slider](https://canopyx.dev/views/time/)**<br>Replay snapshots of a view step by step. | [![Guided flow](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/flow-light.png)](https://canopyx.dev/views/flow/)<br>**[Guided flow](https://canopyx.dev/views/flow/)**<br>Setup and edit tasks with checks, review and one proposal. |
| [![Approval path](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/path-light.png)](https://canopyx.dev/views/path/)<br>**[Approval path](https://canopyx.dev/views/path/)**<br>The route a request takes over your records. | [![Layer stack](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/stack-light.png)](https://canopyx.dev/views/stack/)<br>**[Layer stack](https://canopyx.dev/views/stack/)**<br>Which configuration layer sets each value. | [![Script-free table](https://raw.githubusercontent.com/EvotecIT/CanopyX/main/docs/images/views/email-light.png)](https://canopyx.dev/views/email/)<br>**[Script-free table](https://canopyx.dev/views/email/)**<br>The same view as an email, print or Word table. |

## Get started

### From .NET: a report that opens from disk

```shell
dotnet add package CanopyX.Html
```

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

Open `inventory.html` in any browser. The page carries its own runtime and data, so you can attach it to a ticket, archive it with a run or put it on a file share. Numeric values drive sorting; `Text` is what the reader sees.

For a tree, build `CanopyNode`s under a `CanopyTreeView`. For a large one, `SaveHtmlBundle("report")` writes a folder that loads branches on demand, still with no server. The [getting started guide](https://canopyx.dev/docs/getting-started/) builds both, step by step.

### From JavaScript: mount a view in your page

```shell
npm install @evotecit/canopyx
```

```html
<div id="files" style="height: 360px"></div>
```

```javascript
import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Project files",
    search: { minLength: 1 },
    columns: [{ id: "name", title: "Name", kind: "text", width: 320 }],
    source: { kind: "inline" },
    roots: [{ id: "projects", label: "Projects", children: [{ id: "q3", label: "Quarterly report.pdf" }] }]
  }
});

await grid.ready;
```

| Import | Use it for | Stylesheet |
| --- | --- | --- |
| `@evotecit/canopyx` | Tree grids | `@evotecit/canopyx/styles.css` |
| `@evotecit/canopyx/grid` | Flat data grids | `@evotecit/canopyx/grid.css` |
| `@evotecit/canopyx/reporting` | Data grids with grouping, aggregates and export | `@evotecit/canopyx/reporting.css` |

Already have an HTML table? `CanopyX.enhance("#servers")` turns it into a grid with search, filters, sorting, pages and export, and keeps the table as the fallback ([enhance](docs/enhance.md)). Without a bundler, load `classic.js` and `styles.css` from the package; the script exposes `window.CanopyX`. TypeScript declarations are included, and the package has no runtime dependencies. The [JavaScript guide](https://canopyx.dev/docs/javascript/) covers the rest.

### For email and print

```csharp
using CanopyX.Rendering;

string table = CanopyStaticHtml.RenderGrid(inventory);
```

The result is an HTML table with inline styles and no scripts, ready for a mail body, a print layout or Word. See [email and print](https://canopyx.dev/docs/static-tables/).

## Choose a delivery

| You want | Write | What you get |
| --- | --- | --- |
| One file to attach or archive | `view.SaveHtmlPage("report.html")` | Data and runtime in a single page |
| A big tree or grid on a file share | `view.SaveHtmlBundle("report")` | A folder whose branches and rows load as the reader scrolls |
| Millions of database rows | `CanopyX.Data` + `CanopyX.AspNetCore` | Paging, filters, summaries, export and edits answered by your server |
| A table in an email | `CanopyStaticHtml.Render(view)` | A script-free table that survives mail clients |

More detail, with measured numbers, is in [delivery modes](https://canopyx.dev/docs/delivery/) and [large data](docs/large-data.md).

## Guides by task

| I want to… | Read |
| --- | --- |
| Group, filter, total and export records | [Reporting grids](https://canopyx.dev/docs/reporting/), [grouping](docs/grouping.md), [export formats](docs/authoring.md#export-formats) |
| Let readers edit cells and save through my code | [Editing](docs/editing.md) |
| Colour cells and rows by rule | [Conditional formatting](docs/conditional-formatting.md) |
| Show the same records as a calendar, board or plan | [Calendar](docs/calendar.md), [resource timeline](docs/resource-timeline.md), [board](docs/board.md), [plan](docs/plan.md) |
| Serve a grid from my database | [Server-side data for .NET](docs/remote-dotnet.md), [paging](docs/paging.md) |
| Open one record with all its details | [Record panel](docs/record-panel.md) |
| Filter one view from another | [Linked views](docs/linked-views.md) |
| Compare two snapshots | [Dataset comparison](docs/dataset-compare.md) |
| Build a setup or edit wizard | [Guided flows](docs/flow.md) |
| Translate the controls | [Label packs](docs/labels.md): Polish, German, Spanish, French and Italian are included |
| Add my own cell types, buttons or export formats | [Plugins](docs/plugins.md) |
| Run under a strict Content Security Policy | [Security](docs/security.md) |
| Match my site's colours and density | [Theming](docs/architecture.md#theming) |
| Know what keyboard and screen reader users get | [Accessibility](docs/accessibility.md) |

Everything else: [features](docs/features.md), [recipes](docs/recipes.md), the [authoring reference](docs/authoring.md) and the [canopyx/2 data protocol](docs/data-protocol.md).

## Packages

| Package | What it is |
| --- | --- |
| [`CanopyX.Html`](https://www.nuget.org/packages/CanopyX.Html) | Views, the browser runtime and the HTML writers. Start here. |
| [`CanopyX`](https://www.nuget.org/packages/CanopyX) | The model, bundle writer and script-free renderer, without the browser assets. |
| [`CanopyX.Data`](https://www.nuget.org/packages/CanopyX.Data) | Server-side paging, filters, summaries, export and edits over `IQueryable`. |
| [`CanopyX.AspNetCore`](https://www.nuget.org/packages/CanopyX.AspNetCore) | Minimal-API endpoints for a hosted grid. |
| [`@evotecit/canopyx`](https://www.npmjs.com/package/@evotecit/canopyx) | ES modules, classic scripts, styles and TypeScript types. |

The .NET packages target .NET 8, .NET 10, .NET Standard 2.0 and .NET Framework 4.7.2, and add no third-party runtime dependencies. Generating a report from C# needs no Node.js or build step.

## Community and license

CanopyX is an Evotec project, licensed under MIT. Questions and feedback are welcome in the [Evotec community on Discord](https://evo.yt/discord). Planned work is in [TODO.md](TODO.md), and how changes are tested is in [docs/testing.md](docs/testing.md). More Evotec projects are at [evotec.xyz](https://evotec.xyz/hub).
