# CanopyX Architecture

CanopyX turns host data into large interactive views that stay fast at hundreds of thousands of rows and still work when opened from a file share. This document describes how the pieces fit together. The wire format is specified separately in [data-protocol.md](data-protocol.md).

## Packages

| Package | Owns | Depends on |
| --- | --- | --- |
| `CanopyX` | View definition model, `canopyx/1` protocol documents and their JSON writer, bundle writer, static fallback renderer | nothing at runtime |
| `CanopyX.Html` | Browser runtime assets (tree grid engine, public API, data sources, theme CSS) as embedded resources, and the C# API that emits a page fragment, a full page, or the asset files | `CanopyX` |

Hosts own everything product-specific. A host maps its records into `CanopyNode` objects, computes rollups and flags, and decides the delivery mode. HtmlForgeX will host CanopyX through its own `HtmlForgeX.CanopyX` bridge; TestimoX and other products either use that bridge or call `CanopyX.Html` directly.

## Data Flow

1. The host builds a `CanopyView`: columns, row height, page size, selection mode, search and filter declarations, icons, and a data source declaration.
2. The host builds the tree as `CanopyNode` objects. Each node has an id, a label, optional cells keyed by column id, badges, flags, and either inline children or a lazy-load declaration (`hasChildren`, `childCount`, `ref`).
3. The host picks a delivery mode:
   - **Single file**: the nodes travel inside the view as inline data. Best for small and medium trees.
   - **Bundle**: `CanopyBundleWriter` splits the tree into sidecar script files: the top level in pages, the children pages of all other nodes packed together into pack files, and a search index that holds every node once next to word shards that refer to it. The page loads them on demand, including from `file://`, where `fetch` of local files is blocked. Packing keeps the file count in the thousands for a tree with hundreds of thousands of rows, so a bundle stays practical to copy and upload. The writer takes the tree complete from the view's roots, or node by node from the host while it walks the tree (`Write(view, directory, roots, children)`), in which case it holds only the rows of the lists on the path it is on, one id per node, and the words of the search index.
   - **Hosted**: the page asks an HTTP endpoint for the same documents.
4. `CanopyX.Html` renders the fragment: a host element and the view as a JSON configuration script. Assets are inlined or referenced as files named by their content hash (see [Assets and Caching](#assets-and-caching)).
5. The runtime finds every `[data-canopyx-host]` element, reads its configuration, creates the data source, and mounts a tree grid.

Every document on the wire carries `"protocol": "canopyx/1"`. The runtime rejects documents with another protocol value instead of guessing.

## Assets and Caching

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

The runtime is plain modern JavaScript with no dependencies. Its source parts live in `CanopyX.Html/Assets/canopyx.source/` and are concatenated in file-name order into `canopyx.js` by `Build/Sync-Assets.ps1`. The first part opens a single closure and the last part closes it, so parts share private helpers without globals.

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
| `40-render.js` | DOM scaffold, header, windowed rendering, row pool |
| `42-dom-order.js` | DOM order of virtual rows |
| `45-cells.js` | Row and cell painting, badges, tones, icons |
| `50-detail.js` | Detail row payloads: table, properties, trusted HTML, or a host `renderDetail` callback; measuring detail rows that size themselves |
| `60-keyboard.js` | Keyboard model, type-ahead, roving focus |
| `65-page-focus.js` | Focus ownership across paging and retry |
| `70-behavior.js` | Expand and collapse, paging, selection, `expandPath`, column resize and visibility |
| `80-toolbar.js` | Built-in search box and filter switches |
| `85-api.js` | Remembered state, outline and visible rows, counts, teardown |
| `86-links.js` | Deep links in the default scheme or the host's own |
| `90-bootstrap.js` | Auto-mount from JSON configuration, `window.CanopyX`, closure end |

`window.CanopyX` exposes `createTreeGrid(element, options)`, `configure(viewId, options)`, `mount(root)`, and the data source factories, so JavaScript hosts can build views without the C# side.

### Host Pages

`ToHtmlPage` and `SaveHtmlBundle` write a page that holds the view and nothing else. A host with chrome of its own (a header, a toolbar, a side panel) writes its own page and puts the fragment from `ToHtmlFragment` and the assets into it; page layout and slots belong to the host, and for HtmlForgeX documents to the `HtmlForgeX.CanopyX` bridge. CanopyX does not grow a page template language.

A fragment carries only the view document, and the runtime mounts it when the page has loaded. Host code reaches it in one of two ways:

- `CanopyX.configure(viewId, options)`, called from a script that runs before the page has loaded (for example a deferred script after `canopyx.js`), registers every `createTreeGrid` option except the view: `renderers`, `renderDetail`, `onSelect`, `onToggle`, `onLoad`, `formatLink`, `parseLink`, or a `source`. The automatic mount applies them. Configuring a view that is already mounted is an error, because it would silently do nothing.
- `CanopyHtmlOptions.AutoMount = false` marks the fragment `data-cx-mount="manual"`. The runtime leaves it alone until the host calls `CanopyX.mount(root)`, which also applies configured options. Use it when the host's scripts load late or the view starts hidden.

`createTreeGrid` rejects the `renderCell` option of earlier revisions, which drew every column through one callback and so gave up cell reuse for the whole grid. Host controls in custom cells and details keep their click and keyboard behavior. Paging updates metadata on retained rows without rebuilding their host content. `focus()` enters the current visible row or the empty grid. Restoring saved expansion suppresses declarative expansion defaults on newly loaded pages. `onLoad` runs after the page is applied; a callback exception rejects the operation without marking that page as a source failure or changing its continuation cursor.

### Rendering Model

- Loaded nodes keep their children. The visible rows are a flat array rebuilt on each structure change (expand, collapse, page loaded, sort, filter); the cost is proportional to the visible rows, not to the whole tree.
- Rows have a fixed height, so an offset table gives every row's top position and a binary search finds the first row in the viewport. A detail row either spans a declared number of row slots or, without a declared height, is as tall as its content: it enters the offset table with an estimate and is measured when it is rendered, and again when a `ResizeObserver` reports that its content or the grid's width changed. When a row above the viewport turns out taller or shorter than its estimate, the scroll position moves by the difference, so the rows in view stay where they are.
- A detail row's content sits in a body that sticks at the row's indent and takes the visible width of the grid (`--cx-view-w`, which the runtime keeps up to date), so it stays readable when the columns are wider than the grid.
- Only the rows in the viewport, a small overscan, and the focused row exist in the DOM.
- A row that leaves the window is reused for a row that enters it. Its cell elements survive; only text, attributes, badges, and position change. Rows retained in the viewport are not repainted.
- A host can draw columns itself through `renderers`, one function per column id. Only those columns give up cell reuse: their cell is rebuilt from a clean element each time a row is painted, so nothing a renderer left behind leaks into the next node. A renderer that returns false falls back to the default painting for that cell.
- Positions and attributes are written only when they change, and rendering happens in one `requestAnimationFrame` per change, however many scroll events arrive.
- Screen readers in browse mode read DOM order, so rows stay in visual order throughout scrolling. Departing rows are updated while detached, retaining their cell skeletons, then inserted in order; rows still visible are retained. The focused row is never moved, because moving a focused element drops its focus.

### Accessibility Contract

- The grid has `role="treegrid"`, `aria-rowcount`, and `aria-multiselectable` when multi-select is on. Rows have `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (expandable rows only), `aria-selected`, `aria-busy` while loading, and `aria-rowindex`. Cells are `gridcell`; headers are `columnheader` with `aria-sort` on sortable columns.
- `aria-setsize` counts children that are not loaded yet, so a screen reader hears "row 1 of 1,685" before every page has arrived.
- Focus is a roving `tabindex` on rows: the focused row has DOM focus and Tab leaves the grid. This is the row-focus half of the ARIA tree grid pattern; moving focus between the cells of a row is a follow-up in `TODO.md`.
- Keys: Up and Down move; Right expands, then moves to the first child; Left collapses, then moves to the parent; Home and End; Page Up and Page Down; Enter toggles and selects; Space selects (toggles in multi-select); Shift and Ctrl extend multi-select; typing letters jumps to the next matching label (type-ahead, spaces included).
- "Show more", loading, and error rows span all columns. A polite live region announces "100 of 1,234 loaded" after each page.

### Theming

`canopyx.css` defines a small set of base colours as custom properties (`--cx-surface`, `--cx-text`, `--cx-accent`, `--cx-line`, and one colour per tone it ships). A tone is a name, and a host adds its own, such as the steps of a severity scale, by defining `--cx-tone-<name>` and optionally `--cx-tone-<name>-bg` in its theme (see "Tones" in data-protocol.md). Hover, selection, alternate rows, and muted text are derived with `color-mix()`. A dark palette applies under `data-cx-theme="dark"`, or under `data-cx-theme="auto"` when the system prefers dark. Hosts theme CanopyX by setting the base colours, for example from their own design tokens.

## Performance

The interaction budgets follow the first consumer's reporting plan for its largest tier (the TestimoX plan, section 7.2). There, timings are the median of 5 cold loads with Playwright on a reference machine with 4 physical cores, 16 GB RAM, an SSD, and current Edge without CPU throttling.

| Measure | Budget |
| --- | --- |
| First rows painted, cold load | 2.5 s |
| Expand, page of children, search to expanded path | 250 ms (400 ms with a hosted round trip) |
| Scrolling a large expanded tree | no blank rows |
| Runtime assets (`canopyx.js` plus `canopyx.css`), gzip | 48 KB |
| Largest sidecar file written by the bundle writer | 1 MB |

The Playwright suite in `tests/browser` enforces the interaction and blank-row budgets in CI on the large bundle example, a synthetic file-system-like tree of more than 100,000 nodes. The asset and sidecar budgets are contract tests in `CanopyX.Tests`. Scroll smoothness at a 4x CPU slowdown is measured with `tests/browser/bench/scroll-benchmark.mjs`. Search index size and the cold and warm time from a query to an expanded hit are measured at normal and 4x CPU speed with `tests/browser/bench/search-benchmark.mjs`, on the large bundle example and on the two benchmark bundles that `CanopyX.Examples --search-bench` writes (an adversarial deep tree and a directory-shaped tree). Bundle packing is measured with `tests/browser/bench/expand-benchmark.mjs` on the bundle `CanopyX.Examples --pack-bench` writes (5,000 services, about 380,000 rows under about 150,000 parents): the files and bytes of the bundle, the time to the first rows, and cold expands level by level, at normal and 4x CPU speed. Hosted CI runners are too noisy to gate on these timings. Consumers measure their own fixtures against their own budgets.

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
