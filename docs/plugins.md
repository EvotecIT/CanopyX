# Plugins and Parts

CanopyX grows through two kinds of extension that share one loader:

- **Plugins** are what page and application code writes. A plugin is a plain object with a name, lifecycle hooks and extension points (cell renderers, toolbar items, menu entries, export formats, event handlers). `CanopyX.use(plugin)` registers one for every grid and tree created afterwards; the `plugins` option adds one to a single grid or tree.
- **Parts** are pieces of the runtime itself that load only when a view needs them: the tree tools, the export menu and writers, the filter editor, the history presenters, the pager controls, table enhancement, deep links and the sidecar search. Each is a separate file (`canopyx-<name>.js`, sometimes with a stylesheet) that registers its code with `CanopyX.registerPart`. A plugin can require a part, and later features (editing, grouping, column groups, range selection) arrive as parts.

Both work on every entry point (`canopyx.js`, `canopyx-interactive.js`, `canopyx-grid.js`, `canopyx-reporting.js` and the ES modules). The core of every entry point stays within its size budget because new capability lives in parts.

## Writing a plugin

```js
const unregister = CanopyX.use({
  name: "load-meter",                        // 1–32 lowercase letters, digits and hyphens, starting with a letter
  views: ["grid", "tree"],                   // optional: the view kinds it applies to (both by default)
  requires: ["export"],                      // optional: plugins that start first, or parts that load before init
  cellRenderers: { "load-meter": drawMeter },// columns choose a renderer by name ("renderer": "load-meter")
  toolbarItems: [{ label: "Busiest first", run: ({ api }) => api.sort([{ column: "load", direction: "desc" }]) }],
  menuItems: [{ label: "Clear selection", run: ({ api }) => api.clearSelection() }],
  exportFormats: [markdownFormat],           // the same providers registerExportFormat takes
  events: { select(event, context) { /* canopyx:select on the host */ } },
  init(context) { /* once per grid or tree */ },
  destroy(context) { /* when it is destroyed */ }
});
```

Every member except `name` is optional. `use` validates the plugin and throws for an invalid one or for a name already registered; the disposer it returns removes the registration for grids created later; grids that already exist keep their plugins, but the export formats the plugin registered for the page are removed at once, as `registerExportFormat`'s disposer removes its format. A plugin name cannot be the name of a part. Toolbar items and menu entries are checked when the plugin is registered.

Register page plugins before the views mount: in a script that runs before `DOMContentLoaded` (an inline script in the body, or a deferred script after the runtime), or before calling `createTreeGrid`/`createDataGrid`/`mount`. Fragments marked `data-cx-mount="manual"` mount when the host calls `CanopyX.mount`, so a host can register plugins first.

A plugin for one grid only goes into its options, directly or through `CanopyX.configure(viewId, { plugins: [...] })`. It joins the page plugins and replaces a page plugin with the same name:

```js
CanopyX.createDataGrid(host, { view, plugins: [auditTrail] });
```

## Lifecycle

When a grid or tree is created, its plugins are resolved at once: the page plugins in registration order, then its own, each once, and filtered by `views`. `requires` orders them (a required plugin starts first); a required name that is neither a plugin nor a part of the runtime, or a plugin that requires itself through others, fails the creation with an error naming the plugin.

Cell renderers, toolbar items and menu entries take effect as the grid builds itself, and every plugin's `events` handlers and `destroy` hook are attached as it is created, so no event of the grid is missed. Then, once the grid's API exists, each plugin in order:

1. loads the parts it requires (`requires: ["export"]`), waiting for the tree tools part on a tree, which defines a tree's export part;
2. runs `init(context)` and waits for a returned promise.

The grid's `ready` promise waits for its plugins. A plugin whose part cannot load, or whose `init` throws or rejects, is reported through the grid's `error` event (`canopyx:error`, and `onError` on a flat grid); the grid and its other plugins keep working. Destroying the grid aborts `context.signal`, removes the event subscriptions and runs `destroy(context)`.

The context is frozen and the same object for every hook and handler of a plugin on one grid:

| Field | Meaning |
| --- | --- |
| `api` | The grid's public API, as `createTreeGrid` or `createDataGrid` returns it (also `element.canopyx`). |
| `element` | The host element. |
| `view` | The view document the grid was created from. |
| `kind` | `"tree"` or `"grid"`. |
| `labels` | The texts the grid writes itself, with the view's and the host's translations. |
| `signal` | Aborts when the grid is destroyed. Put listeners, timers and requests on it. |
| `part(name)` | Loads a part of the runtime and resolves once it is installed, for code that needs one only sometimes. |

## Extension points

**Cell renderers.** `cellRenderers` maps a renderer name to a function with the host renderer contract. A column chooses one with its `renderer` field (`CanopyColumn.Renderer` in .NET, `renderer` in the view document, on trees and flat grids). A tree calls `renderer(node, element, context)` and expects `true` when it drew the cell, with `context` `{ column, level, expanded, index }`; a flat grid calls `renderer(row, element, context)` with `context` `{ column, index, signal, onDispose }`. A host's own `renderers` option for the column wins, and a name no plugin registers keeps the built-in painter, so a view can name a renderer a page provides only sometimes. Renderers draw the live view only: exports, print outlines and the static fallback keep the cell text.

**Toolbar items.** `toolbarItems` are buttons `{ label, run }` in the toolbar's left-hand group, after the Columns menu and before Views. `run` receives what the host actions of the more menu receive, plus the API: `{ nodes, signal, api }` on a tree (the selected nodes) and `{ query, signal, api }` on a flat grid. Errors are reported through the grid's `error` event. A tree builds its toolbar with the tree tools part, so its items appear once that part is installed.

**Menu entries.** `menuItems` join the more menu after the host's `actions`, with the same shape and run context. On the reporting runtime a menu entry can disclose content with `render(container, { close, signal })` instead of `run`, as host actions can.

**Export formats.** `exportFormats` takes the providers of [Export formats](data-protocol.md#export-formats). `CanopyX.use` registers them for the page (as `registerExportFormat` does, replacing a format with the same id); a plugin given to one grid offers its formats on that grid only, where they replace a registered format with the same id. The grid's `exportFormats` option and the view's `exportFormats` ids still choose and order what the Export menu shows.

**Events.** `events` maps an event name without the `canopyx:` prefix to a handler `(event, context)`: `select`, `query`, `load`, `toggle`, `filter`, `state`, `error`, `rowActivate`, `link` and the rest that [the protocol](data-protocol.md) lists. The handler receives the DOM event, so it can read `event.detail` and call `preventDefault()` on a cancelable event such as `rowActivate`.

**Editors.** `editors` maps an editor name to `{ create(context) }`. An editable flat-grid column chooses one by name (`"editor": { "type": "stars" }`, `CanopyCellEditor.Custom("stars")` in .NET); a host's `editing.editors` for the grid wins, and a plugin editor replaces a built-in one with the same name. See [Custom editors](editing.md#custom-editors) for the contract.

**Column types.** `columnTypes` is a map a plugin can register today; CanopyX validates that it is an object and keeps it on the plugin. Later features read it.

## Example: a third-party cell renderer

The `plugins.html` and `plugins-tree.html` examples register this plugin before their views mount. The view names the renderer in its column; nothing else in the page changes.

```csharp
grid.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number, Renderer = "load-meter" });
```

```js
function meter(record, element, context) {
  // A flat grid passes the column id, a tree the column; both records carry cells by column id.
  const id = typeof context.column === "string" ? context.column : context.column.id;
  const cell = record.cells[id];
  const value = Math.max(0, Math.min(100, Number(cell !== null && typeof cell === "object" ? cell.value : cell) || 0));
  const wrap = document.createElement("span"), track = document.createElement("span"),
    fill = document.createElement("span"), text = document.createElement("span");
  wrap.className = "load-meter"; track.className = "load-meter-track"; fill.className = "load-meter-fill";
  fill.style.width = value + "%"; text.textContent = value + "%"; track.setAttribute("aria-hidden", "true");
  track.appendChild(fill); wrap.append(track, text); element.appendChild(wrap);
  return true;
}

CanopyX.use({
  name: "load-meter",
  cellRenderers: { "load-meter": meter },
  // A flat grid sorts by a list of column sorts, a tree by one column.
  toolbarItems: [{ label: "Busiest first", run: ({ api }) => api.getSelection ? api.sort([{ column: "load", direction: "desc" }]) : api.sort("load", "desc") }],
  menuItems: [{ label: "Clear selection", run: ({ api }) => api.clearSelection() }],
  events: { select(event, { api }) { /* update a status line */ } }
});
```

Write text with `textContent`, never `innerHTML`, and theme with the runtime's custom properties (`--cx-text`, `--cx-accent`, `--cx-line`) so the renderer follows the light and dark palettes.

In TypeScript the types are `CanopyPlugin`, `CanopyPluginContext`, `CanopyCellRenderer`, `CanopyPluginItem` and `CanopyPluginItemContext` from `@evotecit/canopyx`; `use` and `registerPart` are named exports of the modules and members of `window.CanopyX`.

## Parts

A part is runtime code that loads when a view needs it. The runtime's build manifest names each part it knows with its version and content-hashed file names. When a view first needs a part, the loader:

1. uses the part's code if a script of the same version already registered it (a host that preloads part scripts);
2. otherwise runs the inert payload a single-file page carries (`<script type="application/x-canopyx-<name>" data-cx-version="…">`, and `<name>-style` for the stylesheet), found anywhere in the document;
3. otherwise loads `canopyx-<name>.<hash>.js` (and `.css`) beside a content-hashed runtime, or `canopyx-<name>.js` beside a plainly named one or the ES module;
4. installs the part only when its registered version is the runtime's, after the parts it requires; a failed load can be retried.

| Part | Loads when | Content |
| --- | --- | --- |
| `tree-tools` | a tree mounts | the tree toolbar menus, column fitting, auto height, named views, pins, details and tree captures |
| `export` | an Export menu opens, an export method runs, or a grid copies | the Export menu body, CSV and clipboard text, record enumeration and format writers |
| `filter-editor` | a grid opens a column menu, filter editor, drawer or selected aggregate | grid menus, editors, record drawer, text dialogs |
| `history` | a grid with a status strip or sparkline column starts | the history presenters |
| `pager` | a paged grid whose view has pager settings starts, or `CanopyX.enhance`/`CanopyX.grid` runs | numbered pages, page-size choices and the result sentence ([paging.md](paging.md)) |
| `enhance` | `CanopyX.enhance` or `CanopyX.grid` runs | reading tables, records and URL sources into a grid, state saving and the controller ([enhance.md](enhance.md)); it loads the pager part itself |
| `links` | a tree with `deepLink` is created | deep links in the default scheme or the host's own |
| `search` | a sidecar source answers its first query | the bundle's search index reader |
| `editing` | a grid with an editable column starts, or an editing method runs | typed editors, validation, the change set, row and batch commit, undo and redo, the phone edit form ([editing.md](editing.md)); it requires the filter editor |
| `formatting` | a grid with `formatRules` or `formatting` starts, or a formatting API method runs | rule evaluation, painting, the legend, saved-view rules and export record formats ([conditional formatting](conditional-formatting.md)) |
| `format-editor` | the rule editor opens | the rule editor, on the filter editor part's condition rows |

A part script registers itself whether it runs before or after the runtime: it pushes `[name, definition]` onto `window.CanopyXParts`, which the runtime drains and then turns into a direct call of `CanopyX.registerPart(name, definition)`. The definition is `{ version, requires?, install(context) }`; `install` receives the runtime's internals that the part declared, so parts are built with the runtime, not separately.

### Serving parts

C# hosts need nothing new. `CanopyHtmlAssets.WriteTo` writes every part an entry point knows beside it, `SaveHtmlBundle` does the same, and fragments written with inline assets carry the payloads of the parts their view needs, once per `CanopyHtmlDocument`. Parts are handled generically:

- `CanopyHtmlAssets.Parts`, `GetPart(name)` and `GetParts(runtime)` list them as `CanopyHtmlPart` objects with `Script`, `Style`, `Version`, the plain and content-hashed file names and `Markup`.
- `CanopyHtmlAssets.GetRequiredParts(view)` names the parts a tree or flat grid loads, for a host that assembles single-file pages itself; `CanopyHtmlDocument.EmbedOnce(part)` returns a part's markup the first time a document asks for it.

JavaScript hosts serve the `canopyx-*.js` and `canopyx-*.css` part files of the package beside the runtime or module they load, or include the markup of the parts they need once in the page.

### Adding a part

A part is a listing in `Build/parts.json`; the assembly, the runtimes' manifests, the .NET writers and embedding pick it up from there:

```json
{
  "name": "grouping",
  "label": "row grouping",
  "runtimes": ["grid"],
  "views": ["grid"],
  "key": "DataGrid.prototype",
  "context": ["DataGrid", "h", "setText", "gridButton"],
  "requires": ["filter-editor"],
  "scripts": ["CanopyX.Html/Assets/canopyx.grouping.source"],
  "styles": ["CanopyX.Html/Assets/canopyx.grouping.source/grouping.css"]
}
```

| Field | Meaning |
| --- | --- |
| `name`, `label` | The part's name (file `canopyx-<name>.js`, payload type `application/x-canopyx-<name>`) and the words its errors use. |
| `runtimes` | `tree` (the two tree entry points) and/or `grid` (the two grid entry points): which manifests name the part and beside which entry points `WriteTo` writes it. |
| `views` | Which views' single-file fragments carry its payload. `sources` (tree source kinds), `presenters` (grid presenter kinds), `deepLink` and `editable` (grids with an editable column) narrow that further. |
| `key`, `context` | The object that marks the part as installed for one runtime context, and the names `install` destructures from the context the runtime hands it. |
| `start`, `end` | Optional statements before and after the part's scripts inside `install`. |
| `feature` | Optional: the view feature that makes a grid's single-file fragments carry the part (`formatting`: rules or options; `formatEditor`: the editor option). |
| `requires` | Parts that load and install first. The assembly refuses a name that is not a part of every entry point and view this part has, and requires that form a cycle. |
| `scripts`, `shared` | Source files or folders in order. Entry points leave out every script a part lists, unless the part also lists it under `shared` (the tree tools share the toolbar panels with the grid entry points). |
| `styles`, `styleScope` | Stylesheets in order, and an optional selector rename for this copy. |

Then, in the runtime, define the part for its view kind with the same context and load it where the view needs it:

```js
const GROUPING = definePart(DataGrid, "grouping", "row grouping", () => ({ DataGrid, h, setText, gridButton }));
DataGrid.prototype.groupBy = function (...args) { return loadPart(GROUPING).then(() => this.groupBy(...args)); };
```

`Build/Sync-Assets.ps1` assembles the part, writes its registration and version, adds it to the manifests, and writes `canopyx-parts.json`, which `CanopyHtmlAssets.Parts` reads. Add the files to the npm package's `exports` beside the other parts, keep the part under a gzip guard test like the others, and test the loading paths (payload, plain file, hashed file, module) as the existing parts do.
