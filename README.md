# CanopyX

CanopyX renders large interactive data views from .NET without runtime dependencies. The first view is a virtualized tree grid: a tree with columns, lazy children loaded in pages, search that expands to any node, detail rows, and ARIA tree grid semantics with a row-focus keyboard model and cell navigation for rows whose cells hold controls. A data grid and a 2D matrix view are planned (see [TODO.md](TODO.md)).

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

### Building Against Local Source

A released consumer references the packages. A consumer that needs work that is not released yet (a bridge, a host under development) builds against a checkout of this repository instead:

- Reference `CanopyX.Html/CanopyX.Html.csproj` with a `ProjectReference`; it brings `CanopyX/CanopyX.csproj` with it. A consumer that needs only the model, the bundle writer, and the static outline references `CanopyX/CanopyX.csproj` alone. These two projects are the whole product: `Build/project.build.json` names them in `ExpectedVersionMap` and excludes the examples and test projects, which a consumer never builds.
- Check out the whole repository, not one project folder. `CanopyX.Html` compiles three shared files from `CanopyX/Bundles`, and both projects take their version from `Directory.Build.props` in the repository root.
- The build needs the .NET 10 SDK, because both projects also target `net10.0`. Nothing else has to run before the consumer's build: the runtime a consumer embeds, `CanopyX.Html/Assets/canopyx.js`, is checked in assembled, and there is no npm step. (`Build/Sync-Assets.ps1` reassembles it for someone who edits CanopyX itself.)
- Keep the project reference behind a switch that names the checkout, and the package reference for every other build. A root that is set but wrong fails the build instead of silently taking the package:

```xml
<!-- dotnet build -p:CanopyXRoot=C:\Source\CanopyX -->
<ItemGroup Condition="'$(CanopyXRoot)' != ''">
  <ProjectReference Include="$(CanopyXRoot)\CanopyX.Html\CanopyX.Html.csproj" />
</ItemGroup>
<ItemGroup Condition="'$(CanopyXRoot)' == ''">
  <PackageReference Include="CanopyX.Html" Version="0.1.0" />
</ItemGroup>
<Target Name="CheckCanopyXRoot" BeforeTargets="CollectPackageReferences;ResolveProjectReferences" Condition="'$(CanopyXRoot)' != ''">
  <Error Condition="!Exists('$(CanopyXRoot)\CanopyX.Html\CanopyX.Html.csproj')" Text="CanopyXRoot ('$(CanopyXRoot)') does not contain CanopyX.Html\CanopyX.Html.csproj." />
</Target>
```

The package reference restores once that version is published. Until then, and for any API newer than the published package, the checkout is the only source: the version number does not change between releases, so a consumer built against the checkout must not be run against an older published package of the same version.

A consumer with a solution or build list of its own adds the two CanopyX projects to it; otherwise the project reference builds them implicitly. The runtime and the data it reads must come from the same build: pages reference the runtime by a name that carries its content hash, and a consumer that serves it under the plain name `canopyx.js` instead republishes every page and its data whenever it rebuilds against a newer checkout ([Assets and Caching](docs/architecture.md#assets-and-caching)).

## Tree Grid Features

- Lazy children from inline data, sidecar script files, or an HTTP endpoint, with long child lists paged behind a "show more" row.
- Virtual scrolling over a fixed row height; only the rows near the viewport exist in the DOM.
- Columns with per-level sort, resize, and hide, and a tree column that can stay pinned while the others scroll; dates in UTC or the reader's time zone, switchable at run time.
- Search that returns id paths and expands the tree to the match, optionally limited to the node kinds worth finding; the bundle writer stores every node once and files its words in shards by prefix, so a query loads only the shards of its words and the entries of the matches it shows.
- "Only matching" filters that keep the ancestors of matching rows.
- Cells with host-supplied values, display text, tones, and badges; icons declared once per view. Six tones are built in, and a host adds its own (a severity scale, a maintenance state) with a name and two theme colours.
- Detail rows that hold a table, a property list, or host HTML: as tall as their content (measured in the browser) or a fixed number of row slots, and always inside the visible width of the grid.
- Single and multi-select, selection events for a drawer, deep links that expand a path (in the default scheme or the host's own), and expansion state remembered for the session.
- Light and dark themes from a handful of CSS custom properties.
- Every text CanopyX writes itself (search hints, "show more" and error rows, the column chooser, screen-reader announcements, date marks, the outline's notes) comes from `CanopyView.Labels`: English by default, translated once per view.
- A script-free outline table for email, print, and Word, in the light or dark palette or the host's own colours.

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

For large trees, write a bundle instead. The data is split into sidecar files that the page loads on demand, and the page works when opened straight from a file share. Small child lists share pack files, so a tree with hundreds of thousands of rows is a few thousand files. The page references the runtime under a name that carries its content hash (`assets/canopyx.<hash>.js`), so it always loads the runtime it was written for and the file can be cached for good; publish the page and its data folder together:

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

The outline is light by default. `Theme = CanopyStaticTheme.Dark()` writes the dark palette, a host sets the colours of its own design tokens on the theme, and `UseThemeVariables` lets an outline inside a page follow that page's theme without script ([Theming the Outline](docs/architecture.md#theming-the-outline)).

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

A renderer that draws badges or chips uses `CanopyX.badge({ text, tone, title })`, which returns the badge element the grid itself draws (the `cx-badge` class, the classes of a named tone, and for a host tone its `--cx-tone-<name>` colours), so a host cell matches the cells CanopyX paints:

```js
renderers: { finding: (node, element) => {
  if (!node.data || !node.data.severity) return false;
  element.append(CanopyX.badge({ text: node.data.severity, tone: node.data.severity.toLowerCase() }), " " + node.label);
  return true;
} }
```

A renderer gets the node, a fresh element to fill, and `{ column, level, expanded, index }`. Name only the columns the host really draws: a cell the renderer draws (returns true) or decorates is rebuilt whenever its row is painted, while the other columns, and the rows where the renderer returns false without adding children or attributes to the element (which is then dropped, so put listeners on content you add, or on the grid), reuse their cells, which is what keeps scrolling smooth on slow machines.

A page that embeds a fragment from `ToHtmlFragment` hands it the same options before the runtime mounts it, from a script that runs before the page has loaded:

```js
CanopyX.configure("files", { renderers: { owner: drawOwnerChip }, onSelect: showDrawer });
```

With `CanopyHtmlOptions.AutoMount = false` the fragment waits until the host calls `CanopyX.mount()`.

Repeated creation on a live host returns its existing grid. Call `grid.destroy()` before creating a replacement. A caller-held retired API retains its view metadata; the host no longer exposes the destroyed grid.

Bundle folder and asset constraints are described in the [data protocol](docs/data-protocol.md#sidecar).

## Documentation

- [Architecture](docs/architecture.md): packages, delivery modes, the runtime's structure, rendering model, accessibility contract, theming, and performance budgets.
- [Data protocol](docs/data-protocol.md): the `canopyx/1` documents, bundle file layout, and remote endpoints, with a JSON schema in `docs/schema`.
- [Roadmap](TODO.md): milestones, their consumers, and their gates.
- [Contributing](CONTRIBUTING.md): the quality loop, browser tests, and performance evidence.

## License

CanopyX is licensed under the [MIT License](LICENSE).
