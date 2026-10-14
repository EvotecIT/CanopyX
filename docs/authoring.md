# CanopyX authoring reference

Detailed configuration and integration examples for .NET and JavaScript hosts. For installation and the first report, see [the README](../README.md).

## Display and formatting

### Wrapped grid rows

Set a grid column's `wrap: true` and the grid's `rowHeight: "auto"` to display complete multiline notes. Fixed rows remain the default. In .NET, set `CanopyColumn.Wrap = true` and `CanopyDataGridView.AutoRowHeight = true`; `RowHeight` supplies the minimum and initial estimate. Rendered records are measured as they enter the viewport, with stable scroll anchoring and pixel-based keyboard paging. The generated `wrapped-grid.html` examples demonstrate continuous, paged and grouped views. Grids created inside hidden tabs, accordions and details render automatically when shown; see `contained-grids.html`.

### Highlight records by raw values

Grid rows accept optional `tone` and `className`. Declare ordered `highlightRules` to decorate records without a callback:

```javascript
highlightRules: [
  { column: "status", operator: "eq", values: ["Failed"], tone: "danger" },
  { column: "size", operator: "gt", values: [1000000], target: "cell", className: "large-value" }
]
```

In .NET, add `new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "Failed"), CanopyTone.Danger)` to `view.HighlightRules`. The default target is the row; `CanopyGridHighlightTarget.Cell` decorates the condition column's cell. The first match wins separately for the row and each cell. Rules use typed raw values and the existing filter semantics; display text is independent. Row tones use the existing theme palette, and script-free fallback tables retain the rules and classes. The content-sized example demonstrates these rules.

### Shipped languages

Polish, German and Spanish packs cover all browser controls and static-fallback labels. Set `view.Labels = CanopyLabels.Polish()` (or `German()` / `Spanish()`) in .NET. JavaScript hosts import labels from `@evotecit/canopyx/locales/pl`, `/de` or `/es` and pass them as `labels` on the definition or host options. Individual host overrides still take precedence. The packs are optional assets; the runtime bundles retain their English defaults and existing size budgets. See [label packs](labels.md) for offline classic scripts, placeholders and page language, and the generated `localized-grid-pl.html`, `localized-grid-de.html` and `localized-grid-es.html` examples.

### JavaScript Hosts

The optional `@evotecit/canopyx` package contains the complete interactive runtime, CSS, and TypeScript declarations. It has no runtime dependencies. The module and classic scripts are assembled from the same JavaScript source; .NET consumers keep their existing build with no JavaScript compiler or bundler.

```javascript
import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Files",
    rowHeight: 28, pageSize: 100, selection: "single",
    columns: [{ id: "name", title: "Name", kind: "text", width: 320 }],
    source: { kind: "inline" }, roots: [{ id: "plans", label: "Plans" }]
  }
});
await grid.ready;
```

The CSS import above uses the host's existing asset pipeline. A host without a bundler serves the exported stylesheet through a `<link>` and imports `CanopyX.Html/Assets/canopyx-module.mjs` from a module script. `classic.js` and `core.js` export the complete interactive and smaller readonly scripts as assets; their matching styles are `styles.css` and `core.css`. Classic scripts expose `window.CanopyX`.

Module imports are safe during server rendering and leave the server's globals unchanged. Mounting, configuration, and DOM helpers run in the browser. On a page that mixes module and classic hosts, load the module or complete interactive script first; an already-loaded core script cannot be upgraded to support interaction methods. The module rejects that loading order explicitly. Include one matching runtime and stylesheet for the page.

Typed hosts use `InlineView`, `SidecarView`, or `RemoteView` with the matching source factory. Inline roots use the recursive `InlineNode` shape; `CanopyNode` also supports lazy branches. A node chooses complete children or a lazy reference, and detail rows remain leaves. Query-aware custom sources return a dataset `revision` with every page, search result, and count update. Custom link parsers and formatters are supplied together.

Build the local JavaScript archive with `npm pack --ignore-scripts --pack-destination <output-directory>` at the repository root, then install that tarball in a host. This packs the checked-in assets and declarations; it performs no compilation. Reassemble assets with `Build/Sync-Assets.ps1` after editing their canonical source. The browser quality loop packs and installs an isolated consumer, checks its types, and verifies server imports and browser module behavior.

### Building Against Local Source

A released consumer references the packages. A consumer that needs work that is not released yet (a bridge, a host under development) builds against a checkout of this repository instead:

- Reference `CanopyX.Html/CanopyX.Html.csproj` with a `ProjectReference`; it brings `CanopyX/CanopyX.csproj` with it. A consumer that needs only the model, the bundle writer, and the static outline references `CanopyX/CanopyX.csproj` alone. These two projects are the whole product: `Build/project.build.json` names them in `ExpectedVersionMap` and excludes the examples and test projects, which a consumer never builds.
- Check out the whole repository, not one project folder. `CanopyX.Html` compiles three shared files from `CanopyX/Bundles`, and both projects take their version from `Directory.Build.props` in the repository root.
- The build needs the .NET 10 SDK, because both projects also target `net10.0`. Nothing else has to run before the consumer's build: the runtime a consumer embeds, `CanopyX.Html/Assets/canopyx.js`, is checked in assembled, and there is no npm step. (`Build/Sync-Assets.ps1` reassembles it for someone who edits CanopyX itself.)
- Keep the project reference behind a switch that names the checkout, and the package reference for every other build. A root that is set but wrong fails the build instead of silently taking the package:

```xml
<!-- dotnet build -p:CanopyXRoot=C:\Source\CanopyX -->
<ItemGroup Condition="'$(CanopyXRoot)' != ''">
  <ProjectReference Include="$(CanopyXRoot)\CanopyX.Html\CanopyX.Html.csproj" />
</ItemGroup>
<ItemGroup Condition="'$(CanopyXRoot)' == ''">
  <PackageReference Include="CanopyX.Html" Version="0.1.0" />
</ItemGroup>
<Target Name="CheckCanopyXRoot" BeforeTargets="CollectPackageReferences;ResolveProjectReferences" Condition="'$(CanopyXRoot)' != ''">
  <Error Condition="!Exists('$(CanopyXRoot)\CanopyX.Html\CanopyX.Html.csproj')" Text="CanopyXRoot ('$(CanopyXRoot)') does not contain CanopyX.Html\CanopyX.Html.csproj." />
</Target>
```

Use a project reference only when developing against changes beyond the published package. Keep the runtime assets and generated data from the same build.

A consumer with a solution or build list of its own adds the two CanopyX projects to it; otherwise the project reference builds them implicitly. The runtime and the data it reads must come from the same build: pages reference the runtime by a name that carries its content hash, and a consumer that serves it under the plain name `canopyx.js` instead republishes every page and its data whenever it rebuilds against a newer checkout ([Assets and Caching](architecture.md#assets-and-caching)).

## Flat Data Grid

Flat grids use the [Graphite design](design/data-grid-spec.html). Choose `density: "compact"`, `"default"`, or `"comfortable"` in JavaScript, or `CanopyDataGridView.Density` in .NET, for 28, 34 or 42 pixel rows. An explicit row height takes precedence. `zebra: true` / `Zebra = true` enables alternate-row backgrounds. Hosts can set the existing colour tokens and the typography, spacing and radius inputs documented in [architecture](architecture.md#theming).

Columns size to their header and content and fill the grid width; the identity column (the row header, or the first column) takes spare width and stays pinned left when the grid scrolls sideways. When space is short, normal columns shrink, columns with a priority of 10000 or greater hide, and only then the grid scrolls; essential columns are never trimmed. `CanopyColumnSizing.Preferred`, `Fixed`, `Content` and `Flex` express immutable width intent and bounds. `ResponsivePriority`, `Pinned`, `AlwaysVisible` and `RowHeader` belong to the column; see [column sizing, priority and pinning](column-layout.md). A grid whose rows fit is as tall as its rows. A plain row click never selects (`RowAction` can open details or follow the row link), row tones stay quiet unless `RowAccents` is set, enum and state presenters render the tones in `WithQuietTones(...)` as plain muted text, and scrollbars follow the theme.

Define typed columns and complete inline records with `CanopyDataGridView`, then write a page or host fragment:

```csharp
var inventory = new CanopyDataGridView("inventory", "Inventory");
inventory.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
inventory.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
var row = new CanopyGridRow("record-17");
row.Cells["name"] = "Archive";
row.Cells["size"] = new CanopyCell(2048L) { Text = "2 KiB" };
inventory.Rows.Add(row);
inventory.SaveHtmlPage("inventory.html");
```

For typed records, declare selectors once and reuse the mapper for inline rows or hosted result pages:

```csharp
var mapper = new CanopyGridMapper<FileRecord>(record => record.Id)
    .AddColumn(new CanopyColumn("name", "Name") { Sortable = true }, record => record.Name)
    .AddColumn(new CanopyColumn("size", "Size") {
        Kind = CanopyColumnKind.Number,
        Sizing = CanopyColumnSizing.Preferred(140)
    }, record => new CanopyCell(record.Bytes) { Text = record.DisplaySize });
var inventory = mapper.CreateView("inventory", "Inventory", records);
inventory.SaveHtmlPage("inventory.html");
```

`FileRecord` and `records` are host-owned. The mapper uses selectors rather than reflection and validates the resulting view. Column definitions remain mutable and are reused by its views. Its optional `configure` callback sets reporting or source options before validation. `MapRow(record)` supplies the same mapping to a hosted page.

Choose `CanopyGridSource.Inline()`, `HostedOffset()` or `HostedCursor()` through `view.Source`. Cursor sources select paged presentation and reject continuous presentation. Call `view.Validate()` to check a definition before writing it. `CanopyStaticHtml.RenderGrid(view, cursorPage)` accepts a cursor snapshot, including unknown totals, for script-free fallback.

Before 1.0, the C# authoring API uses `CanopyTreeView` and `CanopyDataGridView` in place of `CanopyView` and `CanopyGridView`. Replace column `Width` and the separate layout fields with `CanopyColumnSizing`; put presenters and ordering directly on the column instead of `Reporting.Presenters`, `Reporting.Ordering` or `Reporting.Layout`. Use numeric `ResponsivePriority` instead of the priority enum. Grid source factories replace separate source/navigation assignments. HTML extension methods retain their names and live in `CanopyHtmlExtensions`. JavaScript hosts use `setColumnPinned(id, "left" | "right" | "none")`; the `pinColumn` alias is removed. These changes have no compatibility aliases. Existing `canopyx/2` documents retain their meaning.

JavaScript export rows now contain normalized cells with both `value` and `text`. Use `row.cells[id].value` for typed data and `row.cells[id].text` for captured display text. The `onExport` event supplies `capture`; enumerate `capture.rows({ signal: event.signal })` directly instead of preparing another export from current UI state. Reporting captures also carry semantic tones, links and diagnostics; ordinary grid captures declare `presentation: "text"`.

Sorting, search and typed predicates use raw values; display text and badges remain presentation. Missing values sort last in either direction, with ordinal record identity as the final tie-breaker. Filters and sort keys apply to the full dataset before returning a window.

Set `inventory.Presentation = CanopyGridPresentation.Paged` and `inventory.PageLength = 50` to show pages with first/previous/next/last controls, direct page entry and a visible range. `PageSize` remains the source fetch size; it does not set the visible page length. Continuous mode remains the default. The `inventory-grid-paged.html` example uses the same full-query results and exports as the continuous inventory.

Browser hosts use `getPaging()`, `goToPage(index)` and `setPageLength(length)` over known-count offset sources. Page indices are zero based; displayed ranges are one based. Saved views retain page length and position, and restoration clamps to the refreshed matching count. `scrollToRow(index)` returns a promise so a host can await navigation across pages. Sources must provide complete offset windows and exact counts; cursor-only and unknown-count sources require a separate host/navigation contract.

Set a query's `SearchMode` to `CanopyGridSearchMode.Words` to match every word or quoted phrase across searchable columns. `inventory.SearchColumns` restricts the searched columns, and a cell's `SearchText` supplies alternate keywords without changing its display, sorting or export value. Existing queries keep substring matching. An optional `CanopyGridFilterGroup` combines typed predicates with nested AND/OR rules; search, flat filters and that group all apply before sorting and paging. `inventory-grid-query.html` demonstrates these contracts on the complete inventory.

The toolbar shows the accepted matching and total row counts, removable search/filter chips, and a clear action. Inline search input applies immediately; hosted input waits 300 ms to avoid a request on every keystroke. Set `SearchDelayMilliseconds` in C# or `searchDelayMs` in browser options to choose a delay from 0 to 5,000 ms. Enter applies immediately, and input-method composition completes before submitting. Programmatic queries apply immediately. Counts and chips retain the accepted conditions while a new query is loading or fails.

JavaScript hosts import `createDataGrid` from `@evotecit/canopyx/grid` and the matching `@evotecit/canopyx/grid.css`. A host source receives a frozen query and cancellation signal and returns a complete requested `gridPage` window. The host owns data access and authorization; CanopyX keeps accepted rows during a replacement request, rejects stale responses and bounds its page cache. See [the grid protocol](data-protocol.md) for query operators and revision semantics.

The grid toolbar provides typed filters, column visibility and ordering, and named saved views. A column's menu sorts, filters, pins, fits or hides it; arrow keys move through the menu. Its filter popover applies changes after 200 ms, with full-query value counts or typed number/date conditions and calendar presets in the grid's time zone. The Filters button opens a sentence builder with All/Any groups. The UI allows two nesting levels; deeper saved expressions remain intact and can be edited as text. Builder values are single-line typed fields: text, number, and date/time, whose condition list also offers Today, Yesterday, Last 7 days, Last 30 days and This month (stored as an inclusive `ge` and exclusive `lt` pair). "Is any of" opens a checkable list of full-query values with counts; Enter in its search adds a typed value for sources without facets. Date operands use ISO timestamps in UTC or with an explicit offset. A tall builder scrolls its conditions between a fixed header and footer within the viewport, and becomes a full-screen sheet on phones. Paged grids show the range on the left, with rows per page and the pager grouped on the right. Reset view lives in Views. Columns resize by dragging their separators or using Left/Right when a separator has focus. Headers stay visible while rows scroll.

Column menus and filter editing load `canopyx-filter-editor.js` and `.css` on first use. The .NET page and asset writers include matching companions automatically. JavaScript hosts serve those files beside the grid script or module; the package also exports `@evotecit/canopyx/filter-editor.js` and `filter-editor.css`. Query execution and export work without opening the editor. See [asset loading](architecture.md#browser-runtime) for single-file embedding and content-hashed output.

Enable reporting selection after defining the inventory above, before writing the page:

```csharp
inventory.Reporting = new CanopyGridReporting { SelectionControls = true };
inventory.Selection = CanopySelectionMode.Multiple;
```

This adds row checkboxes, whole-page selection, Shift ranges and a selected-record summary. “Select all matching” captures the accepted query and revision with bounded exclusions, so a large selection does not allocate every record ID. `api.getSelectionDescriptor()` distinguishes explicit identities from that query scope; `getSelection()` is available for explicit identities. Selected CSV/copy exports use the captured scope, and host export hooks receive `request.querySelection` when active. Hosts validate that descriptor and its authorization. Paging preserves selection; changed criteria clear query selection and a new revision clears both modes. Query selection is not retained in saved preferences. See [record selection scopes](data-protocol.md#record-selection-scopes) for range, cancellation and cursor behavior.

Reporting grids also offer direct header moves with `inventory.Reporting.ColumnReorder = true`. Drag a header's move handle or use Left/Right while that handle has focus. Hidden columns, sorting, saved state and export order follow stable column IDs. `inventory.GetColumn("name").Sizing = CanopyColumnSizing.Flex(1, 120, 600)` constrains its width and allocates spare viewport space. A manual resize disables that column's flex sizing; resetting or restoring a saved view restores its sizing intent.

Press Enter on a reporting-grid resize separator, double-click it, or call `api.autoFitColumn("name")` to fit loaded values. The method measures at most 200 cached records from the accepted query, limits each measured display value to 2,048 code units, and caps its estimate at 800 pixels before applying declared width constraints. It does not fetch unseen records or inspect a custom renderer's DOM. The result states the sampled count and `scope: "loaded"`.

Omit a grid column's JavaScript `width`, or use its default .NET `CanopyColumnSizing.Content()` policy, to fit the header and the first loaded sample automatically. Declared widths and saved views take precedence. Initial fitting keeps flex sizing; an explicit auto-fit counts as a manual width choice. Use the per-column fit buttons or **Fit all columns** in Columns, or call `api.autoFitColumns()`, to fit every declared column, including hidden ones. This uses the same bounded sample and constraints as `autoFitColumn`. See `content-grid.html` for an example without configured widths.

Reporting layouts can retain important fields at the edges and adapt the rest to the available width:

```csharp
inventory.Reporting.Responsive = true;
var name = inventory.GetColumn("name");
name.Sizing = CanopyColumnSizing.Flex(1, 120, 600);
name.Pinned = CanopyGridColumnPin.Left;
name.ResponsivePriority = 0;
name.AlwaysVisible = true;
```

Lower priorities remain visible longer. Temporary responsive hiding preserves the user's saved visibility choices, search, full record details and default export columns. The column chooser can pin fields left or right; pins suspend when they cannot leave the configured scrolling center and return when space permits. `api.getColumnLayout()` distinguishes requested pins and temporary layout decisions. The generated `responsive-grid.html` example combines pinning, rich cells and a host-owned record dialog in paged/continuous and light/dark variants.

Use `api.getState()` and `await api.setState(state)` to save and restore the accepted query, column layout, time zone, selection IDs and scroll position. `api.saveView("Archives")` saves a named snapshot; `await api.applySavedView("Archives")` restores it, and `api.removeSavedView("Archives")` removes it. A grid's `StateKey` remembers the current settings and up to 20 named views in session storage. `await api.resetView()` restores the original definition and clears selection while retaining named views. A host that supplies its own toolbar passes `toolbar: false` and uses these same controller methods.

Grid pages choose the entry point required by their definition, which also hosts interactive trees. For mixed fragments, use `CanopyHtmlAssets.GetRuntime(view)` with `CanopyHtmlAssets.WriteTo` and include the largest required entry point once. Load that entry point first; a smaller tree or ordinary-grid runtime cannot be upgraded after loading. `CanopyStaticHtml.RenderGrid` supplies a script-free fallback, with an explicit accepted page for hosted results.

For print or export metadata, call `CanopyStaticHtml.RenderGridWithResult(view, acceptedPage)`. Its `Html` is the same fallback table; `Rows` captures the displayed cells in document order, including presenter text and badges. `TotalRows` is the accepted matching count before the static row limit. When a cursor page omits that count, `HasUnknownTotal` stays true and `TotalRows` is a lower bound including the page offset and all accepted rows. Both existing `RenderGrid` overloads continue returning the table directly.

Reporting grids add natural or case-folded text ordering, category order and typed filter controls without enlarging the ordinary grid entry point:

The reporting filter editor provides inclusive number/date ranges, category suggestions from declared ordering policies, and translated boolean choices. A filled accent filter button appears beside the title of each filtered column and reopens its filter; unfiltered headers show only the column menu, which offers Filter…. Escape returns focus to the button that opened the filter. `HeaderFilters` remains accepted for existing hosts. Ranges remain two ordinary typed predicates, so hosted queries and exports keep their existing meaning. Category suggestions leave free-text filtering available for values outside the declared list. Active-condition chips and counts describe the accepted full query, including predicates on hidden columns. `Labels.GridBetween`, `GridTrue`, `GridFalse` and `GridHeaderFilter` customize the new controls.

```csharp
view.Reporting = new CanopyGridReporting { HeaderFilters = true };
view.GetColumn("name").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
view.GetColumn("status").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedOrdinal,
    new[] { "Critical", "Warning", "Healthy" });
```

The columns identify declared sortable text fields. Complete-page writers select `CanopyRuntime.ReportingGrid` automatically. JavaScript hosts import from `@evotecit/canopyx/reporting` with its matching `reporting.css`, and supply `reporting: { ordering: { name: { text: "foldedNatural" } } }` in the grid definition. Host query engines can reuse `CanopyGridOrdering`; sorting precedes result windows and export order remains the accepted query order. See the [protocol's ordering and precision rules](data-protocol.md#flat-grid-documents) for categories, missing values, exact text representations and UTC millisecond dates.

The export menu distinguishes filtered results, selected records and all results. Exports use the accepted query, stable record IDs and ordered columns, independently of the virtual rows on screen. `await api.toCsv({ scope: "filtered" })` produces CSV; `await api.copy({ scope: "selected" })` copies tab-separated records with spreadsheet formula protection. Client exports have explicit row limits. For larger Office files, configure `onExport` and call `api.exportToHost("xlsx", { scope: "all" })`; the host owns authorization, document generation and delivery.

`api.refresh()` repaints accepted data. `await api.reload()` requests a fresh source revision using the accepted filters and ordering and restarts at the first page; a failed request keeps the last accepted query and rows. A prepared export remains bound to its original revision.

`prepareExport()` captures an immutable request and a fresh `rows({ signal })` enumeration factory. Each exported cell contains `value` and resolved `text`. The reporting runtime marks the request as `presentation: "semantic"` and also captures presenter intent, CSS pixel width bounds, wrapping, alignment, first-match highlight tones, safe absolute links and diagnostics for presentation that needs host policy. Ordinary grids mark text-only captures as `presentation: "text"`. `recordCount` includes selected-query exclusions and stays null for unknown counts. The `onExport` event supplies this exact `capture` alongside `request` and its cancellation signal; hosts map semantic tones to their output palette and own format generation. See [export contracts](data-protocol.md#export-clipboard-and-record-details) for precision, unsupported presentation and memory limits.

Enter on a row, double-click or Record details opens a drawer with every field, including hidden columns. The drawer uses the column presenters and optional `CanopyColumn.Section` labels, with previous/next records, Escape and focus return. F2 enters the row's cells. On phones, tapping a row opens the full-screen drawer; a +N indicator shows how many fields are hidden. Configure `onDetails` to use a host-owned record view instead. The hook retains its immutable row, accepted query, cancellation signal and return-focus element. To take over row activation itself (a double click, Enter, Ctrl/Command+Enter, a click with `RowAction` `Details` or `Link`, or a tap on a phone), listen for the cancelable `canopyx:rowActivate` event (`{ id, row, keyboard }`) on the host element and call `preventDefault()`, or return `false` from `onRowActivate`; the grid then opens neither its drawer nor the row's link, and the host opens its own drawer for `id`. Trees dispatch the same event for Enter and a double click on a node row, with `{ id, node, keyboard }` and `onRowActivate(node, { keyboard })`. A changed query or newer details request cancels an unfinished opening operation. See [export and details contracts](data-protocol.md#export-clipboard-and-record-details) for revision checks and limits.

The generated `inventory-grid.html` example contains 5,000 records and starts with a typed category predicate and numeric descending sort. It exercises the shared viewport, toolbar, saved views and export controls. Consumer adoption and scrolling performance follow-ups remain in [TODO.md](../TODO.md).

The sentence builder composes All/Any condition groups in ordinary and reporting grids. `Reporting.FilterGroups` remains accepted for existing hosts. Flat conditions remain an outer conjunction. Groups use the same typed predicates, saved query state and whole-result export semantics as API-authored queries. Inclusive ranges inside an Any group stay one condition, represented by an inner AND group. Live editing validates the complete expression before requesting data; invalid input retains the accepted results. The engine still supports eight levels, 64 groups and 64 total predicates. Saved expressions deeper than the UI's two levels open read-only until Edit as text is chosen. Group editing does not enable hosted facet counts.

Inline text columns offer a value list with full-query counts in their column filter popover. Declare `Reporting.FacetColumns.Add("status")` and supply `source.facet(request, { signal })` for hosted facets. The control searches available values and preserves raw types; counts exclude the current column's predicates and include the other accepted conditions. Changes apply after 200 ms. Counts never come from just the visible page. `api.getFacets("status", { search: "review", limit: 100, includeCurrentFilter: false })` retains the explicit projection option; see the [facet protocol](data-protocol.md#flat-grid-documents) for snapshot rules.

Saved reporting views can survive browser sessions with `inventory.StateKey = "inventory-reader"` and `inventory.Reporting.ViewStorage = CanopyGridViewStorage.Local`. The Saved views menu offers rename and default choices; Reset view restores the definition while keeping named views. JavaScript hosts can supply `viewStore.load/save` hooks for governed preference storage instead. Use `api.flushViewSettings()` before disposal when the host must acknowledge a save. `api.getShareState()` keeps layout and sorting while removing searches, filters, selected IDs and dataset positions. See the [preference contract](data-protocol.md#flat-grid-documents) for bounds, schema evolution, cancellation and privacy.

Reporting exports offer progress and cancellation for full filtered, selected or all-result scopes. Optional `fileName`, `locale` and `timeZone` options stay with the captured request. A host can call `api.materializeExport({ scope: "filtered", maxRows: 1000 })` for a complete bounded snapshot, or configure `onPrint({ snapshot, signal })` and call `api.print({ scope: "filtered" })`. The host uses its existing renderer and honors cancellation before delivery. Larger Office or print reports use `exportToHost`, with authorization and generation governed by that host. See the [delivery contract](data-protocol.md#export-clipboard-and-record-details) for bounds, progress and offline choices.

Grouped reporting views retain record-based paging and export scope:

```csharp
inventory.Reporting = new CanopyGridReporting {
    Grouping = new CanopyGridGrouping("category"), SelectionControls = true
};
inventory.Reporting.Aggregates.Add(new CanopyGridAggregate(
    "total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
```

The grouping column leads ordering, followed by user sorts and stable record IDs. Group headings show full group counts, column-aligned totals and the worst declared state tone; collapsing a group hides its rows without removing records from selections or exports. Hosted summaries supply optional `CanopyGridGroup.Cells` / `groups[].cells` for group display facts. The pinned summary row follows the complete filtered query. Inline data computes generic aggregates; hosted sources provide revisioned `gridSummary` metadata through `source.summary`. See the [group and summary contract](data-protocol.md#flat-groups-and-complete-query-totals) for ordering, bounds and host validation. The generated `grouped-grid.html` and continuous/dark variants combine grouping with responsive columns, filters, saved views and selection.

Set `CanopyDataGridView.StatusBar = true` / `statusBar: true` for matching and selected counts. Numeric columns marked `Aggregatable` / `aggregatable` show selected sums and a tooltip with count, average, minimum and maximum. These use complete selected records rather than visible rows. Hosted aggregates read through the accepted export contract, cancel when selection or query changes, and stop at 50,000 records; unavailable values display the translated no-data message. Inline All in the paging footer uses the complete dataset; `api.setPageLength("all")` selects it programmatically and saved paging state retains that choice.

Safe cell presenters can be declared on any flat-grid column. For example, `new CanopyColumn("state", "State") { Presenter = CanopyGridPresenter.State() }` uses each cell's host-supplied tone. JavaScript uses `presenter: { kind: "state" }`. The existing reporting configuration remains supported:

Graphite adds enum pills, quiet healthy states, directional deltas, period strips, bar and line sparklines, identifiers with secondary text, tags and missing-value dashes. History metadata lives in `CanopyCell.Series` / `cell.series`; the cell's raw value retains its search, sorting and export meaning. [The protocol reference](data-protocol.md#safe-cell-presenters) describes thresholds and shared scales. The generated `graphite-grid.html` and dark variant show the presenters together, including 90 daily periods and clamped text.

```csharp
view.GetColumn("name").Presenter = CanopyGridPresenter.Link("address", newWindow: true);
view.GetColumn("status").Presenter = CanopyGridPresenter.Icon("●");
view.GetColumn("completion").Presenter = CanopyGridPresenter.Progress(maximum: 100);
view.GetColumn("enabled").Presenter = CanopyGridPresenter.Boolean();
view.GetColumn("owners").Presenter = CanopyGridPresenter.List(", ", limit: 2);
view.GetColumn("notes").Presenter = CanopyGridPresenter.LongText();
```

The referenced columns must be declared; progress uses a numeric column, while links, booleans and lists use text columns with typed raw cells. Links allow HTTP(S), mailto and relative offline files; invalid destinations remain text. Icons accompany text alternatives. Lists and notes open plain-text dialogs outside fixed-height rows, retaining keyboard focus and query cancellation. Custom host renderers take precedence. These presenters preserve search, sort and export values. The generated `rich-grid.html` example shows every presenter in paged and continuous, light and dark views.

### Export formats

Register extra export formats, such as an XLSX or PDF writer, and they appear in the grid's own Export menu after Download CSV, with the same scope picker (filtered, selected, all), progress meter, Cancel export action and error status:

```js
import { registerExportFormat } from "@evotecit/canopyx/reporting"; // also CanopyX.registerExportFormat for classic scripts

registerExportFormat({
  id: "xlsx",                       // 1–32 lowercase letters, digits and hyphens; "csv" is built in
  label: "Download Excel",          // the button text
  extension: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  async write(capture, { signal, progress, fileName }) {
    const sheet = startWorkbook(capture.request.columns);
    for await (const row of capture.rows({ signal })) sheet.add(row.cells); // typed value, display text, tone
    progress(sheet.length);
    return sheet.toBlob();          // a Blob, ArrayBuffer or typed array, or a promise of one
  }
});
```

The writer receives the same immutable capture as `prepareExport`: the accepted query and sort, the visible columns in their current order, typed `value`, formatted `text` and, on the reporting runtime, semantic tones, links and column intent. CanopyX names the file `fileName` plus the format's extension (a writer that returns a `File` names it itself) and starts the download; `await api.exportAs("xlsx", { scope: "selected", download: false })` returns `{ blob, fileName, format }` instead, for a host that delivers the file itself.

A registered format is offered by every grid on the page that does not choose its own. A grid chooses with the `exportFormats` option (ids of registered formats or provider objects, in order; `[]` offers none) or, from C#, `inventory.ExportFormats.Add("xlsx")`; an id the page does not register is skipped. The browser option wins over the view's list. Formats registered after a grid mounted appear the next time its Export menu opens.

Page reads keep their own `requestTimeoutMs` deadline. The writer runs under a separate safety timeout, `exportTimeoutMs` (10 minutes by default, also per call as `timeoutMs`; checked when an export runs), so long workbook or PDF generation is not cut off at 30 seconds; Cancel export, the timeout and grid destruction abort its `signal` and settle the menu even when a writer ignores it. A writer error is shown in the menu status and dispatched as the grid's `error` event. `onExport`/`exportToHost` use the same export timeout.

Tree grids list the same formats in their own Export menu, after Download CSV, with the scopes Visible rows, Selected rows and All rows. Hosts capture with `api.prepareExport({ scope: "visible" })` (the rows the reader can see), `{ scope: "selected" }` (the loaded selected nodes in tree order, including collapsed branches) or `{ scope: "all" }` (every node in sort order: the whole inline tree, or the loaded nodes of a lazy source). Each record carries `level` (1 for a root) and `path` (the id path ending with its own id) beside its cells, so a writer can indent or add Level and Path columns; the built-in CSV indents the tree column by level. `api.exportAs("xlsx", { scope: "visible" })` runs the same writers. Every tree runtime has tree exports once the tree is ready (they come with the tree tools part); `CanopyTreeView.ExportFormats` chooses which registered formats the menu offers. A host that drew its own export buttons above a tree can drop them and use the tree's Export menu.

The Export menu body, CSV, copy and the writers ship in `canopyx-export.js`, loaded on first use (the menu, an export method, Ctrl/Command+C or reading a capture). The .NET page, fragment and asset writers include it automatically; JavaScript hosts serve it beside the grid runtime or module, as they do the filter editor, also when the Export menu is switched off.

### Toolbar controls, slots and menu entries

Every toolbar control can be switched off; a control switched off is removed from the page (it is not built, or is taken out before the grid appears), and the methods behind it stay available. C# views set `Toolbar` switches (the search box keeps its `Search` switch); browser hosts pass `toolbar` to `createDataGrid` or `CanopyX.configure`, which overrides the definition and also accepts `search`:

```csharp
inventory.Toolbar.Export = false; // the host offers its own export
inventory.Toolbar.Count = false;  // the host shows its own count
```

```js
createDataGrid(host, { view, toolbar: { views: false, more: true } }); // search, filters, columns, views, export, more, count
```

The reporting runtime (`@evotecit/canopyx/reporting`) adds host slots and content entries. Four slots hold host elements in the toolbar: `start`, `afterSearch`, `afterViews` and `end` (the start of the right-hand group, before Export and ⋯). `afterSearch` follows `start` directly when the grid has no search box. `api.toolbarSlot(name)` returns the slot's element (it carries `data-cx-toolbar-slot`), the same one for the grid's lifetime whatever the phone layout moves. Children of the host element marked `data-cx-slot` move into their slot when the grid mounts and return to the host element when it is destroyed, so a remount picks them up again; a misspelt slot name fails the mount and leaves them in place. A replacement grid on another host takes host elements with `next.toolbarSlot("end").append(count)`. Slots add no box of their own; host elements that use the `cx-button` and `cx-grid-field` classes match the grid's controls. The ordinary grid entry point has no slots, to stay within its budget; use the reporting runtime for slots, and [export formats](#export-formats) rather than extra toolbar buttons for additional file types.

```html
<div data-canopyx-host>
  <span data-cx-slot="end" class="my-count">1,204 devices</span>
  <script type="application/json" class="cx-config">…</script>
</div>
```

`actions` entries run a handler (`{ label, run }`) or, in the reporting runtime, disclose host content inside the more menu (`{ label, render }`). `render(container, { close, signal })` fills the container on first open (again after a render that threw); focus moves to its first control, Escape folds the entry back to its label, closing the menu folds it, and `close()` closes the menu and returns focus to ⋯. `signal` aborts when the grid is destroyed:

```js
actions: [{ label: "Save view…", render(container, { close }) {
  const field = document.createElement("label"), name = document.createElement("input"), save = document.createElement("button");
  field.className = "cx-grid-field"; field.append("View name", name);
  save.type = "button"; save.className = "cx-button"; save.textContent = "Save";
  save.onclick = () => { grid.saveView(name.value); close(); };
  container.append(field, save);
} }]
```

Toolbar menus (Filters, Columns, Views, Export, ⋯ and the header selection menu) open in the browser's top layer as popovers, so a short grid or a host with `overflow: hidden` no longer clips them. They stay inside the grid's DOM, so themes, focus order and events are unchanged, and list menus keep their 320-pixel height cap. Browsers without the popover API give them viewport-fixed positioning instead, which escapes `overflow: hidden` but not an ancestor with a `transform`, `filter` or `contain` that captures fixed positioning.

One CanopyX menu is open at a time, from the mouse or the keyboard. A menu (including a column popover and a tree's actions menu) closes on a pointer press or focus outside it and when another CanopyX menu opens; the opening menu dispatches `canopyx:closemenus` on the document with itself as `detail.source`. Hosts with popovers of their own coordinate through the same event:

```js
// Before the host opens its popover: close every CanopyX menu on the page (or call grid.closeMenus() for one view;
// dispatched on an element that holds views, the event needs bubbles: true).
document.dispatchEvent(new CustomEvent("canopyx:closemenus"));
// When a CanopyX menu opens: close the host's popover.
document.addEventListener("canopyx:closemenus", event => { if (event.detail?.source) hostPopover.hidePopover(); });
```

## Tree Grid Features

Trees have the flat grid's toolbar: the search box and filter switches on the left, then **Columns** (show, hide and
reorder; the tree column stays first and shown), **Views** (named session views and Reset view, with `StateKey`), and on
the right **Export** (Visible rows, Selected rows or All rows as CSV or a registered format, with progress, Cancel export
and status) and the **⋯** menu (host `actions` run with the selected nodes, and Print). On phones Views and Export move
into ⋯, as on flat grids. Columns size to their content: the tree column measures each visible row with its indent,
expander, icon and badges, stays pinned while the others scroll and takes spare width; priorities hide optional columns
first. A tree with few visible rows is only as tall as its rows (`AutoHeight`), and grows to the host height when expanded.
The controls, fitting and exports come from the tree tools part every tree runtime loads (`canopyx-tree-tools.js` and
`.css`; single-file pages embed it).

```csharp
var view = new CanopyTreeView("org", "Organisation") { StateKey = "org", Search = new CanopySearchOptions() };
view.Columns.Add(new CanopyColumn("name", "Name"));
view.Columns.Add(new CanopyColumn("email", "Email") { ResponsivePriority = 10000 }); // optional: hides first
view.ExportFormats.Add("xlsx");   // a writer the page registers with CanopyX.registerExportFormat
view.Toolbar.More = false;        // per-control switches: Filters, Columns, Views, Export, More
view.AutoHeight = true;           // the default
```

JavaScript hosts pass `toolbar` (`false`, or switches including `search`), `actions` and `exportFormats` to
`createTreeGrid` or `configure`. Once `ready` has resolved the tree API also has `prepareExport`, `exportAs`,
`getSavedViews`, `saveView`, `applySavedView`, `removeSavedView`, `resetView`, `setColumnOrder` and `resetColumns`.

- Lazy children from inline data, sidecar script files, or an HTTP endpoint, with long child lists paged behind a "show more" row.
- Virtual scrolling over a fixed row height; only the rows near the viewport exist in the DOM. Large logical heights map to a bounded native scrollbar, keeping every loaded row reachable through scrolling, keyboard navigation, and saved anchors.
- Columns with per-level sort, resize, hide and reorder, content-sized to fill the width, and a tree column that stays pinned while the others scroll; dates in UTC or the reader's time zone, switchable at run time.
- Search that returns id paths and expands the tree to the match, optionally limited to the node kinds worth finding; the bundle writer stores every node once and files its words in shards by prefix, so a query loads only the shards of its words and the entries of the matches it shows.
- "Only matching" filters that keep the ancestors of matching rows.
- Cells with host-supplied values, display text, tones, and badges; icons declared once per view. Six tones are built in, and a host adds its own (a severity scale, a maintenance state) with a name and two theme colours.
- Detail rows that hold a table, a property list, or host HTML: as tall as their content (measured in the browser) or a fixed number of row slots, and always inside the visible width of the grid.
- Single and multi-select, selection events for a drawer, deep links that expand a path (in the default scheme or the host's own), and versioned view state remembered for the session.
- Light and dark themes from a handful of CSS custom properties.
- Every text CanopyX writes itself (search hints, "show more" and error rows, the toolbar menus, screen-reader announcements, date marks, the outline's notes) comes from `CanopyTreeView.Labels`: English by default, translated once per view.
- A script-free outline table for email, print, and Word, in the light or dark palette or the host's own colours.

JavaScript hosts can save a view with `const state = api.getState()` and restore it with `await api.setState(state)`. The JSON snapshot includes columns (in their order, with `sized` for widths the reader chose), sort, declared filters, selection, expansion, timezone, focus, and a scroll anchor. Existing expansion-only snapshots remain readable. `stateKey` remembers the same settings in session storage. Host predicates and callbacks stay with the host and are not serialized.

Use `await api.reload()` to reread roots, or `await api.reload(parentId, { signal })` to reread a loaded parent's children. Reload reads through the range already loaded, validates the replacement before applying it, and preserves surviving selection, expansion, focus, and scroll position. A newer reload supersedes an older one. Failed validation retains the old data; cancellation returns `false`. `api.refresh()` repaints the current nodes, and `api.refreshCounts()` updates rollup values and child counts.

The generated `live-records.html` example replaces an inline snapshot and provides save and restore controls for the view. An inline host can assign a new array to `api.view.roots` and then call `await api.reload()`; stable node IDs retain the reader's selection and open branches.

The generated `long-document.html` example loads 20,000 tall sections and provides jumps and saved positions across their full range. The height mapping preserves each section's size; it does not load additional pages or bound the memory of rows the host has already supplied.

Sorting an inline list orders its complete sibling array before choosing the loaded page. Selected and expanded identities remain available when they move outside that prefix. `retainedNodeLimit` is a JavaScript host option, defaulting to 1,024 nodes, that bounds unpinned wrappers retained after inline reordering. Selection, expansion, focus, anchors, and pending operations pin their subtrees. The host's inline arrays remain unchanged. For remote and sidecar lists this API orders loaded siblings; ordering the complete dataset remains the host's responsibility.

## Quick Start

Build a view, add nodes, and save a single-file page:

```csharp
using CanopyX;
using CanopyX.Html;

var view = new CanopyTreeView("files", "File shares");
view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(320), Sortable = true });
view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
view.Columns.Add(new CanopyColumn("owner", "Owner"));

var projects = new CanopyNode("projects", @"\\files\projects");
projects.Cells["size"] = 5_368_709_120;
projects.Cells["owner"] = "Engineering";

var plans = new CanopyNode("projects/plans", "plans");
plans.Cells["size"] = 1_048_576;
plans.Badges.Add(new CanopyBadge("stale", CanopyTone.Warning));
projects.Children.Add(plans);

view.Roots.Add(projects);
view.SaveHtmlPage("files.html");
```

The first column shows each node's label; the other columns show the node's cells by column id.

For large trees, write a bundle instead. The data is split into sidecar files that the page loads on demand, and the page works when opened straight from a file share. Small child lists share pack files, so a tree with hundreds of thousands of rows is a few thousand files. The page references the runtime under a name that carries its content hash (`assets/canopyx.<hash>.js`), so it always loads the runtime it was written for and the file can be cached for good; publish the page and its data folder together:

```csharp
CanopyBundleResult bundle = view.SaveHtmlBundle("report");
Console.WriteLine($"{bundle.NodeCount:N0} nodes in {bundle.FileCount:N0} files ({bundle.PackCount:N0} packs), largest {bundle.LargestFileBytes:N0} bytes");
```

When the tree is too large to build in memory, hand the writer the nodes while it walks the tree. It asks for the children of each node once, depth first, and releases a node when its subtree is written:

```csharp
var view = new CanopyTreeView("files", "File shares");   // columns as above, no roots
CanopyBundleResult bundle = view.SaveHtmlBundle("report", ReadShares(), node => ReadChildren(node.Id));
```

`ReadShares` and `ReadChildren` are the host's own queries and return `IEnumerable<CanopyNode>`; an empty or null result makes the node a leaf. A node that already carries inline `Children` is written as it is.

Local external assets in an HTML bundle use a separate directory tree from its sidecar data. Bundle folders cannot occupy `index.html` or a runtime asset file path. Local asset folders use portable names without internal `.` or `..` segments; a leading `./` is allowed. These layout checks run before any bundle files are written. URLs outside the bundle remain host-served.

For email, print, or Word, render the static outline:

```csharp
using CanopyX.Rendering;

string outline = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { MaxRows = 500 });
```

The outline is light by default. `Theme = CanopyStaticTheme.Dark()` writes the dark palette, a host sets the colours of its own design tokens on the theme, and `UseThemeVariables` lets an outline inside a page follow that page's theme without script ([Theming the Outline](architecture.md#theming-the-outline)).

JavaScript hosts can create a tree grid directly from a view document:

```js
const grid = CanopyX.createTreeGrid(document.getElementById("files"), {
  view,
  // The host draws the columns it names and returns true; every other column keeps the default painting.
  renderers: { owner: (node, element, context) => drawOwnerChip(node, element) },
  onSelect: (node) => showDrawer(node)
});
await grid.expandPath(["projects", "projects/plans"]);
// Pass { signal: controller.signal } to cancel navigation promptly, even while a page is still loading.
```

A renderer that draws badges or chips uses `CanopyX.badge({ text, tone, title })`, which returns the badge element the grid itself draws (the `cx-badge` class, the classes of a named tone, and for a host tone its `--cx-tone-<name>` colours), so a host cell matches the cells CanopyX paints:

```js
renderers: { finding: (node, element) => {
  if (!node.data || !node.data.severity) return false;
  element.append(CanopyX.badge({ text: node.data.severity, tone: node.data.severity.toLowerCase() }), " " + node.label);
  return true;
} }
```

A renderer gets the node, a fresh element to fill, and `{ column, level, expanded, index }`. Name only the columns the host really draws: a cell the renderer draws (returns true) or decorates is rebuilt whenever its row is painted, while the other columns, and the rows where the renderer returns false without adding children or attributes to the element (which is then dropped, so put listeners on content you add, or on the grid), reuse their cells, which is what keeps scrolling smooth on slow machines.

A page that embeds a fragment from `ToHtmlFragment` hands it the same options before the runtime mounts it, from a script that runs before the page has loaded:

```js
const releaseOptions = CanopyX.configure("files", { renderers: { owner: drawOwnerChip }, onSelect: showDrawer });
// When the host retires this view, destroy its grid and call releaseOptions().
```

With `CanopyHtmlOptions.AutoMount = false` the fragment waits until the host calls `CanopyX.mount()`.

Repeated creation on a live host returns its existing grid. Call `grid.destroy()` before creating a replacement. Destruction releases loaded rows, selection, caches, and the row pool. A caller-held retired API retains its view metadata; the host no longer exposes the destroyed grid.

Registered fragment options persist for remounting until their disposer is called or `CanopyX.unconfigure(viewId)` removes them. Removing a registration leaves a mounted grid intact, and an older disposer cannot remove a newer registration.

Built-in remote requests have a 30-second deadline, including reading the response body. Set `requestTimeoutMs` in grid options to change it; destroying the grid cancels its built-in requests. A separately owned source created with `CanopyX.sources.remote(view, { timeoutMs, signal })` follows its owner's signal, and `page(node, cursor, { signal })`, `search(query, limit, { signal })`, and `counts(ids, { signal })` accept individual request signals. Cancelling navigation releases that caller without cancelling a shared page load. Custom sources own their transport cancellation and deadlines.

Selection is independent of focus. `grid.setSelection(["projects", "archive"])` replaces the selection with loaded node ids, `grid.clearSelection()` clears it, and `grid.selectAll({ scope: "visible" })` selects eligible rows in the current expanded/filtered view. The alternative `scope: "loaded"` includes loaded collapsed descendants. Select-all requires multiple selection and never fetches unloaded data; invalid ids and single-selection overflow leave the existing selection intact. Call `expandPath` to load an id before selecting it directly.

Hosts can pass `isSelectable(node)` to keep rows focusable while preventing selection additions, and `beforeSelect(node, nodes, { previous, reason })` to synchronously veto a whole proposal by returning false. The cancelable `canopyx:beforeselect` event offers the same veto. Reasons are `row`, `range`, `api`, `clear`, or `all`. Selection methods return whether their proposal was accepted. A successful clear emits `canopyx:select` and calls `onSelect` with `null` and an empty array; hosts that handle clearing should account for that nullable node. Removal of data reconciles selection directly and cannot be vetoed.

Bundle folder and asset constraints are described in the [data protocol](data-protocol.md#sidecar).

Collapsed branches retain up to 4,096 loaded descendants by default (`inactiveNodeLimit`); unpinned older data is evicted and loaded again when needed. Selection, focus, expansion, state restoration, active requests, and local filters keep their required data. `retainedNodeLimit` separately bounds identities kept outside an inline page after sorting. Both are nonnegative integer host options; pins and host input arrays can exceed these retention limits. The [architecture reference](architecture.md#rendering-model) describes their ownership and the sidecar pack limits.

## Checking Lazy Branches

Checkboxes are independent of row selection. A hierarchical check applies to a complete branch, including children that have not loaded; a deeper rule creates an exception. Checking does not fetch children or perform a host operation.

```csharp
view.Checkboxes = CanopyCheckboxMode.Hierarchical;
view.CheckIntents.Add(new CanopyCheckIntent(new[] { "project-a" }, true));
view.CheckIntents.Add(new CanopyCheckIntent(new[] { "project-a", "task-1" }, false));
```

`CanopyCheckboxMode.Independent` checks individual nodes. Page and bundle writers choose the interactive runtime automatically for checkbox views. Fragment hosts use `CanopyHtmlAssets.GetRuntime(view)` to select the script and matching stylesheet through `GetScript` and `GetStyle`. If any view on a page requires `CanopyRuntime.InteractiveTreeGrid`, include that entry point once for all views. It includes the standard tree runtime.

In the browser, `api.setChecked(id, checked)` changes a loaded node. `api.setCheckIntents([{ path, checked }])` replaces the complete intent without loading paths. `getCheckState(id)` returns `true`, `false`, `"mixed"`, or `null` for an unavailable node; `getCheckIntents()` returns a copied snapshot suitable for the host to interpret. A complete loaded sibling set can combine into one branch rule; partial pages preserve exceptions without claiming unseen siblings. Rules survive sorting, reload, and cache eviction. Saved views include them, and both outline renderers show readonly check states.

Space checks the focused row; Control+Space or Command+Space keeps row selection. F2 enters the native checkbox. `isCheckable(node)` disables direct changes to a node's control. It does not restrict an ancestor's branch intent: the host evaluates its own eligibility and authorization when interpreting that intent. `beforeCheck(node, intents, { previous, reason })` and the cancelable `canopyx:beforecheck` event can veto a complete proposal, including saved-state restoration. Vetoes return synchronously. `onCheck` and `canopyx:check` report accepted changes. Checking controls pause while a saved view restores.

The generated `checkboxes.html` example demonstrates lazy branches, paging, exceptions, keyboard controls, and saved choices.

## Host Actions, Editing, and Moving Nodes

The interactive runtime presents operations to hooks supplied by the host. It sends immutable IDs, complete paths, and proposed values; the host validates authorization and executes the operation against its own data.

```csharp
view.Columns[0].Editable = true;
view.DragDrop = true;
view.ContextActions.Add(new CanopyContextAction("inspect", "Inspect record"));
```

Page and bundle writers choose the interactive assets automatically. Fragment hosts include the interactive script and matching stylesheet once. Configure hooks before mounting:

```js
CanopyX.configure("records", {
  canEdit: (node, column) => node.kind === "task",
  canDrag: node => node.kind === "task",
  onEdit: async (proposal, request) => {
    // The host validates the path, column, value, and current authorization.
    return await records.acceptEdit(proposal, request.signal);
  },
  onDrop: (proposal, request) => records.acceptMove(proposal, request.signal),
  onAction: (proposal, request) => records.runAction(proposal, request.signal)
});
```

Hooks return `true` for acceptance or `false` for rejection, directly or through a promise. Exceptions report failure. Each request supplies an abort signal, its reason, and the current remote query and dataset revision when applicable. The default deadline is 30 seconds; `interactionTimeoutMs` sets a positive deadline. Cancellation, a newer proposal, destruction, or replacement of affected data retires pending work. Hosts observe cancellation before committing their own writes.

Alt+Enter opens an editor for an editable cell; F2 retains cell navigation. Right-click, the Menu key, or Shift+F10 opens actions. The menu provides move destinations, including before and after a node. Control+Shift+X marks a node or its selected group for moving; Control+Shift+V proposes moving into the destination. Native internal drag offers the same placements. A missing hook makes its operation unavailable. `canEdit`, `canDrag`, `canDrop`, and `isActionEnabled` provide synchronous eligibility; the host still enforces authorization.

The API exposes `beginEdit(nodeId, columnId)`, `openActions(nodeId)`, `requestEdit(nodeId, columnId, value)`, `requestDrop(nodeIds, targetId, placement)`, `requestAction(nodeId, actionId)`, and `cancelInteraction()`. Request methods resolve to an acceptance boolean and accept an optional `{ signal, reason }` argument. Edit values are finite JSON scalars. A drop uses loaded nodes, excludes nested sources when their ancestor is also moved, and rejects a destination within the source subtree. An API drop into the root uses `null` with `"inside"`.

Cancelable `canopyx:beforeedit`, `canopyx:beforedrop`, and `canopyx:beforeaction` events can veto a proposal before execution. `canopyx:edit`, `canopyx:drop`, and `canopyx:action` report `{ proposal, accepted, reason }`. After acceptance, the host supplies fresh data through `applyCounts` or `reload`; return from the hook before refreshing affected data so the operation can report its accepted result. The `interactions.html` example demonstrates this flow, host rejection, and keyboard controls. Translations for these controls are properties of `CanopyLabels`.


## Hosted filtering

Host filter bars use `grid.updateActiveFilters({ remove: ["day", "week"], add: ["week"] })` to replace one choice while retaining unrelated selections, including changes in a pending query. The grid commits the final filter set atomically; failed queries retain accepted rows and controls.

For hosted data, `CanopySource.RemoteQuery` lets endpoints sort and filter the complete dataset before paging. Every supplied endpoint receives `{viewQuery}` and returns its dataset revision. In the browser, `await grid.sort("value", "desc")` or `await grid.setActiveFilters(["flagged"])` stages a replacement while accepted rows remain visible. Failed queries keep the old view, and stale pages cannot mix revisions. The [remote query contract](data-protocol.md#queries-before-remote-paging) describes request fields, events, cancellation, and selection semantics; `query-records.html` demonstrates the host source.

