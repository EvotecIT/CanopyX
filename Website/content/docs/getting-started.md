---
title: Getting started with CanopyX
order: 0
description: Install CanopyX, build a file explorer and an inventory table in C#, and render a static table for email or print.
layout: docs
---

## Install

```shell
dotnet add package CanopyX.Html
```

`CanopyX.Html` includes the browser assets and brings in `CanopyX` for the view definitions. Install `CanopyX` alone when you only need the model, the tree bundle writer or the script-free table renderer.

| Target | Support |
| --- | --- |
| .NET 8 and .NET 10 | Windows, Linux and macOS |
| .NET Standard 2.0 | Compatible .NET applications |
| .NET Framework 4.7.2 | Windows |

Neither .NET package adds third-party runtime dependencies. Generating a report from C# needs no Node.js, npm or JavaScript build step.

## Create a file explorer

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

For a larger tree, write a bundle that loads branches on demand with `files.SaveHtmlBundle("file-report")`.

> **Keep the bundle together.** The generated page, assets and data files belong side by side. The bundle can then be opened directly from disk or a file share.

## Create an inventory table

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

## Render a table for email or print

```csharp
using CanopyX.Rendering;

string treeTable = CanopyStaticHtml.Render(files);
string inventoryTable = CanopyStaticHtml.RenderGrid(inventory);
```

These methods return HTML tables with no scripts. Insert the returned HTML into your email, print layout or document-generation workflow.