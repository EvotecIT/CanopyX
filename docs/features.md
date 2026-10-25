# CanopyX features

CanopyX has two interactive views: a **data grid** for flat records and a **tree grid** for hierarchies. Both can be written
from typed C# or mounted from JavaScript, and both can render as a script-free table for email and print. A **flow** is a guided
form for setup and edit tasks that raises one proposal to the host (see [Flows](#flows)). This page lists
what each view does today, grouped by capability, with links to the reference for each feature. For work that is planned
but not built yet, see [planned work](../TODO.md). For short how-tos, see the [recipes](recipes.md).

- **Grid**: the flat data grid (`@evotecit/canopyx/grid`, `CanopyDataGridView`).
- **Reporting**: the data grid with its reporting capabilities (`@evotecit/canopyx/reporting`, `CanopyDataGridView.Reporting`).
- **Tree**: the tree grid (`@evotecit/canopyx`, `CanopyTreeView`).
- **Flow**: guided forms (`@evotecit/canopyx/flow`, `CanopyFlow`); the grid entry points create flows too.
- **Matrix**: a state for each pair of two sets of entities (`CanopyMatrix`, `CanopyX.createMatrix`), from the grid and reporting entry points.
- **Change views**: a text diff, a change list and a propagation view (`CanopyTextDiff`, `CanopyChangeList`, `CanopyPropagation`; `CanopyX.createDiff`, `createChangeList`, `createPropagation`), from the grid and reporting entry points ([changes.md](changes.md)).

## Data sources

| Feature | Views | How | Reference |
|---|---|---|---|
| Inline records in the page | Grid, Tree | `rows` / `roots` in the definition; C# `Rows`, `Roots` | [Flat data grid](authoring.md#flat-data-grid) |
| Typed record mapping in C# | Grid | `CanopyGridMapper<T>` with selectors, no reflection | [Flat data grid](authoring.md#flat-data-grid) |
| Columns from member expressions and rows from typed records in C# | Grid | `CanopyDataGridView<T>`: `Column(x => x.Owner)`, `Field`, `AddRows` | [typed-grids.md](typed-grids.md) |
| Typed rows in TypeScript: columns, rows, facets, events and the live API checked against a row type | Grid | `createDataGrid<Row>(…)`, `GridColumnId<Row>` | [typed-grids.md](typed-grids.md#typescript-a-row-type) |
| Your own query function (server-side sort, filter, search and paging) | Grid | `source.query(query, { signal })` returns a `gridPage`; C# `CanopyGridSource.HostedOffset()` | [Protocol](data-protocol.md#flat-grid-documents) |
| Cursor (keyset) navigation with unknown totals | Grid | `CanopyGridSource.HostedCursor()`, `source: { kind: "host", navigation: "cursor" }` | [Sequential sources](data-protocol.md#sequential-sources-and-unknown-counts) |
| Lazy children from an HTTP endpoint | Tree | `source: { kind: "remote", children, search, counts }` URL templates | [Remote](data-protocol.md#remote) |
| Bundles that load branches on demand from disk or a file share | Tree | `SaveHtmlBundle` (sidecar files and a search index) | [Quick start](authoring.md#quick-start), [Sidecar](data-protocol.md#sidecar) |
| Revisioned results, stale responses rejected, cancellation and timeouts | Grid, Tree | `revision`, `signal`, `requestTimeoutMs` | [Protocol](data-protocol.md#flat-grid-documents) |
| Loading, empty, error and retry states | Grid, Tree | Built in; accepted rows stay visible while a new query loads | [Flat data grid](authoring.md#flat-data-grid) |
| Reload with the current query | Grid, Tree | `reload()`; `refresh()` repaints; `refreshRows()` updates rows in place | [Flat data grid](authoring.md#flat-data-grid) |
| Enhance an existing `<table>`, or build a grid from records or a URL in one call | Grid | `CanopyX.enhance(table, options)`, `CanopyX.grid(element, options)` | [enhance.md](enhance.md) |
| Compact row data, views that mount when visible, and grid bundles for large reports | Grid | `rowData`, `MountWhenVisible`, `SaveHtmlBundle` | [large-data.md](large-data.md) |
| Server-side data for .NET over `IQueryable<T>` or a provider, with saving edits | Grid | `CanopyX.Data`, `MapCanopyRemote` | [remote-dotnet.md](remote-dotnet.md) |
| Rows added, changed and removed in place with a stable order, flashing cells, batching and polling | Grid | `applyTransaction`, `addRows`, `updateRows`, `removeRows`, `setRows`, `poll`, `live`; C# `CanopyGridLive`, `CanopyGridTransaction` | [live-data.md](live-data.md) |
| Revision-aware refresh of hosted grids | Grid | `refreshRows()`, `live.pollMs` | [live-data.md](live-data.md#hosted-grids) |

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
| Conditional formatting: tones, icons, badges, data bars, colour scales and bands, with a rule editor | Grid | `formatRules`, `formatting`; C# `CanopyFormatRule` | [conditional-formatting.md](conditional-formatting.md) |
| Structured values (lists, objects, timelines, changes) and links to other records | Grid, Tree | the `structured` presenter, structured cells | [record-panel.md](record-panel.md) |

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
| Facet panel beside or above the grid: value lists and range histograms that filter each other, a sheet on phones | Grid (hosted: Reporting) | `facets`, `getFacetPanel()`, `setFacetPanelOpen()`; C# `CanopyFacetPanel` | [facets.md](facets.md) |
| Condition builder with nested All/Any groups and date presets | Grid | Filters menu, `query.filterGroup`; C# `CanopyGridFilterGroup` | [Flat data grid](authoring.md#flat-data-grid) |
| Active search and filter chips, result count, clear all | Grid | Built in | [Flat data grid](authoring.md#flat-data-grid) |
| Named filters that keep the ancestors of matches | Tree | `filters`, `ancestorFlag`, `setFilter({ match, keep })` | [Hosted filtering](authoring.md#hosted-filtering) |
| Search-hit highlighting with a match count and next/previous | Grid, Tree | `searchHighlight` | [search-highlight.md](search-highlight.md) |
| External filters from other views, shown as removable chips | Grid, Tree | `setExternalFilter()`, `linkEvents` | [linked-views.md](linked-views.md) |

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
| Column groups: up to three header levels, kept whole by pins, moves and resizing | Grid | `columnGroups`; C# `CanopyColumnGroup` | [column-groups.md](column-groups.md) |

## Paging and scrolling

| Feature | Views | How | Reference |
|---|---|---|---|
| Virtual rows for large results | Grid, Tree | Only the rows near the viewport exist in the DOM; very tall results use a bounded scrollbar | [Rendering model](architecture.md#rendering-model) |
| Continuous scrolling or pages | Grid | `presentation: "paged"`, `pageLength`; C# `Presentation`, `PageLength` | [Flat data grid](authoring.md#flat-data-grid) |
| Pager with first/previous/next/last, page number, rows per page and range text | Grid | Built in; `goToPage`, `setPageLength`, `getPaging` | [Flat data grid](authoring.md#flat-data-grid) |
| "Show more" for long child lists | Tree | Paged children | [Tree grid features](authoring.md#tree-grid-features) |
| Auto height when the rows fit | Grid, Tree, Matrix | `autoHeight` (default on) | [Flat data grid](authoring.md#flat-data-grid), [Matrix](matrix.md#the-document) |
| Works in hidden tabs and accordions | Grid, Tree | Renders when first shown | [Assets and caching](architecture.md#assets-and-caching) |
| Numbered pages, page-size choices with All, and the result sentence | Grid | `pager`; C# `CanopyGridPager` | [paging.md](paging.md) |

## Selection

| Feature | Views | How | Reference |
|---|---|---|---|
| Single or multiple selection by stable id | Grid, Tree | `selection`, `setSelection`, `onSelect`; `getSelection()` on grids, `getSelected()` on trees | [Flat data grid](authoring.md#flat-data-grid) |
| Row checkboxes, Shift ranges, select page, select all matching | Reporting | `reporting.selectionControls`, `selectRange`, `selectPage`, `selectAllMatching` | [Record selection scopes](data-protocol.md#record-selection-scopes) |
| Selection vetoes and eligibility | Tree | `isSelectable`, `beforeSelect`, `canopyx:beforeselect` | [Quick start](authoring.md#quick-start) |
| Hierarchical checkboxes that cover unloaded children | Tree | `checkboxes: "hierarchical"`, `setCheckIntents` | [Checking lazy branches](authoring.md#checking-lazy-branches) |
| Selected-value sums and status bar | Grid | `statusBar`, `aggregatable` | [Flat data grid](authoring.md#flat-data-grid) |
| Cell ranges with copy, paste and an optional fill handle | Grid | `rangeSelection`, `clipboard` | [cell-ranges.md](cell-ranges.md) |
| Rows highlighted from another view | Grid, Tree | `setHighlight()` | [linked-views.md](linked-views.md) |

## Record details

| Feature | Views | How | Reference |
|---|---|---|---|
| Record drawer with every field, previous/next and focus return | Grid, Tree | Grids: Enter, double click, "Record details", `openDetails()`. Trees: the phone "+N" button, "Record details", `openDetails()` | [Flat data grid](authoring.md#flat-data-grid) |
| Your own details view | Grid | `onDetails`, `onRowActivate`, `canopyx:rowActivate` | [Flat data grid](authoring.md#flat-data-grid) |
| Detail rows with a table, a property list or trusted HTML | Tree | `detail` on a node, `renderDetail` | [Detail rows](data-protocol.md#detail-rows) |
| Row links and link cells the host can route | Grid | `rowAction: "link"`, `onLink`, `canopyx:link` | [Flat data grid](authoring.md#flat-data-grid) |
| Record panel: record-only fields, sections, tabs, related records, history, deep links and details on demand | Grid, Tree | `record`; C# `CanopyRecordPanel` | [record-panel.md](record-panel.md) |
| Record details served from .NET: fields, paged collections, timelines, changes and links, by key through the grid's own scoped query | Grid | `CanopyRecordMap<T>`, `POST {pattern}/record`; `ICanopyRecordProvider` for other back ends | [Record details](remote-dotnet.md#record-details) |

## Editing and host actions

CanopyX never writes data itself. It raises proposals to hooks the host provides, and the host decides.

| Feature | Views | How | Reference |
|---|---|---|---|
| Cell edit proposals | Tree | `editable` columns, Alt+Enter, `onEdit`, `requestEdit()` | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| Move nodes by drag and drop or keyboard | Tree | `dragDrop`, `onDrop`, `requestDrop()` | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| Context actions | Tree | `contextActions`, `onAction`, right-click, Shift+F10 | [Host actions, editing, and moving nodes](authoring.md#host-actions-editing-and-moving-nodes) |
| More-menu actions and host content | Grid, Tree | `actions: [{ label, run }]`; reporting adds `{ label, render }` | [Toolbar controls](authoring.md#toolbar-controls-slots-and-menu-entries) |
| Chart action from the selection bar | Grid | `onChart`; the host draws the chart | [Flat data grid](authoring.md#flat-data-grid) |
| Flat-grid editing: typed editors, validation, change marks, undo and redo, row and batch commit, the phone edit form | Grid | `editable`, `editor`, `validation`, `editing` | [editing.md](editing.md) |

## Grouping and summaries

| Feature | Views | How | Reference |
|---|---|---|---|
| Group rows by one column, with counts and collapse | Reporting | `reporting.grouping`; C# `CanopyGridGrouping` | [Flat groups](data-protocol.md#flat-groups-and-complete-query-totals) |
| Aggregates (count, sum, average, minimum, maximum) in group rows and a pinned summary row | Reporting | `reporting.aggregates`; hosted sources add `source.summary` | [Flat groups](data-protocol.md#flat-groups-and-complete-query-totals) |
| Hierarchies of any depth | Tree | `CanopyTreeView`, inline or lazy children | [Tree grid features](authoring.md#tree-grid-features) |
| Grouping by up to four columns, from the column menus or a group-by bar, with labelled aggregates | Reporting | `reporting.groupBy`, `reporting.groupable`, `setGroupBy()` | [grouping.md](grouping.md) |
| Calendar and numeric range buckets for grouping and facets | Reporting | `bucket`; C# `CanopyBucket`, hosted `IQueryable` translation | [grouping.md](grouping.md#grouping) |
| Percent shares, running totals, rank, difference and percent change | Reporting | Aggregate `showAs`, `setAggregateShowAs()`, numeric `getDisplaySummary()`; C# `CanopyAggregateDisplay` | [grouping.md](grouping.md#show-values-as) |
| Pivot rows and columns, totals, both-axis collapse, top-N/Other and exact drill-through | Reporting | `reporting.pivot`, `pivotable`, `setPivot()`, `source.pivot`; C# `CanopyGridPivot`, `CanopyPivot` | [pivot.md](pivot.md) |
| Calculated columns with bounded arithmetic, comparisons, text/date functions and saved definitions | Grid | Column `calculation`, `calculatedColumnsEditable`, `setCalculatedColumns()`; C# `CanopyCalculation`, `CanopyCalculationSet` | [calculated-columns.md](calculated-columns.md) |
| Expandable detail rows: a template, HTML, or a nested grid or tree | Reporting | `reporting.detail` | [grouping.md](grouping.md#detail-rows) |

## Calendar and resource timeline

| Feature | Views | How | Reference |
|---|---|---|---|
| Month, week, day, N-day, agenda and year views of a grid's records | Grid | `calendar: { start, end, title, … }`; C# `CanopyCalendar`, typed `Calendar().Start(x => x.Starts)` | [calendar.md](calendar.md) |
| All-day, multi-day, overlapping and zero-length events; "+N more" in month cells | Grid | `allDay`, `end`, `eventLimit` | [Views](calendar.md#views) |
| Time zones with correct DST, first weekday, working hours, hidden days, slots and visible hours | Grid | `timeZone`, `firstDay`, `workingHours`, `hiddenDays`, `slotMinutes`, `minTime`, `maxTime` | [Time zones](calendar.md#time-zones) |
| Recurring events (an RFC 5545 RRULE subset) with exceptions and moved occurrences | Grid | `recurrence`, `exceptions`, `series`, `recurrenceId`; C# `CanopyRecurrence` | [Recurrence](calendar.md#recurrence) |
| Resource timeline with a resource tree, zoom from hours to quarters, capacity per group and aggregates | Grid | `resources`, `zoom`, `capacity`, `aggregates` | [resource-timeline.md](resource-timeline.md) |
| Resource columns in day and week views, business hours per resource, unavailable time and background ranges | Grid | `availability`, `ranges`, `display: "background"` | [Resource columns](resource-timeline.md#resource-columns-in-day-and-week-views) |
| Drag to move and resize, across resources, with keyboard moves, conflict rules, commit and undo | Grid | `editable: { overlap, allowedResources, workingHours, commit }` | [Editing](calendar.md#editing) |
| Record panel, linked views, facets, saved views and live data on calendar events | Grid | the grid's own options | [calendar.md](calendar.md#the-record-panel) |
| Server data by visible date range over `IQueryable` | Grid | `source.range`; `POST {pattern}/range` | [Server data](calendar.md#server-data), [Range queries](remote-dotnet.md#range-queries) |
| iCalendar export, and print layouts for month, agenda and timeline | Grid | Export menu, `exportCalendar()` | [Export and print](calendar.md#export-and-print) |
| A basic calendar from a list of events, read-only with a details popover; presets basic, standard and scheduler | Grid | `CanopyX.createCalendar(host, { events, preset })`; C# `new CanopyCalendar(events)`, `CanopyCalendar.From(...)` | [Quick start](calendar.md#quick-start), [Levels and options](calendar.md#levels-and-options) |
| Creating events by click, drag and keyboard; dropping grid rows and marked page elements | Grid | `create`, `drop`, `dragRows`; inserts in `gridCommit` | [Creating events](calendar.md#creating-events), [Dropping events](calendar.md#dropping-events) |
| This event, this and following, or all events of a series | Grid | `occurrence`, `series`, `recurrenceId` | [Changing one occurrence](calendar.md#changing-one-occurrence) |
| Mini month, week and day lists, stacked months, a year with its events, a timeline without resources and custom spans | Grid | `views`, `yearEvents`, `months`, `span` | [Views](calendar.md#views) |
| Week numbers, day links, a valid range, six fixed weeks, right to left | Grid | `weekNumbers`, `navLinks`, `validRange`, `fixedWeeks`, `dir="rtl"` | [The calendar definition](calendar.md#the-calendar-definition) |
| Several sources with a legend; iCalendar import (browser and .NET) | Grid | `sources`, `source`; `CanopyICalendar.Parse` | [Sources and iCalendar](calendar.md#sources-and-icalendar), [icalendar.md](icalendar.md) |
| Shading outside ranges; context menus and hover cards | Grid | `ranges[].inverse`, `menu`, `hover`, `calendar.menu` hook | [Context menus](calendar.md#context-menus-and-hover-cards) |

## Flows

CanopyX never writes: a flow collects answers, checks them and raises one proposal; the host applies it and answers.

| Feature | How | Reference |
|---|---|---|
| Steps with typed fields, sections and descriptions, from C# or a JSON document | `CanopyFlow`, `flow.Step(...)`; `CanopyX.createFlow(host, { flow })`; `ToContract`, `FromContract` | [flow.md](flow.md) |
| The grid's editors in forms: text, number, date, date and time, time, select, toggle (as a switch), lookup and custom editors | `type` on a field; one implementation with grid editing (the `forms` part) | [Fields](flow.md#fields) |
| Choice cards with descriptions, badges and disabled reasons; multiple choice with groups, Select all and a count; text areas; lists with item rules; durations | `choice`, `multiChoice`, `textarea`, `list`, `secret`, `duration` | [Fields](flow.md#fields) |
| Secrets that never echo: masked with reveal, kept when blank in edit mode, sent once through an accessor | `secret`, `keepWhenBlank`, `storedSecrets`, `detail.secret(id)` | [Secrets](flow.md#secrets) |
| Conditions as data in the filter builder's grammar, for steps, sections and fields; hidden answers left out | `when`; C# `CanopyFlowCondition` with the same evaluator | [Conditions](flow.md#conditions) |
| Field, step and flow validation with host validators, a step error summary and messages in place | `validation`, `hooks.validators`, `validateStep`, `validateFlow` | [Validation](flow.md#validation) |
| Horizontal and vertical steppers; stacked steps on narrow hosts; linear or free order | `layout.orientation`, `mode` | [Layouts](flow.md#layouts) |
| A review page with change links, "Not provided", a ready banner and a declaration; changes only in edit mode, with what each answer was | the `review` step, `initial`, `changesOnly` | [The review page](flow.md#the-review-page) |
| One proposal with the visible answers, each secret's state, the changes and a JSON patch from field paths; saved, accepted, error and conflict answers | `canopyx:flowSubmit`, `respondWith`, `setProgress`, `complete` | [The proposal](flow.md#the-proposal-and-the-hosts-answer) |
| Labels in six languages and right-to-left pages | `CanopyLabels.Polish()` and the other packs; `dir="rtl"` | [Labels](flow.md#labels-and-right-to-left) |
| Server checks such as "Test sign-in": running, pass, warning and fail with details, stale when a tested answer changes, gating Next, secrets read once | `checks`, `hooks.check`, `runCheck`; C# `step.Check(...)` | [Server checks](flow.md#server-checks) |
| Options and fields the host supplies, reloaded when the fields they depend on change; late answers dropped | `source: "host"`, `dependsOn`, `hooks.options`, `hooks.fields` | [Host options](flow.md#host-options-and-dependent-fields) |
| Records fields (rows of typed cells) and pick steps whose answer is a grid's or tree's selection, with facets and a tray | `records`, `columns`; `pick`; C# `flow.Pick(...)` | [Records](flow.md#records-fields), [Pick steps](flow.md#pick-steps) |
| Task lists with host states and blockers; dialog and drawer flows that ask before discarding | `mode: "tasks"`, `hooks.status`, `setStepState`; `layout.container` | [Task lists](flow.md#task-lists), [Dialogs](flow.md#dialogs-and-drawers) |
| The equivalent command with variants, the JSON patch and Copy; presets with "changed" marks; drafts with a stale-baseline warning; deep links per step | `command`, `presets`, `draft`, `deepLinks` | [Host-connected flows](flow.md#host-connected-flows) |
| The host's preview, typed confirmation and a conditional acknowledgement on the review page | `hooks.preview`, `confirm`, `acknowledge` | [The review page](flow.md#the-preview-and-consent-on-the-review-page) |
| Server side: proposals read and checked against the server's own flow, hook requests and answers, and every hook as an authorized route | `CanopyFlowSubmission` (CanopyX.Data); `MapCanopyFlow` (CanopyX.AspNetCore) | [An endpoint](flow.md#an-endpoint-mapcanopyflow) |
| A page of forms loads no grid code | the flow entry point and the lazily loaded `forms` and `flow` parts | [Packaging](flow.md#packaging-and-size) |
## Matrices

A matrix shows a state for each row and column pair, such as replication between domain controllers or services by servers.

| Feature | How | Docs |
| --- | --- | --- |
| Rows and columns as items with attributes; a square matrix whose rows are its columns; one string of state digits per row | `CanopyMatrix`, `Rows`, `Columns`, `Square`, `Set`, `AddCells`; `CanopyX.createMatrix(host, { view })` | [The document](matrix.md#the-document) |
| States drawn with a tone and a symbol, a value or short text, details, a legend; self cells hatched and counted nowhere, cells without data a faint dot | `State(...)`, `Diagonal`, `notes` | [States](matrix.md#states-totals-and-the-diagonal) |
| Row and column totals, sorting by name, total or attribute, grouping into collapsible rows and column bands, facets, search, only problems and hide empty rows and columns on both axes | `SortBy`, `GroupBy`, `facet`, `HideEmpty`, the Rows and Columns panels | [Sorting, filtering and grouping](matrix.md#sorting-filtering-and-grouping) |
| Sticky headers and totals, both axes windowed; 150 by 150 and 400 by 400 scroll within budget | `AxisWindow`, canvas rows | [Performance](matrix.md#performance) |
| An ARIA grid with one tab stop, a tooltip on hover and focus, a cell event and a details dialog | `canopyx:matrixCell`, `details` | [Keyboard](matrix.md#keyboard) |
| Phones: pinned row headers, or a card per row | `phone: "cards"` | [Phones](matrix.md#phones) |
| A script-free table for email, print and Office, or the cells that need attention past 2,500 cells | `CanopyStaticHtml.RenderMatrix` | [Static output](matrix.md#static-output-print-and-email) |

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
| State saving in session or local storage, or in the address for shareable links | Grid | `stateSave` | [enhance.md](enhance.md) |

## Phones and narrow widths

| Feature | Views | How | Reference |
|---|---|---|---|
| Columns give way by priority as the width shrinks | Grid, Tree | `priority`, `alwaysVisible` | [How a width is chosen](column-layout.md#how-a-width-is-chosen) |
| Phone layout at 640 px and below: "+N" hidden fields, full-screen record drawer | Grid, Tree | Built in | [Flat data grid](authoring.md#flat-data-grid) |
| Toolbar menus fold into the more menu; the filter builder becomes a full-screen sheet | Grid, Tree | Built in | [Flat data grid](authoring.md#flat-data-grid) |
| Layout modes (fit, scroll sideways, cards) and three densities | Grid, Tree | `layout` | [layout-modes.md](layout-modes.md) |

## Accessibility

| Feature | Views | How | Reference |
|---|---|---|---|
| ARIA `grid` and `treegrid` roles with row counts and positions | Grid, Tree | Built in | [Accessibility contract](architecture.md#accessibility-contract) |
| Keyboard model: rows, cells, controls in cells, Home/End, Page Up/Down, F2, type-ahead (trees) | Grid, Tree | Built in | [Accessibility contract](architecture.md#accessibility-contract) |
| One Tab stop per view, focus kept across virtual scrolling | Grid, Tree | Built in | [Rendering model](architecture.md#rendering-model) |
| Automated axe checks in light and dark themes | Grid, Tree | Browser test suite | [Tests](architecture.md#tests) |
| Manual screen-reader script | Grid, Tree | NVDA and Narrator steps | [Screen-reader test](screen-reader-test.md) |
| Forced colours, reduced motion, 24 px pointer targets (44 px on phones) | Grid, Tree | built in | [accessibility.md](accessibility.md) |

Spoken screen-reader output has not been recorded for a release yet. Calendar and resource-timeline layouts support right-to-left pages; see [Keyboard and screen readers](calendar.md#keyboard-and-screen-readers).

## Theming

| Feature | Views | How | Reference |
|---|---|---|---|
| Light, dark and system themes | Grid, Tree | `data-cx-theme="light" \| "dark" \| "auto"` | [Theming](architecture.md#theming) |
| A few base colours; hover, selection and muted colours derived | Grid, Tree | `--hfx-color-surface`, `--hfx-color-text`, `--hfx-color-accent`, `--hfx-color-border`, tone variables | [Theming](architecture.md#theming) |
| Typography, radius, spacing and scrollbar tokens | Grid, Tree | `--hfx-font-sans`, `--hfx-radius-control`, `--cx-row-h`, `--cx-scrollbar-*` | [Theming scrollbars](architecture.md#theming-scrollbars) |
| Themed script-free tables | Grid, Tree | `CanopyStaticTheme`, `UseThemeVariables` | [Theming the outline](architecture.md#theming-the-outline) |

## Translations

| Feature | Views | How | Reference |
|---|---|---|---|
| Every built-in text is a named label | Grid, Tree | `labels`; C# `CanopyLabels` | [Labels](data-protocol.md#labels) |
| Polish, German, Spanish, French and Italian packs, with plural forms where a label counts | Grid, Tree, Flow | `@evotecit/canopyx/locales/pl`, `/de`, `/es`, `/fr`, `/it`; `CanopyLabels.Polish()`, `German()`, `Spanish()`, `French()`, `Italian()` | [Label packs](labels.md) |
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
| Public API baselines for C# and TypeScript, checked on every build, and a versioning and deprecation policy | `api/`, `ApiSurfaceTests`, `npm run test:api` | [versioning.md](versioning.md) |
| Single-file pages, fragments and content-hashed asset files | `SaveHtmlPage`, `ToHtmlFragment`, `CanopyHtmlAssets.WriteTo` | [Assets and caching](architecture.md#assets-and-caching) |
| Size guards per entry point (gzip, each its size plus about 15%): tree 59.5 KiB, interactive tree 69.5 KiB, grid 119.5 KiB, reporting 147.5 KiB, flow 10 KiB | Optional parts load on first use | [Assets and caching](architecture.md#assets-and-caching) |
| A strict Content Security Policy with a nonce, and Trusted Types | Grid, Tree | `CanopyHtmlOptions.Nonce`, `CanopyX.setNonce` | [security.md](security.md) |
