# CanopyX TODO

This is the central place for active and planned work. Every milestone names the consumer that needs it and the gate that says it is done. Durable technical reference lives in `docs/architecture.md` and `docs/data-protocol.md`; do not add separate roadmap or handoff documents.

References to "the TestimoX plan" mean `docs/roadmaps/Reporting-Platform-EndToEnd-Plan.md` in the TestimoX repository. The `hfx/archetypes` checklist is in `docs/roadmaps/Reporting-Platform-PR-Stacks.md` in the same repository, and the D21 spike write-up is `Docs/spikes/tree-explorer.md` on the HtmlForgeX `spike/tree-explorer` branch.

## Scope and Boundaries

- CanopyX is generic. It renders views over data that hosts supply and holds no product logic: nothing about Active Directory, PKI, TestimoX, ADPlayground, CertNoob, or any other product. Rollup counts, change markers, severities, and "only changed" flags are computed by the host and arrive as cells, badges, and flags.
- Static, non-interactive tables, lists, and KPI cards stay in `ChartForgeX.VisualBlocks`. CanopyX's static renderer exists only as the fallback for its own interactive views.
- Charts are not duplicated. When a consumer needs trend cells (the 0.4 status matrix is the likely first), they come through an optional ChartForgeX sparkline cell integration: the host renders the sparkline with ChartForgeX and passes the SVG to CanopyX as trusted cell markup. Neither CanopyX package references ChartForgeX.
- CanopyX never performs writes. Context actions (0.5), edits, and drops (1.0) are raised to hooks that the host provides and governs; CanopyX applies nothing on its own.
- Packages: stay with `CanopyX` and `CanopyX.Html` until size or dependency evidence says otherwise (see [Package Split Policy](#package-split-policy)).

## 0.1 Tree Grid, Read-Only

### Tree Explorer Completion

Consumers: HtmlForgeX tree documents and the live and offline tree explorers described below. These requirements complete their selection and data lifecycle before adding another view type.

- [x] Prompt navigation cancellation, host-owned keyboard events, disposable fragment configuration, bounded remote requests, and viewport-aware toolbar panels.
- [x] Correct ordering of fully materialized inline siblings before paging, with stable retained selection and expansion.
- [ ] Query-aware hosted sorting and filtering with cursor invalidation.
- [x] Programmatic selection, selectability and veto hooks, and explicit select-all scope that never fetches unloaded data.
- [ ] Hierarchical checkbox selection with branch intent for unloaded descendants, separate from focus and row selection.
- [x] Versioned reload and accepted data updates that preserve surviving identities, focus, selection, expansion, and scroll anchors.
- [x] Versioned saved view state for columns, sorting, declared filters, selection, expansion, timezone, and scroll anchors.
- [ ] Host-governed edit, drop, and context-action proposals with asynchronous rejection and keyboard alternatives.
- [ ] Bounded client caches, large logical-height scrolling, and measured normal/4x rendering within the existing budgets.
- [x] Bounded unpinned identities retained by inline sorting; active and pinned tree data remain outside that retention limit.
- [ ] Focused Firefox/WebKit coverage, manual reader qualification, JavaScript distribution/types, and representative HtmlForgeX migration proof.

Gate: the library's protocol, static fallback, supported .NET targets, package smoke, browser contracts, and real host workflows pass together. Unloaded selections and query changes have explicit semantics, stalled operations settle, and large datasets stay within measured memory and rendering budgets.

Consumers: the TestimoX GPO explorer (both views, the GPO list and the scope tree; TestimoX plan section 10.2) and the replacement for the HtmlForgeX `FancyTree` component (jQuery plus the fancytree plugin today).

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
- [ ] A screen-reader pass (NVDA and Narrator) over the tree grid, including DOM order during scrolling and cell navigation: run `docs/screen-reader-test.md`. Automated checks cover roles, states, focus, and order, not what a reader announces.

Gate:

- In CanopyX CI, on the large bundle example (a synthetic tree of more than 100,000 nodes): first rows within 2.5 s, each expand, page of children, and search to an expanded path within 250 ms, and no blank rows while scrolling. Runtime assets within 48 KB gzip.
- With `tests/browser/bench/scroll-benchmark.mjs`, median of 5 runs at `--cpu 4`: frames over 50 ms are at most 6% of the frames recorded while scrolling, which was patched Wunderbaum's median in the spike (56 of about 900).
- In TestimoX, measured there on its own fixture: the GPO explorer design packet renders both views on CanopyX with the L fixture (5 domains, 5,000 GPOs, 200,000 links) within the TestimoX plan section 7.2 budgets.
- Every HtmlForgeX `FancyTree` example (nested nodes, icons, folders, minimum expand level) renders on CanopyX with the same content.

If row-cell reuse cannot meet the 4x gate, the D21 decision is revisited in the TestimoX plan. Its fallback, patched Wunderbaum, would live in the consumer behind its own API; CanopyX does not vendor a third-party grid.

Closed for the first consumer (the TestimoX GPO explorer design pages, 2026-09-30), each as a generic API:

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

- [x] Labels: every text CanopyX writes itself comes from `CanopyView.Labels` (English by default), carried to the browser in the view's `labels`; `createTreeGrid` and `configure` take `labels` too.
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
- While a hit's files are prefetched nothing shows, also past 250 ms; the files stay pinned in the sidecar source until the next path opens.
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

## HtmlForgeX Bridge and FancyTree Removal

Consumers: HtmlForgeX documents that use `FancyTree` today, and TestimoX reports that HtmlForgeX renders. The work happens in HtmlForgeX and needs CanopyX 0.1; this entry tracks it because it is the first external consumer of `CanopyX.Html`.

- [ ] `HtmlForgeX.CanopyX` bridge (in HtmlForgeX): registers the CanopyX assets as a library, maps HtmlForgeX design tokens onto the CanopyX base colours, and emits the fragment.
- [ ] Replace every `FancyTree` usage and mark the `FancyTree` API obsolete for one release. Its `SelectMode` and free-form `Extensions` can reach fancytree features (tri-state checkboxes, drag and drop, editing) that CanopyX only plans for 1.0, so check outside callers before deleting.
- [ ] Delete the component and its jQuery and fancytree assets.
- [ ] `HtmlForgeX.Email` renders tree content through the CanopyX static renderer, because email clients run no script.

Gate: HtmlForgeX ships no fancytree asset, and a tree in an HtmlForgeX email renders as an outline table in the HtmlForgeX.Email client checks.

## 0.3 Data Grid View

Consumer: the HtmlForgeX `DataExplorer` (branch `feature/report-datasets`, owned by another maintainer).

- [ ] Extract one shared virtual-scroll core (offset table, row pool, windowed rendering, cell reuse) used by both the tree grid and the data grid. Do this once and only with the `DataExplorer` owner's agreement; do not copy the code into HtmlForgeX.
- [ ] Data grid view on that core, reading the same data sources.

Gate: the `DataExplorer` inventories run on the shared core within the plan section 7.2 interaction budget, and the tree grid performance tests still pass on the same core.

## 0.4 Matrix View

Consumers: the status matrix (services × DCs), the relationship matrix (DC × DC), and the consistency matrix (object × DC, mismatches only) from the TestimoX plan section 9.

- [ ] 2D virtualization: rows and columns both windowed, with sticky row and column headers.
- [ ] Categorical cells with tones and links, and grouping of rows by a host-supplied group key above a host-set row threshold (the status matrix groups DCs by site).

Gate: a 150 × 25 status matrix and a DC × DC relationship matrix at L meet the plan section 7.2 interaction budget and pass the accessibility checks.

## 0.5 Explorer Composition Patterns

Consumers: an Active Directory users and computers browser (ADPlayground and TestimoX Desktop) and the CertNoob Manager / CA Noob certificates overview.

- [ ] Master-detail layout and a property sheet for the selected node.
- [ ] Column chooser and saved views.
- [ ] Filter builder.
- [ ] Context actions that call host-provided, host-governed write hooks. CanopyX never performs a write itself.
- [ ] Remote sources with 1,000,000 rows.

Gate: the directory browser runs on the TestimoX L directory fixture (1.5 million objects) and the certificates overview on 1 million issued certificates from the TestimoX scale fixtures, both without product code in CanopyX, and every write goes through a host hook.

## 1.0 Public-Grade

Consumers: external users of the published packages, and write-governed tools such as CA Noob Desktop for editing.

- [ ] Editing, drag and drop, and tri-state checkboxes. Edits and drops are raised as proposals to host hooks; CanopyX applies nothing on its own.
- [ ] Documentation website built with PowerForge.Web.
- [ ] Published benchmarks with reproducible commands.
- [ ] Optional npm distribution of the built runtime for hosts that are not .NET.

Gate: no breaking changes to the public API or to `canopyx/2` during 1.x, and the website documents every public entry point with a working example.

## Package Split Policy

- Stay with `CanopyX` and `CanopyX.Html`.
- When the runtime grows with new views, prefer separate JavaScript entry points (for example a tree grid script and a matrix script) inside `CanopyX.Html` before splitting packages.
- Split views into separate packages only when package size or dependency evidence requires it, and record that evidence here first.
- The one planned exception is `CanopyX.AspNetCore` (0.2). Its evidence is the dependency: it needs the ASP.NET Core shared framework, which `CanopyX` must not take, so it targets `net8.0` and `net10.0` only.
