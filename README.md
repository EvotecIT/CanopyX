# CanopyX

CanopyX renders large interactive data views from .NET without runtime dependencies. The first view is a virtualized tree grid: a tree with columns, lazy children loaded in pages, search that expands to any node, detail rows, and ARIA tree grid semantics with a row-focus keyboard model. A data grid and a 2D matrix view are planned (see [TODO.md](TODO.md)).

CanopyX is generic. Hosts supply the data, including rollup counts, badges, and flags; CanopyX knows nothing about the products that use it.


![A CanopyX tree grid in the light theme: file shares with sizes, dates, owners, badges, and a version's before and after table open as a detail row](docs/images/tree-grid-light.png)

The same view in the dark theme, and the static outline that email, print, and Word get:

| Dark theme | Static outline |
| --- | --- |
| ![The tree grid in the dark theme](docs/images/tree-grid-dark.png) | ![The script-free outline table](docs/images/static-outline.png) |

The images come from the pages `CanopyX.Examples` generates; `tests/browser/tools/screenshots.mjs` refreshes them.

## Packages

| Package | Purpose |
| --- | --- |
| `CanopyX` | View definitions, the `canopyx/1` data protocol, the bundle writer, and the static fallback renderer. No runtime dependencies. |
| `CanopyX.Html` | The browser runtime (tree grid, data sources, theme CSS) and the API that writes pages, fragments, bundles, and asset files. |

Both packages target `net472`, `netstandard2.0`, `net8.0`, and `net10.0`.

## Tree Grid Features

- Lazy children from inline data, sidecar script files, or an HTTP endpoint, with long child lists paged behind a "show more" row.
- Virtual scrolling over a fixed row height; only the rows near the viewport exist in the DOM.
- Columns with per-level sort, resize, and hide; dates in UTC or the reader's time zone, switchable at run time.
- Search that returns id paths and expands the tree to the match; the bundle writer stores every node once and files its words in shards by prefix, so a query loads only the shards of its words and the entries of the matches it shows.
- "Only matching" filters that keep the ancestors of matching rows.
- Cells with host-supplied values, display text, tones, and badges; icons declared once per view.
- Detail rows that hold a table, a property list, or host HTML: as tall as their content (measured in the browser) or a fixed number of row slots, and always inside the visible width of the grid.
- Single and multi-select, selection events for a drawer, deep links that expand a path, and expansion state remembered for the session.
- Light and dark themes from a handful of CSS custom properties.
- A script-free outline table for email, print, and Word.

## Quick Start

Build a view, add nodes, and save a single-file page:

```csharp
using CanopyX;
using CanopyX.Html;

var view = new CanopyView("files", "File shares");
view.Columns.Add(new CanopyColumn("name", "Name") { Width = 320, Sortable = true });
view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
view.Columns.Add(new CanopyColumn("owner", "Owner"));

var projects = new CanopyNode("projects", @"\\files\projects");
projects.Cells["size"] = 5_368_709_120;
projects.Cells["owner"] = "Engineering";

var plans = new CanopyNode("projects/plans", "plans");
plans.Cells["size"] = 1_048_576;
plans.Badges.Add(new CanopyBadge("stale", CanopyTone.Warning));
projects.Children.Add(plans);

view.Roots.Add(projects);
view.SaveHtmlPage("files.html");
```

The first column shows each node's label; the other columns show the node's cells by column id.

For large trees, write a bundle instead. The data is split into sidecar files that the page loads on demand, and the page works when opened straight from a file share. Small child lists share pack files, so a tree with hundreds of thousands of rows is a few thousand files:

```csharp
CanopyBundleResult bundle = view.SaveHtmlBundle("report");
Console.WriteLine($"{bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files ({bundle.PackCount:N0} packs), largest {bundle.LargestFileBytes:N0} bytes");
```

When the tree is too large to build in memory, hand the writer the nodes while it walks the tree. It asks for the children of each node once, depth first, and releases a node when its subtree is written:

```csharp
var view = new CanopyView("files", "File shares");   // columns as above, no roots
CanopyBundleResult bundle = view.SaveHtmlBundle("report", ReadShares(), node => ReadChildren(node.Id));
```

`ReadShares` and `ReadChildren` are the host's own queries and return `IEnumerable<CanopyNode>`; an empty or null result makes the node a leaf. A node that already carries inline `Children` is written as it is.

Local external assets in an HTML bundle use a separate directory tree from its sidecar data. Bundle folders cannot occupy `index.html` or a runtime asset file path. Local asset folders use portable names without internal `.` or `..` segments; a leading `./` is allowed. These layout checks run before any bundle files are written. URLs outside the bundle remain host-served.

For email, print, or Word, render the static outline:

```csharp
using CanopyX.Rendering;

string outline = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { MaxRows = 500 });
```

JavaScript hosts can create a tree grid directly from a view document:

```js
const grid = CanopyX.createTreeGrid(document.getElementById("files"), {
  view,
  // The host draws the columns it names and returns true; every other column keeps the default painting.
  renderers: { owner: (node, element, context) => drawOwnerChip(node, element) },
  onSelect: (node) => showDrawer(node)
});
await grid.expandPath(["projects", "projects/plans"]);
// Pass { signal: controller.signal } to cancel navigation before selection and focus.
```

A renderer gets the node, the element to fill, and `{ column, level, expanded, index }`. Name only the columns the host really draws: their cells are rebuilt whenever a row is painted, while the other columns reuse theirs, which is what keeps scrolling smooth on slow machines.

Repeated creation on a live host returns its existing grid. Call `grid.destroy()` before creating a replacement. A caller-held retired API retains its view metadata; the host no longer exposes the destroyed grid.

Bundle folder and asset constraints are described in the [data protocol](docs/data-protocol.md#sidecar).

## Documentation

- [Architecture](docs/architecture.md): packages, delivery modes, the runtime's structure, rendering model, accessibility contract, theming, and performance budgets.
- [Data protocol](docs/data-protocol.md): the `canopyx/1` documents, bundle file layout, and remote endpoints, with a JSON schema in `docs/schema`.
- [Roadmap](TODO.md): milestones, their consumers, and their gates.
- [Contributing](CONTRIBUTING.md): the quality loop, browser tests, and performance evidence.

## License

CanopyX is licensed under the [MIT License](LICENSE).
