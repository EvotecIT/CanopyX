# CanopyX Architecture

CanopyX turns host data into large interactive views that stay fast at hundreds of thousands of rows and still work when opened from a file share. This document describes how the pieces fit together. The wire format is specified separately in [data-protocol.md](data-protocol.md).

## Packages

| Package | Owns | Depends on |
| --- | --- | --- |
| `CanopyX` | View definition model, `canopyx/2` protocol documents and their JSON writer, bundle writer, static fallback renderer | nothing at runtime |
| `CanopyX.Html` | Browser runtime assets (tree grid engine, public API, data sources, theme CSS) as embedded resources, and the C# API that emits a page fragment, a full page, or the asset files | `CanopyX` |

Hosts own everything product-specific. A host maps its records into `CanopyNode` objects, computes rollups and flags, and decides the delivery mode. HtmlForgeX will host CanopyX through its own `HtmlForgeX.CanopyX` bridge; TestimoX and other products either use that bridge or call `CanopyX.Html` directly.

## Data Flow

1. The host builds a `CanopyTreeView`: columns, row height, page size, selection mode, search and filter declarations, icons, and a data source declaration.
2. The host builds the tree as `CanopyNode` objects. Each node has an id, a label, optional cells keyed by column id, badges, flags, and either inline children or a lazy-load declaration (`hasChildren`, `childCount`, `ref`).
3. The host picks a delivery mode:
   - **Single file**: the nodes travel inside the view as inline data. Best for small and medium trees.
   - **Bundle**: `CanopyBundleWriter` splits the tree into sidecar script files: the top level in pages, the children pages of all other nodes packed together into pack files, and a search index that holds every node once next to word shards that refer to it, itself packed into shared files. The page loads them on demand, including from `file://`, where `fetch` of local files is blocked. Packing keeps the file count in the thousands for a tree with hundreds of thousands of rows, so a bundle stays practical to copy and upload. The writer takes the tree complete from the view's roots, or node by node from the host while it walks the tree (`Write(view, directory, roots, children)`), in which case it holds only the rows of the lists on the path it is on, one id per node, the words of the search index, the search entries of the top-level node it is in until that node is finished (an entry names the files of the pages on its path, which are known once each list is complete; for a tree with one top-level node that is the whole entry table), and, for an index it packs, the serialized shards until it writes them at the end.
   - **Hosted**: the page asks an HTTP endpoint for the same documents.
4. `CanopyX.Html` renders the fragment: a host element and the view as a JSON configuration script. Assets are inlined or referenced as files named by their content hash (see [Assets and Caching](#assets-and-caching)).
5. The runtime finds every `[data-canopyx-host]` element, reads its configuration, creates the data source, and mounts a tree grid.

Every document on the wire carries `"protocol": "canopyx/2"`. The runtime rejects documents with another protocol value instead of guessing.

## Assets and Caching

Grids in hidden tabs, accordions and closed details load their data but defer row rendering while their viewport
has zero size. ResizeObserver applies layout at the first nonzero size and after resizing. Hosts do not need to
call refresh when opening a panel. Hidden state restoration retains the requested logical scroll position until
the viewport is measurable. The `contained-grids.html` example exercises these layouts.

The assembler removes optional JavaScript delimiter spacing while preserving quoted literals, slash-led suffixes
and automatic-semicolon-insertion boundaries. It joins only delimiter boundaries and the spaces around a + or -
whose neighbours are not + or -, and drops a semicolon before a closing brace; source parts remain readable. Stylesheets lose
the whitespace around braces and after semicolons, commas and declaration colons outside quoted text.
No minifier dependency or npm build step is required.

Complete Polish, German and Spanish label packs are generated from one translation table into .NET factories and
optional JavaScript module/classic assets. They are loaded only by hosts that choose a pack; no language table is
added to the four runtime entry points. Browser and script-free label coverage share the same source.

Flat grids use the optional `canopyx-grid.js` entry point and its stylesheet. This entry point also contains the interactive tree runtime, so a mixed page loads one runtime. Ordinary tree pages retain their smaller entry points. The data-grid assets have a 96 KiB (98,304 bytes) combined gzip budget; core trees retain their 48 KiB budget and interactive trees retain 64 KiB. The increase accommodates the Graphite design's presenters, loading and error states, phone layout, and entry points for column menus, filters and record details.

Reporting capabilities live in `canopyx.reporting.source`, assembled into `canopyx-reporting.js` and its module/style companions. A grid with a `reporting` definition selects this entry point automatically through `CanopyHtmlAssets.GetRuntime(view)`. It also hosts ordinary grids and both tree runtimes. The optional reporting payload has a separate 128 KiB (131,072 bytes) combined gzip budget for the Graphite reporting controls; tree budgets stay unchanged. Hosts include one entry point per page and use the largest required entry point for mixed content. Unsupported reporting definitions fail explicitly in the ordinary grid entry point.

Column menus, filter editors, record and text dialogs, and selected-value aggregation use the companion `canopyx-filter-editor.js` and `.css`, activated on first use. Their combined gzip guard is 16 KiB. Matching companion versions are enforced before installation. `Build/filter-editor-parts.json` lists their canonical UI source parts; query parsing, matching, facets and exports stay in the grid engine. This split is necessary because the complete editor exceeded the approved grid budget. `CanopyHtmlAssets.WriteTo` writes both companions with the main assets, while retaining its two returned main paths. Content-hashed scripts load matching hashed companions. Single-file grid fragments carry inert payloads outside the mounted host, so local-file pages need no request. JavaScript hosts serve the plain companion files beside the runtime or module, or include `CanopyHtmlAssets.FilterEditorMarkup` once for an embedded runtime. Hosts that preload the registration script also include its stylesheet. These assets are shipped in both the .NET assembly and the JavaScript package.

`CanopyDataGridView` carries typed columns and stable record identities. An inline source queries its complete dataset before returning a window. A host source implements `query(query, { signal })` and returns a `gridPage` covering the requested window, or the remaining rows at its end. The host owns transport, authorization and full-dataset query execution. Every accepted query records the returned revision; subsequent windows must keep that revision and the same total and matching counts. A failed replacement query keeps the accepted rows and offers a retry.

Trees and flat grids share logical scrolling, focused-row retention, row recycling and DOM ordering. Trees keep hierarchy and measured details; flat grids default to fixed-height records and bounded page caches. Automatic rows use the shared detail ResizeObserver with sparse prefix offsets over estimated heights. Measuring an overscan row adjusts the logical scroll position to retain the visible row and its pixel offset, including above the bounded scrollbar threshold. Column changes retain prior measurements as estimates until remeasured. Missing host rows are temporary status rows, so a million-record result does not allocate a million browser wrappers. Selection stores record IDs independently of cached windows. The flat-grid container uses `role="grid"` and rows have no tree levels or expanders. Keyboard navigation follows visible cells.

Paged flat grids restrict row lookup and loading to the accepted page, using the canonical viewport's existing handling of absent rows. Row indices stay global while row positions and scrollbar height are relative to the accepted page. The query owns full-source filtering/sorting; presentation owns visible page length and navigation. No second row renderer or query engine is introduced, and tree runtime assets retain their existing budget.

Grid height is a preferred size when the runtime renders its controls. When controls wrap or a status message grows, the shared sizing observer keeps enough room for the header and records and keeps the pager inside the host. A short compact report can therefore grow taller than its requested height. The minimum contracts again when the controls fit on fewer lines; hosts should allow this height or provide outer scrolling rather than clip the frame. With `toolbar: false`, the host owns control layout and viewport height, including sizing for short or empty results. Destroying a grid restores the host's prior minimum-height property and removes the grid class, so the same element can host another view.

`CanopyStaticHtml.RenderGrid` renders a script-free fallback for the same definition. An inline definition retains source order; a host grid requires an explicit result page. Supply a query-result page when the fallback needs accepted filtering or sorting. A partial snapshot includes a note naming the number shown and the matching total.

The runtime and the data it reads come from the same build. A page, the runtime it loads, and its sidecar files are written by one version of CanopyX and published together; an older runtime cannot be expected to read newer data (a runtime from before packs cannot open a packed bundle), and nothing promises the reverse either.

File names keep that rule when files are cached or shared:

- `CanopyHtmlAssets.WriteTo(directory)` and `SaveHtmlBundle` write the runtime and the stylesheet as `canopyx.<hash>.js` and `canopyx.<hash>.css`, where `<hash>` is the first 16 hex digits of the SHA-256 of the file's content, and a page with external assets references those names. The same content always has the same name, so the files can be served with a long `Cache-Control: max-age` and `immutable`.
- A page written by an older build keeps loading its own runtime. Writing a newer build's assets into the same folder adds files and replaces none, and a file that is already there is never rewritten (a new one appears whole), so several bundles can share one asset folder and be republished one at a time. `SaveHtmlBundle` writes assets only into a folder inside the bundle; for a shared folder outside it (`AssetBaseUrl = "../assets/"`) the host calls `CanopyHtmlAssets.WriteTo(folder, options.AssetNaming)` itself. Removing runtime files no page references any more is the host's job; CanopyX never deletes them.
- The data folder of a bundle is not named by content: republish a bundle's page and data together, into a folder of their own. A page cached by a browser while its data folder was overwritten by a newer build would pair an old runtime with new data. Serve `index.html` with revalidation (`no-cache`), or write each build into a new folder.
- A host with an asset pipeline of its own takes the text from `CanopyHtmlAssets.Script` and `Style` and names the files itself; `ScriptHash` and `StyleHash` give it the same content hash for names and cache keys (16 hex digits of the SHA-256; not a subresource integrity digest). `CanopyAssetNaming.Plain` (on `CanopyHtmlOptions.AssetNaming` and `WriteTo`, which take the same value: a page references what the assets were written as) writes and references the fixed names `canopyx.js` and `canopyx.css`; every page that uses them is then republished with each new build.

## Static Fallback


`CanopyStaticHtml` renders a view and its nodes as a plain indented outline table: no script, no classes that need a stylesheet, inline styles only, and a row limit with an overflow note that says how many rows were left out. Email (through `HtmlForgeX.Email`), print, and Word exports use it. The runtime also builds an outline of the rows that are open when the user prints. The live browser view can render host-trusted HTML details; the built-in print outline encodes that markup as text. A host `renderDetail` callback can supply its own formatted print content. The script-free C# fallback also preserves arbitrary HTML details as text.

### Theming the Outline

The outline is themed when it is rendered, not by script. `CanopyStaticHtmlOptions.Theme` holds the same base colours the runtime is themed with (surface, text, accent, line, and the four coloured tones), and the renderer mixes muted text, header and detail backgrounds, strong lines, and badge tints from them with the formulas of `canopyx.css`. The table, its caption, and the note in its last row carry the surface, so a dark outline is complete on a white page. The host chooses the colours by where the outline goes:

| Where the outline goes | What the host sets | What is written |
| --- | --- | --- |
| Email, Word, print, a light page | nothing (the light theme) | literal light colours |
| A dark document | `Theme = CanopyStaticTheme.Dark()` | literal dark colours |
| A document with a palette of its own | the colours its design tokens resolve to, on `Theme`, and its tone colours in `ToneColors` | those literals |
| A page whose theme is decided in the browser | `UseThemeVariables = true`, plus any of the above for the fallback | each literal, then the same property as `var(--cx-…, literal)` |

A host passes token colours in one of two forms. Resolved: it reads the hex values of its tokens for the theme it renders (for example surface `#10141a`, text `#e6edf3`, and the ink of each status) and assigns them to `Theme` and `ToneColors`; colours are `#` plus three or six hex digits, because they go into inline styles. Live: it sets `UseThemeVariables` and lets its stylesheet define the runtime's custom properties for an element around the outline, exactly as it does for the grid:

```css
/* One rule themes the grid and the outline from the host's tokens, in whichever theme the page is in. */
.report .cx-host.cx-host, .report .report-outline {
  --cx-surface: var(--token-surface-card); --cx-text: var(--token-text); --cx-accent: var(--token-accent); --cx-line: var(--token-line);
  --cx-tone-critical: var(--token-critical-ink); --cx-tone-critical-bg: var(--token-critical-tint);
}
```

```html
<noscript><div class="report-outline"><!-- CanopyStaticHtml.Render(view, options) --></div></noscript>
```

The element around the outline is the host's own, so nothing in `canopyx.css` competes with the rule. (On the grid, the palettes of `canopyx.css` are selected by `data-cx-theme` and weigh as much as one class plus one attribute; a host rule outweighs them with a repeated class, as above, whatever the order of the stylesheets.) `ToneColors` are literals of one theme, so a page that can turn dark defines `--cx-tone-<name>` for its own tones as well.

A page that uses only the CanopyX stylesheet wraps the outline in an element with the class `cx-static` instead: `canopyx.css` gives it the light or dark palette by its `data-cx-theme` (`light`, `dark`, or `auto` for the reader's system preference), and the light palette for print.

```html
<div class="cx-static" data-cx-theme="auto"><!-- CanopyStaticHtml.Render(view, options) --></div>
```

Every declaration with a custom property comes after the literal for the same property: a client that does not know custom properties keeps the literal, and so does a page that defines none. A browser that knows custom properties but not `color-mix()` (before 2023) loses the mixed colours only: muted text and tints fall back to the inherited colour and no background. Literal-only output stays the default because some mail clients handle unknown declarations poorly.

Compared with the outline before themes: the table now paints its surface (white in the light theme) instead of showing the page through; the note is the table's last row instead of a paragraph after it; and muted text, strong lines, and badge tints are mixed from the base colours as in the runtime, which moves them a few shades from the literals used before.

## Browser Runtime

The standard tree entry point remains within its 48 KiB gzip budget. Checking, editing, drag/drop, and context actions live in a separate interactive tree entry point assembled from the same core source parts plus `canopyx.interactive.source`. Its complete script and stylesheet have a 64 KiB gzip budget. Hosts include one entry point per page; the interactive tree also mounts ordinary views. C# page and bundle writers choose matching content-hashed assets automatically when a view enables an interaction feature or overrides an interaction label. The runtime sends proposals to host hooks and never applies domain writes. Lifetime cancellation and snapshot ownership keep retired interactions from reporting against newer data.

Checking stores a trie of explicit node-ID paths rather than references to loaded wrappers. Branch intent therefore survives lazy paging, sorting, queries, and inactive-cache retirement. Reads are not needed to check a branch. The current path and its exceptions determine native checkbox state; a complete loaded sibling set can fold into an ancestor rule. Synchronous host vetoes and proposal revisions prevent a nested newer change from being overwritten. Saved-state validation includes checking before applying presentation, and the script-free C# outline evaluates the same path semantics.

The runtime is plain modern JavaScript with no dependencies. Its source parts live in `CanopyX.Html/Assets/canopyx.source/` and are concatenated in file-name order into `canopyx.js` by `Build/Sync-Assets.ps1`, which leaves out whole-line comments and trims indentation while preserving line boundaries. The same assembly writes `canopyx.css` from the documented stylesheet in that source folder. The sources retain their comments, and both assets keep their opening header. The first JavaScript part opens a single closure and the last part closes it, so parts share private helpers without globals.

| Part | Responsibility |
| --- | --- |
| `00-core.js` | Closure start, constants, tones, text, number and date formatting, DOM helpers |
| `05-search-folding.js` | Search text folding shared with the C# bundle writer |
| `10-sidecar.js` | Sidecar registry: sidecar files push into a queue, so they work whether they load before or after the runtime |
| `15-search-index.js` | Sidecar search: word shards, posting lists, and the entry table of a bundle's search index |
| `20-sources.js` | Inline, sidecar, and remote data sources behind one promise-based interface; packed pages of a bundle |
| `30-model.js` | Tree grid constructor, root loading, status rows, and events |
| `31-wrapping.js` | Iterative node construction and initial expansion |
| `32-layout.js` | Iterative filtering, visible-row layout, and per-level sorting |
| `34-inline-order.js` | Complete inline sibling ordering, position indexes, and retained-identity limits |
| `35-inactive-cache.js` | Recent-use retention and pinning of inactive collapsed subtrees |
| `36-node-retirement.js` | Permanent node and request retirement shared by reload and eviction |
| `40-render.js` | DOM scaffold, header, windowed rendering, row pool |
| `42-dom-order.js` | DOM order of virtual rows |
| `45-cells.js` | Row and cell painting, badges, tones, icons |
| `50-detail.js` | Detail row payloads: table, properties, trusted HTML, or a host `renderDetail` callback; measuring detail rows that size themselves |
| `60-keyboard.js` | Keyboard model, type-ahead, roving focus |
| `62-cell-focus.js` | Cell navigation: moving focus between the cells and controls of a row |
| `65-page-focus.js` | Focus ownership across paging and retry |
| `70-behavior.js` | Expand and collapse, paging, focus and reveal, filters, sorting, column visibility |
| `71-paths.js` | Opening a path (search hits, deep links, remembered state, `expandPath`): loading its pages at once, one row rebuild and one render |
| `73-reload.js` | Transactional list reloads, identity reconciliation, request retirement, and scroll anchors |
| `80-toolbar.js` | Built-in search box and filter switches |
| `83-view-state.js` | Versioned view snapshots, validation, presentation, and restoration position |
| `85-api.js` | Remembered state, outline and visible rows, counts |
| `86-links.js` | Deep links in the default scheme or the host's own |
| `88-lifetime.js` | Grid teardown and release of owned loaded data |
| `90-bootstrap.js` | Auto-mount from JSON configuration, `window.CanopyX`, closure end |

`window.CanopyX` exposes `createTreeGrid(element, options)`, `configure(viewId, options)`, `mount(root)`, and the data source factories, so JavaScript hosts can build views without the C# side.

### Host Pages

`ToHtmlPage` and `SaveHtmlBundle` write a page that holds the view and nothing else. A host with chrome of its own (a header, a toolbar, a side panel) writes its own page and puts the fragment from `ToHtmlFragment` and the assets into it; page layout and slots belong to the host, and for HtmlForgeX documents to the `HtmlForgeX.CanopyX` bridge. CanopyX does not grow a page template language.

A fragment carries only the view document, and the runtime mounts it when the page has loaded. Host code reaches it in one of two ways:

- `CanopyX.configure(viewId, options)`, called from a script that runs before the page has loaded (for example a deferred script after `canopyx.js`), registers every `createTreeGrid` option except the view: `renderers`, `renderDetail`, `onSelect`, `onToggle`, `onLoad`, `formatLink`, `parseLink`, or a `source`. The automatic mount applies them. Configuring a view that is already mounted is an error, because it would silently do nothing.
- `CanopyHtmlOptions.AutoMount = false` marks the fragment `data-cx-mount="manual"`. The runtime leaves it alone until the host calls `CanopyX.mount(root)`, which also applies configured options. Use it when the host's scripts load late or the view starts hidden.

`createTreeGrid` rejects the `renderCell` option of earlier revisions, which drew every column through one callback and so gave up cell reuse for the whole grid. Host controls in custom cells and details keep their click behavior and their own Enter and Space; the arrow keys move between cells, except on controls that use them (text boxes, lists, radio buttons, tabs) or that handle the key themselves (`preventDefault`). Paging updates metadata on retained rows without rebuilding their host content. `focus()` enters the current visible row or the empty grid. Restoring saved expansion suppresses declarative expansion defaults on newly loaded pages. `onLoad` runs after the page is applied; a callback exception rejects the operation without marking that page as a source failure or changing its continuation cursor.

`expandPath(path, { signal })` settles with `null` when the signal is aborted or the grid is destroyed, including while it waits for roots, prefetch, children, paging, or initial expansion. The cancelled caller releases its layout hold and never takes selection or focus later. A shared page load can still complete for other callers. Built-in remote sources bound each request, including its body, to 30 seconds by default (`requestTimeoutMs` in grid options), and destruction aborts their requests. A separately created remote source takes `{ timeoutMs, signal }`; its methods take an optional request signal. Custom sources govern their own transport lifetime.

Fragment configuration belongs to the host. `configure(viewId, options)` returns a disposer for that registration, and `unconfigure(viewId)` removes the current registration for future mounts. Destroying a grid leaves its configuration available for remounting. Removing configuration does not change a mounted grid; disposing an older registration cannot remove a newer one.

Selection proposals share one owner across clicks, keyboard ranges, path navigation, and the host APIs. `setSelection(ids)` validates the entire loaded-id set before changing it; single selection permits at most one distinct id. `clearSelection()` proposes an empty set. `selectAll({ scope })` requires `visible` or `loaded` and never fetches more data. `isSelectable(node)` governs additions and filters ranges/select-all. Existing selection can be removed even if eligibility later changes. `beforeSelect(node, nodes, { previous, reason })` is synchronous and can veto the full set; returning a promise is an error. Hosts can also cancel `canopyx:beforeselect`. A nested host selection supersedes the older proposal, and a node removed by a host callback cannot be reattached through selection. Vetoes leave the selection, its URL fragment, and selection notifications intact. Focus and expansion remain separate. Accepted data removal reconciles selection without a veto.

`reload(id?, { signal }?)` stages a replacement child list through the range already loaded before changing the model. The root list is the default. An invalid document rejects and leaves existing data attached; an abort, destruction, or newer reload returns `false`. Surviving IDs reuse their wrappers, expansion, selection, focus, and scroll anchor. Unchanged nodes keep their host controls. A changed inline child list is reconciled; loaded lazy subtrees remain cached unless the replacement proves them obsolete. Reload a lazy parent separately when its children changed. Older page finalizers cannot clear a newer request. Custom sources receive a request signal in the third argument to `page`; their transport remains host-owned. Immutable sidecar bundles continue to read their cached snapshot; mount the replacement bundle to switch versions. `refresh()` repaints, while `refreshCounts()` updates counts, cells, and flags.

`getState()` returns a JSON snapshot with `version: 1`, `expanded` and `selection` ID paths, `columns` (`id`, `width`, `hidden`), `sort`, active declared `filters`, `timeZone`, `pinTreeColumn`, a `focus` path, and an `anchor` (`path`, row-relative pixel `offset`). `setState()` validates the full snapshot before changing the view and returns `false` for invalid or unsupported versions. Removed columns and filters are skipped, obsolete sort columns clear sorting, and missing node paths are ignored. Restoration loads missing saved paths without taking DOM focus; selected nodes in a collapsed branch remain selected. Selection policy still governs a restored selection. The legacy `{ expanded }` shape changes expansion alone. `stateKey` stores the versioned snapshot with a debounce after interaction; initialization never writes a partial snapshot. Host predicates, renderers, and callbacks are not serialized.

### Rendering Model

- Loaded nodes keep their children. The visible rows are a flat array rebuilt on each structure change (expand, collapse, page loaded, sort, filter); the cost is proportional to the visible rows, not to the whole tree.
- An inline list keeps its host array in its original order and sorts a `Uint32Array` of positions, using four bytes per sibling for the ordered index. Paging reads that complete order, so a later page does not insert a sibling that belongs before the first page. Equal keys retain the host's original order. Clearing sort restores the original page order.
- Already loaded inline identities outside a reordered prefix are retained separately from attached rows, so selection and expansion survive. `retainedNodeLimit` (JavaScript host option, nonnegative 32-bit integer, default 1,024) limits unpinned retained subtrees across the grid. Selection, expansion, focus, selection anchors, and active requests pin their subtrees; those pins can exceed the limit. This limit does not bound the host's input arrays, active loaded rows, or lazy subtrees. Navigation pages through the ordered prefix before revealing a retained node. Reload validates and reconciles retained identities too.
- `inactiveNodeLimit` (JavaScript host option, nonnegative 32-bit integer, default 4,096) limits loaded descendants of collapsed branches in recent-use order. Eviction runs after rendering, reloads lazy data when the branch opens again, and rematerializes inline children from the unchanged host array. Selection, focus, anchors, remembered expansion, initial/restored state, active loads, and reloads retain the data they need. Queued user expansions retain their targets until replay settles, then inactive trimming resumes. An active local filter pins groups containing a matching node or ancestor hint; other collapsed groups remain subject to the limit. Pins, active rows, and host input arrays can exceed the retention limit; it is not a total-heap cap.
- Children and search pack caches each retain up to six settled packs and 2 MiB of their UTF-16 page text. In-flight loads remain shared; oversized packs still answer their active requests. Parsed search shards and entry readers retain up to 24 and 32 documents respectively. Every navigation releases its prefetch pins on completion or cancellation. A separately owned sidecar source accepts `prefetch(opens, finds, { signal })` and returns a release function; without a signal, a new manual prefetch releases the preceding manual lease. These limits bound retained documents and text, rather than measuring browser heap allocation.
- Count refreshes capture loaded node identity and its revision. Responses cannot overwrite a node loaded after the request or a replacement rematerialized after eviction. Destroying a grid releases its loaded rows, selection, model caches, source, and row pool; a retained API still exposes its original view metadata.
- The browser folding table uses derived text records: base-36 code-unit gaps and lowercase deltas, with run records for pairs that share a delta at a fixed stride. The C# Unicode table remains canonical; asset tests expand the browser records back to those bytes, and a browser test compares all 65,536 UTF-16 code units. The representation changes neither protocol tokens nor search ranking.
- Rows have a fixed height, so an offset table gives every row's top position and a binary search finds the first row in the viewport. A detail row either spans a declared number of row slots or, without a declared height, is as tall as its content: it enters the offset table with an estimate and is measured when it is rendered, and again when a `ResizeObserver` reports that its content or the grid's width changed. When a row above the viewport turns out taller or shorter than its estimate, the scroll position moves by the difference, so the rows in view stay where they are.
- Logical heights above 8,000,000 CSS pixels use a bounded native scrollbar. The scrollbar maps to the complete loaded range; rows keep their real heights and are positioned relative to the logical viewport. Keyboard navigation and saved anchors use logical offsets. Wheel and single-touch movement inside the scaled view keep CSS-pixel distance, while native scrollbar jumps cover the whole range. Ordinary views retain native scrolling. This bounds DOM geometry, not the host's input arrays or the loaded row model.
- A detail row's content sits in a body that sticks at the row's indent and takes the visible width of the grid (`--cx-view-w`, which the runtime keeps up to date), so it stays readable when the columns are wider than the grid.
- Only the rows in the viewport, a small overscan, and the focused row exist in the DOM.
- In a scaled view the canvas clips offscreen rows so a retained focus row cannot enlarge the native scrollbar range.
- A row that leaves the window is reused for a row that enters it. Its cell elements survive; only text, attributes, badges, and position change. Rows retained in the viewport are not repainted.
- A host draws cells through `renderers`, one function per declared column ID. The callback receives a fresh element and a cell lifetime context. Returning true owns the cell; returning false keeps default painting after any decoration. Reading `context.signal` or registering `context.onDispose(cleanup)` retains the fresh element even when it has no content or attribute changes, so listeners survive default painting. Cleanup runs once, in reverse registration order, after aborting the cell signal and before replacement, recycling, layout destruction or view destruction. Temporary outline rendering disposes its cell resources after serializing the result. Failed renderers dispose their new resources and restore the previous cell. Ordinary views without host resources retain cell reuse.
- Positions and attributes are written only when they change, and rendering happens in one `requestAnimationFrame` per change, however many scroll events arrive.
- Opening a path (a search hit, a deep link, remembered state, `expandPath`) changes the model level by level, but the rows are rebuilt and rendered once, when the path is open, and focus moves once, at the end. Before the first level opens, the data source loads at once the pages the path will read, as far as it knows where they are: a bundle's search index tells where the pages on each hit's path are (see "Search Index" in data-protocol.md). Remembered state restores all its paths the same way, together. Until then the grid shows, and `visibleRows()` and `toOutline()` return, the rows it showed before; a path that takes longer than 250 ms, because a level is slow to load, shows its loading rows from then on (the files a hit's path loads at once come before that, and show nothing while they load). After a jump to a row far away, the frame that shows it draws only the rows in view, and the overscan follows in the frame after.
- Screen readers in browse mode read DOM order, so rows stay in visual order throughout scrolling. Departing rows are updated while detached, retaining their cell skeletons, then inserted in order; rows still visible are retained. The focused row is never moved, because moving a focused element drops its focus.

### Accessibility Contract

- The grid has `role="treegrid"`, `aria-rowcount`, and `aria-multiselectable` when multi-select is on. Rows have `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (expandable rows only), `aria-selected`, `aria-busy` while loading, and `aria-rowindex`. Cells are `gridcell`; headers are `columnheader` with `aria-sort` on sortable columns.
- `aria-setsize` counts children that are not loaded yet, so a screen reader hears "row 1 of 1,685" before every page has arrived.
- Focus is a roving `tabindex` on rows: the focused row has DOM focus and Tab leaves the grid. Row focus is the default. Controls a host draws into cells (through `renderers`) or into detail rows are taken out of the Tab order, so the grid stays one Tab stop, and are reached with cell navigation, the cell half of the ARIA tree grid pattern (below).
- Keys: Up and Down move; Right expands, then moves to the first child; Left collapses, then moves to the parent; Home and End; Page Up and Page Down; Enter toggles and selects; Space selects (toggles in multi-select); Shift and Ctrl extend multi-select; typing letters jumps to the next matching label (type-ahead, spaces included).
- Cell navigation, in rows whose cells hold controls: Right on a row that has nothing to open or enter (a leaf, or an open row without loaded children), or F2 on any row, focuses the first cell with a control. There Left and Right move between cells, and between the controls of one cell; Up and Down keep the column in the rows above and below (a status or detail row takes row focus); Home and End go to the first and last cell; Escape, F2, or Left from the first cell return to the row. A cell whose one control is a button, a link, or a checkbox focuses the control, which keeps Enter and Space; a plain cell acts as its row on Enter and Space. A control that uses the arrow keys (a text box, a list, radio buttons, tabs, an editable region) is not entered by the arrows: they stop at its cell, Enter goes into the control, and Escape comes back out. A repaint that rebuilds the cell holding focus (host-drawn cells and details are rebuilt) puts focus back into it. Clicking a cell is a row click as before. A control that its cell clips (cells hide what does not fit their width) is scrolled into view inside the cell, and the cell scrolls back to its start once focus leaves it. Tab and Shift+Tab from a cell or a control leave the grid in one step, as from the row. In a detail row the controls come in document order, followed by the body itself when it scrolls, whose arrow keys then scroll it. Rows without controls behave as before: Right on them does nothing.
- `docs/screen-reader-test.md` is the manual NVDA and Narrator pass over these announcements, which automated tests cannot hear.
- "Show more", loading, and error rows span all columns. A polite live region announces "100 of 1,234 loaded" after each page.

### Theming

The approved [data-grid design specification](design/data-grid-spec.html) is the reference for grid tokens, components, and interactions. Open it with `#light` or `#dark` to compare either theme.

The Graphite defaults use Calibri/Carlito/Segoe UI and expose `--cx-font`, `--cx-font-mono`, `--cx-font-size`, `--cx-radius`, `--cx-radius-sm`, `--cx-control-h`, `--cx-row-h`, `--cx-head-h`, `--cx-cell-px`, and `--cx-on-accent`. No web font download is required. Map the host's card surface, body text, accent, line and status inks to the existing inputs; HtmlForgeX bridges can map typography, control radius and spacing through the new inputs. Derived tokens (`--cx-text-2`, `--cx-muted`, `--cx-control-border`, `--cx-group-bg`, `--cx-accent-soft`, `--cx-quiet` and the state backgrounds) follow those inputs. The control border is intentionally stronger than decorative separators.

Grid `density` is `compact` (28 pixel rows, 8 pixel padding), `default` (34/12), or `comfortable` (42/14). JavaScript can omit `rowHeight` to use density; the .NET writer emits the effective numeric height. Explicit heights keep their meaning. `zebra: true` opts into alternate backgrounds; the default is off.

`canopyx.css` defines a small set of base colours as custom properties (`--cx-surface`, `--cx-text`, `--cx-accent`, `--cx-line`, and one colour per tone it ships). A tone is a name, and a host adds its own, such as the steps of a severity scale, by defining `--cx-tone-<name>` and optionally `--cx-tone-<name>-bg` in its theme (see "Tones" in data-protocol.md). Hover, selection, alternate rows, and muted text are derived with `color-mix()`. Host renderers draw badges and chips with `CanopyX.badge({ text, tone, title })`, which returns the element the runtime draws for a badge (a `span` with `cx-badge`, the tone classes, and for a host tone the custom properties that point at its theme colours), so a host never repeats the badge markup or the tone rules; `tone` defaults to `neutral`, and a missing or non-string `text` throws. A dark palette applies under `data-cx-theme="dark"`, or under `data-cx-theme="auto"` when the system prefers dark. Hosts theme CanopyX by setting the base colours, for example from their own design tokens.

#### Theming scrollbars

Every scroll container a view owns (the grid body in both directions, the pinned and scrolling regions, the Columns menu, filter popovers, the filter builder, the record drawer and dropdown lists) uses `scrollbar-color` and `scrollbar-width: thin`, with a `::-webkit-scrollbar` fallback (rounded thumb, transparent track, hover state) for engines that need it. Four custom properties drive them: `--cx-scrollbar-thumb` and `--cx-scrollbar-thumb-hover` (derived from `--cx-text`, so they follow light, dark, `auto` and host palettes, including a report shell that switches the theme on the document and maps its tokens onto `.cx-host`), `--cx-scrollbar-track` (transparent) and `--cx-scrollbar-size` (10 pixels). Hosts override them on `.cx-host`. Under `forced-colors: active` the system scrollbars are left alone; nothing hides scrollbars or adds overlay-scrollbar script.

## Performance

The interaction budgets follow the first consumer's reporting plan for its largest tier (the TestimoX plan, section 7.2). There, timings are the median of 5 cold loads with Playwright on a reference machine with 4 physical cores, 16 GB RAM, an SSD, and current Edge without CPU throttling.

| Measure | Budget |
| --- | --- |
| First rows painted, cold load | 2.5 s |
| Expand, page of children, search to expanded path | 250 ms (400 ms with a hosted round trip) |
| Scrolling a large expanded tree | no blank rows |
| Runtime assets (`canopyx.js` plus `canopyx.css`), gzip | 48 KB |
| Largest sidecar file written by the bundle writer | 1 MB |

The Playwright suite in `tests/browser` enforces the interaction and blank-row budgets in CI on the large bundle example, a synthetic file-system-like tree of more than 100,000 nodes. The asset and sidecar budgets are contract tests in `CanopyX.Tests`. Scroll smoothness at a 4x CPU slowdown is measured with `tests/browser/bench/scroll-benchmark.mjs`. Search index size and the cold and warm time from a query to an expanded hit are measured at normal and 4x CPU speed with `tests/browser/bench/search-benchmark.mjs`, on the large bundle example, on the two benchmark bundles that `CanopyX.Examples --search-bench` writes (an adversarial deep tree and a directory-shaped tree), and on the packing benchmark bundle. Bundle packing is measured with `tests/browser/bench/expand-benchmark.mjs` on the bundle `CanopyX.Examples --pack-bench` writes (5,000 services, about 380,000 rows under about 150,000 parents), and on the large bundle example and the directory-shaped tree: the files and bytes of the bundle, the time to the first rows, and cold expands level by level, at normal and 4x CPU speed. At 4x on a busy machine, a cold search to an expanded hit takes 96 to 154 ms on the large bundle example and the two search benchmark bundles, and 150 to 209 ms on the packing benchmark (medians of 9): 30 to 80 ms of search, one round of page loads, one row rebuild and render of the rows in view, and the paint. The Playwright suite also checks what does not depend on the runner: a query reads a bounded part of the index, the pages on a hit's path load in one round, and a path renders once. Hosted CI runners are too noisy to gate on these timings. Consumers measure their own fixtures against their own budgets.

## Build Standards

- `CanopyX` and `CanopyX.Html` target `net472`, `netstandard2.0`, `net8.0`, and `net10.0`; tests and examples target `net10.0`.
- Warnings are errors in every project; there are no `NoWarn` suppressions.
- XML documentation is generated for both libraries and required on every public API.
- Library builds are deterministic, produce symbol packages, and enable the trimming and AOT analyzers on `net8.0` and `net10.0`.
- Production C# files stay under 800 lines and runtime source parts under 350 lines; `Build.ps1` enforces both.
- One public type per file, organised in folders by concern.

## Tests

- `CanopyX.Tests` (xUnit) holds contract tests: protocol documents validated against the checked-in JSON schema, bundle layout and file-size bounds, static output, fragment and asset emission, and the assembled runtime matching its source parts.
- `tests/browser` (Playwright) holds the browser contract: a smoke pass over every Must feature, axe-core in both themes, a keyboard walkthrough, and performance budgets.
- `CanopyX.Examples` generates the example pages the browser tests open, from a synthetic file-system-like tree that scales past 100,000 nodes. With `--search-bench` and `--pack-bench` it writes the benchmark bundles instead.
