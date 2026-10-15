# CanopyX TODO

This is the central place for active and planned work. Every milestone names the consumer that needs it and the gate that says it is done. Durable technical reference lives in `docs/architecture.md` and `docs/data-protocol.md`; do not add separate roadmap or handoff documents.

References to "the TestimoX plan" mean `docs/roadmaps/Reporting-Platform-EndToEnd-Plan.md` in the TestimoX repository. The `hfx/archetypes` checklist is in `docs/roadmaps/Reporting-Platform-PR-Stacks.md` in the same repository, and the D21 spike write-up is `Docs/spikes/tree-explorer.md` on the HtmlForgeX `spike/tree-explorer` branch.

## Scope and Boundaries

- CanopyX is generic. It renders views over data that hosts supply and holds no product logic: nothing about Active Directory, PKI, TestimoX, ADPlayground, CertNoob, or any other product. Rollup counts, change markers, severities, and "only changed" flags are computed by the host and arrive as cells, badges, and flags.
- Static, non-interactive tables, lists, and KPI cards stay in `ChartForgeX.VisualBlocks`. CanopyX's static renderer exists only as the fallback for its own interactive views.
- Grid cells provide miniature bar, line and period-strip presenters for host-supplied histories. Full charts and richer visualizations come from ChartForgeX through host-owned rendering and chart actions. Neither CanopyX package references ChartForgeX.
- CanopyX never performs writes. Context actions (0.5), edits, and drops (1.0) are raised to hooks that the host provides and governs; CanopyX applies nothing on its own.
- Packages: `CanopyX` and `CanopyX.Html` for views and rendering; `CanopyX.Data` and `CanopyX.AspNetCore` for server-side execution of the hosted grid protocol. Further splits need size or dependency evidence (see [Package Split Policy](#package-split-policy)).

## Contract And Authoring Consolidation

Consumers: standalone .NET authors, the HtmlForgeX tree/grid bridge, and OfficeIMO hosts consuming accepted grid captures. The authoring changes share the existing protocol and runtime rather than adding a new dependency or view engine.

- [x] Preserve dictionary keys in sidecar document scripts, normalize non-finite numeric fallback values, and accept unknown optional grid-document fields while validating known fields.
- [x] Use explicit tree/data-grid view types, source factories, one column sizing policy, column-owned presenters and ordering, and a selector-based typed record mapper.
- [x] Dispose host cell resources on repaint, recycling, layout changes, outline capture and destruction.
- [x] Reload grid data against a fresh revision with accepted criteria, restarting navigation; preserve the accepted query and records when reload fails.
- [x] Capture normalized raw/text cells and optional semantic presentation before Office delivery, with scope counts, independent cancellable enumeration and explicit unsupported-presentation diagnostics. Render cursor snapshots as script-free fallback tables.
- [x] Validate the consolidated candidate through all supported .NET targets, native/browser/package contracts and rendered examples. Scrolling qualification follows the existing performance gates below.
- [x] Qualify a real HtmlForgeX migration and OfficeIMO consumer against the accepted source and packed-artifact boundary. The installed HtmlForgeX tree, report grid and static outline pass across three browser engines.
- [x] Publish and verify CanopyX and CanopyX.Html 0.1.0 on NuGet and @evotecit/canopyx 0.1.0 on npm, including downloaded archive integrity and fresh public-package consumers. The full public dependency graph is available; HtmlForgeX #331 passes normal public-package restore and CI and is merged into reporting-platform.

Gate: the local source and packed artifacts agree on the public API and runtime; representative hosts retain identities, query scope, cancellation and presentation without rebuilding those contracts. The final tree-scrolling measurements pass the existing 4x budget. NVDA and Narrator are omitted from this release qualification by maintainer decision; spoken announcements remain unverified.

## 0.1 Tree Grid, Read-Only

### Tree Explorer Completion

Consumers: HtmlForgeX tree documents and the live and offline tree explorers described below. These requirements complete their selection and data lifecycle before adding another view type.

- [x] Prompt navigation cancellation, host-owned keyboard events, disposable fragment configuration, bounded remote requests, and viewport-aware toolbar panels.
- [x] Correct ordering of fully materialized inline siblings before paging, with stable retained selection and expansion.
- [x] Query-aware hosted sorting and filtering with cursor invalidation and dataset revision checks.
- [x] Programmatic selection, selectability and veto hooks, and explicit select-all scope that never fetches unloaded data.
- [x] Hierarchical checkbox selection with branch intent for unloaded descendants, separate from focus and row selection.
- [x] Versioned reload and accepted data updates that preserve surviving identities, focus, selection, expansion, and scroll anchors.
- [x] Versioned saved view state for columns, sorting, declared filters, selection, expansion, timezone, and scroll anchors.
- [x] Host-governed edit, drop, and context-action proposals with asynchronous rejection and keyboard alternatives.
- [x] Bounded inactive subtree and sidecar pack retention, with navigation-owned prefetch pins.
- [x] Large logical-height scrolling with reachable rows and preserved logical anchors.
- [x] Qualify the final tree runtime at normal speed and 4x CPU slowdown with five runs per browser and processor domain. On the Ryzen 9 9950X3D2, Edge 154's plain nine-column tree has 4x medians of 4.36% and 4.30% frames over 50 ms; Chromium 153's tree with host-rendered cells on 20% of rows has medians of 4.07% and 0.92%. Each is below the unchanged 6% target. All 40 runs have zero blank samples and runtime errors. Edge records roughly 144 Hz cadence, Chromium roughly 60 Hz; workloads and cadence differ, so these are separate qualifications. Individual runs above 6% remain in the evidence.
- [x] Bounded unpinned identities retained by inline sorting; active and pinned tree data remain outside that retention limit.
- [x] JavaScript module and classic distribution with typed host contracts, an isolated package-consumer check, and server-safe imports.
- [x] Firefox and WebKit browser contracts, alongside Chromium, with engine-specific coverage in CI.
- [x] Complete representative HtmlForgeX migration proof against the accepted source, packed artifacts and published CanopyX packages. Normal public-package restore and CI pass in HtmlForgeX #331. Automated accessibility checks pass; NVDA and Narrator are omitted from this release qualification.

Gate: the library's protocol, static fallback, supported .NET targets, package smoke, browser contracts, and real host workflows pass together. Unloaded selections and query changes have explicit semantics, stalled operations settle, and large datasets stay within measured memory and rendering budgets.

Consumers: the TestimoX GPO explorer (both views, the GPO list and the scope tree; TestimoX plan section 10.2), and HtmlForgeX, where the CanopyX tree is offered as a second tree choice next to the existing `FancyTree` component (jQuery plus the fancytree plugin), which stays.

Scope, taken from the `hfx/archetypes` 07 `tree` checklist:

- [x] Every Must, each covered by the Playwright suite in `tests/browser`:
  - [x] lazy children from a data source (inline, sidecar, remote)
  - [x] paged children with "show more"
  - [x] virtual scrolling
  - [x] columns with per-level sort
  - [x] search that returns id paths and expands them
  - [x] "only matching" filter that keeps ancestors
  - [x] badges and rollup values supplied by the host
  - [x] detail rows that host other components (for example a before/after table under a revision)
  - [x] selection event for a drawer
  - [x] deep link that expands a path
  - [x] remembered expansion state
  - [x] ARIA tree grid roles and states with a row-focus keyboard model and screen-reader announcements
  - [x] theming in light and dark from a small set of base colours
  - [x] outline fallback for email, print, and Office
- [x] Row-cell reuse on recycle, with virtual rows kept in DOM order throughout scrolling. Normal-speed and 4x CPU comparisons for the final renderer are recorded in PR #5; timing depends on the workload and machine.
- [x] Multi-select (a Should, small: selection set plus `aria-multiselectable`).
- [x] Column resize and hide (a Should; the spike already has resize, hide is small).
- [x] Bundle writer: top-level pages, the children pages of all other nodes packed into shared files, paged long lists, and a search index (an entry table that holds every node once, and word shards by prefix that refer to it), all as sidecar scripts that load from `file://`. It replaces the spike's one-off converter and removes the 7.7 MB single-file problem. Packing answers the first consumer's delivery problem: its largest bundle had one file per child list, 151,802 files in all. The writer also takes the tree node by node from the host, so that consumer no longer needs 1.2 GB to write it.
- [x] Static fallback renderer: a script-free outline table for email, print, and Word.
- [x] Examples generated from a synthetic file-system-like tree that scales past 100,000 nodes.
- [x] Playwright smoke tests, accessibility checks (axe-core plus a keyboard walkthrough), and performance budgets in CI.
- [ ] A screen-reader pass over the tree grid, including DOM order during scrolling and cell navigation: run `docs/screen-reader-test.md`. NVDA and Narrator are omitted from this release qualification by maintainer decision. Automated checks cover roles, states, focus, and order; spoken announcements remain unverified.

Gate:

- In CanopyX CI, on the large bundle example (a synthetic tree of more than 100,000 nodes): first rows within 2.5 s, each expand, page of children, and search to an expanded path within 250 ms, and no blank rows while scrolling. Runtime assets within 48 KB gzip.
- With `tests/browser/bench/scroll-benchmark.mjs`, median of 5 runs at `--cpu 4`: frames over 50 ms are at most 6% of the frames recorded while scrolling, which was patched Wunderbaum's median in the spike (56 of about 900).
- In TestimoX, measured there on its own fixture: the GPO explorer design packet renders both views on CanopyX with the L fixture (5 domains, 5,000 GPOs, 200,000 links) within the TestimoX plan section 7.2 budgets.
- Every HtmlForgeX `FancyTree` example (nested nodes, icons, folders, minimum expand level) can also be rendered on CanopyX with the same content, so authors can choose either tree.

If row-cell reuse cannot meet the 4x gate, the D21 decision is revisited in the TestimoX plan. Its fallback, patched Wunderbaum, would live in the consumer behind its own API; CanopyX does not vendor a third-party grid.

Closed for the first consumer (the TestimoX GPO explorer design pages, 2026-09-30), each as a generic API:

- [x] Fixed-size rows contain layout and painting; detail rows retain content measurement. Five paired, alternating before/after runs of `scroll-benchmark.mjs` (Edge headless, 5,005 expanded rows, nine columns) measure 6.70% → 5.89% frames over 50 ms at 4x CPU slowdown, within the 6% gate. At normal speed both medians are 0%, and neither version shows a blank row. The 4x after-run range is 5.45% to 6.75%; these measurements qualify this fixture on the validation machine.
- [x] Bundle packing: children pages share pack files up to the file budget (152,601 files became 3,457 on the packing benchmark).
- [x] Streaming bundle writer: `Write(view, directory, roots, children)` reads the tree from the host node by node.
- [x] Detail rows as tall as their content (measured), inside the visible width, with wrapping tables and column width shares.
- [x] Host renderers per column (`renderers`), so the other columns keep their cell reuse.
- [x] Dates in UTC or the reader's time zone (`timeZone`, `setTimeZone`), the other zone in the tooltip.
- [x] Tones as names: six built in, any other from the host theme (`--cx-tone-<name>`).
- [x] Host data on a node (`data`), and search limited to node kinds (`search.kinds`).
- [x] Host-driven filters (`hidden`, `canopyx:filter`), a pinned tree column, `setColumnWidth`.
- [x] `CanopyX.configure` for auto-mounted fragments, manual mounting, and a host link scheme (`formatLink`, `parseLink`).

Closed for the HtmlForgeX bridge (`HtmlForgeX.CanopyX`, 2026-09-30):

- [x] Labels: every text CanopyX writes itself comes from `CanopyTreeView.Labels` (English by default), carried to the browser in the view's `labels`; `createTreeGrid` and `configure` take `labels` too.
- [x] Deep links are written onto the page's own address, so a `<base href>` (SharePoint viewers) does not move them.
- [x] The static outline in light, dark, or the host's colours (`CanopyStaticTheme`), and with `UseThemeVariables` following the page's theme without script.
- [x] `CanopyNode.HasInlineChildren`, `HasCells`, `HasBadges`, `HasFlags`, `HasData` ask what a node holds without creating its collections.
- [x] Runtime files named by their content hash (`canopyx.<hash>.js`), and `CanopyHtmlAssets.ScriptHash` and `StyleHash` for hosts with their own asset pipeline.
- [x] The search index packed into `q/<n>` files of up to 64 KiB (`CanopyBundleOptions.SearchPackBytes`): on the packing benchmark 2,910 index files became 370, and the bundle 917 files instead of 3,457. Measured with `search-benchmark.mjs` on the packed catalog (medians of 5; the search part of a cold query, then the whole cold query to a painted, expanded hit):

  | Index | Files | Cold query loads ("identity gateway") | Search 1x | Search 4x | To expanded hit 1x | To expanded hit 4x |
  | --- | --- | --- | --- | --- | --- | --- |
  | Separate files | 2,910 | 24 files, 736 KB | 17 to 39 ms | 61 to 94 ms | 40 to 82 ms | 234 to 371 ms |
  | 64 KiB packs | 370 | 19 files, 1,503 KB | 13 to 23 ms | 44 to 81 ms | 48 to 79 ms | 265 to 301 ms |
  | 512 KiB packs | 42 | 12 files, 6,090 KB | 13 to 20 ms | 58 to 81 ms | 43 to 51 ms | 259 to 295 ms |

  The ranges span the three catalog queries; the machine ran other work, so differences of 20 ms are noise. The search part stays far inside the 250 ms budget at 4x either way. 64 KiB packs were chosen because 512 KiB packs load three to six megabytes per cold query and hold two to three times the heap for a few hundred files fewer. The expand benchmark is unchanged within noise (first rows 86 ms at 1x, the manifest grows from 30 to 32 KB).
- [x] Cell navigation (the cell half of the ARIA tree grid pattern) for rows whose cells hold controls; controls in cells and detail rows are no longer Tab stops. `docs/screen-reader-test.md` is the manual reader pass. A control its cell clips scrolls into view inside the cell, and Shift+Tab from a cell leaves the grid in one step.
- [x] A children pack size of its own (`CanopyBundleOptions.ChildPackBytes`, 128 KiB), with the pages of one child list kept together up to the file budget. Measured with `search-benchmark.mjs` and `expand-benchmark.mjs` (Edge, busy machine, medians of 9: three interleaved rounds of 3 runs; ranges over the three catalog queries):

  | Children packs | Files: catalog / examples / directory | Cold query loads: catalog / examples | Heap after it: catalog | To expanded hit 4x: catalog / examples | To expanded hit 1x: catalog |
  | --- | --- | --- | --- | --- | --- |
  | 512 KiB (before) | 917 / 172 / 69 | 1,312 to 1,663 KB / 1,619 KB | 2.0 to 2.5 MB | 192 to 254 / 201 ms | 36 to 46 ms |
  | 256 KiB | 1,465 / 246 / 85 | 801 to 1,248 KB / 1,100 KB | 1.6 to 2.0 MB | 202 to 315 / 249 ms | 29 to 42 ms |
  | 128 KiB (default) | 2,568 / 392 / 117 | 645 to 1,224 KB / 851 KB | 1.4 to 1.9 MB | 244 to 249 / 193 ms | 32 to 40 ms |
  | 64 KiB | 4,807 / 689 / 182 | 581 to 1,225 KB / 723 KB | 1.4 to 1.8 MB | 218 to 352 / 211 ms | 35 to 43 ms |

  The pack size changes the bytes a query loads and the heap it keeps, not its time: the same 512 KiB bundle measured 275 to 371 ms at 4x in an earlier run of the benchmark on the same machine, and a 512 KiB pack loads and runs in 14 ms at 4x (a 128 KiB one in 9 ms). Without grouping, 64 KiB packs put each page of a long list in a file of its own, and reaching a service far down a region read four packs one after another; grouped, it reads one. Expands, first rows, and the directory bundle are unchanged within noise. 128 KiB was chosen as the size that takes most of the saving in bytes and heap while the large bundle stays at about 2,600 files.
- [x] A host filter bar: `setActiveFilters(ids)` sets the whole active set in one step (one row rebuild, one `canopyx:filter` event with the final set, where switching a choice with `setFilterActive` made two, the first with the state in between), and `CanopyHtmlOptions.HiddenFilterIds` hides the switches of the filters a host draws itself on one page without changing a shared view (the bridge flipped `CanopyFilter.Hidden` under a lock). Example page `filter-bar.html`.
- [x] Location hints on search hits, and one render per opened path. A search entry names the files of the pages on its path that a reader would not load anyway (the node's first children page, and the page that holds it, each when it is in another file), so the runtime loads every file on a hit's path at once; opening any path (search hit, deep link, remembered state, `expandPath`) rebuilds and renders the rows once, moves focus once, and draws the overscan in the frame after the jump. Measured with `search-benchmark.mjs` and `expand-benchmark.mjs` (Edge headless, medians of 9: three interleaved rounds of 3 runs, the machine 77 to 100% busy with other work):

  | Search to expanded hit | Cold 4x | Cold 1x | Warm 4x | Search part 4x (after) |
  | --- | --- | --- | --- | --- |
  | examples: quarterly review | 221 → 154 ms | 58 → 30 ms | 11 → 9 ms | 46 ms |
  | deep: quarterly report 17 | 278 → 128 ms | 45 → 29 ms | 24 → 17 ms | 50 ms |
  | directory: firewall policy 0022 | 144 → 96 ms | 20 → 21 ms | 10 → 6 ms | 28 ms |
  | directory: workstations | 182 → 101 ms | 30 → 22 ms | 11 → 8 ms | 33 ms |
  | catalog: identity gateway | 212 → 209 ms | 43 → 29 ms | 11 → 8 ms | 78 ms |
  | catalog: release 3 security | 302 → 190 ms | 52 → 35 ms | 23 → 19 ms | 70 ms |
  | catalog: dana.levi | 294 → 150 ms | 36 → 23 ms | 21 → 15 ms | 44 ms |

  Opening a path by id without a search, 4x: the catalog's deep service 102 → 69 ms and a fresh page on a deep link to it 649 → 449 ms; the example's deep file 533 → 104 ms and its deep link 1,039 → 578 ms; the directory's deep unit 56 → 33 ms. First rows and single expands are the same or faster (first rows at 1x within 11 ms, which is noise here). The index grows about 1% (20.1 → 20.3 MiB and 370 → 371 files on the catalog, 5.52 → 5.58 MiB on the examples, 2.93 → 2.95 MiB on the directory tree) and 17% on the adversarial deep tree; a cold query loads the same number of files. The streamed writer holds the entries of one top-level subtree until it is finished (the catalog's peak working set 163 → about 175 MB).

Left open by that work:

- Page chrome (header, toolbar slots, side panel) stays with the host; for HtmlForgeX documents it belongs to the `HtmlForgeX.CanopyX` bridge, which also maps design tokens onto `--cx-tone-<name>`.
- Right-to-left layout: row positions, the pinned tree column, and the detail body use physical left offsets.
- The streamed writer holds one whole child list in memory until its last node is read; a flat list of millions of top-level rows needs pages that are written as they fill.
- On the packed catalog at 4x, "identity gateway" (a service far down a region of 1,000) stays at about 210 ms on a busy machine, over the 200 ms margin and under the 250 ms budget. A trace (Edge, 4x): the search is 70 to 80 ms (19 index files; inserting their script elements alone costs about 17 ms), attaching the region's 1,000 services from one 229 KB pack about 25 ms, the forced layout of the rows in view about 20 ms, and the paint and commit 30 to 40 ms. What is left is the search (it ranks five times `maxResults` candidates and reads the entry files of all of them) and the size of the list a hit sits in; the path itself already loads in one round and renders once.
- The pages of a list larger than the file budget, and the top-level pages, that lie between a list's first page and the one that holds a hit still load one after another.
- The streamed writer holds the search entries of a top-level node's subtree until that node is finished, because the location fields of an entry are known only once the lists on its path are paged: for a tree with one top-level node, the whole entry table (about the size of the entry files, twice in memory as UTF-16). Keeping the pending entries as UTF-8 or spilling them to a file would bound it, if a consumer's tree needs that.
- While a hit's files are prefetched nothing shows, also past 250 ms. Prefetched files are released when their navigation completes or is cancelled.
- Scroll benchmark numbers for renderers and time zones on a quiet machine; the runs recorded in PR #10 were taken while other builds ran and differ by less than their noise.

Tree grid follow-ups without a milestone yet, each with the consumer that will pull it in:

- Ghost rows for "as of" views: GPO explorer as-of view, once `rp/gpo-collect` stores versioned snapshots.
- Export of the visible tree to Excel: GPO explorer fallback. The export runs in the host through OfficeIMO from the same rows `visibleRows()` returns; CanopyX only supplies the rows.
- Sticky parent rows and filter-match highlighting: the GPO explorer scope tree, if the design packet asks for them.

- Switching between host-supplied groupings in the toolbar (group by domain, change date, owner, or status): the GPO explorer list view, if the design packet keeps it. Each grouping stays a tree the host builds; CanopyX only switches between them.

## 0.2 Hosted Protocol

Consumer: the TestimoX Monitoring service, which serves the GPO explorer live from its database.

- [ ] `CanopyX.AspNetCore` (targets `net8.0` and `net10.0`): endpoint helpers that answer children pages, search, and counts with the same `canopyx/2` documents the bundle writer produces, so the runtime's remote data source works unchanged.
- [ ] The host supplies the query callbacks. Database paging stays in DbaClientX and reaches CanopyX through a bridge in the host, so CanopyX takes no DbaClientX dependency.
- [ ] Endpoints take the host's authorization policy (there is no anonymous default) and the host's page-size and query-time caps (TestimoX plan section 19.1).
- [ ] Remote search hits carry no location hints, so a hosted path opens one level after another (one round trip each). The remote source can implement the runtime's optional `prefetch(opens, finds)` once the search document says where a hit's pages are; the bundle index already does (see "Search Index" in data-protocol.md).

Gate: the live GPO explorer answers each expand and search within 400 ms round trip at L (TestimoX plan section 7.2).

### Hosted Grid Server

Consumers: ASP.NET Core and other .NET hosts that serve hosted flat grids from a database or a service, starting with the fleet inventory sample and the TestimoX Monitoring grids.

- [x] `CanopyX.Data`: typed request parsing with an explicit column allow-list and safety limits, `IQueryable<T>` execution (sort, every filter operator, filter groups, quick search, paging with counts, value lists, grouping and aggregates), streamed CSV export with an export-format interface, `ICanopyDataProvider` for raw SQL back ends and the `CanopyInMemoryProvider<T>` reference implementation.
- [x] `CanopyX.AspNetCore`: `MapCanopyRemote` query, value-list, summary, export and view routes with cancellation, typed client errors, authorization by default and the browser source script.
- [x] Fleet inventory sample over SQLite and EF Core with an end-to-end browser test and `--bench` measurements at 100,000 and 1,000,000 rows (`docs/remote-dotnet.md`).
- [ ] Batch commit of grid edits through the same endpoint group once editing lands.
- [ ] Multi-level grouping and further aggregates as the grid's grouping feature extends `gridSummary`.
- [ ] Cursor (keyset) navigation for very deep pages over large tables.

Gate: random queries give the same documents from EF Core over SQLite, LINQ to objects and the reference implementation, and the sample grid pages, sorts, filters, searches, lists values and exports against its real endpoints.

## HtmlForgeX Bridge: CanopyX as a Tree Choice

Consumers: HtmlForgeX documents and the TestimoX reports that HtmlForgeX renders. The work happens in HtmlForgeX and needs CanopyX 0.1; this entry tracks it because it is the first external consumer of `CanopyX.Html`.

Owner decision (2026-10-15): HtmlForgeX offers choices. `FancyTree` stays and the CanopyX tree is added beside it; nothing is deprecated or removed.

- [ ] `HtmlForgeX.CanopyX` bridge (in HtmlForgeX): registers the CanopyX assets as a library, maps HtmlForgeX design tokens onto the CanopyX base colours, and emits the fragment.
- [ ] Offer the CanopyX tree alongside `FancyTree`, so authors can pick either. Document where each fits; for example, `FancyTree`'s `SelectMode` and free-form `Extensions` reach fancytree features (tri-state checkboxes, drag and drop, editing) that CanopyX may not cover yet.
- [ ] Keep `FancyTree` and its jQuery and fancytree assets maintained, and load them only on pages that use it.
- [ ] Qualify the bridge's `StaticOutline.Only` output for email and Office delivery. HtmlForgeX has no separate `HtmlForgeX.Email` project; the bridge emits a script-free outline table through CanopyX's static renderer. Actual email-client rendering remains a separate consumer check.

Gate: both trees work side by side on one page without asset conflicts, and a tree authored through the bridge has a script-free outline table with literal colours and inline styles for email and Office delivery. Actual email-client rendering requires that consumer's checks.

## 0.3 Data Grid View

Consumer: the HtmlForgeX `DataExplorer` and inventory reports. Its existing reporting implementation remains a separate maintainer's branch; integration uses separate branches. TestimoX adoption is deferred and does not gate standalone library work.

The first flat grid is implemented on the shared tree/grid viewport. It provides stable row identities, typed raw/display cells, whole-dataset search and filtering before paging, stable multi-column sorting, bounded virtual rows and request lifetimes, column resize/visibility/order, sticky headers, named session views, keyboard/ARIA navigation, selection/copy, host-composed details, and filtered/selected/all exports. Cell tones, badges, tooltips and host renderers are already available. See [README.md](README.md#flat-data-grid) and [the protocol](docs/data-protocol.md) for current usage.

Standalone examples and a separate HtmlForgeX inventory host have contract, browser, package and actual wide/compact light/dark proof. The shared runtime preserves the tree contracts. Current scrolling qualification covers five alternating before/after pairs at normal and 4x slowdown per processor domain in Edge and Chromium, at roughly 144 Hz and 60 Hz. Final 4x medians of frames over 50 ms are 0.21%/0% and 0%/0%, below the existing 6% target; all 80 runs have zero blank samples and runtime errors. Earlier roughly 55 Hz Edge matrices failed that target and remain an open environment-sensitivity investigation. These measurements establish current-environment behavior, not a guarantee for every host.

### Reporting Grid Replacement Scope

Report-engine foundations include hidden-container layout, wrapped automatic rows, stable measured scroll anchoring, pixel-based keyboard paging, bounded first-load content sizing and ordered raw-value row/cell highlight rules. Columns offers per-column and full-grid fitting while saved widths retain precedence. Complete Polish, German and Spanish packs cover browser and static labels. The standalone contained, wrapped, content and localized examples exercise these paths. Consumer: portable inventory reports and TestimoX tables. Host migration still needs each report's workflow qualification.

The replacement target is a complete reporting workflow: readers can find records, change their layout, inspect content, select a defined scope, and export the same accepted results. Existing DataTables callers also depend on formatting, paging controls, responsive hidden-column details, grouping and print behavior. Replacing a table must preserve those outcomes, not merely its row renderer.

The following assessment uses the current CanopyX source and the primary reference documentation linked below. It is a product backlog; unchecked capabilities are not implemented. Delivery stages express order rather than promised versions or dates.

| Capability | Current CanopyX | Remaining useful outcome | Stage |
| --- | --- | --- | --- |
| Typed values and sorting | Raw/display values, numbers/dates, missing-last ordering, stable ID ties, multi-sort, deterministic natural/category policies and explicit binary64 precision limits | Qualify ordering through combined reporting and host-query workflows | A |
| Visible paging | Paged or continuous presentation, independent fetch/page lengths, offset controls and opaque cursor traversal | Qualify combined reporting workflows as further controls land | A |
| Search as users type | Configurable local/remote delay, case-folded substring or word/phrase search, column policy, aliases, IME and cancellation | Qualify input-to-accepted-result latency in representative hosts | A |
| Typed filters | Active chips, inclusive ranges, category/boolean choices, membership and optional header filters | Qualify the combined report's operators and missing-value behavior during adoption | A |
| Rich cell content | Safe link/icon/progress/list/boolean/long-text presenters, tones, badges and explicit host renderers | Map each report's formatting and copy/export text through the typed cells | A |
| Column layout | Pointer/keyboard moves, bounded auto-fit, min/max/flex widths, left/right pins, chooser and sticky headers | Grouped headers and measured column virtualization needs | C |
| Responsive records | Priority-based temporary hiding, horizontal scrolling and host-composed record views | Optional host card layout for a demonstrated report need | Adoption |
| Advanced filtering | Nested AND/OR builder, typed predicates and full-query facets/counts | Host-authorized query presets and consumer-specific facet sources | Adoption |
| Saved views | Durable local/host storage, schema validation, default/rename/delete/reset and permitted shareable state | Integrate each host's remote storage and access policy | Adoption |
| Selection | Checkboxes, Shift ranges, page/filtered scopes, counts and revisioned query selection with exclusions | Cell ranges and analytical status summaries | C |
| Details | Cancellable host hook, focus return and qualified reusable HtmlForgeX record/property drawers | Measured inline expansion when a report requires it | C |
| Grouping and summaries | Flat headings, collapse, full-query totals and revisioned hosted summaries; paging and exports count records | Grouped headers and summary/footer rows for demonstrated wide reports | C |
| Export and print | Captured scoped requests, bounded snapshots, progress/cancel, metadata, complete host print and qualified typed Office host delivery | Connect approved host formats and preserve each report's standalone download behavior | Adoption |
| Wide tables | Row virtualization; all visible columns are mounted | Grouped headers, frozen summary rows and measured need for column virtualization | C |
| Live data | Query replacement and view destruction are managed | Revision-aware replace/update/remove operations that preserve focus and reject old cached pages | C |
| Analytical interaction | Row selection and focused-cell copy | Cell ranges, range copy and scoped status summaries; pivot UI only for a measured consumer need | C |
| Editing and reordering records | Tree proposal hooks exist; the flat grid does not expose those workflows | Typed flat-grid proposals, validation/conflicts/busy states, batch proposals and host-governed record reordering | D |
| Host integration | .NET page/fragment writers, JavaScript grid entry point, local inventory bridge proof | A documented typed HtmlForgeX table migration surface, maintained examples and consumer-specific replacement gates | Adoption |

### Stage A: Finish Everyday Table Interaction

Consumers: standalone CanopyX examples, HtmlForgeX inventory reports and the existing `DataTablesTable` paging/search/column-control workflows. CanopyX owns generic query and interaction behavior; HtmlForgeX owns report authoring and composition.

- [x] Add an optional paged presentation alongside continuous virtual scrolling. Source fetch size and visible page size are independent. Accepted filtered/total counts, page ranges, first/previous/next/last controls and page jump share the existing query, revision, selection and export contracts. Query changes reset or clamp the page.
- [x] Declare offset and cursor source navigation capabilities. Known-total offset sources offer numbered pages; cursor-only sources offer supported next/previous navigation with independently nullable counts, without fake random access. Database traversal stays in the host/DbaClientX owner. Exports validate contiguous traversal, captured revisions and complete known totals.
- [x] Make search delay configurable, with a fast local default and bounded remote requests. Specify all-word matching across searchable columns, quoted phrases, case/diacritic behavior and optional search aliases independent of display/sort/export values. Keep substring mode available and define equivalent host semantics. Enter applies immediately; IME composition never sends partial queries.
- [x] Show active search/filter chips, result counts and an explicit clear action. Reporting views add inclusive number/date ranges, boolean/category choices and optional header filters over the existing typed predicates; missing-value operators remain explicit.
- [x] Add documented deterministic ordinal/folded/natural text order and category-order policies, with a reusable host comparer. Missing values stay last and stable identities break ties. Define binary64 numeric limits, exact text representations and UTC millisecond date ordering; shared native/browser fixtures cover policy equivalence.
- [x] Build a small optional set of safe cell presenters on the existing renderer contract: links with allowed schemes, icons with text alternatives, progress, boolean/status values, compact lists and long-text expansion. Keep trusted custom DOM rendering explicit; export/search text must not be scraped from the mounted viewport. Hosts compute domain facts and conditional tones.
- [x] Add direct header reordering with visible drag feedback, keyboard move commands and stable focus. Add documented auto-fit sampling/caps, width constraints and optional flex sizing. Keep hidden columns, saved state, sort priorities and export order consistent by column ID.

Gate: a standalone paged report and the same inventory in continuous mode produce identical full-query sorted/filtered results and export identities. Exercise first/last/empty pages, page-size changes, queued search/reset, rapid remote responses, IME input, numeric/date precision fixtures and pointer/keyboard column changes. Measure input-to-accepted-result separately from render and network time; establish a repeatable latency budget on representative local and hosted datasets before calling search instant.

### Stage B: Replace Complete Reporting Workflows

Consumers: HtmlForgeX inventories with wide content, grouped reports, reusable filters, saved layouts and export controls. The independent DataExplorer maintainer's implementation supplies comparison workflows; it is not rewritten as part of library qualification.

- [x] Add generic left/right column pinning with width limits and an accessible scrolling center. Preserve column identity, visual/DOM order, focus and export order when hiding, dragging or resizing pinned columns.
- [x] Define responsive column priorities and always-visible identity/actions. Hidden fields remain reachable through the generic record drawer or a host-owned `onDetails` view; responsive hiding never changes search or export scope. Keep the existing horizontal-scroll option. Product-specific composition and card layouts belong to reusable HtmlForgeX components over the same accepted data.
- [x] Extend the query protocol with bounded nested AND/OR filter groups and a composable builder. Add facet values, counts and optional remote search as source capabilities, with explicit whether-counts-include-the-current-facet semantics. Never derive whole-dataset facets from cached visible rows.
- [x] Add persistent view storage hooks and a documented state schema: defaults, rename/delete/reset, validation, added/removed columns and schema versions. Sharing omits sensitive searches; query-bearing sharing uses a host-authorized opaque identifier. Loading state is user intent, not authorization to read other records.
- [x] Add visible row selection controls, Shift ranges and a selected-count summary. Define page selection separately from all filtered results. Large query selection uses an accepted revision/query descriptor plus exclusions instead of materializing a million IDs; exports and host actions validate that descriptor. Define what happens when a selected record leaves the query or the revision changes.
- [x] Support reusable HtmlForgeX record/property drawers through `onDetails`, with cancellation, focus return, safe long text and related-record content. Responsive fields remain available through the same accepted record; details do not stretch a fixed virtual row.
- [x] Add flat grouping and summary descriptors with stable group keys, collapse state and group/leaf count semantics. Paging, selection and record exports count records; collapsed presentation ranges do not trigger hidden-page loading. The grouping key leads sort order, followed by user sorts and stable IDs. Inline complete datasets compute generic aggregates; hosted sources provide complete-query aggregates. Record exports omit synthetic headings and receive the accepted grouping order; a host can add summary metadata deliberately. Domain rollups stay host-owned.
- [x] Expand delivery over the existing export descriptor: progress/cancel, filename and locale/time-zone metadata, visible vs declared columns, raw vs display values, and print of an accepted query. Bounded snapshots traverse the requested source scope without truncation; hosts use the static renderer for complete print output. Printing the mounted viewport is not a full-query export.
- [x] Provide captured requests and cancellation for host-supplied OfficeIMO XLSX/PDF generation through HtmlForgeX export hooks. Qualify typed dates/numbers, literal formula-like text, safe hyperlinks, complete ordering, limits, failures and cancellation of an active large-result generator. Office generation remains a host responsibility. Standalone reports use bounded embedded CSV/copy, a host-prepared Office download, or a separately approved optional provider; an HTTP hook does not provide offline Office generation.

Gate: compare an actual HtmlForgeX paged inventory, a rich responsive report and a grouped report against their current workflows. Record formatting, result IDs/order/counts, filtered/selected/all exports, visible/hidden columns, state restoration, print and details behavior. Test combined pinning/reorder/responsive/selection/export behavior, not each feature in isolation. Keep existing tables as an explicit migration choice until every consequential workflow in that report passes.

### Stage C: Wide, Live And Analytical Views

Consumers: the HtmlForgeX DataExplorer's wide datasets and live inventories; the later matrix view shares only the proven generic viewport capabilities. These are conditional extensions after the reporting gates, not prerequisites for replacing ordinary tables.

- [ ] Evaluate inline expandable grid details when a named report needs them, with measured row heights and keyboard/ARIA proof. A fixed row must not grow beyond its containment box; retain the host-composed record drawer as the existing details path.

- [ ] Add grouped headers and summary/footer rows for wide reports, with explicit accessible header associations and ordering rules. Bring this forward into Stage B when an inventoried report already requires complex headers; otherwise keep its complexity behind the wide-table use case.
- [ ] Measure realistic 50/100/200-column fixtures before implementing column virtualization. If mounted cells dominate cost, extend the shared viewport while retaining pinned columns, logical ARIA indices, offscreen keyboard navigation, details and exports. Do not introduce a second row engine.
- [ ] Define revision-aware data replacement and row updates/removals, cache invalidation, scroll anchoring, focus/selection retention and optional paused refresh. Sorted/filtered hosted updates may require a fresh accepted query rather than relocating rows from partial cache knowledge.
- [ ] Add rectangular cell selection and range copy only where DataExplorer readers need comparison workflows. Define ranges across reordered/hidden/virtual columns and rows, escaped clipboard formats and whole-range versus loaded-range limits. Summaries name their scope and never treat a loaded window as the dataset.
- [ ] Evaluate pivot presentation only after a real inventory needs it and grouping/aggregate semantics are stable. Hosted pivot data is computed through the host/data owner; full charts remain ChartForgeX integrations. A 2D categorical matrix remains its own view rather than an overloaded table option.

Gate: produce a measured wide/live inventory demonstration. Record DOM/cache bounds, browser memory, query/render/input latency, sustained scroll and update behavior at normal and 4x slowdown. Keyboard navigation, cell identity and frozen headers remain correct when columns/rows leave the mounted window. Ship only the extensions that improve the demonstrated consumer.

### Stage D: Governed Grid Actions

Consumers: a later HtmlForgeX editable inventory or administrative explorer that actually needs governed changes. TestimoX and other product adoption require their own later scope; existing tree editing is not proof of flat-grid editing.

- [ ] Extend the existing proposal pattern to flat cell editors and row/context actions. Include typed validation, cancellation, busy states, an accessible error surface and host-returned canonical values/revisions. CanopyX raises intent; the host authorizes and executes changes.
- [ ] Define batch editing/paste and record drag reorder only for a named host workflow. Support partial failure, conflict and cancellation policies; do not silently overwrite newer records or mutate cached rows as an assumed database commit.
- [ ] Keep undo/redo, audit, conflict resolution and write transactions host-owned. Spreadsheet formulas, automatic fill and merged body cells need separate consumer and design justification before entering the library.

Gate: a host example rejects unauthorized and stale proposals, returns validation/partial-failure results, and refreshes the accepted data without losing focus or applying an unconfirmed write. Reordering is tested independently of column reordering and current sort order.

### Reliability And Adoption Gates

Consumers: every CanopyX host, especially standalone .NET/JavaScript users and the HtmlForgeX inventory bridge. These gates apply across stages rather than becoming a separate feature engine.

- [ ] Investigate the retained roughly 55 Hz Edge scrolling failures with a concrete environment hypothesis. Keep every domain/round/outlier, browser/cadence/asset provenance and the unchanged 6% target. Extend proof to search/sort/state/selection/export latency and browser memory where new work affects them; do not replace a failed run with a favorable refresh-rate sample.
- [ ] Complete actual screen-reader speech checks alongside automated ARIA/axe, keyboard, zoom, forced-colors, RTL/localization and reduced-motion checks. Keep logical row/column counts and focus observable with virtualization, loading, pinned content and details. Automated accessibility checks alone do not establish speech behavior.
- [ ] Exercise request failure/timeout/cancellation, stale revisions, invalid state, source count changes, empty datasets, multiple grids, tab/hidden-container sizing and disposal. Export and selection must preserve accepted-query identity through these transitions.
- [ ] Maintain source/protocol/schema/native/browser/package contracts together, all four .NET targets, strict JavaScript consumers and core asset budgets. Keep optional interaction/presentation parts out of the ordinary tree runtime where practical. Audit unsafe text/links, renderer lifetime, CSP-compatible hosting and prototype-shaped IDs at the owning boundaries.
- [ ] Publish a documented HtmlForgeX grid builder and migration map for existing table authoring calls, after owner acceptance and package readiness. The bridge remains thin; database work belongs to DbaClientX, Office formats to OfficeIMO, report layout/forms/details to HtmlForgeX, and charts/static visual blocks to ChartForgeX.
- [ ] Document supported combinations and limitations, with a runnable feature gallery and a representative interaction matrix. Include paged/continuous, inline/hosted, light/dark, narrow/wide and offline/HTTP modes without multiplying unsupported configuration paths.
- [ ] Qualify library packages, public feed availability and the installed host version separately. Remove an old table component or vendor asset only after its callers migrate and generated reports/consumer CI pass. Do not add compatibility shims for unpublished shared changes.
- [ ] Evaluate a TestimoX results report only in later, separately authorized adoption work, including its existing standalone Excel behavior. Preserve useful local preparation without making it a current library gate.

The first replacement gate is Stages A and B plus the relevant reliability checks on the named HtmlForgeX reports. Stage C is driven by measured scale/analysis needs; Stage D by a governed host workflow. A full replacement claim requires a caller inventory and every required report behavior to pass, not a feature-count comparison.

### Reference Capabilities

Primary documentation checked 2026-10-04. These references describe comparison behavior, not dependencies or implementation to copy:

- [DataTables extensions](https://datatables.net/manual/extensions/) and [ColumnControl](https://datatables.net/manual/extensions/columncontrol/) establish the reporting-control surface; [SearchBuilder](https://datatables.net/manual/extensions/searchbuilder/) covers nested conditions.
- [DataTables search](https://datatables.net/ref/core/api/search()) covers word/phrase behavior; [search delay](https://datatables.net/ref/core/option/searchDelay) distinguishes local response from remote request frequency. [Orthogonal data](https://datatables.net/manual/core/data/orthogonal-data) and [renderers](https://datatables.net/manual/core/data/renderers) distinguish presentation from query values.
- [DataTables server-side processing](https://datatables.net/manual/server-side) defines complete-result ordering/filtering before page windows. [Buttons](https://datatables.net/manual/extensions/buttons/) covers export/print controls; [the server-side export FAQ](https://datatables.net/support/faqs) explains why a client with only a result window needs a host path for full exports.
- [Responsive](https://datatables.net/manual/extensions/responsive/), [ColReorder](https://datatables.net/manual/extensions/colreorder/) and [RowGroup](https://datatables.net/manual/extensions/rowgroup/) cover narrow layouts, direct column changes and report grouping. Their existence does not prove every combination is supported; our combination gates are explicit.
- [AG Grid key features](https://www.ag-grid.com/javascript-data-grid/key-features/), [column pinning](https://www.ag-grid.com/javascript-data-grid/column-pinning/), [cell selection](https://www.ag-grid.com/javascript-data-grid/cell-selection/) and [grid state](https://www.ag-grid.com/javascript-data-grid/grid-state/) describe useful advanced-grid workflows. Their larger commercial/analytical surface is a source of candidates, not an obligation to ship them all.
- [Tabulator pagination](https://www.tabulator.info/docs/6.x/page/) and [persistence](https://www.tabulator.info/docs/6.x/persist/) illustrate distinct page controls and durable layout state. [TanStack's data/rendering distinction](https://tanstack.com/table/latest/docs/guide/client-side-vs-server-side) separates full-dataset processing from viewport virtualization.
- [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) defines accessible interactive-grid behavior; real assistive-technology qualification remains necessary.

## 0.4 Matrix View

Consumers: the status matrix (services × DCs), the relationship matrix (DC × DC), and the consistency matrix (object × DC, mismatches only) from the TestimoX plan section 9.

- [ ] 2D virtualization: rows and columns both windowed, with sticky row and column headers.
- [ ] Categorical cells with tones and links, and grouping of rows by a host-supplied group key above a host-set row threshold (the status matrix groups DCs by site).

Gate: a 150 × 25 status matrix and a DC × DC relationship matrix at L meet the plan section 7.2 interaction budget and pass the accessibility checks.

## 0.5 Explorer Composition Patterns

Consumers: an Active Directory users and computers browser (ADPlayground and TestimoX Desktop) and the CertNoob Manager / CA Noob certificates overview.

- [ ] Master-detail layout and a property sheet for the selected node.
- [ ] Compose the implemented column chooser and saved views with the explorer's property sheet and navigation state.
- [ ] Consume the reporting grid filter builder rather than adding a product-local query engine.
- [x] Context actions that call host-provided, host-governed write hooks. CanopyX never performs a write itself.
- [ ] Remote sources with 1,000,000 rows.

Gate: the directory browser runs on the TestimoX L directory fixture (1.5 million objects) and the certificates overview on 1 million issued certificates from the TestimoX scale fixtures, both without product code in CanopyX, and every write goes through a host hook.

## 1.0 Public-Grade

Consumers: external users of the published packages, and write-governed tools such as CA Noob Desktop for editing.

- Tree editing and drag and drop already raise proposals to host hooks; flat-grid action coverage follows Stage D above. CanopyX applies no writes on its own.
- [ ] Documentation website built with PowerForge.Web.
- [ ] Published benchmarks with reproducible commands.
- [x] Optional npm distribution of the built runtime for hosts that are not .NET.

Gate: no breaking changes to the public API or to `canopyx/2` during 1.x, and the website documents every public entry point with a working example.

## Package Split Policy

- Stay with `CanopyX` and `CanopyX.Html`.
- When the runtime grows with new views, prefer separate JavaScript entry points (for example a tree grid script and a matrix script) inside `CanopyX.Html` before splitting packages.
- Split views into separate packages only when package size or dependency evidence requires it, and record that evidence here first.
- `CanopyX.AspNetCore` is split by dependency: it needs the ASP.NET Core shared framework, which `CanopyX` must not take, so it targets `net8.0` and `net10.0` only. It serves hosted flat grids today; the tree endpoints of 0.2 belong in it too.
- `CanopyX.Data` is split by dependency and responsibility: it parses requests with `System.Text.Json` (a package on `net472` and `netstandard2.0`) and translates them to expression trees, which the dependency-free `CanopyX` must not carry. It depends only on `CanopyX`; EF Core and database drivers stay in the host.
