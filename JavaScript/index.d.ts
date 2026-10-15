import type {
  CanopyBadge, CanopyNode, CanopyView, CanopyLabels, CellValue, CheckIntent, CheckState,
  CountsDocument, SortDirection, TimeZone, ViewQuery, ViewState, LegacyViewState, SearchResult, LabelName
} from "./protocol.js";
import type {
  TreeGridOptions, HostOptions, Sources, ExpandPathOptions, NodeFilter, FilterOptions,
  InteractionOptions, DropPlacement, ExportFormat, ExportFormatOptions, ExportFormatResult, TreeExport, TreeExportOptions, LinkedView
} from "./hosts.js";
import type { CanopyPlugin, CanopyPartDefinition } from "./plugins.js";
export * from "./protocol.js";
export * from "./hosts.js";
export * from "./plugins.js";

/** One mounted grid. Every method owns presentation only; host hooks own domain writes. */
export interface TreeGrid extends LinkedView {
  readonly element: HTMLElement;
  readonly view: CanopyView;
  readonly ready: Promise<void>;
  expandPath(ids: string[], options?: ExpandPathOptions): Promise<CanopyNode | null>;
  setFilter(filter: NodeFilter | null, options?: FilterOptions): void;
  setFilterActive(id: string, active: boolean): void | Promise<boolean>;
  setActiveFilters(ids: string[]): void | Promise<boolean>;
  /** Applies removals, then additions, in one transaction using the latest pending query. */
  updateActiveFilters(change: { add?: readonly string[]; remove?: readonly string[] }): void | Promise<boolean>;
  getActiveFilters(): string[];
  sort(columnId: string, direction?: SortDirection | null): void | Promise<boolean>;
  getQuery(): ViewQuery;
  setQuery(query: ViewQuery, options?: { signal?: AbortSignal }): Promise<boolean>;
  setColumnVisible(columnId: string, visible: boolean): void;
  setColumnWidth(columnId: string, width: number): void;
  /** Pins the tree column to the left edge or lets it scroll with the other columns; remembered with the view state. */
  setTreeColumnPinned(pinned: boolean): void;
  setTimeZone(zone: TimeZone): void;
  getTimeZone(): TimeZone;
  refresh(): void;
  reload(id?: string | null, options?: { signal?: AbortSignal }): Promise<boolean>;
  readLocation(): Promise<void>;
  getSelected(): CanopyNode[];
  /** Replaces selection with loaded IDs. Single-selection overflow is rejected atomically. */
  setSelection(ids: string[]): boolean;
  clearSelection(): boolean;
  /** Chooses loaded or visible nodes without fetching unloaded data. Scope is required. */
  selectAll(options: { scope: "visible" | "loaded" }): boolean;
  focus(): void;
  visibleRows(): { node: CanopyNode; level: number; path: string[] }[];
  /** The indented outline of the open rows that print uses; drawn by the tree tools part, so empty until ready. */
  toOutline(): string;
  /** Closes this tree's toolbar menus and actions menu (none before ready). To close every view's menus, dispatch canopyx:closemenus on the document. */
  closeMenus(): void;
  /** Once ready (the tree tools part): captures the visible rows (default), the loaded selected nodes or all rows now, with level and id path. */
  prepareExport(options?: TreeExportOptions): TreeExport;
  /** Once ready: captures now, then runs a registered or configured export format and downloads its file. */
  exportAs(format: string, options?: TreeExportOptions & ExportFormatOptions): Promise<ExportFormatResult>;
  /** Once ready: names of the views saved for the session (with stateKey; the page only otherwise). */
  getSavedViews(): string[];
  /** Saves the current state under a name of 1 to 100 characters; at most 20 views. */
  saveView(name: string): void;
  applySavedView(name: string): Promise<boolean>;
  removeSavedView(name: string): void;
  /** Returns to the declared columns, sort, filters and expansion. */
  resetView(): Promise<boolean>;
  /** Names every column once; the tree column stays first. */
  setColumnOrder(ids: string[]): void;
  /** Returns columns to their declared order, widths, visibility and pins. */
  resetColumns(): void;
  /** Once ready: pins a column other than the tree column to the left (after the tree column) or right edge, or unpins it. */
  setColumnPinned(columnId: string, pin: "left" | "right" | "none"): void;
  /** Once ready: opens the record drawer of a visible node, its label and every other column (the phone "+N" button opens it too). */
  openDetails(id: string): Promise<void>;
  getState(): ViewState;
  setState(state: ViewState | LegacyViewState): Promise<boolean>;
  search(query: string, limit?: number): Promise<SearchResult>;
  loadMore(id?: string | null): Promise<void>;
  applyCounts(document: CountsDocument): void;
  refreshCounts(ids?: string[]): Promise<CountsDocument | null>;
  getCheckState(id: string): CheckState | null;
  getCheckIntents(): CheckIntent[];
  setChecked(id: string, checked: boolean): boolean;
  setCheckIntents(intents: readonly CheckIntent[]): boolean;
  requestEdit(id: string, column: string, value: CellValue, options?: InteractionOptions): Promise<boolean>;
  requestDrop(ids: string[], target: string | null, placement?: DropPlacement, options?: InteractionOptions): Promise<boolean>;
  requestAction(id: string, action: string, options?: InteractionOptions): Promise<boolean>;
  cancelInteraction(): boolean;
  beginEdit(id: string, column: string): boolean;
  openActions(id: string): boolean;
  destroy(): void;
}

export const protocol: "canopyx/2";
/** Creates a grid, or returns the existing grid mounted in this host. Requires a browser DOM. */
export function createTreeGrid(host: HTMLElement, options: TreeGridOptions): TreeGrid;
/** Configures future fragment mounts and returns a disposer for this registration. Requires a browser DOM. */
export function configure(viewId: string, options: HostOptions): () => void;
export function unconfigure(viewId: string): boolean;
/**
 * Mounts unmounted fragments below root, or root itself when it is a fragment. Fragments marked `data-cx-mount="visible"`
 * below root wait until they come near the viewport; passing such a fragment as root mounts it at once. Requires a browser DOM.
 */
export function mount(root?: ParentNode): TreeGrid[];
export const sources: Readonly<Sources>;
export function badge(value: CanopyBadge): HTMLElement;
export const labels: Readonly<Record<LabelName, string>>;
/** Registers an export format for every grid and tree on the page that does not choose its own; returns a disposer. */
export function registerExportFormat(format: ExportFormat): () => void;
/** Registers a plugin for every grid and tree created afterwards; returns a disposer. Throws for an invalid plugin or a name already registered. */
export function use(plugin: CanopyPlugin): () => void;
/** Registers the code of a part of the runtime; part scripts call it as they run (docs/plugins.md). */
export function registerPart(name: string, part: CanopyPartDefinition): void;
/**
 * Sets the Content Security Policy nonce the runtime gives the part files and sidecar scripts it loads from now on, and that
 * an embedded part's payload must carry to run. Without it the runtime uses the nonce of its own script element, then (for
 * files) that of a nonced script on the page. Throws for a value that is not a nonempty string (docs/security.md).
 */
export function setNonce(nonce: string): void;

declare const CanopyX: Readonly<{
  protocol: typeof protocol;
  createTreeGrid: typeof createTreeGrid;
  configure: typeof configure;
  unconfigure: typeof unconfigure;
  mount: typeof mount;
  sources: typeof sources;
  badge: typeof badge;
  labels: typeof labels;
  registerExportFormat: typeof registerExportFormat;
  use: typeof use;
  registerPart: typeof registerPart;
  setNonce: typeof setNonce;
}>;
export default CanopyX;
