import CanopyX, {
  createTreeGrid, sources, labels, type CanopyView, type CanopyNode, type InlineNode, type DataSource, type ViewState, type CheckState, type PageDocument
} from "@evotecit/canopyx";
import GridRuntime, { createDataGrid, mount as mountViews, type GridSource, type HostGridView, type InlineGridView } from "@evotecit/canopyx/grid";
import type { CursorGridView, GridCursorSource, GridCursorQuery, CompactGridView, GridCompactRow, GridFormatRule, GridExportFormat, GridGroupLevel as GroupLevel, GridGroup, GridAggregate, GridNumberFormat,
  GridColumnGroup, GridCellRange, GridPasteEvent, GridPasteResult, GridColumnGroupState } from "@evotecit/canopyx/grid";
import { enhance, grid as gridInit, type EnhancedGrid, type GridInitOptions, type GridPager } from "@evotecit/canopyx/grid";
import ReportingRuntime from "@evotecit/canopyx/reporting";
import type { GridTupleColumn, GridTupleFilter } from "@evotecit/canopyx/grid";
import type { GridPivotDefinition, GridPivotLevel, GridPivotResult, GridPivotAcceptedResult, GridPivotExportSnapshot } from "@evotecit/canopyx/grid";
import type { GridCalculatedColumnDefinition, GridColumn } from "@evotecit/canopyx/grid";
const calculationDefinitions: readonly GridCalculatedColumnDefinition[] = [
  { id: "total", title: "Total", kind: "number", expression: "[quantity] * [price]" }
];
const calculationView: InlineGridView = { protocol: "canopyx/2", type: "grid", id: "calculated", label: "Calculated records",
  source: { kind: "inline" }, rows: [{ id: "r1", cells: { quantity: 3, price: 12.5 } }], pageSize: 100, selection: "none", search: true,
  calculatedColumnsEditable: true, labels: { gridCalculationError: "Calculation failed: {error}" },
  columns: [{ id: "quantity", title: "Quantity", kind: "number" }, { id: "price", title: "Price", kind: "number" },
    { id: "total", title: "Total", kind: "number", calculation: "[quantity] * [price]", editable: false }] };
const calculationApi = createDataGrid(document.createElement("div"), { view: calculationView });
const readCalculations: readonly GridCalculatedColumnDefinition[] = calculationApi.getCalculatedColumns();
const updatedCalculations: Promise<readonly GridCalculatedColumnDefinition[]> = calculationApi.setCalculatedColumns(calculationDefinitions);
const openedCalculation: Promise<void> = calculationApi.openCalculatedColumn(document.createElement("button"));
const calculationState = calculationApi.getState(); calculationState.calculatedColumns = calculationDefinitions;
// @ts-expect-error Accepted calculation definitions are read-only snapshots.
readCalculations[0].expression = "1";
// @ts-expect-error Calculated cells cannot be directly editable.
const editableCalculation: GridColumn = { id: "bad", title: "Bad", kind: "number", calculation: "1", editable: true };
const hostedCalculationView: HostGridView = { ...calculationView, rows: undefined, source: { kind: "host" },
  // @ts-expect-error Hosted calculations use server values; the client editor requires inline data.
  calculatedColumnsEditable: true };
// @ts-expect-error Query documents carry declared column references, not calculation definitions.
calculationApi.setQuery({ calculatedColumns: calculationDefinitions });
void updatedCalculations; void openedCalculation; void calculationState; void editableCalculation; void hostedCalculationView;
const tupleField: GridTupleColumn = { column: "days", bucket: { kind: "width", width: 10 } };
const tupleFilter: GridTupleFilter = { columns: [{ column: "name" }, tupleField], values: [["review", 1], [null, null]], exclude: true };
const invalidTuple: GridTupleFilter = { columns: [tupleField], values: [[1]],
  // @ts-expect-error Exclusion is a boolean; operands retain their scalar types.
  exclude: "true" };
void invalidTuple;
import polish, { staticLabels as polishStatic } from "@evotecit/canopyx/locales/pl";
import german from "@evotecit/canopyx/locales/de";
import spanish from "@evotecit/canopyx/locales/es";
import french from "@evotecit/canopyx/locales/fr";
import italian from "@evotecit/canopyx/locales/it";
const translatedNote: string = polishStatic.fullReport;
CanopyX.configure("polish", { labels: polish });
CanopyX.configure("german", { labels: { ...german, columns: "Host columns" } });
CanopyX.configure("spanish", { labels: spanish });
CanopyX.configure("french", { labels: french });
CanopyX.configure("italian", { labels: { ...italian, columns: "Colonne host" } });
// A strict Content Security Policy: the page nonce for inserted parts, and host markup through a sanitiser.
CanopyX.setNonce("rAnd0m+N/once_-==");
CanopyX.configure("sanitized", { sanitizeHtml: (html, { kind }) => kind === "icon" ? html : document.createRange().createContextualFragment(html) });
// @ts-expect-error The sanitiser returns markup or a node.
CanopyX.configure("unsanitized", { sanitizeHtml: () => 1 });
// @ts-expect-error Shipped packs are immutable; use a host override.
polish.columns = translatedNote;

const reportingHost = document.createElement("div");
const reportingApi = ReportingRuntime.createDataGrid(reportingHost, { view: { protocol: "canopyx/2", type: "grid", id: "ordered", label: "Ordered report",
  source: { kind: "inline" }, rows: [], rowHeight: "auto", estimatedRowHeight: 32, pageSize: 100, selection: "none", search: true,
  highlightRules: [{ column: "name", operator: "eq", values: ["Needs review"], tone: "warning", className: "needs-review" },
    { column: "name", operator: "isNull", values: [], target: "cell", className: "empty" }],
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true, wrap: true, maxLines: 2,
    valueLabels: { review: "Needs review", verified: "Verified" }, valueOrder: ["review", "verified"], valueTones: { review: "warning", verified: "success" } },
    { id: "days", title: "Days remaining", kind: "number", wrap: true, maxLines: 2, numericTones: [
      { operator: "below", value: 0, tone: "danger", label: "Overdue" },
      { operator: "atMost", value: 14, tone: "warning", label: "Review soon" },
      { operator: "above", value: 90, tone: "info", label: "Long horizon" },
      { operator: "atLeast", value: 30, tone: "success", label: "Time available" }] }],
  reporting: { columnReorder: true, responsive: true, filterGroups: true, facetColumns: ["name"], minimumCenterWidth: 160,
    layout: { name: { minimum: 120, maximum: 800, flex: 1, pin: "left", priority: 0, alwaysVisible: true } }, ordering: { name: { text: "foldedNatural", categories: ["Pinned"] } },
    presenters: { name: { kind: "link", newWindow: true } } } } });
reportingApi.autoFitColumn?.("name");
reportingApi.autoFitColumns();
reportingApi.setQuery({ tupleFilters: [tupleFilter] });
const pivotDefinition: GridPivotDefinition = {
  rows: [{ column: "name", direction: "asc" }], columns: [{ column: "days", direction: "asc", bucket: { kind: "width", width: 10 } }],
  values: ["total"], maxColumns: 200, topNColumns: 12, sortByTotal: { aggregate: "total", direction: "desc" }
};
const pivotReporting: InlineGridView["reporting"] = { pivot: pivotDefinition, pivotable: true,
  aggregates: [{ id: "total", column: "days", operation: "sum", label: "Total" }] };
const pivotSource: Pick<GridSource, "pivot"> = {
  pivot(request, { signal }) {
    const accepted: GridPivotAcceptedResult = { protocol: "canopyx/2", type: "gridPivot", view: request.query.view,
      query: request.query, revision: request.query.revision, definition: request.definition, matched: 0, distinctColumns: 0,
      columnsLimited: false, rows: [{ key: "r", path: [], other: false }], columns: [{ key: "c", path: [], other: false }],
      retainedColumns: [], cells: [{ row: "r", column: "c", count: 0, aggregates: { total: null } }] };
    void signal; return Promise.resolve(accepted);
  }
};
declare const computedPivot: GridPivotResult;
const unrevisionedPivotSource: Pick<GridSource, "pivot"> = {
  // @ts-expect-error A direct computed result needs accepted query/revision ownership before a host can return it.
  pivot: () => computedPivot
};
const invalidPivotLevel: GridPivotLevel = { column: "name", direction: "asc",
  // @ts-expect-error Pivot axis levels use sortByTotal instead of an aggregate field.
  aggregate: "total" };
reportingApi.setPivot?.(pivotDefinition);
reportingApi.setPivot?.(false);
reportingApi.setPivotCollapsed?.("rows", "opaque-prefix", true);
const pivotState = reportingApi.getPivot?.();
const pivotResult: GridPivotAcceptedResult | null | undefined = reportingApi.getPivotResult?.();
const pivotExport: Promise<GridPivotExportSnapshot> | undefined = reportingApi.getPivotExport?.();
void pivotExport?.then(snapshot => {
  const typedPath = snapshot.columnAxis.find(node => node.other)?.path;
  const range = snapshot.columnGroups[0];
  const rangeColumns = range ? snapshot.columns.slice(range.firstColumn, range.firstColumn + range.columnCount) : [];
  for (const column of rangeColumns) if (column.kind === "number") {
    const rawValue = snapshot.rows[0]?.cells[column.id].value;
    const identity: string = column.axisKey, aggregate: string = column.aggregate;
    const summary: boolean = column.summary, hidden: boolean = column.hidden;
    void rawValue; void identity; void aggregate; void summary; void hidden;
  }
  void typedPath; void snapshot.distinctColumns; void snapshot.retainedColumns;
});
void pivotReporting; void pivotSource; void unrevisionedPivotSource; void invalidPivotLevel; void pivotState; void pivotResult; void pivotExport;
// Compact row data in place of rows: chunks inline in the document, as host scripts (a count) or as sidecar files.
const compactRows: GridCompactRow[] = [["r1", "Item 1", 10], [{ id: "r2", tone: "warning" }, "Item 2", null, { value: 3, text: "three" }]];
const compactView: CompactGridView = { protocol: "canopyx/2", type: "grid", id: "compact", label: "Compact rows",
  source: { kind: "inline" }, pageSize: 100, selection: "none", search: true, rowHeight: 32,
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "size", title: "Size", kind: "number" }, { id: "notes", title: "Notes", kind: "text" }],
  rowData: { version: 1, columns: ["name", "size", "notes"], count: 2, ordered: true, chunks: [compactRows] } };
createDataGrid(document.createElement("div"), { view: compactView });
const sidecarRows: CompactGridView["rowData"] = { version: 1, columns: ["name"], count: 10000, encoding: "gzip", base: "data/compact/", chunks: 2 };
// @ts-expect-error A compact grid has no rows beside its row data.
const bothRows: CompactGridView = { ...compactView, rows: [] };
mountViews(document.querySelector("[data-canopyx-host]") ?? document);
void sidecarRows; void bothRows;
const measuredWireView: InlineGridView = { protocol: "canopyx/2", type: "grid", id: "measured", label: "Measured records",
  source: { kind: "inline" }, rows: [], pageSize: 100, selection: "none", search: false, rowHeight: 32, autoRowHeight: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 160, autoWidth: true, wrap: true }] };
createDataGrid(document.createElement("div"), { view: measuredWireView });
const graphiteView: InlineGridView = {
  ...measuredWireView, id: "graphite", density: "comfortable", noun: "services", emptyReason: "No connected source.",
  zebra: false, statusBar: true, presentation: "paged", pageLength: 25,
  columns: [
    { id: "name", title: "Name", kind: "text", presenter: { kind: "identifier", mono: true }, section: "Identity" },
    { id: "enabled", title: "Enabled", kind: "text", presenter: { kind: "boolean", inverted: true } },
    { id: "state", title: "State", kind: "text", presenter: { kind: "state", tones: { Healthy: "success" } } },
    { id: "amount", title: "Amount", kind: "number", aggregatable: true, format: { maximumFractionDigits: 1, suffix: "%" },
      presenter: { kind: "sparklineLine", minimum: 0, scaleMaximum: 100, mark: "last", thresholds: [{ upperBound: 50, tone: "success" }] } },
    { id: "history", title: "History", kind: "text", presenter: { kind: "statusStrip" } }
  ], rows: [{ id: "one", cells: { name: { value: "Service", secondary: "Region" }, amount: { value: 20,
    series: [{ period: "2026-10-05", value: 20, state: "Healthy", tone: "success" }] } } }]
};
// Search highlighting and layout modes: typed options, state and API.
const ticketsView: InlineGridView = { ...measuredWireView, id: "tickets",
  searchHighlight: { ignoreAccents: true, matchCase: false, minLength: 2, filterTones: { name: "info" } },
  layout: { mode: "cards", modes: ["cards", "fit", "scroll"], density: "compact" }, toolbar: { matches: true, layout: true } };
const tickets = createDataGrid(document.createElement("div"), { view: ticketsView,
  recordHeading: record => ({ title: "Change " + record.id, subtitle: String(record.cells?.when || "") }),
  onPrint: ({ layout }) => { const stacked: boolean = layout === "stacked"; } });
const layout = await tickets.setLayout({ mode: "scroll", density: "comfortable" });
const layoutModes: readonly ("fit" | "scroll" | "cards")[] = layout.modes;
const matchCount: number = tickets.getMatches().total;
const moved: boolean = await tickets.nextMatch({ focus: false });
await tickets.setSearchHighlight(false);
const savedLayout = tickets.getState().layout?.density;
// @ts-expect-error A layout mode is fit, scroll or cards.
await tickets.setLayout({ mode: "tiles" });
const kbTree = createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "kb", label: "Knowledge base", rowHeight: 28, pageSize: 100,
  selection: "single", columns: [{ id: "name", title: "Article", width: 200, kind: "text" }], searchHighlight: true, layout: { mode: "scroll" },
  source: { kind: "inline" }, roots: [] } });
await kbTree.previousMatch();
const treeLayout: string = kbTree.getLayout().mode;
// @ts-expect-error Trees offer the fit and scroll layouts.
const cardsTree: CanopyView = { protocol: "canopyx/2", type: "view", id: "bad", label: "Bad", rowHeight: 28, pageSize: 100, selection: "single", columns: [], layout: { mode: "cards" } };
const amountSummary: GridAggregate = { id: "average", column: "amount", operation: "average", label: "Average amount",
  format: { minimumFractionDigits: 0, maximumFractionDigits: 0, prefix: "~", suffix: "%" } };
// @ts-expect-error Number format affixes are text.
const badFormat: GridNumberFormat = { suffix: 1 };
createDataGrid(document.createElement("div"), { view: { ...graphiteView, id: "graphite-summary", reporting: { aggregates: [amountSummary] } } });
const graphite = createDataGrid(document.createElement("div"), { view: graphiteView,
  onChart: ({ signal, selection }) => { if (signal.aborted) return; }, onUngroup: ({ signal }) => {} });
await graphite.setPageLength("all");
const allRows: boolean | undefined = graphite.getState().paging?.allRows;
const recordSelection = reportingApi.getSelectionDescriptor?.();
if (recordSelection?.kind === "query") {
  const matched: number | null = recordSelection.matched;
  // @ts-expect-error Query selection exclusions are immutable.
  recordSelection.excludedIds.push("injected");
} else if (recordSelection) {
  const revision: string | null = recordSelection.revision;
  // @ts-expect-error Explicit selection snapshots are immutable.
  recordSelection.ids.push("injected");
}
await reportingApi.selectPage?.(true, { signal: new AbortController().signal });
await reportingApi.selectRange?.(0, 50, { additive: true });
reportingApi.selectAllMatching?.();
const selectedExport = reportingApi.prepareExport({ scope: "selected" }).request;
if (selectedExport.querySelection) {
  const capturedSearch: string = selectedExport.querySelection.query.search;
  // @ts-expect-error Export selection descriptors remain immutable.
  selectedExport.querySelection.matched = 10;
}
const storedPreferences = reportingApi.getViewSettings?.();
if (storedPreferences?.current) {
  // @ts-expect-error A retained preference snapshot is immutable.
  storedPreferences.current.columns[0].width = 400;
  await reportingApi.setState(storedPreferences.current);
}
reportingApi.renameSavedView?.("Old", "New");
reportingApi.setDefaultView?.("New");
const sharedPreferences = reportingApi.getShareState?.();
if (sharedPreferences) await reportingApi.setState(sharedPreferences);
await reportingApi.flushViewSettings?.();
reportingApi.setColumnPinned?.("name", "right");
const facetPage = await reportingApi.getFacets?.("name", { search: "Pinned", limit: 100, includeCurrentFilter: false });
if (facetPage) {
  const matched: number = facetPage.matched;
  // @ts-expect-error Accepted facet response buckets are immutable.
  facetPage.items[0].count = matched;
}
const placement = reportingApi.getColumnLayout?.()[0];
if (placement) {
  const requested: import("@evotecit/canopyx/grid").GridColumnPin = placement.requestedPin;
  // @ts-expect-error Effective layout snapshots are read-only.
  placement.responsiveHidden = false;
  const reason: "user" | "priority" | "phone" | null = placement.hiddenReason;
}
const endSlot: HTMLElement | undefined = reportingApi.toolbarSlot?.("end");
endSlot?.append(document.createElement("span"));
// @ts-expect-error Toolbar slots are start, afterSearch, afterViews and end.
reportingApi.toolbarSlot?.("middle");

const gridView: HostGridView = { protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  columns: [{ id: "name", title: "Name", kind: "text", width: 200 }], source: { kind: "host" }, rowHeight: 28,
  pageSize: 100, selection: "multiple", search: true };
const gridSource: GridSource = { async query(query, { signal }) {
  if (signal.aborted) throw new Error("Cancelled");
  // @ts-expect-error Host callbacks cannot mutate an accepted query snapshot.
  query.sort.push({ column: "name", direction: "asc" });
  return { protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "v1", offset: query.offset,
    total: 0, matched: 0, items: [] };
}, facet(request, { signal }) {
  const revision: string = request.query.revision;
  return { protocol: "canopyx/2", type: "gridFacetPage", view: request.query.view, revision, column: request.column,
    search: request.search, includeCurrentFilter: request.includeCurrentFilter, matched: 0, totalValues: 0, truncated: false, items: [] };
} };
const dataGrid = createDataGrid(document.createElement("div"), { view: { ...gridView, reporting: {}, stateKey: "host-inventory" }, source: gridSource, searchDelayMs: 300,
  viewStore: { load({ key, signal }) { return null; }, save({ settings, signal }) {
    // @ts-expect-error Host preference callbacks receive immutable snapshots.
    settings.views.push({ name: "Injected", state: dataGrid.getState() });
  } },
  labels: { gridResultCount: "{count} / {total}", gridRemoveCondition: "Remove: {condition}" } });
const preferenceStore: import("@evotecit/canopyx/grid").GridViewStore = {load(){return null;},save(){}};
// @ts-expect-error Host preference storage requires a typed keyed reporting definition.
const unboundStore: import("@evotecit/canopyx/grid").GridHostOptions = {viewStore:preferenceStore};
// @ts-expect-error Reporting storage also requires a state key.
createDataGrid(document.createElement("div"), {view:{...gridView,reporting:{}},source:gridSource,viewStore:preferenceStore});
// @ts-expect-error Fragment configuration binds storage to its keyed reporting definition.
GridRuntime.configure('inventory',{viewStore:preferenceStore});
GridRuntime.configure('inventory',{view:{...gridView,stateKey:'inventory-reader',reporting:{}},viewStore:preferenceStore});
// @ts-expect-error Ordinary grids do not opt into reporting preference storage.
createDataGrid(document.createElement("div"), {view:gridView,source:gridSource,viewStore:preferenceStore});
// @ts-expect-error Durable preference queries cannot contain dataset snapshot credentials.
const revisionPreference: import("@evotecit/canopyx/grid").GridPreferenceState["query"] = {protocol:"canopyx/2",type:"gridQuery",view:"inventory",offset:0,limit:10,search:"",sort:[],filters:[],revision:"secret"};
// @ts-expect-error Cursor preferences cannot retain continuation credentials.
const cursorPreference: import("@evotecit/canopyx/grid").GridPreferenceState<GridCursorQuery>["query"] = {protocol:"canopyx/2",type:"gridCursorQuery",view:"inventory",limit:10,search:"",sort:[],filters:[],cursor:"secret"};
const offsetCount: number = dataGrid.getPaging().matched;
const cursorView: CursorGridView = { ...gridView, source: { kind: "host", navigation: "cursor" }, presentation: "paged", query: undefined };
const cursorSource: GridCursorSource = { navigation: "cursor", query(query, { signal }) {
  const token: string | undefined = query.cursor;
  // @ts-expect-error Cursor traversal has no random-access position in its request.
  query.offset;
  return { protocol: "canopyx/2", type: "gridCursorPage", view: query.view, revision: "r1", offset: 0, total: null, matched: null, items: [] };
} };
const cursorGrid = createDataGrid(document.createElement("div"), { view: cursorView, source: cursorSource,
  onQuery(event) { const count: number | null = event.matched; } });
const cursorQuery: GridCursorQuery = await cursorGrid.nextPage();
const unknownCount: number | null = cursorGrid.getPaging().matched;
// @ts-expect-error A cursor source may not know a complete-result count.
const assumedCount: number = cursorGrid.prepareExport({ scope: "all" }).request.total;
// @ts-expect-error A cursor controller rejects offset requests.
await cursorGrid.setQuery({ offset: 25 });
// @ts-expect-error Offset and cursor source contracts are distinct.
createDataGrid(document.createElement("div"), { view: cursorView, source: gridSource });
gridView.searchDelayMs = 0;
gridView.presentation = "paged";
gridView.pageLength = 50;
gridView.source.navigation = "offset";
await dataGrid.goToPage(1);
await dataGrid.setPageLength(25);
await dataGrid.scrollToRow(80);
const paging: import("@evotecit/canopyx/grid").GridPaging = dataGrid.getPaging();
// @ts-expect-error Cursor-only sources cannot masquerade as known-count offset sources.
gridView.source.navigation = "cursor";
// @ts-expect-error Debounce is a bounded number, not a textual duration.
createDataGrid(document.createElement("div"), { view: gridView, source: gridSource, searchDelayMs: "300ms" });
gridView.searchColumns = ["name"];
await dataGrid.setQuery({ search: 'ready "north office"', searchMode: "words", filterGroup: {
  operator: "or", filters: [{ column: "name", operator: "eq", values: ["Alpha"] }],
  groups: [{ operator: "and", filters: [{ column: "name", operator: "isNotNull", values: [] }], groups: [] }]
} });
// @ts-expect-error Query modes name a supported matching contract.
await dataGrid.setQuery({ searchMode: "regex" });
const alternateSearchCell = { value: "Alpha", text: "Visible", searchText: "north office" };
const searchRow: import("@evotecit/canopyx/grid").GridRow = { id: "alternate", cells: { name: alternateSearchCell } };
GridRuntime.configure(gridView.id, { source: gridSource });
dataGrid.setQuery({ filters: [{ column: "name", operator: "in", values: ["Atlas"] }] });
dataGrid.setSelection(["row-1"]);
const exported = dataGrid.prepareExport({ scope: "selected", columns: ["name"], values: "raw" });
for await (const record of exported.rows()) {
  // @ts-expect-error Exported rows and cells are immutable snapshots.
  record.cells.name = "Changed";
}
// @ts-expect-error An export scope is mandatory.
dataGrid.toCsv({ columns: ["name"] });
await dataGrid.toCsv({ scope: "filtered", maxRows: 1000 });
await dataGrid.exportToHost("xlsx", { scope: "all" });
await reportingApi.materializeExport?.({ scope: "filtered", maxRows: 500, fileName: "October inventory", locale: "pl-PL", timeZone: "utc",
  onProgress(progress) { const total: number | null = progress.total; const count: number = progress.completed; void total; void count; } });
await reportingApi.print?.({ scope: "selected", columns: ["name"], values: "raw" });
// @ts-expect-error Delivery phases have a fixed read/generate/ready vocabulary.
const invalidDeliveryPhase: import("@evotecit/canopyx/grid").GridExportProgress["phase"] = "downloaded";
createDataGrid(document.createElement("div"), { view: gridView, source: gridSource, toolbar: { search: false, export: false, count: false },
  actions: [{ label: "Reset", run: ({ query }) => void query },
    { label: "Save view…", render: (container, { close, signal }) => { container.append("Name"); if (!signal.aborted) close(); } }] });
// @ts-expect-error Toolbar switches are booleans by control name.
createDataGrid(document.createElement("div"), { view: gridView, source: gridSource, toolbar: { chips: false } });
// @ts-expect-error An action runs a handler or renders content, not both.
createDataGrid(document.createElement("div"), { view: gridView, source: gridSource, actions: [{ label: "Both", run: () => {}, render: () => {} }] });
const documentToolbar: HostGridView = { ...gridView, toolbar: { export: false, more: false } };
// @ts-expect-error The document keeps the search box in its search property.
documentToolbar.toolbar = { search: false };
// @ts-expect-error Host views require a query source.
createDataGrid(document.createElement("div"), { view: gridView });
const inlineGrid: InlineGridView = { ...gridView, source: { kind: "inline" }, rows: [{ id: "row-1", cells: { name: "Atlas" } }] };
createDataGrid(document.createElement("div"), { view: inlineGrid });
for (const controller of [...mountViews(document), ...GridRuntime.mount(document)]) {
  // @ts-expect-error A mixed fragment mount does not promise tree controllers.
  controller.expandPath(["row-1"]);
  if ("getStep" in controller) {
    const flow: import("@evotecit/canopyx/flow").FlowApi = controller;
    void flow.ready.then(api => api.getStep());
  }
  else if ("focusCell" in controller) controller.focusCell("dc1", "dc2");
  else if ("getSelection" in controller) controller.getSelection();
  else if ("getHunks" in controller) void controller.copy();
  else if ("expandPath" in controller) controller.expandPath(["tree-1"]);
}

const view: CanopyView = {
  protocol: "canopyx/2", type: "view", id: "files", label: "Files", rowHeight: 28, pageSize: 100,
  selection: "multiple", checkboxes: "hierarchical", dragDrop: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 320, editable: true }],
  contextActions: [{ id: "inspect", label: "Inspect" }],
  source: { kind: "inline" }, roots: [{ id: "a", label: "Atlas" },
    { id: "properties", label: "Properties", detail: { type: "properties", items: [{ name: "Owner", value: "A" }] } },
    { id: "table", label: "Table", detail: { type: "table", caption: "Values", columns: ["Name"], widths: [1], rows: [[{ value: 12, text: "Twelve" }]] } },
    { id: "html", label: "HTML", detail: { type: "html", height: 2, html: "<p>Trusted content</p>" } }]
};
const source: DataSource = {
  queryAware: true, canSearch: true,
  async page(node, cursor, request) {
    request?.signal.throwIfAborted();
    const revision: string | null | undefined = request?.revision;
    const filters: readonly string[] | undefined = request?.query?.filters;
    // @ts-expect-error Source query snapshots freeze the filter array.
    request?.query?.filters.push("active");
    // @ts-expect-error Source query snapshots freeze the sort object.
    if (request?.query?.sort) request.query.sort.direction = "desc";
    // @ts-expect-error The source cannot replace a frozen query field.
    if (request?.query) request.query.sort = null;
    return { items: [{ id: "a", label: "Atlas" }], next: null, offset: 0, revision: request?.revision || "r1" };
  },
  async search(query, limit, request) { return { hits: [], truncated: false, revision: request?.revision || "r1" }; }
};
const api = createTreeGrid(document.createElement("div"), {
  view, source,
  beforeSelect(node, nodes, context) { return context.previous.length === 0 || nodes.length > 0; },
  onCheck(node, intents) { const path: readonly string[] | undefined = intents[0]?.path; },
  onEdit(proposal, context) {
    const previous: string | number | boolean | null = proposal.previous;
    context.signal.throwIfAborted();
    const queryVersion: number | undefined = context.query?.version;
    const revision: string | null = context.revision;
    // @ts-expect-error Non-query interactions carry a null query.
    context.query.version;
    // @ts-expect-error A first or non-query interaction can have a null revision.
    context.revision.toUpperCase();
    // @ts-expect-error Host proposals are immutable.
    proposal.path.push("other");
    return true;
  },
  async onDrop(proposal) { return proposal.target.nodeId !== null && proposal.nodes.length > 0; },
  async onAction(proposal) { return proposal.action === "inspect"; },
  renderers: { name(node, element, context) {
    const column: string = context.column;
    element.textContent = column + ": " + node.label;
    // @ts-expect-error Renderer contexts supply a column ID.
    context.column.id;
    return context.level > 0;
  } }
});
const state: ViewState = api.getState();
const checked: CheckState | null = api.getCheckState("a");
const checking: boolean | "mixed" | null = checked;
await api.setState(state);
await api.requestEdit("a", "name", "New label");
await api.requestDrop(["a"], null, "inside");
await api.requestAction("a", "inspect");
api.selectAll({ scope: "loaded" });
await api.updateActiveFilters({ add: ["flagged"], remove: ["other"] });
// @ts-expect-error Filter changes contain arrays of declared IDs.
api.updateActiveFilters({ remove: "other" });
// Tree toolbar switches, host actions, all-rows exports, named views and column order.
createTreeGrid(document.createElement("div"), { view: { ...view, toolbar: { export: false }, autoHeight: false, exportFormats: ["xlsx"] },
  toolbar: { columns: false, search: false }, actions: [{ label: "Audit", run: ({ nodes, signal }) => signal.aborted || nodes.length }] });
const treeScope: "visible" | "selected" | "all" = api.prepareExport({ scope: "all" }).request.scope;
api.saveView("Mine"); const savedViews: string[] = api.getSavedViews(); await api.resetView(); api.setColumnOrder(["name"]);
// @ts-expect-error Tree toolbar switches are booleans.
createTreeGrid(document.createElement("div"), { view, toolbar: { export: "no" } });
CanopyX.badge({ text: labels.saveEdit, tone: "success" });
await sources.inline(view).page(null, null);

// @ts-expect-error Select-all requires an explicit scope.
api.selectAll();
// @ts-expect-error Scope names follow the public contract.
api.selectAll({ scope: "all" });
// @ts-expect-error Eligibility callbacks must be synchronous.
createTreeGrid(document.createElement("div"), { view, canEdit: async () => true });
// @ts-expect-error Write hooks return acceptance, not an arbitrary object.
createTreeGrid(document.createElement("div"), { view, onAction: () => ({ ok: true }) });
// @ts-expect-error An edit value is a JSON scalar.
api.requestEdit("a", "name", { label: "Invalid" });
// @ts-expect-error Unknown translated labels fail at the runtime boundary too.
createTreeGrid(document.createElement("div"), { view, labels: { missingLabel: "Missing" } });
// @ts-expect-error Inline views require roots.
const missingRoots: CanopyView = { ...view, source: { kind: "inline" }, roots: undefined };
// @ts-expect-error Properties details require their items.
const missingDetailItems: CanopyNode = { id: "bad", label: "Bad", detail: { type: "properties" } };
// @ts-expect-error Table details cannot carry HTML content.
const wrongDetailPayload: CanopyNode = { id: "bad", label: "Bad", detail: { type: "table", columns: [], rows: [], html: "<p>Bad</p>" } };

// @ts-expect-error A sidecar factory needs a sidecar view and its base.
sources.sidecar(view);
const sidecarView = { ...view, source: { kind: "sidecar" as const, base: "data/" }, roots: undefined };
// @ts-expect-error A remote factory needs remote URL templates.
sources.remote(sidecarView);
// @ts-expect-error An inline factory needs inline roots.
sources.inline(sidecarView);
await sources.sidecar(sidecarView).page(null, null);
await sources.remote({ ...sidecarView, source: { kind: "remote", children: "/children?parent={parent}&cursor={cursor}" } }).page(null, null);

// @ts-expect-error A host link scheme supplies both hooks.
createTreeGrid(document.createElement("div"), { view, formatLink: () => "record/a" });
// @ts-expect-error A host link scheme supplies both hooks.
CanopyX.configure("files", { parseLink: () => ["a"] });
CanopyX.configure("files", { formatLink: path => path.join("/"), parseLink: fragment => fragment.split("/") });

// Normalized custom pages can omit terminal metadata; wire documents retain required offsets and continuations.
const terminalSource: DataSource = { page: () => ({ items: [] }) };
// @ts-expect-error Wire pages keep their required continuation and offset.
const incompleteWirePage: PageDocument = { protocol: "canopyx/2", type: "page", parent: null, items: [] };
// @ts-expect-error Search availability requires a search implementation.
const missingSearch: DataSource = { canSearch: true, page: () => ({ items: [], next: null, offset: 0 }) };
const hiddenSearch: DataSource = { canSearch: false, page: () => ({ items: [] }), search: () => ({ hits: [], truncated: false }) };
if (source.canSearch) await source.search("atlas", 10);

const { checkboxes: ignoredMode, ...withoutCheckboxes } = view;
// @ts-expect-error Initial checking intents need a checkbox mode.
const missingCheckboxes: CanopyView = { ...withoutCheckboxes, checkIntents: [{ path: ["a"], checked: true }] };

// @ts-expect-error Query-aware pages identify the accepted dataset revision.
const unversionedQueryPage: DataSource = { queryAware: true, page: () => ({ items: [] }) };
// @ts-expect-error Query-aware search results belong to the same revision.
const unversionedQuerySearch: DataSource = { queryAware: true, canSearch: true, page: () => ({ items: [], revision: "r1" }), search: () => ({ hits: [], truncated: false }) };
// @ts-expect-error Query-aware count updates belong to the same revision.
const unversionedQueryCounts: DataSource = { queryAware: true, page: () => ({ items: [], revision: "r1" }), counts: () => ({ protocol: "canopyx/2", type: "counts", items: [] }) };
// @ts-expect-error Detail rows cannot own child nodes.
const detailWithChildren: CanopyNode = { id: "detail", label: "Detail", detail: { type: "html", html: "<p>Details</p>" }, children: [{ id: "child", label: "Child" }] };
// @ts-expect-error A node chooses inline children or a lazy reference.
const inlineWithRef: CanopyNode = { id: "parent", label: "Parent", children: [{ id: "child", label: "Child" }], ref: "children", hasChildren: true };
// @ts-expect-error Inline views contain only fully materialized nodes, recursively.
const inlineWithLazyChild: CanopyView = { ...view, roots: [{ id: "parent", label: "Parent", children: [{ id: "lazy", label: "Lazy", hasChildren: true }] }] };
CanopyX.configure("files", { isActionEnabled(node, action) {
  // @ts-expect-error Eligibility receives a frozen action descriptor.
  action.label = "Changed";
  return action.id === "inspect";
} });
const inlineBranch: InlineNode = { id: "branch", label: "Branch", children: [{ id: "leaf", label: "Leaf" }], hasChildren: true };
const emptyLeaf: InlineNode = { id: "empty", label: "Empty", children: [], hasChildren: false };
const emptyImplicitLeaf: CanopyNode = { id: "empty-implicit", label: "Empty", children: [] };
sources.inline({ ...view, roots: [{ id: "parent", label: "Parent", children: [emptyLeaf] }] });
// @ts-expect-error An explicitly declared leaf cannot contain child nodes.
const populatedLeaf: InlineNode = { id: "populated", label: "Populated", hasChildren: false, children: [{ id: "child", label: "Child" }] };
const lazySource: DataSource = { queryAware: true,
  page: () => ({ items: [{ id: "lazy", label: "Lazy", hasChildren: true, ref: "children" }], revision: "r1" }),
  counts: () => ({ protocol: "canopyx/2", type: "counts", items: [], revision: "r1" })
};
// Input action definitions remain editable; the runtime freezes its own descriptor snapshot.
if (view.contextActions?.[0]) view.contextActions[0].label = "Inspect record";

// Export format providers: one writer for tree and flat-grid captures, registered for the page or per grid.
const workbook: import("@evotecit/canopyx").ExportFormat = { id: "xlsx", label: "Download Excel", extension: "xlsx", showInMenu: false,
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  async write(capture, { signal, progress, fileName }) {
    const lines: string[] = [fileName];
    for await (const row of capture.rows({ signal })) lines.push(capture.request.columns.map(column => row.cells[column.id]?.text ?? "").join("\t"));
    progress(lines.length - 1);
    return new Blob(lines);
  } };
const disposeWorkbook: () => void = CanopyX.registerExportFormat(workbook);
disposeWorkbook();
const exportingTree = createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "export-tree", label: "Tree", source: { kind: "inline" }, rowHeight: 28, pageSize: 100, selection: "multiple",
  columns: [{ id: "name", title: "Name", kind: "text", width: 200 }], roots: [] }, exportFormats: ["xlsx", workbook], exportTimeoutMs: 120000 });
const treeCapture = exportingTree.prepareExport({ scope: "selected" });
const treeLevel: number = treeCapture.request.recordCount;
void exportingTree.exportAs("xlsx", { onProgress: progress => progress.completed, download: false }).then(result => result.blob.size + treeLevel);
const exportingGrid = createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "export-grid", label: "Grid",
  source: { kind: "inline" }, rows: [], pageSize: 50, selection: "multiple", search: true, exportFormats: ["xlsx", "pdf"],
  columns: [{ id: "name", title: "Name", kind: "text" }] }, exportFormats: ["xlsx", workbook], exportTimeoutMs: 600000 });
void exportingGrid.exportAs("xlsx", { scope: "filtered", timeoutMs: 30000 }).then(result => result.fileName);
// Row activation and menu closing, on grids and trees.
const activatingGrid = createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "activate-grid", label: "Grid",
  source: { kind: "inline" }, rows: [], pageSize: 50, selection: "single", search: false, rowAction: "details", columns: [{ id: "name", title: "Name", kind: "text" }] },
  onRowActivate: event => { const id: string = event.id; const keyboard: boolean = event.keyboard; return event.row.cells.name === undefined && id.length > 0 && keyboard; } });
activatingGrid.closeMenus();
const activatingTree = createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "activate-tree", label: "Tree", source: { kind: "inline" }, rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", kind: "text", width: 200 }], roots: [] }, onRowActivate: (node, context) => node.id === "a" && !context.keyboard ? false : undefined });
activatingTree.closeMenus();
// @ts-expect-error A tree's activation hook takes the node and a context.
createTreeGrid(document.createElement("div"), { view, onRowActivate: (event: { id: number }) => false });
// @ts-expect-error Format writers return a Blob or bytes.
CanopyX.registerExportFormat({ id: "bad", label: "Bad", extension: "txt", write: () => 42 });
// @ts-expect-error Menu visibility is a boolean.
CanopyX.registerExportFormat({ ...workbook, showInMenu: "false" });

// Column tooltips, the column menu switch and tree pins.
const tipGrid = createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "tip-grid", label: "Grid", source: { kind: "inline" }, rows: [], pageSize: 50,
  selection: "none", search: false, toolbar: { columnMenus: false }, columns: [{ id: "name", title: "Name", kind: "text", tooltip: "auto" }, { id: "path", title: "Path", kind: "text", tooltip: "name" }] } });
void tipGrid;
const pinTree = createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "pin-tree", label: "Tree", source: { kind: "inline" }, rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", kind: "text", width: 200, tooltip: "auto" }, { id: "state", title: "State", kind: "text", width: 90, pinned: "right" }], roots: [] } });
pinTree.setColumnPinned("state", "left");
// @ts-expect-error Pins are left, right or none.
pinTree.setColumnPinned("state", "top");
pinTree.openDetails("node-1");
// @ts-expect-error A node is named by its id.
pinTree.openDetails(1);

// Plugins: page-wide with use, per grid with the plugins option; columns name a plugin's cell renderer.
import { use, registerPart, type CanopyPlugin, type CanopyPluginContext } from "@evotecit/canopyx";
const meterPlugin: CanopyPlugin = {
  name: "load-meter",
  views: ["grid", "tree"],
  requires: ["export"],
  cellRenderers: { "load-meter": (row: { cells: Record<string, unknown> }, element: HTMLElement) => { element.textContent = String(row.cells.load); return true; } },
  toolbarItems: [{ label: "Busiest first", run: ({ api }) => { void api; } }],
  menuItems: [{ label: "Clear selection", run: ({ api }) => { api.clearSelection(); } }],
  events: { select: (event: CustomEvent, context: CanopyPluginContext) => { void event.detail; void context.api; } },
  init(context: CanopyPluginContext) { const signal: AbortSignal = context.signal; void signal; return context.part("export"); },
  destroy() {}
};
const disposePlugin: () => void = use(meterPlugin);
disposePlugin();
CanopyX.use({ name: "empty" })();
GridRuntime.use({ name: "grid-only", views: ["grid"] });
createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "plugged", label: "Plugged", rowHeight: 28, pageSize: 100, selection: "single", columns: [{ id: "name", title: "Name", width: 200, kind: "text", renderer: "load-meter" }], source: { kind: "inline" }, roots: [] }, plugins: [meterPlugin] });
registerPart("custom", { version: "0123456789abcdef", install() {} });
// @ts-expect-error A plugin needs a name.
use({ init() {} });
// @ts-expect-error The views are tree and grid.
use({ name: "bad", views: ["matrix"] });

// Pager settings, progressive enhancement and simple init.
const pagerSettings: GridPager = { lengths: [10, 25, { value: 50, label: "Fifty" }, "all"], numbers: 7, info: "sentence", lengthMenu: true, pageInput: false, firstLast: true };
const pagedView: InlineGridView = { ...measuredWireView, id: "paged", presentation: "paged", pageLength: 25, pager: pagerSettings };
createDataGrid(document.createElement("div"), { view: pagedView });
void enhance("#servers", { pageLength: 10, order: [[1, "desc"]], stateSave: { storage: "local", duration: 0, url: "hash" }, texts: { search: "Find" },
  on: { draw: (detail, table) => table.getPaging() } }).then((table: EnhancedGrid<string[]>) => {
  table.on("draw", ({ paging }) => paging.pageIndex).on("select", detail => detail.ids);
  const firstPage: string[] | undefined = table.getRows("page")[0];
  const groups: readonly string[] | undefined = table.headerGroups[0]?.[0]?.columns;
  void firstPage; void groups;
  // @ts-expect-error getRows takes all, filtered or page
  table.getRows("visible");
  table.destroy();
});
interface ServerRecord { name: string; site: { city: string }; load: number }
const recordOptions: GridInitOptions<ServerRecord> = { data: [{ name: "alpha", site: { city: "Warsaw" }, load: 12 }], rowId: "name", selection: "multiple",
  columns: [{ data: "name", title: "Server" }, { data: "site.city", title: "Site" },
    { data: "load", type: "number", render: (value, purpose) => purpose === "display" ? value + " %" : value }],
  pageLengths: [10, "all"], pageNumbers: 5, info: "range" };
void gridInit(document.createElement("div"), recordOptions).then(records => records.addRows([{ name: "beta", site: { city: "Berlin" }, load: 40 }]));
void gridInit("#remote", { url: { url: "/api/servers/query", serverSide: true, headers: { "X-Key": "1" }, facetUrl: "/api/servers/facet" },
  columns: [{ data: "name", type: "text" }, { data: "load", type: "number" }], rowId: "name" });
// @ts-expect-error a column type is text, number, datetime, date or auto
void gridInit("#bad", { data: [], columns: [{ data: "name", type: "html" }] });
// Editing: typed editors and validation on the columns, host checks and writers in the options, the change API.
import type { CanopyCellEditor, GridCommit, GridCommitResult, GridChange, GridCommitOutcome } from "@evotecit/canopyx/grid";
const stars: CanopyCellEditor = { create(context) {
  const select = document.createElement("select");
  select.value = String(context.value ?? 0);
  return { element: select, getValue: () => Number(select.value), error: () => null };
} };
use({ name: "stars", editors: { stars } });
const writer = async (batch: GridCommit, { signal }: { signal: AbortSignal }): Promise<GridCommitResult> => {
  void signal;
  return { protocol: "canopyx/2", type: "gridCommitResult", view: batch.view, revision: "r2", rows: batch.rows.map(row => ({ id: row.id, status: "saved" as const })) };
};
const editable = createDataGrid(document.createElement("div"), {
  view: { protocol: "canopyx/2", type: "grid", id: "assets", label: "Assets", pageSize: 100, selection: "multiple", search: true, source: { kind: "inline" },
    editing: { mode: "row", drawer: "always" },
    columns: [
      { id: "tag", title: "Tag", kind: "text", editable: true, validation: { required: true, pattern: "[A-Z]{2}-\\d{4}", maxLength: 7 } },
      { id: "cost", title: "Cost", kind: "number", editable: true, editor: { type: "number", min: 0, step: 0.01 } },
      { id: "when", title: "When", kind: "datetime", editable: true, editor: "date", validation: { min: "2000-01-01T00:00:00Z" } },
      { id: "status", title: "Status", kind: "text", editable: true, editor: { type: "select", options: ["New", { value: "Old", label: "Retired" }] } },
      { id: "owner", title: "Owner", kind: "text", editable: true, editor: { type: "lookup", lookup: { limit: 10 } } },
      { id: "rating", title: "Rating", kind: "number", editable: true, editor: "stars" }],
    rows: [{ id: "a1", cells: { tag: "AS-1000", cost: 1 } }] },
  editing: {
    isEditable: (row, column) => column !== "tag" || row.id !== "locked",
    validators: { cost: value => typeof value === "number" && value > 1000 ? "Too expensive." : null, tag: async value => value === "XX-0000" ? "Taken." : null },
    validateRow: (row, change: GridChange) => change.values.cost === 0 ? { cost: "Zero cost." } : null,
    lookups: { owner: async ({ search, limit }) => ["Ada", "Ben"].filter(name => name.startsWith(search)).slice(0, limit) },
    commit: writer,
    undoLimit: 50
  },
  onCellValueChanging: event => event.value !== "forbidden",
  onCellValueChanged: event => { void event.previous; void event.source; },
  onRowCommit: event => event.id === "a1" ? Promise.resolve({ status: "saved" as const, cells: { cost: 2 } }) : undefined,
  onCommit: (result: GridCommitOutcome) => { void result.saved; }
});
void editable.beginEdit("a1", "cost", { initial: "5" });
void editable.setCellValue("a1", "cost", 12).then(result => { const valid: boolean = result.valid; void valid; });
const changes: GridChange[] = editable.getChanges();
void changes;
void editable.commitChanges({ ids: ["a1"] }).then(result => result.rows.map(row => row.status));
const undone: boolean = editable.undo() || editable.redo() || editable.canUndo() || editable.canRedo();
void undone;
editable.revertChanges(["a1"]);
editable.setReadOnly(true);
// @ts-expect-error The edit mode is cell or row.
createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "x", label: "X", pageSize: 1, selection: "none", search: false, source: { kind: "inline" }, rows: [], columns: [{ id: "a", title: "A", kind: "text" }], editing: { mode: "sheet" } } });
// @ts-expect-error setCellValue needs a cell value.
void editable.setCellValue("a1", "cost", { value: 1 });
// Conditional formatting: typed rules, the API, the export format and the format labels.
const healthRules: GridFormatRule[] = [
  { id: "down", label: "Server down", target: "row", when: { operator: "and", filters: [{ column: "status", operator: "eq", values: ["Down"] }] }, style: { tone: "danger" } },
  { id: "cpu", column: "cpu", style: { bar: { minimum: 0, maximum: 100, tone: "info" } } },
  { id: "latency", column: "latency", style: { scale: { stops: [{ type: "min", tone: "success" }, { type: "percent", value: 50, tone: "warning" }, { type: "max", tone: "danger" }] } } },
  { id: "disk", column: "disk", when: { operator: "none", filters: [{ column: "disk", operator: "gt", values: [20] }] },
    style: { bands: [{ upperBound: 10, tone: "danger", label: "Critical" }, { tone: "warning", label: "Low" }] } },
  { id: "name", column: "name", when: { operator: "or", filters: [{ column: "name", operator: "like", values: ["web-*"], caseSensitive: true, culture: "pl-PL" },
    { column: "name", operator: "notIn", values: ["a", "b"] }] }, style: { tone: "info", icon: "flag", badge: "web", cue: "front end", emphasis: "strong" } }
];
// @ts-expect-error A scale has two or three stops.
const badScale: GridFormatRule = { id: "bad", column: "cpu", style: { scale: { stops: [{ type: "min", tone: "success" }] } } };
const formatted: InlineGridView = { protocol: "canopyx/2", type: "grid", id: "health", label: "Health", pageSize: 100, selection: "none", search: false,
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "status", title: "Status", kind: "text" }, { id: "cpu", title: "CPU", kind: "number" },
    { id: "latency", title: "Latency", kind: "number" }, { id: "disk", title: "Disk", kind: "number" }],
  source: { kind: "inline" }, rows: [], formatRules: healthRules, formatting: { legend: true, editor: true },
  labels: { formatRules: "Formatowanie warunkowe", formatLegend: "Legenda" } };
const formattedGrid = createDataGrid(document.createElement("div"), { view: formatted, onFormat: ({ rules }) => rules.length });
const currentRules: readonly GridFormatRule[] = formattedGrid.getFormatRules();
void formattedGrid.setFormatRules([...currentRules, { id: "extra", column: "cpu", style: { tone: "warning" } }]).then(rules => rules[0].id);
void formattedGrid.openFormatRules();
const exportedFormat: GridExportFormat | undefined = undefined as unknown as GridExportFormat | undefined;
void [badScale, exportedFormat?.bar?.fraction];
// Linked views: external filters, highlights and the neutral payloads of canopyx:linkchange (docs/linked-views.md).
import type { ExternalFilter, ExternalFilterEvent, LinkChange, LinkedView } from "@evotecit/canopyx";
const linkedGrid = createDataGrid(document.createElement("div"), { linkEvents: true, view: { protocol: "canopyx/2", type: "grid", id: "linked", label: "Linked", pageSize: 100, selection: "multiple", search: false,
  source: { kind: "inline" }, columns: [{ id: "site", title: "Site", kind: "text" }, { id: "load", title: "Load", kind: "number" }], rows: [] } });
const linked: LinkedView = linkedGrid;
void linked.setExternalFilter("site-chart", { field: "site", values: ["Berlin"], sourceLabel: "Sites chart" }).then((done: boolean) => done);
void linked.setExternalFilter("load-band", [{ field: "load", range: [10, null], persist: true }]);
void linked.setExternalFilter("site-chart", null);
void linked.clearExternalFilters();
const applied: ExternalFilter[] = linked.getExternalFilters();
void applied[0]?.sourceLabel;
void linked.setHighlight(["row-1"], { scroll: false, source: "Sites chart" }).then((count: number) => count);
void linked.clearHighlight();
void linked.startLinkEvents().then(() => undefined);
const highlighted: string[] = linked.getHighlight();
void highlighted;
linkedGrid.element.addEventListener("canopyx:linkchange", event => {
  const detail = (event as CustomEvent<LinkChange>).detail;
  const sites: readonly (string | number | boolean)[] = detail.values.site || [];
  void sites; void (detail.action === "select" ? detail.keys : detail.scope);
});
linkedGrid.element.addEventListener("canopyx:externalfilter", event => { const detail = (event as CustomEvent<ExternalFilterEvent>).detail; void (detail.reason === "user"); });
CanopyX.configure("linked-tree", { linkEvents: true });
// @ts-expect-error A range needs at least one end.
void linked.setExternalFilter("open", { field: "load", range: [null, null] });
// @ts-expect-error An external filter has values or a range, not both.
void linked.setExternalFilter("both", { field: "load", values: [1], range: [1, 2] });
// Live data: transactions, the batched update rate, polling and the revision-aware refresh (docs/live-data.md).
import type { GridLiveResult, GridLiveState, GridPoller, GridTransaction } from "@evotecit/canopyx/grid";
const liveGrid = createDataGrid(document.createElement("div"), {
  view: { protocol: "canopyx/2", type: "grid", id: "live", label: "Live", pageSize: 100, selection: "multiple", search: true, source: { kind: "inline" },
    columns: [{ id: "name", title: "Name", kind: "text" }, { id: "load", title: "Load", kind: "number" }], rows: [],
    live: { stableOrder: true, flash: { durationMs: 900 }, batchMs: 250, announce: true } },
  live: { load: ({ signal }) => signal.aborted ? null : [{ id: "a", cells: { name: "A", load: 1 } }] },
  onRowsChanged: (event: GridLiveResult) => void [event.added, event.updated, event.removed, event.missing, event.orderChanged, event.source] });
const liveChange: GridTransaction = { add: [{ id: "b", cells: { name: "B", load: 2 } }], update: [{ id: "a", cells: { load: null } }], remove: ["c", { id: "d" }] };
void liveGrid.applyTransaction(liveChange).then((result: GridLiveResult) => result.updated.length);
void liveGrid.addRows([{ id: "e", cells: { name: "E" } }]);
void liveGrid.updateRows([{ id: "e", cells: { load: 4 }, tone: null }]);
void liveGrid.removeRows(["e"]);
void liveGrid.setRows([]);
void liveGrid.flushTransactions();
void liveGrid.refreshRows();
void liveGrid.resort();
void liveGrid.poll({ intervalMs: 5000, immediate: true }).then((poller: GridPoller) => { poller.pause(); poller.resume(); void poller.refresh(); poller.stop(); return poller.active && !poller.paused; });
const liveState: GridLiveState = liveGrid.getLiveState();
void [liveState.orderChanged, liveState.pending, liveState.polling, liveState.revision];
// @ts-expect-error A transaction lists rows to add, not a single row.
void liveGrid.applyTransaction({ add: { id: "x", cells: {} } });
// Typed rows (docs/typed-grids.md): a named row type checks column ids, rows, facets, events and the live API.
import type { GridRow as TypedGridRow, GridRowUpdate, GridColumnId, InlineGridView as TypedInlineView } from "@evotecit/canopyx/grid";
interface ServerRow extends TypedGridRow { cells: { host: string; load: number; site: string | null } }
const serverView: TypedInlineView<ServerRow> = { protocol: "canopyx/2", type: "grid", id: "servers", label: "Servers", pageSize: 100, selection: "multiple", search: true,
  source: { kind: "inline" }, columns: [{ id: "host", title: "Host", kind: "text" }, { id: "load", title: "Load", kind: "number" }, { id: "site", title: "Site", kind: "text" }],
  rows: [{ id: "s1", cells: { host: "web-01", load: 0.4, site: "Oslo" } }], facets: { columns: ["site", { column: "load", kind: "range" }] }, searchColumns: ["host"] };
const servers = createDataGrid<ServerRow>(document.createElement("div"), { view: serverView,
  onDetails: event => void event.row.cells.host.toUpperCase(), onColumnResize: event => void (event.column satisfies GridColumnId<ServerRow>) });
servers.setColumnVisible("load", false);
void servers.addRows([{ id: "s2", cells: { host: "db-01", load: 2, site: null } }]);
void servers.updateRows([{ id: "s2", cells: { load: 3 } }]);
void servers.updateRows([{ id: "s2", cells: { site: null } }]);
// @ts-expect-error A typed live update cannot clear a required non-null cell.
void servers.updateRows([{ id: "s2", cells: { host: null } }]);
interface DetailedServerRow extends ServerRow { detail?: { type: "properties"; items: { name: string; value: string }[] } }
const typedDetailUpdate: GridRowUpdate<DetailedServerRow> = { id: "s2", detail: { type: "properties", items: [{ name: "Owner", value: "Team" }] } };
// @ts-expect-error A typed live update preserves a specialized detail payload.
const wrongDetailUpdate: GridRowUpdate<DetailedServerRow> = { id: "s2", detail: { type: "html", html: "Wrong payload" } };
void typedDetailUpdate; void wrongDetailUpdate;
const typedColumn: GridColumnId<ServerRow> = "site";
void typedColumn;
// @ts-expect-error A typed grid knows its columns.
servers.setColumnVisible("owner", false);
// @ts-expect-error Rows carry the row type's cells.
void servers.addRows([{ id: "s3", cells: { host: "x", load: "high", site: null } }]);
// @ts-expect-error Columns name the row type's cells.
const badServerView: TypedInlineView<ServerRow> = { ...serverView, columns: [{ id: "owner", title: "Owner", kind: "text" }] };
void badServerView;
// Without a row type, rows stay plain GridRow and any column id goes.
// The rows and columns here are literals, so a grid that inferred its row type from them would refuse the calls below.
const plainGrid = createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "plain", label: "Plain", pageSize: 100, selection: "none", search: false,
  source: { kind: "inline" }, columns: [{ id: "any", title: "Any", kind: "text" }], rows: [{ id: "p0", cells: { any: "x" } }] } });
plainGrid.setColumnVisible("anything", true);
void plainGrid.addRows([{ id: "p1", cells: { other: 1 } }]);
void plainGrid.updateRows([{ id: "p1", cells: { other: null } }]);
// Row activation, links and detail callbacks carry the row type too.
createDataGrid<ServerRow>(document.createElement("div"), { view: serverView,
  onRowActivate: event => void event.row.cells.load.toFixed(1), onLink: event => void (event.column satisfies GridColumnId<ServerRow>),
  detail: { hasDetail: row => row.cells.site !== null } });
// The facet panel (docs/facets.md): a definition in the view, host options and the panel API.
import type { GridFacetPanelDefinition, GridFacetPanelState } from "@evotecit/canopyx/grid";
const facetPanel: GridFacetPanelDefinition = { columns: ["region", { column: "load", kind: "range", bins: 12, sort: "value", collapsed: false }], position: "side", open: true, collapsible: true, width: 280, label: "Refine" };
const facetGrid = createDataGrid(document.createElement("div"), {
  view: { protocol: "canopyx/2", type: "grid", id: "facets", label: "Facets", pageSize: 100, selection: "single", search: true, source: { kind: "inline" },
    columns: [{ id: "region", title: "Region", kind: "text" }, { id: "load", title: "Load", kind: "number" }], rows: [], facets: facetPanel },
  facets: { position: "top", target: document.createElement("div") },
  onFacetPanel: event => void event.open });
const facetState: GridFacetPanelState = facetGrid.getFacetPanel();
void [facetState.open, facetState.columns, facetState.active];
void facetGrid.setFacetPanelOpen(false).then(state => state.open);
const facetSaved: boolean | undefined = facetGrid.getState().facets?.open;
void facetSaved;
// @ts-expect-error A facet is a list or a range.
const badFacet: GridFacetPanelDefinition = { columns: [{ column: "region", kind: "chart" }] };
void badFacet;
// The calendar (docs/calendar.md): a definition in the view, resources, the template hook, the API, range sources and state.
import type { GridCalendarDefinition, GridCalendarState, GridCalendarEvent, GridRangeQuery, GridRangePage, GridOccurrenceChange } from "@evotecit/canopyx/grid";
type ShiftRow = { id: string; cells: { title: string; starts: string; ends: string | null; host: string; rule: string | null } };
const shiftCalendar: GridCalendarDefinition<ShiftRow> = { start: "starts", end: "ends", title: "title", resource: "host", recurrence: "rule", view: "week",
  views: ["month", "week", "day", "days", "agenda", "year", "timeline"], days: 4, firstDay: 1, hiddenDays: [0, 6], slotMinutes: 15, minTime: "06:00", maxTime: "22:00",
  workingHours: { start: "08:00", end: "17:00" }, eventLimit: "auto", eventStyle: "strong", timeZone: "Europe/Warsaw", zoom: "day", zooms: ["hour", "day", "week"],
  editable: { move: true, resize: true, overlap: false, snapMinutes: 15, commit: "manual" }, capacity: { thresholds: [{ at: 3, tone: "warning" }] },
  ranges: [{ start: "2026-10-26T00:00:00Z", end: "2026-10-31T00:00:00Z", label: "Freeze", kind: "background" }], availability: [{ resource: "h1", start: "07:00", end: "15:00" }],
  resources: { view: { protocol: "canopyx/2", type: "view", id: "hosts", label: "Hosts", rowHeight: 34, pageSize: 200, selection: "single", columns: [{ id: "name", title: "Host", width: 150, kind: "text" }], source: { kind: "inline" }, roots: [{ id: "h1", label: "h1" }] },
    aggregates: { name: "count" } } };
const calendarGrid = createDataGrid<ShiftRow>(document.createElement("div"), {
  view: { protocol: "canopyx/2", type: "grid", id: "shifts", label: "Shifts", pageSize: 100, selection: "single", search: true, source: { kind: "inline" },
    columns: [{ id: "title", title: "Title", kind: "text" }, { id: "starts", title: "Starts", kind: "datetime" }, { id: "ends", title: "Ends", kind: "datetime" },
      { id: "host", title: "Host", kind: "text" }, { id: "rule", title: "Rule", kind: "text" }], rows: [], calendar: shiftCalendar },
  calendar: { render: ({ event, element }) => { element.textContent = event.title; return true; } },
  onCalendar: (state: GridCalendarState) => void state.view, onOccurrenceChange: (change: GridOccurrenceChange) => change.start !== change.end });
void calendarGrid.setCalendarView("timeline").then(state => state.zoom);
void calendarGrid.setCalendarDate("2026-10-16"); void calendarGrid.calendarStep(-1); void calendarGrid.setCalendarZoom("hour");
void calendarGrid.exportCalendar({ scope: "visible" }).then(file => file.text.startsWith("BEGIN:VCALENDAR"));
void Promise.resolve(calendarGrid.getCalendarEvents()).then((events: readonly GridCalendarEvent[]) => events[0]?.record);
const calendarSaved = calendarGrid.getState().calendar?.view;
void calendarSaved;
const rangeSource = { query: () => { throw new Error("unused"); }, range: (request: GridRangeQuery): GridRangePage<ShiftRow> =>
  ({ protocol: "canopyx/2", type: "gridRangePage", view: request.view, revision: "r1", from: request.from, to: request.to, matched: 0, truncated: false, items: [] }) };
void rangeSource;
// A basic calendar from events, the presets and the opt-in options, the hooks, inserts and the sources API.
import { createCalendar, type CalendarEventInput, type GridCalendarMenuContext, type GridEventCreate } from "@evotecit/canopyx/grid";
const basicEvents: CalendarEventInput[] = [{ title: "Planning", start: new Date(), end: "2026-10-16T10:00:00Z", tone: "info" }, { id: "trip", title: "Trip", start: "2026-10-20" }];
const basicCalendar = createCalendar(document.createElement("div"), { events: basicEvents, preset: "basic", views: ["month", "mini", "weekList", "dayList", "months"],
  sources: [{ id: "team", label: "Team", tone: "info" }, { id: "ext", label: "Company", ics: "holidays.ics", hidden: true }],
  calendar: { weekNumbers: "iso", validRange: { start: "2026-01-01" }, menu: (context: GridCalendarMenuContext, defaults) => context.kind === "event" ? [...defaults, { label: "Copy", run: () => undefined }] : null },
  onCreate: (proposal: GridEventCreate) => proposal.allDay });
void Promise.resolve(basicCalendar.setCalendarSource("team", false)).then((visible: boolean) => visible);
void basicCalendar.insertRow({ cells: { title: "New" } }).then(result => result.id);
const schedulerDefinition: GridCalendarDefinition<ShiftRow> = { start: "starts", create: { minutes: 30 }, drop: true, occurrence: "ask", toolbar: ["search", "export"], details: "popover",
  span: { count: 2, unit: "week" }, agendaSpan: "week", months: 3, ranges: [{ start: "2026-10-05T08:00:00Z", end: "2026-10-05T18:00:00Z", label: "Closed", inverse: true, recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" }] };
void schedulerDefinition;
// @ts-expect-error The toolbar lists known controls.
const badToolbar: GridCalendarDefinition<ShiftRow> = { start: "starts", toolbar: ["print"] };
void badToolbar;
// @ts-expect-error A calendar names its start column.
const badCalendar: GridCalendarDefinition<ShiftRow> = { end: "ends" };
void badCalendar;
// @ts-expect-error Calendar columns are the row type's columns.
const wrongColumn: GridCalendarDefinition<ShiftRow> = { start: "opened" };
void wrongColumn;
// Runtime grouping, plugin aggregates and detail rows on the reporting runtime.
ReportingRuntime.use({ name: "median-aggregate", aggregates: { median: { label: "med {value}", compute: values => values.length ? Number(values[0]) : null } },
  detailRenderers: { "order-note": (row, element, context) => { element.textContent = row.id; context.onDispose(() => undefined); } } });
const groupedApi = ReportingRuntime.createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "orders", label: "Orders",
  source: { kind: "inline" }, rows: [{ id: "o1", cells: { region: "North", amount: 10 }, detail: { type: "properties", items: [{ name: "Owner", value: "Ops" }] } }],
  rowHeight: 32, pageSize: 100, selection: "multiple", search: true,
  columns: [{ id: "region", title: "Region", kind: "text", sortable: true }, { id: "amount", title: "Amount", kind: "number", sortable: true }],
  reporting: { groupBy: [{ column: "region", direction: "asc" }], groupable: true, detail: { print: false },
    aggregates: [{ id: "total", column: "amount", operation: "sum", label: "Total" }, { id: "distinct", column: "region", operation: "distinctCount", label: "Regions" },
      { id: "median", column: "amount", operation: "median", label: "Median" }] } },
  detail: { hasDetail: row => !!row.detail, export: row => ({ type: "html", html: row.id }) } });
const levels: readonly GroupLevel[] = groupedApi.getGroupBy?.() ?? [];
void groupedApi.setGroupBy?.([...levels, { column: "amount", direction: "desc", aggregate: "total" }]);
void groupedApi.setGroupLevelCollapsed?.(1, true); void groupedApi.expandAllGroups?.(); void groupedApi.expandDetail?.("o1");
const expanded: string[] = groupedApi.getExpandedDetails?.() ?? [];
const nestedGroups: readonly GridGroup[] | undefined = groupedApi.getSummary?.()?.groups[0]?.groups;
void expanded; void nestedGroups;
// Column groups and cell ranges.
const budgetGroups: GridColumnGroup[] = [{ id: "h1", title: "First half", pinned: "left", groups: [{ id: "q1", title: "Q1", columns: ["jan", "feb", "mar"] }] }, { id: "total", title: "Totals", columns: ["year"] }];
const budgetView: InlineGridView = { protocol: "canopyx/2", type: "grid", id: "budget", label: "Budget", source: { kind: "inline" }, rows: [], pageSize: 100, selection: "multiple", search: true, rowHeight: 34,
  columns: ["jan", "feb", "mar", "year"].map(id => ({ id, title: id, kind: "number" as const })), columnGroups: budgetGroups,
  rangeSelection: { multiple: true, fillHandle: true }, clipboard: { copyHeaders: true, copyValues: "raw", paste: true } };
const budget = createDataGrid(document.createElement("div"), { view: budgetView, rangeSelection: true, clipboard: { copyValues: "display" },
  onPaste: (event: GridPasteEvent) => { event.respondWith({ refused: event.cells.filter(cell => cell.column === "year").map(cell => ({ id: cell.id, column: cell.column, reason: "Computed" })) }); },
  onCellRangeChange: ({ ranges }) => { const first: GridCellRange | undefined = ranges[0]; void first; } });
const groupState: readonly GridColumnGroupState[] = budget.getColumnGroups();
void groupState[0]?.visibleColumns;
void budget.setColumnGroupVisible("q1", false);
void budget.setCellRanges([{ startRow: 0, startColumn: "jan", endRow: 2, endColumn: "mar" }]);
const rangeText: Promise<string> = budget.copyCellRanges({ headers: true, values: "raw" });
const pasted: Promise<GridPasteResult> = budget.pasteCells("1\t2", { row: 0, column: "jan" });
void rangeText; void pasted; void budget.getCellRanges(); void budget.clearCellRanges(); void budget.selectAllCells(); void budget.getCellRangeText();
// @ts-expect-error Copied values are display or raw.
void budget.copyCellRanges({ values: "typed" });
// The record panel: structured cells, record fields, sections and tabs, details on demand, drawer sections and record actions.
import type { GridRecordQuery, GridRecord, RecordPanelDefinition, RecordSectionRenderer } from "@evotecit/canopyx/grid";
const recordPanel: RecordPanelDefinition = {
  fields: [{ id: "thumbprint", title: "Thumbprint" }, { id: "contacts", title: "Contacts", section: "People" }, { id: "trend", title: "Trend", kind: "number", presenter: { kind: "sparklineLine" } }],
  header: { status: "status", facts: ["cn"] },
  sections: [{ id: "identity", label: "Identity", fields: ["thumbprint", "names"], renderer: "key-chart", sections: [{ id: "dates", label: "Dates", collapsed: true }] }],
  tabs: [{ id: "overview", label: "Overview", sections: ["identity"] }],
  hideEmpty: true, deepLink: { key: "cert" }, source: { kind: "sidecar", base: "records/", shards: 16 }, actions: { export: false }
};
const keyChart: RecordSectionRenderer = (record, element, context) => { element.textContent = record.id + " " + context.width; context.onDispose(() => undefined); };
ReportingRuntime.use({ name: "record-extras", drawerSections: { "key-chart": keyChart }, recordActions: [{ label: "Renew", run: ({ record, view }) => { void (record.id + view); } }] });
const loadRecord = async (request: GridRecordQuery, options: { signal: AbortSignal }): Promise<GridRecord | null> =>
  options.signal.aborted ? null : { protocol: "canopyx/2", type: "gridRecord", view: request.view, id: request.id, fields: { thumbprint: "AB12" } };
const recordGrid = ReportingRuntime.createDataGrid(document.createElement("div"), {
  view: { protocol: "canopyx/2", type: "grid", id: "certs", label: "Certificates", rowHeight: 34, pageSize: 100, selection: "single", search: true, source: { kind: "inline" },
    columns: [{ id: "cn", title: "Common name", kind: "text", sortable: true }, { id: "status", title: "Status", kind: "text", presenter: { kind: "state" } },
      { id: "names", title: "Names", kind: "text", presenter: { kind: "structured", display: "chips", limit: 2, countText: "{count} names" } },
      { id: "serial", title: "Serial", kind: "text", hidden: true, drawer: false }],
    rows: [{ id: "c1", cells: { cn: { value: "app", ref: { id: "c2" } }, status: "Valid", names: { value: "a, b", items: ["a", { value: "b", tone: "info" }] } },
      fields: { contacts: { records: { columns: [{ id: "role", title: "Role" }], rows: [{ id: "o", cells: { role: "Owner" } }], total: 3, target: { view: "people", column: "role" } } },
        trend: { value: 3, series: [{ period: "2026-01", value: 3 }] } } }],
    record: recordPanel },
  loadRecord, recordActions: [{ label: "Open", run: () => undefined }], onOpenAll: event => event.ids.length > 0, onRecordPrint: event => void event.element });
void recordGrid.openRecord("c1", { tab: "overview" });
const recordTree = createTreeGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "view", id: "tree", label: "Tree", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 200, kind: "text" }, { id: "state", title: "State", width: 120, kind: "text", section: "Health", drawer: true }], source: { kind: "inline" },
  roots: [{ id: "a", label: "A", fields: { owner: { value: "Team", events: [{ time: "2026-01-01T00:00:00Z", summary: "Created", changes: [{ name: "Owner", before: null, after: "Team" }] }] } } }],
  record: { fields: [{ id: "owner", title: "Owner" }], deepLink: true } }, onDetails: ({ node, signal }) => { void node.label; void signal; } });
void recordTree.openRecord("a", { path: ["a"] });
// @ts-expect-error A structured presenter displays a count, chips or the first item.
ReportingRuntime.createDataGrid(document.createElement("div"), { view: { protocol: "canopyx/2", type: "grid", id: "bad", label: "Bad", rowHeight: 34, pageSize: 100, selection: "single", search: false, source: { kind: "inline" }, rows: [], columns: [{ id: "a", title: "A", kind: "text", presenter: { kind: "structured", display: "table" } }] } });

// Flows: the document, hooks, the submit detail and the API are typed (docs/flow.md).
import FlowRuntime, { createFlow, type FlowDocument, type FlowAnswer, type FlowSubmitDetail } from "@evotecit/canopyx/flow";
const flowDocument: FlowDocument = { kind: "flow", version: 1, id: "mail", title: "Connect a mail server",
  steps: [{ id: "server", title: "Which server?", fields: [{ id: "host", type: "text", label: "Server", required: true, path: "mail.host" },
    { id: "password", type: "secret", label: "Password" }, { id: "timeout", type: "duration", label: "Timeout", default: "PT30S", units: ["seconds", "minutes"] },
    { id: "security", type: "choice", label: "Security", options: [{ value: "tls", label: "TLS", badge: "Recommended" }, { value: "none", label: "None" }],
      when: { operator: "and", filters: [{ field: "host", operator: "isNotNull" }] } }] }, { id: "review", type: "review", declaration: "Applies at once." }],
  initial: { host: "old.example.com" }, storedSecrets: ["password"], baseline: "rev-1" };
const flowApi = createFlow(document.createElement("div"), {
  flow: flowDocument,
  hooks: { validators: { host: value => typeof value === "string" && value.includes(" ") ? "No spaces." : null }, validateStep: () => ({ warnings: ["Check the port."] }) },
  onSubmit: (detail: FlowSubmitDetail): Promise<FlowAnswer> => {
    const password: string | null = detail.secret("password");
    const state: "set" | "keep" | undefined = detail.secrets.password?.state;
    return Promise.resolve({ status: password || state === "keep" ? "saved" : "error", message: detail.patch.map(change => change.op).join(), fieldErrors: { host: "Unreachable." } });
  }
});
flowApi.ready.then(api => api.validate("server")).then(result => result.errors.map(error => error.message));
flowApi.ready.then(api => {
  const step: string = api.getStep();
  const values: Record<string, import("@evotecit/canopyx/flow").FlowValue> = api.getValues();
  const state: import("@evotecit/canopyx/flow").FlowState = api.getState();
  const dirty: boolean = api.isDirty();
  const reset: boolean = api.reset();
  const progress: boolean = api.setProgress({ done: 1, total: 2 });
  const complete: boolean = api.complete({ status: "saved" });
  const setValues: void = api.setValues({ host: "smtp.example.com" });
  const setError: void = api.setFieldError("host", null);
  void [step, values, state, dirty, reset, progress, complete, setValues, setError];
});
const flowAnswer: Promise<FlowAnswer | null> = flowApi.submit();
FlowRuntime.configure("mail", { onReload: detail => detail.baseline });
GridRuntime.configure("mail", { onSubmit: detail => ({ status: detail.patch.length ? "saved" : "error" }) });
GridRuntime.createFlow(document.createElement("div"), { flow: flowDocument }).destroy();
void flowAnswer;

// Host-connected flows: checks, host options and sections, records, pick steps, tasks, dialogs, the command, presets, drafts, links and an endpoint.
import type { FlowCheckResult, FlowStepState, FlowPreview, FlowDraft, FlowPickedRecord } from "@evotecit/canopyx/flow";
const hostFlow: FlowDocument = { kind: "flow", version: 1, id: "relay", title: "Relay", mode: "tasks", layout: { container: "dialog", launch: "Set up" },
  steps: [{ id: "server", title: "Server", group: "Connection", checks: [{ id: "connect", label: "Test", fields: ["host"], required: "pass" }],
    fields: [{ id: "host", type: "text", label: "Host" }, { id: "region", type: "select", label: "Region", source: "host", dependsOn: ["host"] },
      { id: "rules", type: "records", label: "Rules", columns: [{ id: "name", title: "Name", required: true }, { id: "limit", title: "Limit", type: "number", validation: { min: 1 } }] }],
    sections: [{ id: "engine", label: "Engine", source: "host", dependsOn: ["region"] }] },
  { id: "servers", type: "pick", title: "Which servers?", pick: { field: { id: "servers", required: true }, view: { protocol: "canopyx/2", type: "grid" }, label: "name", tray: true } },
  { id: "review", type: "review", confirm: { label: "Type RELAY", text: "RELAY" }, acknowledge: { label: "I understand." } }],
  command: { name: "Set-Relay", style: "powershell", variants: [{ id: "csharp", label: "C#" }] }, presets: [{ id: "office", label: "Office", values: { host: "smtp.office.example" } }],
  draft: "host", deepLinks: true, endpoint: { url: "/api/flows/relay", routes: ["check", "submit"] } };
const hostApi = createFlow(document.createElement("div"), {
  flow: hostFlow, timeout: 5000, headers: { "X-CSRF": "token" },
  hooks: {
    options: (field, values, { signal }) => (signal.aborted ? [] : [{ value: "eu", label: field + String(values.host) }]),
    fields: () => [{ id: "folder", type: "text", label: "Folder" }],
    check: async (id, values, { secret }): Promise<FlowCheckResult> => ({ status: secret("password") ? "pass" : "warning", message: id, details: [{ label: "Host", value: String(values.host) }] }),
    preview: (): FlowPreview => ({ title: "Changes", rows: [{ label: "Host", value: "smtp", tone: "warning" }], notes: ["Restarts."] }),
    status: (): Record<string, FlowStepState> => ({ server: { state: "blocked", blockers: ["No licence."] } }),
    commands: { csharp: values => "relay.Set(" + JSON.stringify(values) + ");" },
    draftStore: { load: (): FlowDraft | null => null, save: () => undefined, clear: () => undefined },
    presetStore: { list: () => [], save: () => undefined },
    pickers: { servers: { pageSize: 50 } }
  },
  onCheck: detail => detail.result.status, onLeaving: () => false, formatLink: step => "relay/" + step, parseLink: fragment => fragment.split("/")[1] ?? null,
  onSubmit: detail => ({ status: detail.checks?.connect?.status === "pass" && detail.command ? "saved" : "error", message: detail.preset })
});
void hostApi.ready.then(async api => {
  const picked = api.getValues().servers as readonly FlowPickedRecord[];
  const result = await api.runCheck("connect");
  const status: FlowCheckResult["status"] | undefined = result?.status;
  await api.refreshOptions("region");
  api.setStepState("server", { state: "complete", summary: "Ready" });
  const saved: boolean = await api.saveDraft();
  await api.setPreset(null);
  const opened: boolean = api.open() && api.close();
  void [picked, result, status, saved, opened];
});
const loaded: { id: string; cells: Record<string, unknown> }[] = dataGrid.getLoadedRows(["1"]);
void loaded;

// The matrix view: the document, the state and the cell event are typed (docs/matrix.md).
import { createMatrix, type MatrixDocument, type MatrixCellDetail, type MatrixApi } from "@evotecit/canopyx/grid";
const matrixDocument: MatrixDocument = { protocol: "canopyx/2", type: "matrix", id: "replication", label: "Replication", square: true, columnTitle: "Source",
  rows: { title: "Destination", attributes: [{ id: "site", title: "Site", facet: true }], items: [{ id: "dc1", label: "DC1", values: { site: "Oslo" } }, { id: "dc2", label: "DC2" }], groupBy: "site" },
  states: [{ id: "fail", label: "Failing", tone: "danger", symbol: "cross", attention: true }, { id: "ok", label: "Healthy", tone: "success", symbol: "check" }],
  cells: [".0", "1."], notes: [[0, 1, 3, "3 errors"]] };
const matrixApi = createMatrix(document.createElement("div"), { view: matrixDocument, onCell: (detail: MatrixCellDetail, event) => { if (detail.state === "fail") event.preventDefault(); } });
matrixApi.sort("rows", "#total", "desc"); matrixApi.filter("columns", "site", ["Oslo"]);
const matrixRows: string[] = matrixApi.getVisible().rows;
GridRuntime.createMatrix(document.createElement("div"), { view: { ...matrixDocument, hideEmpty: true, autoHeight: false }, state: { attentionOnly: true, hideEmpty: false } }).destroy();
void matrixRows;
GridRuntime.configure("replication", { onCell: (detail: MatrixCellDetail, event: CustomEvent<MatrixCellDetail>) => { if (detail.state === "fail") event.preventDefault(); } });
const mountedMatrix: MatrixApi | undefined = GridRuntime.mount().find((view): view is MatrixApi => "focusCell" in view);
matrixApi.setState({ sort: { rows: { by: "#label" } } });
void mountedMatrix;

// The change views: the documents, the action event and the APIs are typed (docs/changes.md).
import { createDiff, createChangeList, createPropagation, type DiffDocument, type ChangeListDocument, type ChangeActionDetail, type ChangeExportDetail, type PropagationDocument } from "@evotecit/canopyx/grid";
const diffDocument: DiffDocument = { protocol: "canopyx/2", type: "diff", id: "logon", label: "logon.ps1", hunks: [{ before: 1, after: 1, lines: [" a", "-b", "+c"] }], layout: "split" };
const diffApi = createDiff(document.createElement("div"), { view: diffDocument, onCopy: detail => { const copied: boolean = detail.copied; void copied; } });
const diffLayout: "inline" | "split" = diffApi.getLayout();
void diffLayout; void diffApi.copy().then((copied: boolean) => copied);
const changeDocument: ChangeListDocument = { protocol: "canopyx/2", type: "changes", id: "files", label: "Files",
  actions: [{ id: "ack", label: "Acknowledge", icon: "check", reason: true }, { id: "copy", label: "Copy path", icon: "copy", copy: "unc" }, { id: "see", label: "Diff", reveal: "diff" }],
  toolbar: [{ id: "open", label: "Open", icon: "open", link: "object" }], values: { object: "#object/1" }, exports: ["csv", "json"],
  items: [{ id: "a", kind: "renamed", path: "b.ps1", previousPath: "a.ps1", flags: [{ id: "f", label: "Unsigned", reason: "No signature.", tone: "danger" }], diff: { id: "d", label: "D", before: "x", after: "y" } }] };
const changeApi = createChangeList(document.createElement("div"), { view: changeDocument, onAction: (detail: ChangeActionDetail) => { const path: string | null = detail.path; const reason: string | undefined = detail.reason; void path; void reason; },
  onExport: (detail: ChangeExportDetail) => { const format: "csv" | "json" = detail.format; void format; } });
changeApi.setState({ flaggedOnly: true, kinds: ["added"] });
const propagationDocument: PropagationDocument = { protocol: "canopyx/2", type: "propagation", id: "p", label: "P", witnesses: [{ id: "dc1", label: "DC01", state: "propagating", firstSeen: "2026-10-21T10:42:00Z" }] };
createPropagation(document.createElement("div"), { view: propagationDocument }).update(propagationDocument);

// Standalone UI shares the lazy API across tree and grid entry points.
import { tabs, stepper, contextMenu, type UiTabsController } from "@evotecit/canopyx";
const uiTabs: UiTabsController = tabs("#sections", {
  autoProgress: { interval: 5000, pauseOnHover: true, pauseOnFocus: true },
  labels: polish,
  beforeChange: async (from, to, signal) => !signal.aborted && from?.id !== to.id,
  renderIcon: name => { const span = document.createElement("span"); span.textContent = name; return span; }
});
void uiTabs.ready.then(controller => controller.select("activity"));
stepper("#setup", { validate: step => step.id === "review" ? true : ["Choose a workspace."], onFinish: () => {} });
const disposeMenu = contextMenu(".record", (_event, element) => [{ id: element.id, label: "Open record" }], {
  onSelect: (item, _event, _element, detail) => { const id: string = detail.id; void id; void item.checked; }
});
void disposeMenu.ready.then(() => disposeMenu());
void GridRuntime.drawer("#details").ready;
void ReportingRuntime.dialog("#confirm").ready;
