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
   - **Bundle**: `CanopyBundleWriter` splits the tree into small sidecar script files (top level, children per parent, paged long lists, and a search index sharded by name prefix). The page loads them on demand, including from `file://`, where `fetch` of local files is blocked.
   - **Hosted**: the page asks an HTTP endpoint for the same documents.
4. `CanopyX.Html` renders the fragment: a host element, the view as a JSON configuration script, and optionally a `<noscript>` outline. Assets are inlined or referenced as `canopyx.js` and `canopyx.css`.
5. The runtime finds every `[data-canopyx-host]` element, reads its configuration, creates the data source, and mounts a tree grid.

Every document on the wire carries `"protocol": "canopyx/1"`. The runtime rejects documents with another protocol value instead of guessing.

## Static Fallback

`CanopyStaticHtml` renders a view and its nodes as a plain indented outline table: no script, no classes that need a stylesheet, inline styles only, and a row limit with an overflow note that says how many rows were left out. Email (through `HtmlForgeX.Email`), print, and Word exports use it. The runtime also builds an outline of the rows that are open when the user prints, so a printed page matches the screen.

## Browser Runtime

The runtime is plain modern JavaScript with no dependencies. Its source parts live in `CanopyX.Html/Assets/canopyx.source/` and are concatenated in file-name order into `canopyx.js` by `Build/Sync-Assets.ps1`. The first part opens a single closure and the last part closes it, so parts share private helpers without globals.

| Part | Responsibility |
| --- | --- |
| `00-core.js` | Closure start, constants, text and number formatting, DOM helpers |
| `10-sidecar.js` | Sidecar registry: sidecar files push into a queue, so they work whether they load before or after the runtime |
| `20-sources.js` | Inline, sidecar, and remote data sources behind one promise-based interface |
| `30-model.js` | Tree grid constructor, root loading, status rows, and events |
| `31-wrapping.js` | Iterative node construction and initial expansion |
| `32-layout.js` | Iterative filtering, visible-row layout, and per-level sorting |
| `40-render.js` | DOM scaffold, windowed rendering, row pool, DOM order of virtual rows |
| `45-cells.js` | Row and cell painting, badges, tones, icons |
| `50-detail.js` | Detail row payloads: table, properties, trusted HTML, or a host `renderDetail` callback |
| `60-keyboard.js` | Keyboard model, type-ahead, roving focus |
| `65-page-focus.js` | Focus ownership across paging and retry |
| `70-behavior.js` | Expand and collapse, paging, selection, `expandPath`, column resize and visibility |
| `80-toolbar.js` | Built-in search box and filter switches |
| `85-api.js` | Public instance API, remembered state, deep links, outline and visible rows |
| `90-bootstrap.js` | Auto-mount from JSON configuration, `window.CanopyX`, closure end |

`window.CanopyX` exposes `createTreeGrid(element, options)`, `mount(root)`, and the data source factories, so JavaScript hosts can build views without the C# side.

Host controls in custom cells and details keep their click and keyboard behavior. Paging updates metadata on retained rows without rebuilding their host content. `focus()` enters the current visible row or the empty grid. Restoring saved expansion suppresses declarative expansion defaults on newly loaded pages. `onLoad` runs after the page is applied; a callback exception rejects the operation without marking that page as a source failure or changing its continuation cursor.

### Rendering Model

- Loaded nodes keep their children. The visible rows are a flat array rebuilt on each structure change (expand, collapse, page loaded, sort, filter); the cost is proportional to the visible rows, not to the whole tree.
- Rows have a fixed height. A detail row spans a declared number of row slots, so an offset table gives every row's top position and a binary search finds the first row in the viewport.
- Only the rows in the viewport, a small overscan, and the focused row exist in the DOM. Rows leaving the window go back to a pool.
- A recycled row keeps its cell elements. Painting a row updates text, attributes, and badges in place instead of rebuilding the cells.
- Rendering happens in one `requestAnimationFrame` per change, however many scroll events arrive.
- Rows stay in visual order in the DOM, because screen readers in browse mode read DOM order. The focused row is never moved, because moving a focused element drops its focus.

### Accessibility Contract

- The grid has `role="treegrid"`, `aria-rowcount`, and `aria-multiselectable` when multi-select is on. Rows have `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (expandable rows only), `aria-selected`, `aria-busy` while loading, and `aria-rowindex`. Cells are `gridcell`; headers are `columnheader` with `aria-sort` on sortable columns.
- `aria-setsize` counts children that are not loaded yet, so a screen reader hears "row 1 of 1,685" before every page has arrived.
- Focus is a roving `tabindex` on rows: the focused row has DOM focus and Tab leaves the grid. This is the row-focus half of the ARIA tree grid pattern; moving focus between the cells of a row is a follow-up in `TODO.md`.
- Keys: Up and Down move; Right expands, then moves to the first child; Left collapses, then moves to the parent; Home and End; Page Up and Page Down; Enter toggles and selects; Space selects (toggles in multi-select); Shift and Ctrl extend multi-select; typing letters jumps to the next matching label (type-ahead, spaces included).
- "Show more", loading, and error rows span all columns. A polite live region announces "100 of 1,234 loaded" after each page.

### Theming

`canopyx.css` defines a small set of base colours as custom properties (`--cx-surface`, `--cx-text`, `--cx-accent`, `--cx-line`, and one colour per tone). Hover, selection, alternate rows, and muted text are derived with `color-mix()`. A dark palette applies under `data-cx-theme="dark"`, or under `data-cx-theme="auto"` when the system prefers dark. Hosts theme CanopyX by setting the base colours, for example from their own design tokens.

## Performance

The interaction budgets follow the first consumer's reporting plan for its largest tier (the TestimoX plan, section 7.2). There, timings are the median of 5 cold loads with Playwright on a reference machine with 4 physical cores, 16 GB RAM, an SSD, and current Edge without CPU throttling.

| Measure | Budget |
| --- | --- |
| First rows painted, cold load | 2.5 s |
| Expand, page of children, search to expanded path | 250 ms (400 ms with a hosted round trip) |
| Scrolling a large expanded tree | no blank rows |
| Runtime assets (`canopyx.js` plus `canopyx.css`), gzip | 40 KB |
| Largest sidecar file written by the bundle writer | 1 MB |

The Playwright suite in `tests/browser` enforces the interaction and blank-row budgets in CI on the large bundle example, a synthetic file-system-like tree of about 120,000 nodes. The asset and sidecar budgets are contract tests in `CanopyX.Tests`. Scroll smoothness at a 4x CPU slowdown is measured with `tests/browser/bench/scroll-benchmark.mjs` and reported in pull requests; hosted CI runners are too noisy to gate on it. Consumers measure their own fixtures against their own budgets.

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
- `CanopyX.Examples` generates the example pages the browser tests open, from a synthetic file-system-like tree that scales past 100,000 nodes.
