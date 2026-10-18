---
title: Getting started with CanopyX
order: 1
description: Install CanopyX, build a file explorer and an inventory table in C#, and render both as script-free tables for email or print.
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

A `CanopyTreeView` holds columns and nodes. The first column shows each node's label; the other columns show the node's cells. Numeric values control sorting while `Text` controls what the reader sees.

{{< cnx-example id="tree" caption="The page this code writes, running here. Expand Archive, sort by Size or Owner, or search for budget." >}}

For a larger tree, write a bundle that loads branches on demand with `files.SaveHtmlBundle("file-report")`. [Delivery modes](/docs/delivery/) shows the files each choice writes.

> **Keep the bundle together.** The generated page, assets and data files belong side by side. The bundle can then be opened directly from disk or a file share.

## Create an inventory table

A `CanopyDataGridView` is a flat list of records. Rows keep their IDs when the reader sorts, so selection and exports refer to the same records whatever the order on screen.

{{< cnx-example id="grid" caption="The inventory page, running here. Search the records, sort by any column, and resize or hide columns from the header." >}}

Grouping, facets, aggregates and cell presenters such as progress bars are covered in [Reporting grids](/docs/reporting/).

## Render a table for email or print

The same two views render as HTML tables with no script and inline styles, ready for an email body, a print layout or a Word document.

{{< cnx-example id="static" caption="Both strings, exactly as the code returns them. They use literal colours, so mail clients show them the same way; this page shows them on white for that reason." >}}

[Email and print](/docs/static-tables/) covers row limits, the overflow link to the full report, the dark palette and tables that follow the page theme.
