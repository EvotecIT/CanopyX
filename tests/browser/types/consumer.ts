import CanopyX, {
  createTreeGrid, sources, labels, type CanopyView, type CanopyNode, type InlineNode, type DataSource, type ViewState, type CheckState, type PageDocument
} from "@evotecit/canopyx";
import GridRuntime, { createDataGrid, mount as mountViews, type GridSource, type HostGridView, type InlineGridView } from "@evotecit/canopyx/grid";
import type { CursorGridView, GridCursorSource, GridCursorQuery } from "@evotecit/canopyx/grid";
import { enhance, grid as gridInit, type EnhancedGrid, type GridInitOptions, type GridPager } from "@evotecit/canopyx/grid";
import ReportingRuntime from "@evotecit/canopyx/reporting";
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
// @ts-expect-error Shipped packs are immutable; use a host override.
polish.columns = translatedNote;

const reportingHost = document.createElement("div");
const reportingApi = ReportingRuntime.createDataGrid(reportingHost, { view: { protocol: "canopyx/2", type: "grid", id: "ordered", label: "Ordered report",
  source: { kind: "inline" }, rows: [], rowHeight: "auto", estimatedRowHeight: 32, pageSize: 100, selection: "none", search: true,
  highlightRules: [{ column: "name", operator: "eq", values: ["Needs review"], tone: "warning", className: "needs-review" },
    { column: "name", operator: "isNull", values: [], target: "cell", className: "empty" }],
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true, wrap: true }],
  reporting: { columnReorder: true, responsive: true, filterGroups: true, facetColumns: ["name"], minimumCenterWidth: 160,
    layout: { name: { minimum: 120, maximum: 800, flex: 1, pin: "left", priority: 0, alwaysVisible: true } }, ordering: { name: { text: "foldedNatural", categories: ["Pinned"] } },
    presenters: { name: { kind: "link", newWindow: true } } } } });
reportingApi.autoFitColumn?.("name");
reportingApi.autoFitColumns();
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
    { id: "amount", title: "Amount", kind: "number", aggregatable: true,
      presenter: { kind: "sparklineLine", minimum: 0, scaleMaximum: 100, mark: "last", thresholds: [{ upperBound: 50, tone: "success" }] } },
    { id: "history", title: "History", kind: "text", presenter: { kind: "statusStrip" } }
  ], rows: [{ id: "one", cells: { name: { value: "Service", secondary: "Region" }, amount: { value: 20,
    series: [{ period: "2026-10-05", value: 20, state: "Healthy", tone: "success" }] } } }]
};
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
  if ("getSelection" in controller) controller.getSelection();
  else controller.expandPath(["tree-1"]);
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
const workbook: import("@evotecit/canopyx").ExportFormat = { id: "xlsx", label: "Download Excel", extension: "xlsx",
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