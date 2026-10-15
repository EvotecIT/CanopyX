# CanopyX features

CanopyX has two interactive views: a **data grid** for flat records and a **tree grid** for hierarchies. Both can be written
from typed C# or mounted from JavaScript, and both can render as a script-free table for email and print. This page lists
what each view does today, grouped by capability, with links to the reference for each feature. For work that is planned
but not built yet, see the [roadmap](roadmap.md). For short how-tos, see the [recipes](recipes.md).

- **Grid**: the flat data grid (`@evotecit/canopyx/grid`, `CanopyDataGridView`).
- **Reporting**: the data grid with its reporting capabilities (`@evotecit/canopyx/reporting`, `CanopyDataGridView.Reporting`).
- **Tree**: the tree grid (`@evotecit/canopyx`, `CanopyTreeView`).

## Data sources

| Feature | Views | How | Reference |
|---|---|---|---|
| Inline records in the page | Grid, Tree | `rows` / `roots` in the definition; C# `Rows`, `Roots` | [Flat data grid](authoring.md#flat-data-grid) |
| Typed record mapping in C# | Grid | `CanopyGridMapper<T>` with selectors, no reflection | [Flat data grid](authoring.md#flat-data-grid) |
| Your own query function (server-side sort, filter, search and paging) | Grid | `source.query(query, { signal })` returns a `gridPage`; C# `CanopyGridSource.HostedOffset()` | [Protocol](data-protocol.md#flat-grid-documents) |
| Cursor (keyset) navigation with unknown totals | Grid | `CanopyGridSource.HostedCursor()`, `source: { kind: "host", navigation: "cursor" }` | [Sequential sources](data-protocol.md#sequential-sources-and-unknown-counts) |
| Lazy children from an HTTP endpoint | Tree | `source: { kind: "remote", children, search, counts }` URL templates | [Remote](data-protocol.md#remote) |
| Bundles that load branches on demand from disk or a file share | Tree | `SaveHtmlBundle` (sidecar files and a search index) | [Quick start](authoring.md#quick-start), [Sidecar](data-protocol.md#sidecar) |
| Revisioned results, stale responses rejected, cancellation and timeouts | Grid, Tree | `revision`, `signal`, `requestTimeoutMs` | [Protocol](data-protocol.md#flat-grid-documents) |
| Loading, empty, error and retry states | Grid, Tree | Built in; accepted rows stay visible while a new query loads | [Flat data grid](authoring.md#flat-data-grid) |
| Reload with the current query | Grid, Tree | `reload()`; `refresh()` repaints | [Flat data grid](authoring.md#flat-data-grid) |

## Values, rendering and formatting

| Feature | Views | How | Reference |
|---|---|---|---|
| Typed columns | Grid, Tree | `kind: "text" \| "number" \| "datetime"`; C# `CanopyColumnKind` | [Cell](data-protocol.md#cell) |
| Separate display, sort and search values per cell | Grid | `value`, `text`, `sort`, `searchText`; C# `CanopyCell.Text`, `SortKey`, `SearchText` | [Default formatting and sorting](data-protocol.md#default-formatting-and-sorting) |
| Declarative cell presenters | Grid | Link, icon, progress, boolean, list, long text, enum, state, change, status strip, bar and line sparklines, identifier, tags, missing value | [Safe cell presenters](data-protocol.md#safe-cell-presenters) |
| Custom cell drawing | Grid, Tree | `renderers[columnId](row, element, context)` with a disposal lifetime; `CanopyX.badge()` | [Rendering model](architecture.md#rendering-model) |
| Tones and badges | Grid, Tree | Six built-in tones, host tones from two theme colours | [Tones](data-protocol.md#tones) |
| Row and cell highlight rules from raw values | Grid | `highlightRules`; C# `CanopyGridHighlightRule` | [Highlight records](authoring.md#highlight-records-by-raw-values) |
| Wrapped text with measured row heights | Grid | `wrap: true`, `rowHeight: "auto"`; C# `Wrap`, `AutoRowHeight` | [Wrapped grid rows](authoring.md#wrapped-grid-rows) |
| Tooltips for cut-off text or from another column | Grid, Tree | `tooltip: "auto"` or a column id | [Tooltips](column-layout.md#tooltips-and-header-room) |
| Dates in UTC or the reader's time zone, switchable | Grid, Tree | `timeZone`, `setTimeZone()` | [Default formatting and sorting](data-protocol.md#default-formatting-and-sorting) |
| Density and zebra rows | Grid | `density`, `zebra` | [Flat data grid](authoring.md#flat-data-grid) |

## Sorting, search and filters

| Feature | Views | How | Reference |
|---|---|---|---|
| Multi-column sorting (Shift+click), missing values last, stable ties | Grid | Header clicks, `sort([...])`, `query.sort` | [Flat data grid](authoring.md#flat-data-grid) |
| Per-level sibling sorting | Tree | `sort(columnId, direction)` | [Tree grid features](authoring.md#tree-grid-features) |
| Natural, case-folded and category text ordering | Reporting | `ordering`; C# `CanopyGridOrdering` | [Flat data grid](authoring.md#flat-data-grid) |
| Search as you type, substring or all words and quoted phrases | Grid | `searchMode: "words"`, `searchColumns`, `searchDelayMs` | [Flat data grid](authoring.md#flat-data-grid) |
| Case- and diacritic-insensitive matching | Grid, Tree | Built in, shared with the C# bundle writer | [Search](data-protocol.md#search) |
| Path search that opens the tree to the match | Tree | Search box, `search()`, bundle search index | [Tree grid features](authoring.md#tree-grid-features) |
| Typed column filters (equals, contains, ranges, is any of, is empty) | Grid | Header ⋮ menu, `query.filters` | [Flat data grid](authoring.md#flat-data-grid) |
| Value lists with full-query counts for inline text columns | Grid | Column filter popover | [Flat data grid](authoring.md#flat-data-grid) |
| Value lists with counts from your server; facet API | Reporting | `reporting.facetColumns` with `source.facet`; `getFacets()` | [Flat data grid](authoring.md#flat-data-grid) |
| Condition builder with nested All/Any groups and date presets | Grid | Filters menu, `query.filterGroup`; C# `CanopyGridFilterGroup` | [Flat data grid](authoring.md#flat-data-grid) |
| Active search and filter chips, result count, clear all | Grid | Built in | [Flat data grid](authoring.md#flat-data-grid) |
| Named filters that keep the ancestors of matches | Tree | `filters`, `ancestorFlag`, `setFilter({ match, keep })` | [Hosted filtering](authoring.md#hosted-filtering) |

## Columns

| Feature | Views | How | Reference |
|---|---|---|---|
| Content sizing that fills the width | Grid, Tree | Default; `width`, `minWidth`, `maxWidth`, `flex`, `fixed`; C# `CanopyColumnSizing` | [Column layout](column-layout.md) |
| Resize by pointer or keyboard; fit one or all columns | Grid, Tree | Separators and the Columns menu; grids add `autoFitColumn()`, `autoFitColumns()` | [API and events](column-layout.md#api-and-events) |
| Show, hide and reorder | Grid, Tree | Columns menu with find, drag and Alt+Up/Down; `setColumnVisible`, `setColumnOrder` | [Columns menu](column-layout.md#columns-menu) |
| Drag headers to reorder | Reporting | `reporting.columnReorder` | [Flat data grid](authoring.md#flat-data-grid) |
| Pin columns left or right | Grid, Tree | `pinned`, `setColumnPinned()`; the identity column pins left | [Identity column and pinning](column-layout.md#identity-column-and-pinning) |
| Priorities that decide what hides first at narrow widths | Grid, Tree | `priority`, `alwaysVisible` | [How a width is chosen](column-layout.md#how-a-width-is-chosen) |
| Header menu per column: sort, filter, pin, fit, hide | Grid | Built in; `toolbar.columnMenus` switches it off | [Tooltips and header room](column-layout.md#tooltips-and-header-room) |
| Sticky header | Grid, Tree | The header stays visible while the rows scroll inside the view | [Flat data grid](authoring.md#flat-data-grid) |

## Paging and scrolling

| Feature | Views | How | Reference |
|---|---|---|---|
| Virtual rows for large results | Grid, Tree | Only the rows near the viewport exist in the DOM; very tall results use a bounded scrollbar | [Rendering model](architecture.md#rendering-model) |
| Continuous scrolling or pages | Grid | `presentation: "paged"`, `pageLength`; C# `Presentation`, `PageLength` | [Flat data grid](authoring.md#flat-data-grid) |
| Pager with first/previous/next/last, page number, rows per page and range text | Grid | Built in; `goToPage`, `setPageLength`, `getPaging` | [Flat data grid](authoring.md#flat-data-grid) |
| "Show more" for long child lists | Tree | Paged children | [Tree grid features](authoring.md#tree-grid-features) |
| Auto height when the rows fit | Grid, Tree | `autoHeight` (default on) | [Flat data grid](authoring.md#flat-data-grid) |
| Works in hidden tabs and accordions | Grid, Tree | Renders when first shown | [Assets and caching](architecture.md#assets-and-caching) |

## Selection

| Feature | Views | How | Reference |
|---|---|---|---|
| Single or multiple selection by stable id | Grid, Tree | `selection`, `setSelection`, `onSelect`; `getSelection()` on grids, `getSelected()` on trees | [Flat data grid](authoring.md#flat-data-grid) |
| Row checkboxes, Shift ranges, select page, select all matching | Reporting | `reporting.selectionControls`, `selectRange`, `selectPage`, `selectAllMatching` | [Record selection scopes](data-protocol.md#record-selection-scopes) |
| Selection vetoes and eligibility | Tree | `isSelectable`, `beforeSelect`, `canopyx:beforeselect` | [Quick start](authoring.md#quick-start) |
| Hierarchical checkboxes that cover unloaded children | Tree | `checkboxes: "hierarchical"`, `setCheckIntents` | [Checking lazy branches](authoring.md#checking-lazy-branches) |
| Selected-value sums and status bar | Grid | `statusBar`, `aggregatable` | [Flat data grid](authoring.md#flat-data-grid) |

## Record details

| Feature | Views | How | Reference |
|---|---|---|---|
| Record drawer with every field, previous/next and focus return | Grid, Tree | Grids: Enter, double click, "Record details", `openDetails()`. Trees: the phone "+N" button, "Record details", `openDetails()` | [Flat data grid](authoring.md#flat-data-grid) |
| Your own details view | Grid | `onDetails`, `onRowActivate`, `canopyx:rowActivate` | [Flat data grid](authoring.md#flat-data-grid) |
| Detail rows with a table, a property list or trusted HTML | Tree | `detail` on a node, `renderDetail` | [Detail rows](data-protocol.md#detail-rows) |
| Row links and link cells the host can route | Grid | `rowAction: "link"`, `onLink`, `canopyx:link` | [Flat data grid](authoring.md#flat-data-grid) |

## Editing and host actions

CanopyX never writes data itself. It raises proposals to hooks the host provides, and the host decides.

| Feature | Views | How | Reference |
|---|---|---|---|
| Cell edit proposals | Tree | `editable` columns, Alt+Enter, `onEdit`, `requestEdit()` | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| Move nodes by drag and drop or keyboard | Tree | `dragDrop`, `onDrop`, `requestDrop()` | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| Context actions | Tree | `contextActions`, `onAction`, right-click, Shift+F10 | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| More-menu actions and host content | Grid, Tree | `actions: [{ label, run }]`; reporting adds `{ label, render }` | [Toolbar controls](authoring.md#toolbar-controls-slots-and-menu-entries) |
| Chart action from the selection bar | Grid | `onChart`; the host draws the chart | [Flat data grid](authoring.md#flat-data-grid) |

Flat-grid editing is not available yet; see the [roadmap](roadmap.md).

## Grouping and summaries

| Feature | Views | How | Reference |
|---|---|---|---|
| Group rows by one column, with counts and collapse | Reporting | `reporting.grouping`; C# `CanopyGridGrouping` | [Flat groups](data-protocol.md#flat-groups-and-complete-query-totals) |
| Aggregates (count, sum, average, minimum, maximum) in group rows and a pinned summary row | Reporting | `reporting.aggregates`; hosted sources add `source.summary` | [Flat groups](data-protocol.md#flat-groups-and-complete-query-totals) |
| Hierarchies of any depth | Tree | `CanopyTreeView`, inline or lazy children | [Tree grid features](authoring.md#tree-grid-features) |

## Export, copy and print

| Feature | Views | How | Reference |
|---|---|---|---|
| CSV download | Grid, Tree | Export menu; grids add `toCsv()` | [Export, clipboard and record details](data-protocol.md#export-clipboard-and-record-details) |
| Copy as tab-separated text, with spreadsheet formula protection | Grid | Export menu Copy, `copy()`, Ctrl/Cmd+C | [Export, clipboard and record details](data-protocol.md#export-clipboard-and-record-details) |
| Scope choice: filtered, selected or all records (trees: visible, selected or all rows) | Grid, Tree | Export menu, `prepareExport({ scope })` | [Export formats](authoring.md#export-formats) |
| Your own file formats in the Export menu, with progress and cancel | Grid, Tree | `registerExportFormat({ id, label, extension, write })`, `exportAs()` | [Export formats](authoring.md#export-formats) |
| Large exports generated by the host | Grid | `onExport`, `exportToHost()` | [Export, clipboard and record details](data-protocol.md#export-clipboard-and-record-details) |
| Print a complete result through your renderer | Reporting | `print()`, `onPrint` | [Flat data grid](authoring.md#flat-data-grid) |
| Print the open rows of a tree | Tree | More menu Print, `toOutline()` | [Tree grid features](authoring.md#tree-grid-features) |
| Script-free table for email, print and Word | Grid, Tree | `CanopyStaticHtml.Render`, `RenderGrid`, `RenderGridWithResult` | [Static fallback](architecture.md#static-fallback) |

## Saved state and views

| Feature | Views | How | Reference |
|---|---|---|---|
| Save and restore the query, columns, selection and scroll position | Grid, Tree | `getState()`, `setState()` | [Flat data grid](authoring.md#flat-data-grid) |
| Remember settings for the session | Grid, Tree | `stateKey` | [Flat data grid](authoring.md#flat-data-grid) |
| Named views with reset | Grid, Tree | Views menu, `saveView`, `applySavedView`, `resetView` | [Flat data grid](authoring.md#flat-data-grid) |
| Views that last across sessions, rename, default view | Reporting | `reporting.viewStorage: "local"` | [Flat data grid](authoring.md#flat-data-grid) |
| Your own preference storage | Reporting | `viewStore: { load, save }`, `flushViewSettings()` | [Flat data grid](authoring.md#flat-data-grid) |
| Shareable layout without searches, filters or selection | Reporting | `getShareState()` | [Flat data grid](authoring.md#flat-data-grid) |
| Deep links that open a path | Tree | `deepLink`, `formatLink`, `parseLink` | [Deep links](data-protocol.md#deep-links) |

## Phones and narrow widths

| Feature | Views | How | Reference |
|---|---|---|---|
| Columns give way by priority as the width shrinks | Grid, Tree | `priority`, `alwaysVisible` | [How a width is chosen](column-layout.md#how-a-width-is-chosen) |
| Phone layout at 640 px and below: "+N" hidden fields, full-screen record drawer | Grid, Tree | Built in | [Flat data grid](authoring.md#flat-data-grid) |
| Toolbar menus fold into the more menu; the filter builder becomes a full-screen sheet | Grid, Tree | Built in | [Flat data grid](authoring.md#flat-data-grid) |

## Accessibility

| Feature | Views | How | Reference |
|---|---|---|---|
| ARIA `grid` and `treegrid` roles with row counts and positions | Grid, Tree | Built in | [Accessibility contract](architecture.md#accessibility-contract) |
| Keyboard model: rows, cells, controls in cells, Home/End, Page Up/Down, F2, type-ahead (trees) | Grid, Tree | Built in | [Accessibility contract](architecture.md#accessibility-contract) |
| One Tab stop per view, focus kept across virtual scrolling | Grid, Tree | Built in | [Rendering model](architecture.md#rendering-model) |
| Automated axe checks in light and dark themes | Grid, Tree | Browser test suite | [Tests](architecture.md#tests) |
| Manual screen-reader script | Grid, Tree | NVDA and Narrator steps | [Screen-reader test](screen-reader-test.md) |

Spoken screen-reader output has not been recorded for a release yet, and right-to-left layout is not supported yet.

## Theming

| Feature | Views | How | Reference |
|---|---|---|---|
| Light, dark and system themes | Grid, Tree | `data-cx-theme="light" \| "dark" \| "auto"` | [Theming](architecture.md#theming) |
| A few base colours; hover, selection and muted colours derived | Grid, Tree | `--cx-surface`, `--cx-text`, `--cx-accent`, `--cx-line`, tone variables | [Theming](architecture.md#theming) |
| Typography, radius, spacing and scrollbar tokens | Grid, Tree | `--cx-font`, `--cx-radius`, `--cx-row-h`, `--cx-scrollbar-*` | [Theming scrollbars](architecture.md#theming-scrollbars) |
| Themed script-free tables | Grid, Tree | `CanopyStaticTheme`, `UseThemeVariables` | [Theming the outline](architecture.md#theming-the-outline) |

## Translations

| Feature | Views | How | Reference |
|---|---|---|---|
| Every built-in text is a named label | Grid, Tree | `labels`; C# `CanopyLabels` | [Labels](data-protocol.md#labels) |
| Polish, German and Spanish packs | Grid, Tree | `@evotecit/canopyx/locales/pl`, `/de`, `/es`; `CanopyLabels.Polish()`, `German()`, `Spanish()` | [Label packs](labels.md) |
| Locale-aware number and date formatting | Grid, Tree | Browser `Intl` | [Default formatting and sorting](data-protocol.md#default-formatting-and-sorting) |

## Extension points

| Feature | Views | How | Reference |
|---|---|---|---|
| Export format writers | Grid, Tree | `registerExportFormat` | [Export formats](authoring.md#export-formats) |
| Toolbar switches and host slots | Grid, Tree; slots in Reporting | `toolbar`, `toolbarSlot()`, `data-cx-slot` | [Toolbar controls](authoring.md#toolbar-controls-slots-and-menu-entries) |
| Events and callbacks | Grid | `canopyx:query`, `select`, `state`, `error`, `columnResize`, `columnPin`, `rowActivate`, `link` and the matching `on…` options | [API and events](column-layout.md#api-and-events) |
| Events and callbacks | Tree | `canopyx:ready`, `select`, `beforeselect`, `toggle`, `load`, `query`, `filter`, `error`, `rowActivate` and host hooks such as `onSelect`, `onToggle`, `onLoad` | [Host pages](architecture.md#host-pages) |
| Menu coordination with host popovers | Grid, Tree | `closeMenus()`, `canopyx:closemenus` | [Toolbar controls](authoring.md#toolbar-controls-slots-and-menu-entries) |
| Fragments configured before mounting | Grid, Tree | `CanopyX.configure(viewId, options)`, `CanopyX.mount()` | [Host pages](architecture.md#host-pages) |

## Delivery and packages

| Feature | How | Reference |
|---|---|---|
| .NET packages with no third-party runtime dependencies (net472, netstandard2.0, net8.0, net10.0) | `CanopyX`, `CanopyX.Html` | [README](../README.md#installation) |
| npm package with ES modules, classic scripts, styles and TypeScript types | `@evotecit/canopyx` | [JavaScript hosts](authoring.md#javascript-hosts) |
| Single-file pages, fragments and content-hashed asset files | `SaveHtmlPage`, `ToHtmlFragment`, `CanopyHtmlAssets.WriteTo` | [Assets and caching](architecture.md#assets-and-caching) |
| Size budgets per entry point (gzip): tree 48 KiB, interactive tree 64 KiB, grid 96 KiB, reporting 128 KiB | Optional parts load on first use | [Assets and caching](architecture.md#assets-and-caching) |
