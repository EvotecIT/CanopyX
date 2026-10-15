# CanopyX roadmap

What is planned for CanopyX, in the order we expect to build it. Items under "Available now" have landed; nothing else here is available yet unless it says so; for what
the views do today, see [features](features.md). The tiers express order, not promised versions or dates. The engineering
backlog with consumers and acceptance gates stays in [TODO.md](../TODO.md).

Every planned feature comes with documentation, TypeScript types, C# XML documentation, a generic example and browser tests
in light and dark themes at desktop and phone widths, including keyboard and screen-reader paths. New capabilities load as
optional parts, so pages that don't use them keep their current size.

## Available now

These Tier 1 items have landed; each has its own page.

| | Feature | Documentation |
|---|---|---|
| A | **Plugin API** on one registry of lazy parts | [plugins.md](plugins.md) |
| B | **.NET query adapter** (`CanopyX.Data`, `CanopyX.AspNetCore`), including saving edits and multi-level grouping | [remote-dotnet.md](remote-dotnet.md) |
| C | **Feature overview, recipes and this roadmap** | [features.md](features.md), [recipes.md](recipes.md) |
| D | **Editing:** typed editors, validation, change marks, row and batch commit, undo and redo, the phone edit form | [editing.md](editing.md) |
| E | **Grouping and detail rows:** up to four levels with labelled aggregates, and expandable detail rows | [grouping.md](grouping.md) |
| F | **Column groups, cell ranges and the clipboard** | [column-groups.md](column-groups.md), [cell-ranges.md](cell-ranges.md) |
| H | **Enhance existing tables and simple setup**, pager settings and state saving | [enhance.md](enhance.md), [paging.md](paging.md) |
| I | **Conditional formatting** with a rule editor | [conditional-formatting.md](conditional-formatting.md) |
| J | **Search-hit highlighting** | [search-highlight.md](search-highlight.md) |
| K | **Layout modes** (fit, scroll, cards) and densities | [layout-modes.md](layout-modes.md) |
| | **Linked views:** external filters with chips, highlights and link events | [linked-views.md](linked-views.md) |
| | **Record panel:** structured values, tabs, related records, history, deep links and record details on demand | [record-panel.md](record-panel.md) |
| | **Large data:** mount when visible, compact row data and grid bundles | [large-data.md](large-data.md) |
| | **Security and accessibility modes:** strict CSP and Trusted Types, forced colours, reduced motion, target sizes | [security.md](security.md), [accessibility.md](accessibility.md) |

## Tier 1: in progress

| | Feature | What it adds |
|---|---|---|
| G | **Web component and Blazor** | `<canopy-grid>` and `<canopy-tree>` custom elements with attributes, properties and events. Blazor components (Server and WebAssembly) on top of them, with typed column definitions, two-way binding for selection and editing, and the .NET adapter as the data source. A sample app. |

## Tier 2: next

- **Charts with ChartForgeX:** chart a selected range or a group; chart columns (bar in cell, bullet, status strip). Bar and line
  sparklines and status strips are already available as presenters.
- **Styled Excel export through OfficeIMO**, as an export-format plugin: tones, widths, outline grouping, frozen panes and number
  formats. Also PDF export. CSV, copy and your own registered writers are already available.
- **Trees:** lazy children served through the .NET adapter, drag-and-drop reordering on top of the existing move proposals, and
  dimmed non-matches as a filter presentation (highlighted matches are available, J). Hierarchical checkboxes, filters that keep
  ancestors and type-ahead are already available.
- **Scale proof:** row and column virtualisation at 1,000,000 rows and 200 columns, published reproducible benchmarks, and memory
  and time budgets in CI.
- **Pivot mode:** row and column pivots with aggregates.
- **Formula and computed columns.**

## Tier 3: later

- **Documentation site with live examples** and a theme builder over the design tokens.
- **Accessibility statement:** axe checks in CI (already running in the browser suite), a written keyboard model against the ARIA grid
  and treegrid patterns, recorded screen-reader passes and a WCAG 2.2 AA statement.
- **Framework wrappers** for React, Vue, Angular and Svelte, on top of the web component.
- **PowerShell module** and PSWriteHTML integration.
- **More languages** beyond Polish, German, Spanish, French and Italian, and right-to-left layout.

## Also planned

These came out of a review of what CanopyX doesn't offer yet. Most fit a feature above; the rest are new items.

| Capability | Covered by |
|---|---|
| Enhance an existing `<table>`, per-cell sort and search values from `data-*` attributes, options from `data-*` attributes | H |
| Plain JSON arrays of objects or arrays with field mapping; a URL source with a property path to the rows | H |
| Configurable rows-per-page choices, numbered page buttons, hide the rows-per-page control on its own | H |
| Info text with a filtered-from-total variant | H (counts and page ranges are already shown) |
| Saved state with a duration | H |
| Multi-row headers from `<thead>` colspan and rowspan | F (H reads them) |
| Footer rows from `<tfoot>` and per-page footer totals | E, H |
| Keyboard cell focus API and events | D, F |
| Custom sort comparators, custom filter predicates and custom column types for flat grids | A |
| A row-level render hook | A |
| **Faceted filter panel:** value lists with counts for several columns shown side by side, always visible | New. Value lists with counts already exist in the filter popover of inline text columns, and of server-backed columns declared as facets. |
| **Live data:** add, update and remove rows in place, keeping focus, selection and scroll position | New |
| **Shareable state in the URL** (query string or hash), alongside session and local storage | Available for enhanced and simple-setup grids (`stateSave.url`, H) |
| **Row reordering in flat grids** by drag and keyboard, raised to the host like tree moves | New (alongside D) |
| **Sticky header on page scroll** for grids that grow with their rows | New |
| Per-column CSS class names | New (small) |
| Regular-expression search | New (low priority) |
| A card layout for records | K |
| Find-and-highlight inside the current result | J |
| Conditional styles carried into print and export | I |
