import type {
  CanopyNode, CanopyColumn, CanopyView, InlineView, SidecarView, RemoteView, CanopyLabels, CellValue, CheckIntent,
  CountsDocument, PageResult, SearchResult, ViewQuery, ReadonlyViewQuery, ContextAction, TimeZone, TreeToolbarControls
} from "./protocol.js";
import type { CanopyPlugin } from "./plugins.js";
import type { RecordPanelOptions } from "./records.js";
import type { TreeGrid } from "./index.js";

export type Awaitable<T> = T | PromiseLike<T>;
/** Query-aware hosts answer from one accepted dataset revision. */
export interface SourceRequest { signal: AbortSignal; query?: ReadonlyViewQuery; revision?: string | null; }
interface DataSourceBase {
  kind?: string;
  /** Resolves a lease disposer. A source releases held data on cancellation as well. */
  prefetch?(opens: string[], finds: string[], request?: SourceRequest): Awaitable<void | (() => void)>;
}
type SourcePage<T> = (node: CanopyNode | null, cursor: string | null, request?: SourceRequest) => Awaitable<T>;
type SourceSearch<T> = (query: string, limit: number, request?: SourceRequest) => Awaitable<T>;
type SourceCounts<T> = (ids: string[], request?: SourceRequest) => Awaitable<T>;
type SearchCapability<T> = (
  | { canSearch: true; search: SourceSearch<T> }
  | { canSearch?: false; search?: SourceSearch<T> }
);
/** Search availability requires its method; query-aware callbacks identify one dataset revision. */
export type DataSource = DataSourceBase & (
  | ({ queryAware?: false; page: SourcePage<PageResult>; counts?: SourceCounts<CountsDocument> | null } & SearchCapability<SearchResult>)
  | ({ queryAware: true; page: SourcePage<PageResult & { revision: string }>;
       counts?: SourceCounts<CountsDocument & { revision: string }> | null } & SearchCapability<SearchResult & { revision: string }>)
);
export interface RemoteOptions { timeoutMs?: number; signal?: AbortSignal; }
export interface Sources {
  inline(view: InlineView): DataSource;
  sidecar(view: SidecarView): DataSource;
  remote(view: RemoteView, options?: RemoteOptions): DataSource;
}

export interface NodeReference { readonly nodeId: string; readonly path: readonly string[]; }
export interface EditProposal extends NodeReference {
  readonly column: string;
  readonly previous: CellValue;
  readonly value: CellValue;
}
export type DropPlacement = "inside" | "before" | "after";
export interface DropProposal {
  readonly nodes: readonly NodeReference[];
  readonly target: { readonly nodeId: string | null; readonly path: readonly string[] };
  readonly placement: DropPlacement;
}
export interface ActionProposal extends NodeReference { readonly action: string; }
export interface InteractionContext {
  readonly signal: AbortSignal;
  readonly reason: string;
  readonly query: ViewQuery | null;
  readonly revision: string | null;
}
export interface InteractionOptions { signal?: AbortSignal; reason?: string; }
export interface SelectionContext { previous: CanopyNode[]; reason: string; }
export interface CheckContext { readonly previous: readonly CheckIntent[]; readonly reason: string; }
export interface CellContext {
  column: string; level: number; expanded: boolean; index: number;
  /** Aborts before replacement, recycling, failed rendering or destruction. */
  readonly signal: AbortSignal;
  /** Registers cleanup for this cell paint. Called once in reverse registration order. */
  onDispose(cleanup: () => void): void;
}
export interface LoadInfo { node: CanopyNode | null; count: number; total: number | null; ms: number; }

/** One exported cell: the typed value, the display text formatted at capture, and a semantic tone where the data declares one. */
export interface ExportCell { readonly value: CellValue; readonly text: string; readonly tone?: string; }
/** What every export capture offers a format writer. Tree captures (request.kind "tree") and flat-grid captures add their own fields. */
export interface ExportRequest {
  readonly columns: readonly { readonly id: string; readonly title: string; readonly kind: "text" | "number" | "datetime" }[];
  /** Exact captured record count, or null when a source cannot know it. */
  readonly recordCount: number | null;
  readonly values: "raw" | "display";
  readonly timeZone: TimeZone;
  readonly locale?: string;
  readonly fileName?: string;
}
export interface ExportCapture {
  readonly request: ExportRequest;
  /** Each enumeration reads the captured rows afresh; the signal links with the writer's own. */
  rows(options?: { signal?: AbortSignal }): AsyncIterable<{ readonly id: string; readonly cells: Readonly<Record<string, ExportCell>> }>;
}
export interface ExportFormatContext {
  /** Aborts on cancellation, the export safety timeout or grid destruction. */
  readonly signal: AbortSignal;
  /** The suggested file name without the extension. */
  readonly fileName: string;
  /** The format's id. */
  readonly format: string;
  /** Reports written records (a nonnegative integer; other values are ignored); the Export menu shows them as progress. */
  progress(completed: number): void;
}
/** A writer the Export menu lists after CSV, in the grid's own menu with its scope picker, progress and cancellation. */
export interface ExportFormat<C extends ExportCapture = ExportCapture> {
  /** 1–32 lowercase letters, digits and hyphens, starting with a letter. "csv" is built in. */
  readonly id: string;
  /** The button text in the Export menu, such as "Download Excel". */
  readonly label: string;
  /** The file extension without the dot (1–16 letters or digits). */
  readonly extension: string;
  /** The Blob type for bytes a writer returns; default application/octet-stream. */
  readonly mime?: string;
  /** Returns the file: a Blob (a File names the download itself), or bytes typed with mime. */
  write(capture: C, context: ExportFormatContext): Blob | ArrayBuffer | ArrayBufferView | PromiseLike<Blob | ArrayBuffer | ArrayBufferView>;
}
export interface ExportProgress { readonly phase: "reading" | "generating" | "ready"; readonly completed: number; readonly total: number | null; }
export interface ExportFormatOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  /** Safety timeout for the writer, 1..2147483647 ms; overrides the grid's exportTimeoutMs (default 600000). */
  timeoutMs?: number;
  /** False returns the file without starting a browser download. Default true. */
  download?: boolean;
}
export interface ExportFormatResult { readonly blob: Blob; readonly fileName: string; readonly format: string; }
export interface TreeExportOptions {
  /** "visible" (default): the rows the reader can see, in order. "selected": the loaded selected nodes in tree order, including collapsed ones.
   * "all": every node in the current sort order, the whole tree of an inline source and the loaded nodes of a lazy one. */
  scope?: "visible" | "selected" | "all";
  /** Defaults to the visible columns in their current order. */
  columns?: string[];
  values?: "raw" | "display";
  signal?: AbortSignal;
}
export interface TreeExportRequest extends ExportRequest {
  readonly kind: "tree";
  readonly scope: "visible" | "selected" | "all";
  readonly presentation: "text";
  readonly revision: string | null;
  readonly recordCount: number;
}
/** A record with its depth (level 1 is a root) and the id path from its root, ending with its own id. */
export interface TreeExportRow { readonly id: string; readonly level: number; readonly path: readonly string[]; readonly cells: Readonly<Record<string, ExportCell>>; }
export interface TreeExport extends ExportCapture {
  readonly request: TreeExportRequest;
  rows(options?: { signal?: AbortSignal }): AsyncIterable<TreeExportRow>;
}
/** The TrustedHTML type of the DOM library when it declares Trusted Types; otherwise never. */
export type HostTrustedHTML = typeof globalThis extends { TrustedHTML: { prototype: infer T } } ? T : never;
/** Hooks stay with the host. Acceptance never makes the grid perform a write. */
interface HostOptionsBase extends RecordPanelOptions {
  source?: DataSource;
  labels?: CanopyLabels;
  requestTimeoutMs?: number;
  /** The formats the Export menu and exportAs offer (ids of registered formats or provider objects); absent offers the view's exportFormats, else every registered format. */
  exportFormats?: readonly (string | ExportFormat)[];
  /** False hides the tree toolbar; an object switches single controls off, overriding the view's toolbar switches. */
  toolbar?: boolean | TreeToolbarOptions;
  /** Host entries of the tree's more menu, run with the selected nodes; the host owns what they do. */
  actions?: readonly TreeAction[];
  /** Plugins for this tree only, after the page's (CanopyX.use); one replaces a page plugin of the same name. */
  plugins?: readonly CanopyPlugin[];
  /** Loads the link part when the tree is created and reports its selection as canopyx:linkchange (LinkChange). */
  linkEvents?: boolean;
  /** Safety timeout for export format writers, 1..2147483647 ms (default 600000). */
  exportTimeoutMs?: number;
  retainedNodeLimit?: number;
  inactiveNodeLimit?: number;
  interactionTimeoutMs?: number;
  renderers?: Record<string, (node: CanopyNode, element: HTMLElement, context: CellContext) => boolean>;
  renderDetail?: (node: CanopyNode, element: HTMLElement) => boolean;
  /**
   * Sees the markup the host declared trusted before it is written: an html detail ("detail") or a view icon ("icon").
   * Return a string, a TrustedHTML from the host's own Trusted Types policy, or a Node, which is inserted as it is (docs/security.md).
   */
  sanitizeHtml?: (html: string, context: { readonly kind: "detail" | "icon" }) => string | HostTrustedHTML | Node;
  /** Replaces the tree's record drawer with the host's own view of the node (a frozen copy); restore returnFocus when it closes. */
  onDetails?: (event: { node: Readonly<CanopyNode>; signal: AbortSignal; returnFocus: Element | null }) => void | PromiseLike<void>;
  onSelect?: (node: CanopyNode | null, nodes: CanopyNode[]) => void;
  onToggle?: (node: CanopyNode, expanded: boolean) => void;
  onLoad?: (node: CanopyNode | null, info: LoadInfo) => void;
  /** Row activation (Enter on a node row, or a double click), with the tree tools part: runs before the tree's own action
   * (select and toggle); returning false keeps that from running. The cancelable canopyx:rowActivate event carries { id, node, keyboard }. */
  onRowActivate?: (node: CanopyNode, context: { readonly keyboard: boolean }) => boolean | void;
  isSelectable?: (node: CanopyNode) => boolean;
  beforeSelect?: (node: CanopyNode | null, nodes: CanopyNode[], context: SelectionContext) => boolean | void;
  isCheckable?: (node: CanopyNode) => boolean;
  beforeCheck?: (node: CanopyNode | null, intents: readonly CheckIntent[], context: CheckContext) => boolean | void;
  onCheck?: (node: CanopyNode | null, intents: readonly CheckIntent[], context: { reason: string }) => void;
  onEdit?: (proposal: EditProposal, context: InteractionContext) => Awaitable<boolean>;
  onDrop?: (proposal: DropProposal, context: InteractionContext) => Awaitable<boolean>;
  onAction?: (proposal: ActionProposal, context: InteractionContext) => Awaitable<boolean>;
  canEdit?: (node: CanopyNode, column: CanopyColumn) => boolean;
  canDrag?: (node: CanopyNode) => boolean;
  canDrop?: (proposal: DropProposal) => boolean;
  isActionEnabled?: (node: CanopyNode, action: Readonly<ContextAction>) => boolean;
}
/** Per-control tree toolbar switches; an absent switch keeps its control, and a control switched off is not built. */
export interface TreeToolbarOptions extends TreeToolbarControls {
  /** The search box; the view's search options still decide whether there is one. */
  search?: boolean;
}
/** A more-menu entry of a tree. */
export interface TreeAction {
  label: string;
  run(context: { nodes: CanopyNode[]; signal: AbortSignal; api: TreeGrid }): unknown;
}
/** A custom deep-link scheme supplies its formatter and parser together. */
export type HostOptions = HostOptionsBase & (
  | { formatLink: (path: string[], node: CanopyNode | null) => string | null;
      parseLink: (fragment: string) => Awaitable<string[] | null> }
  | { formatLink?: never; parseLink?: never }
);
export type TreeGridOptions = HostOptions & { view: CanopyView };
export interface ExpandPathOptions {
  select?: boolean;
  focus?: boolean;
  reveal?: boolean;
  expandLast?: boolean;
  signal?: AbortSignal;
}
export interface FilterOptions { autoExpand?: boolean; }
export type NodeFilter = ((node: CanopyNode) => boolean) | {
  match(node: CanopyNode): boolean;
  keep?(node: CanopyNode): boolean;
};

// ---------- linked views (docs/linked-views.md) ----------
/** A raw value an external filter or a link payload carries. */
export type LinkValue = string | number | boolean;
interface ExternalFilterText {
  /** The chip shows this instead of the values. */
  label?: string;
  /** Who applied the filter, as the chip and announcements name it; defaults to the source id. */
  sourceLabel?: string;
  /** Keep the filter in the state saved views and the remembered state store; off by default. */
  persist?: boolean;
}
/** What another view applies: 1 to 1000 values of a declared column, or a [from, to] range (either end null) of a number or date column. */
export type ExternalFilterInput = ExternalFilterText & (
  | { field: string; values: readonly LinkValue[]; range?: never }
  | { field: string; range: readonly [LinkValue, LinkValue | null] | readonly [null, LinkValue]; values?: never });
/** An applied external filter, as getExternalFilters and canopyx:externalfilter report it. */
export interface ExternalFilter {
  readonly source: string;
  readonly field: string;
  readonly values?: readonly LinkValue[];
  readonly range?: readonly [LinkValue | null, LinkValue | null];
  readonly label?: string;
  readonly sourceLabel: string;
  readonly persist: boolean;
}
export interface HighlightOptions {
  /** Scroll the first highlighted row into view (default true). */
  scroll?: boolean;
  /** Who asked, for the screen-reader announcement. */
  source?: string;
}
/** The detail of canopyx:externalfilter: the filters now applied, and whether the reader removed one (a chip or Clear all). */
export interface ExternalFilterEvent {
  readonly filters: readonly ExternalFilter[];
  readonly reason: "api" | "user";
}
/**
 * The detail of canopyx:linkchange, which a view with linkEvents dispatches: the reader's selection (select, with the row keys
 * and each column's distinct values across the selected loaded rows) or a flat grid's own eq and in conditions (filter, by
 * column), and clear when either became empty. External filters and highlights never report.
 */
export interface LinkChange {
  readonly view: string;
  readonly action: "select" | "filter" | "clear";
  readonly scope: "select" | "filter";
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, readonly LinkValue[]>>;
  readonly label: string;
}
/** The link methods of trees and flat grids. The first call loads the link part; the getters answer without it. */
export interface LinkedView {
  /** Replaces the external filters of one source (1 to 128 letters, digits, '.', ':', '_' or '-'); null removes them. Resolves once the view shows the result. */
  setExternalFilter(source: string, filter: ExternalFilterInput | readonly ExternalFilterInput[] | null): Promise<boolean>;
  /** Removes every external filter, or those of one source. */
  clearExternalFilters(source?: string): Promise<boolean>;
  getExternalFilters(): ExternalFilter[];
  /** Marks the rows with these keys (at most 10000) without filtering; resolves with the number of keys. */
  setHighlight(keys: readonly string[], options?: HighlightOptions): Promise<number>;
  clearHighlight(): Promise<number>;
  getHighlight(): string[];
  /** Starts canopyx:linkchange on a view created without linkEvents (for hosts that link views after they mount). */
  startLinkEvents(): Promise<void>;
}