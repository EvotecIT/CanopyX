# CanopyX roadmap

What is planned for CanopyX, in the order we expect to build it. Nothing here is available yet unless it says so; for what
the views do today, see [features](features.md). The tiers express order, not promised versions or dates. The engineering
backlog with consumers and acceptance gates stays in [TODO.md](../TODO.md).

Every planned feature comes with documentation, TypeScript types, C# XML documentation, a generic example and browser tests
in light and dark themes at desktop and phone widths, including keyboard and screen-reader paths. New capabilities load as
optional parts, so pages that don't use them keep their current size.

## Tier 1: in progress

| | Feature | What it adds |
|---|---|---|
| A | **Plugin API** | `CanopyX.registerPart(...)` and `CanopyX.use(...)` with lifecycle hooks for columns, cell renderers, editors, toolbar items, menu entries, export formats and events. The existing optional parts (tree tools, export, history, filter editor) become plugins, and C# page writers learn about registered parts. No behaviour change. |
| B | **.NET query adapter** | A package that turns the grid's query (search, sort, filters, condition groups, paging, value lists, grouping, export) into `IQueryable<T>` for EF Core, LINQ to objects or any LINQ provider, plus a provider interface for raw SQL. Column allow-lists, parameterised queries only, limits on page size, export rows and expression depth, and streamed export. An optional ASP.NET Core endpoint helper and a sample web app. |
| C | **Feature overview, recipes and this roadmap** | [features.md](features.md), [recipes.md](recipes.md) and this page. |
| D | **Editing** | Typed editors (text, number, date, choice, toggle, lookup with remote search); cell and row validation with messages; dirty-cell marking; a cancelable value-changed event and row commit; batch commit through the .NET adapter; undo and redo; keyboard editing (F2, Enter, Escape, Tab) with optional full-row editing; on phones the record drawer becomes an edit form. As today, the host decides what is saved. |
| E | **Grouping and master/detail** | Grouping by several columns with aggregates (sum, count, average, minimum, maximum, custom) in group rows and the footer; group by from the column menu; works with server sources. Expandable detail rows holding a template, HTML or a nested grid. Keyboard, print and export aware. |
| F | **Column groups, range selection and clipboard** | Multi-level headers that work with pinning, priorities, resizing and reordering. Cell ranges by mouse, Shift+arrows and touch; copy as tab-separated text with optional headers; paste into editable ranges (with D); an optional fill handle. |
| H | **Enhance existing tables and simple setup** | `CanopyX.enhance(tableElement, options)` turns an HTML `<table>` into a grid, reading headers, cell text and per-cell sort and search values from `data-*` attributes. One-line setup from a URL or a JSON array of plain objects. A configurable rows-per-page list, optional numbered pages and info text when paging is on. State saving with a duration. |
| I | **Conditional formatting** | Rules built from the same conditions as the filter builder (nested all/any/none groups, every operator, typed text, number, boolean, date and choice values, with case and culture options). A rule styles a cell, the whole row, other columns, or the fields shown in the record drawer and on phones. Styles come from theme tones, so they stay consistent in dark mode, with raw CSS as an escape hatch; icons and badges, data bars, colour scales and threshold bands. Never colour alone: each rule adds an icon or text cue and an accessible description, with an optional legend. Rules are kept in saved views, edited at run time in a rule editor, and carried into print and Excel export. Typed C# authoring (`CanopyFormatRule`) with the same JSON schema; works with server sources on the rows received. Today's raw-value highlight rules keep working. |
| J | **Search-hit highlighting** | Marks what quick search and column filters matched in cells, the record drawer and tree nodes, with separate styles for search and filter hits from theme tokens. Accessible `<mark>` elements and screen-reader-friendly counts; a match count with next/previous match that scrolls virtual rows into view; case- and diacritic-insensitive like search itself; never breaks cell markup, links or chips. A toolbar or menu switch, remembered in saved views. |
| K | **Layout modes** | A reader-switchable mode per grid and tree: **fit** (today's behaviour: columns give way by priority, with "+N" and the record drawer), **scroll** (every column kept, identity pinned, horizontal scrolling) and **cards** (each row as a stacked card on phones and narrow panels). A density switch (compact, default, comfortable). Switching keeps sort, filters, selection, scroll position and focus, and is remembered in saved views. Hosts set the default and the allowed modes; print uses fit or cards. |
| G | **Web component and Blazor** | `<canopy-grid>` and `<canopy-tree>` custom elements with attributes, properties and events. Blazor components (Server and WebAssembly) on top of them, with typed column definitions, two-way binding for selection and editing, and the .NET adapter as the data source. A sample app. |

## Tier 2: next

- **Charts with ChartForgeX:** chart a selected range or a group; chart columns (bar in cell, bullet, status strip). Bar and line
  sparklines and status strips are already available as presenters.
- **Styled Excel export through OfficeIMO**, as an export-format plugin: tones, widths, outline grouping, frozen panes and number
  formats. Also PDF export. CSV, copy and your own registered writers are already available.
- **Trees:** lazy children served through the .NET adapter, drag-and-drop reordering on top of the existing move proposals, and
  dimmed non-matches as a filter presentation (highlighted matches come with J). Hierarchical checkboxes, filters that keep
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
- **More languages** beyond Polish, German and Spanish, and right-to-left layout.

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
| **Shareable state in the URL** (query string or hash), alongside session and local storage | New |
| **Row reordering in flat grids** by drag and keyboard, raised to the host like tree moves | New (alongside D) |
| **Sticky header on page scroll** for grids that grow with their rows | New |
| Per-column CSS class names | New (small) |
| Regular-expression search | New (low priority) |
| A card layout for records | K |
| Find-and-highlight inside the current result | J |
| Conditional styles carried into print and export | I |
