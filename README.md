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
| `CanopyX` | View definitions, the `canopyx/2` data protocol, the bundle writer, and the static fallback renderer. No runtime dependencies. |
| `CanopyX.Html` | The browser runtime (tree grid, data sources, theme CSS) and the API that writes pages, fragments, bundles, and asset files. |

Both packages target `net472`, `netstandard2.0`, `net8.0`, and `net10.0`.

### JavaScript Hosts

The optional `@evotecit/canopyx` package contains the complete interactive runtime, CSS, and TypeScript declarations. It has no runtime dependencies. The module and classic scripts are assembled from the same JavaScript source; .NET consumers keep their existing build with no JavaScript compiler or bundler.

```javascript
import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Files",
    rowHeight: 28, pageSize: 100, selection: "single",
    columns: [{ id: "name", title: "Name", kind: "text", width: 320 }],
    source: { kind: "inline" }, roots: [{ id: "plans", label: "Plans" }]
  }
});
await grid.ready;
```

The CSS import above uses the host's existing asset pipeline. A host without a bundler serves the exported stylesheet through a `<link>` and imports `CanopyX.Html/Assets/canopyx-module.mjs` from a module script. `classic.js` and `core.js` export the complete interactive and smaller readonly scripts as assets; their matching styles are `styles.css` and `core.css`. Classic scripts expose `window.CanopyX`.

Module imports are safe during server rendering and leave the server's globals unchanged. Mounting, configuration, and DOM helpers run in the browser. On a page that mixes module and classic hosts, load the module or complete interactive script first; an already-loaded core script cannot be upgraded to support interaction methods. The module rejects that loading order explicitly. Include one matching runtime and stylesheet for the page.

Build the local JavaScript archive with `npm pack --ignore-scripts --pack-destination <output-directory>` at the repository root, then install that tarball in a host. This packs the checked-in assets and declarations; it performs no compilation. Reassemble assets with `Build/Sync-Assets.ps1` after editing their canonical source. The browser quality loop packs and installs an isolated consumer, checks its types, and verifies server imports and browser module behavior.

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
- Virtual scrolling over a fixed row height; only the rows near the viewport exist in the DOM. Large logical heights map to a bounded native scrollbar, keeping every loaded row reachable through scrolling, keyboard navigation, and saved anchors.
- Columns with per-level sort, resize, and hide, and a tree column that can stay pinned while the others scroll; dates in UTC or the reader's time zone, switchable at run time.
- Search that returns id paths and expands the tree to the match, optionally limited to the node kinds worth finding; the bundle writer stores every node once and files its words in shards by prefix, so a query loads only the shards of its words and the entries of the matches it shows.
- "Only matching" filters that keep the ancestors of matching rows.
- Cells with host-supplied values, display text, tones, and badges; icons declared once per view. Six tones are built in, and a host adds its own (a severity scale, a maintenance state) with a name and two theme colours.
- Detail rows that hold a table, a property list, or host HTML: as tall as their content (measured in the browser) or a fixed number of row slots, and always inside the visible width of the grid.
- Single and multi-select, selection events for a drawer, deep links that expand a path (in the default scheme or the host's own), and versioned view state remembered for the session.
- Light and dark themes from a handful of CSS custom properties.
- Every text CanopyX writes itself (search hints, "show more" and error rows, the column chooser, screen-reader announcements, date marks, the outline's notes) comes from `CanopyView.Labels`: English by default, translated once per view.
- A script-free outline table for email, print, and Word, in the light or dark palette or the host's own colours.

JavaScript hosts can save a view with `const state = api.getState()` and restore it with `await api.setState(state)`. The JSON snapshot includes columns, sort, declared filters, selection, expansion, timezone, focus, and a scroll anchor. Existing expansion-only snapshots remain readable. `stateKey` remembers the same settings in session storage. Host predicates and callbacks stay with the host and are not serialized.

Use `await api.reload()` to reread roots, or `await api.reload(parentId, { signal })` to reread a loaded parent's children. Reload reads through the range already loaded, validates the replacement before applying it, and preserves surviving selection, expansion, focus, and scroll position. A newer reload supersedes an older one. Failed validation retains the old data; cancellation returns `false`. `api.refresh()` repaints the current nodes, and `api.refreshCounts()` updates rollup values and child counts.

The generated `live-records.html` example replaces an inline snapshot and provides save and restore controls for the view. An inline host can assign a new array to `api.view.roots` and then call `await api.reload()`; stable node IDs retain the reader's selection and open branches.

The generated `long-document.html` example loads 20,000 tall sections and provides jumps and saved positions across their full range. The height mapping preserves each section's size; it does not load additional pages or bound the memory of rows the host has already supplied.

Sorting an inline list orders its complete sibling array before choosing the loaded page. Selected and expanded identities remain available when they move outside that prefix. `retainedNodeLimit` is a JavaScript host option, defaulting to 1,024 nodes, that bounds unpinned wrappers retained after inline reordering. Selection, expansion, focus, anchors, and pending operations pin their subtrees. The host's inline arrays remain unchanged. For remote and sidecar lists this API orders loaded siblings; ordering the complete dataset remains the host's responsibility.

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
// Pass { signal: controller.signal } to cancel navigation promptly, even while a page is still loading.
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
const releaseOptions = CanopyX.configure("files", { renderers: { owner: drawOwnerChip }, onSelect: showDrawer });
// When the host retires this view, destroy its grid and call releaseOptions().
```

With `CanopyHtmlOptions.AutoMount = false` the fragment waits until the host calls `CanopyX.mount()`.

Repeated creation on a live host returns its existing grid. Call `grid.destroy()` before creating a replacement. Destruction releases loaded rows, selection, caches, and the row pool. A caller-held retired API retains its view metadata; the host no longer exposes the destroyed grid.

Registered fragment options persist for remounting until their disposer is called or `CanopyX.unconfigure(viewId)` removes them. Removing a registration leaves a mounted grid intact, and an older disposer cannot remove a newer registration.

Built-in remote requests have a 30-second deadline, including reading the response body. Set `requestTimeoutMs` in grid options to change it; destroying the grid cancels its built-in requests. A separately owned source created with `CanopyX.sources.remote(view, { timeoutMs, signal })` follows its owner's signal, and `page(node, cursor, { signal })`, `search(query, limit, { signal })`, and `counts(ids, { signal })` accept individual request signals. Cancelling navigation releases that caller without cancelling a shared page load. Custom sources own their transport cancellation and deadlines.

Selection is independent of focus. `grid.setSelection(["projects", "archive"])` replaces the selection with loaded node ids, `grid.clearSelection()` clears it, and `grid.selectAll({ scope: "visible" })` selects eligible rows in the current expanded/filtered view. The alternative `scope: "loaded"` includes loaded collapsed descendants. Select-all requires multiple selection and never fetches unloaded data; invalid ids and single-selection overflow leave the existing selection intact. Call `expandPath` to load an id before selecting it directly.

Hosts can pass `isSelectable(node)` to keep rows focusable while preventing selection additions, and `beforeSelect(node, nodes, { previous, reason })` to synchronously veto a whole proposal by returning false. The cancelable `canopyx:beforeselect` event offers the same veto. Reasons are `row`, `range`, `api`, `clear`, or `all`. Selection methods return whether their proposal was accepted. A successful clear emits `canopyx:select` and calls `onSelect` with `null` and an empty array; hosts that handle clearing should account for that nullable node. Removal of data reconciles selection directly and cannot be vetoed.

Bundle folder and asset constraints are described in the [data protocol](docs/data-protocol.md#sidecar).

Collapsed branches retain up to 4,096 loaded descendants by default (`inactiveNodeLimit`); unpinned older data is evicted and loaded again when needed. Selection, focus, expansion, state restoration, active requests, and local filters keep their required data. `retainedNodeLimit` separately bounds identities kept outside an inline page after sorting. Both are nonnegative integer host options; pins and host input arrays can exceed these retention limits. The [architecture reference](docs/architecture.md#rendering-model) describes their ownership and the sidecar pack limits.

## Checking Lazy Branches

Checkboxes are independent of row selection. A hierarchical check applies to a complete branch, including children that have not loaded; a deeper rule creates an exception. Checking does not fetch children or perform a host operation.

```csharp
view.Checkboxes = CanopyCheckboxMode.Hierarchical;
view.CheckIntents.Add(new CanopyCheckIntent(new[] { "project-a" }, true));
view.CheckIntents.Add(new CanopyCheckIntent(new[] { "project-a", "task-1" }, false));
```

`CanopyCheckboxMode.Independent` checks individual nodes. Page and bundle writers choose the interactive runtime automatically for checkbox views. For a page assembled from fragments, include `CanopyHtmlAssets.GetScript(CanopyRuntime.InteractiveTreeGrid)` and its matching `GetStyle` once. The interactive entry point includes the standard tree runtime; use one entry point per page.

In the browser, `api.setChecked(id, checked)` changes a loaded node. `api.setCheckIntents([{ path, checked }])` replaces the complete intent without loading paths. `getCheckState(id)` returns `true`, `false`, `"mixed"`, or `null` for an unavailable node; `getCheckIntents()` returns a copied snapshot suitable for the host to interpret. A complete loaded sibling set can combine into one branch rule; partial pages preserve exceptions without claiming unseen siblings. Rules survive sorting, reload, and cache eviction. Saved views include them, and both outline renderers show readonly check states.

Space checks the focused row; Control+Space or Command+Space keeps row selection. F2 enters the native checkbox. `isCheckable(node)` disables direct changes to a node's control. It does not restrict an ancestor's branch intent: the host evaluates its own eligibility and authorization when interpreting that intent. `beforeCheck(node, intents, { previous, reason })` and the cancelable `canopyx:beforecheck` event can veto a complete proposal, including saved-state restoration. Vetoes return synchronously. `onCheck` and `canopyx:check` report accepted changes. Checking controls pause while a saved view restores.

The generated `checkboxes.html` example demonstrates lazy branches, paging, exceptions, keyboard controls, and saved choices.

## Host Actions, Editing, and Moving Nodes

The interactive runtime presents operations to hooks supplied by the host. It sends immutable IDs, complete paths, and proposed values; the host validates authorization and executes the operation against its own data.

```csharp
view.Columns[0].Editable = true;
view.DragDrop = true;
view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect record"));
```

Page and bundle writers choose the interactive assets automatically. Fragment hosts include the interactive script and matching stylesheet once. Configure hooks before mounting:

```js
CanopyX.configure("records", {
  canEdit: (node, column) => node.kind === "task",
  canDrag: node => node.kind === "task",
  onEdit: async (proposal, request) => {
    // The host validates the path, column, value, and current authorization.
    return await records.acceptEdit(proposal, request.signal);
  },
  onDrop: (proposal, request) => records.acceptMove(proposal, request.signal),
  onAction: (proposal, request) => records.runAction(proposal, request.signal)
});
```

Hooks return `true` for acceptance or `false` for rejection, directly or through a promise. Exceptions report failure. Each request supplies an abort signal, its reason, and the current remote query and dataset revision when applicable. The default deadline is 30 seconds; `interactionTimeoutMs` sets a positive deadline. Cancellation, a newer proposal, destruction, or replacement of affected data retires pending work. Hosts observe cancellation before committing their own writes.

Alt+Enter opens an editor for an editable cell; F2 retains cell navigation. Right-click, the Menu key, or Shift+F10 opens actions. The menu provides move destinations, including before and after a node. Control+Shift+X marks a node or its selected group for moving; Control+Shift+V proposes moving into the destination. Native internal drag offers the same placements. A missing hook makes its operation unavailable. `canEdit`, `canDrag`, `canDrop`, and `isActionEnabled` provide synchronous eligibility; the host still enforces authorization.

The API exposes `beginEdit(nodeId, columnId)`, `openActions(nodeId)`, `requestEdit(nodeId, columnId, value)`, `requestDrop(nodeIds, targetId, placement)`, `requestAction(nodeId, actionId)`, and `cancelInteraction()`. Request methods resolve to an acceptance boolean and accept an optional `{ signal, reason }` argument. Edit values are finite JSON scalars. A drop uses loaded nodes, excludes nested sources when their ancestor is also moved, and rejects a destination within the source subtree. An API drop into the root uses `null` with `"inside"`.

Cancelable `canopyx:beforeedit`, `canopyx:beforedrop`, and `canopyx:beforeaction` events can veto a proposal before execution. `canopyx:edit`, `canopyx:drop`, and `canopyx:action` report `{ proposal, accepted, reason }`. After acceptance, the host supplies fresh data through `applyCounts` or `reload`; return from the hook before refreshing affected data so the operation can report its accepted result. The `interactions.html` example demonstrates this flow, host rejection, and keyboard controls. Translations for these controls are properties of `CanopyLabels`.

## Documentation

For hosted data, `CanopySource.RemoteQuery` lets endpoints sort and filter the complete dataset before paging. Every supplied endpoint receives `{viewQuery}` and returns its dataset revision. In the browser, `await grid.sort("value", "desc")` or `await grid.setActiveFilters(["flagged"])` stages a replacement while accepted rows remain visible. Failed queries keep the old view, and stale pages cannot mix revisions. The [remote query contract](docs/data-protocol.md#queries-before-remote-paging) describes request fields, events, cancellation, and selection semantics; `query-records.html` demonstrates the host source.

- [Architecture](docs/architecture.md): packages, delivery modes, the runtime's structure, rendering model, accessibility contract, theming, and performance budgets.
- [Data protocol](docs/data-protocol.md): the `canopyx/2` documents, bundle file layout, and remote endpoints, with a JSON schema in `docs/schema`.
- [Roadmap](TODO.md): milestones, their consumers, and their gates.
- [Contributing](CONTRIBUTING.md): the quality loop, browser tests, and performance evidence.

## License

CanopyX is licensed under the [MIT License](LICENSE).
