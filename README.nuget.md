# CanopyX - Large Interactive Data Views for .NET

CanopyX renders large interactive data views from .NET without runtime dependencies. The first view is a virtualized tree grid with lazy children loaded in pages, search that expands to any node, detail rows, multi-select, and ARIA tree grid semantics with a row-focus keyboard model. Pages work as a single file, as a bundle opened from a file share, or against an HTTP endpoint.

## Install

```powershell
dotnet add package CanopyX.Html
```

Both packages target `net472`, `netstandard2.0`, `net8.0`, and `net10.0`.

| Package | Purpose |
| --- | --- |
| `CanopyX` | View definitions, the `canopyx/1` data protocol, the bundle writer, and the static fallback renderer. No runtime dependencies. |
| `CanopyX.Html` | The browser runtime (tree grid, data sources, theme CSS) and the API that writes pages, fragments, bundles, and asset files. |

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

## Links

- Repository: https://github.com/EvotecIT/CanopyX
- Issues: https://github.com/EvotecIT/CanopyX/issues
