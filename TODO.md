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

Consumers: the TestimoX GPO explorer (both views, the GPO list and the scope tree; TestimoX plan section 10.2) and the replacement for the HtmlForgeX `FancyTree` component (jQuery plus the fancytree plugin today).

Scope, taken from the `hfx/archetypes` 07 `tree` checklist:

- [ ] Every Must:
  - [ ] lazy children from a data source (inline, sidecar, remote)
  - [ ] paged children with "show more"
  - [ ] virtual scrolling
  - [ ] columns with per-level sort
  - [ ] search that returns id paths and expands them
  - [ ] "only matching" filter that keeps ancestors
  - [ ] badges and rollup values supplied by the host
  - [ ] detail rows that host other components (for example a before/after table under a revision)
  - [ ] selection event for a drawer
  - [ ] deep link that expands a path
  - [ ] remembered expansion state
  - [ ] ARIA tree grid roles and states with a row-focus keyboard model and screen-reader announcements
  - [ ] theming in light and dark from a small set of base colours
  - [ ] outline fallback for email, print, and Office
- [x] Row-cell reuse on recycle, with virtual rows kept in DOM order throughout scrolling. Normal-speed and 4x CPU comparisons for the final renderer are recorded in PR #5; timing depends on the workload and machine.
- [ ] Multi-select (a Should, small: selection set plus `aria-multiselectable`).
- [ ] Column resize and hide (a Should; the spike already has resize, hide is small).
- [ ] Bundle writer: top-level pages, children per parent, paged long lists, and a search index sharded by name prefix (a shard that grows too large splits on a longer prefix), all as sidecar scripts that load from `file://`. It replaces the spike's one-off converter and removes the 7.7 MB single-file problem.
- [ ] Static fallback renderer: a script-free outline table for email, print, and Word.
- [ ] Examples generated from a synthetic file-system-like tree that scales past 100,000 nodes.
- [ ] Playwright smoke tests, accessibility checks (axe-core plus a keyboard walkthrough), and performance budgets in CI.

Gate:

- In CanopyX CI, on the large bundle example (a synthetic tree of about 120,000 nodes): first rows within 2.5 s, each expand, page of children, and search to an expanded path within 250 ms, and no blank rows while scrolling.
- With `tests/browser/bench/scroll-benchmark.mjs`, median of 5 runs at `--cpu 4`: frames over 50 ms are at most 6% of the frames recorded while scrolling, which was patched Wunderbaum's median in the spike (56 of about 900).
- In TestimoX, measured there on its own fixture: the GPO explorer design packet renders both views on CanopyX with the L fixture (5 domains, 5,000 GPOs, 200,000 links) within the TestimoX plan section 7.2 budgets.
- Every HtmlForgeX `FancyTree` example (nested nodes, icons, folders, minimum expand level) renders on CanopyX with the same content.

If row-cell reuse cannot meet the 4x gate, the D21 decision is revisited in the TestimoX plan. Its fallback, patched Wunderbaum, would live in the consumer behind its own API; CanopyX does not vendor a third-party grid.

Tree grid follow-ups without a milestone yet, each with the consumer that will pull it in:

- Ghost rows for "as of" views: GPO explorer as-of view, once `rp/gpo-collect` stores versioned snapshots.
- Export of the visible tree to Excel: GPO explorer fallback. The export runs in the host through OfficeIMO from the same rows `visibleRows()` returns; CanopyX only supplies the rows.
- Cell navigation with Left/Right inside a row (the cell-focus half of the ARIA tree grid pattern), and keyboard stops inside detail rows: the accessibility review of the GPO explorer.
- Sticky parent rows and filter-match highlighting: the GPO explorer scope tree, if the design packet asks for them.
- Location hints on search hits (the offset of each path segment among its siblings), so expanding to a child deep in a long list loads the pages it needs at once instead of one after another: the GPO explorer at L, with about 1,000 GPOs per domain. The field is optional, so it fits in `canopyx/1`.
- Switching between host-supplied groupings in the toolbar (group by domain, change date, owner, or status): the GPO explorer list view, if the design packet keeps it. Each grouping stays a tree the host builds; CanopyX only switches between them.

## 0.2 Hosted Protocol

Consumer: the TestimoX Monitoring service, which serves the GPO explorer live from its database.

- [ ] `CanopyX.AspNetCore` (targets `net8.0` and `net10.0`): endpoint helpers that answer children pages, search, and counts with the same `canopyx/1` documents the bundle writer produces, so the runtime's remote data source works unchanged.
- [ ] The host supplies the query callbacks. Database paging stays in DbaClientX and reaches CanopyX through a bridge in the host, so CanopyX takes no DbaClientX dependency.
- [ ] Endpoints take the host's authorization policy (there is no anonymous default) and the host's page-size and query-time caps (TestimoX plan section 19.1).

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

Gate: no breaking changes to the public API or to `canopyx/1` during 1.x, and the website documents every public entry point with a working example.

## Package Split Policy

- Stay with `CanopyX` and `CanopyX.Html`.
- When the runtime grows with new views, prefer separate JavaScript entry points (for example a tree grid script and a matrix script) inside `CanopyX.Html` before splitting packages.
- Split views into separate packages only when package size or dependency evidence requires it, and record that evidence here first.
- The one planned exception is `CanopyX.AspNetCore` (0.2). Its evidence is the dependency: it needs the ASP.NET Core shared framework, which `CanopyX` must not take, so it targets `net8.0` and `net10.0` only.
