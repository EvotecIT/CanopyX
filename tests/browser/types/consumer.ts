import CanopyX, {
  createTreeGrid, sources, labels, type CanopyView, type CanopyNode, type InlineNode, type DataSource, type ViewState, type CheckState, type PageDocument
} from "@evotecit/canopyx";

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
const lazySource: DataSource = { queryAware: true,
  page: () => ({ items: [{ id: "lazy", label: "Lazy", hasChildren: true, ref: "children" }], revision: "r1" }),
  counts: () => ({ protocol: "canopyx/2", type: "counts", items: [], revision: "r1" })
};
// Input action definitions remain editable; the runtime freezes its own descriptor snapshot.
if (view.contextActions?.[0]) view.contextActions[0].label = "Inspect record";
