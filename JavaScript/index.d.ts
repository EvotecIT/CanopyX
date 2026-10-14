import type {
  CanopyBadge, CanopyNode, CanopyView, CanopyLabels, CellValue, CheckIntent, CheckState,
  CountsDocument, SortDirection, TimeZone, ViewQuery, ViewState, LegacyViewState, SearchResult, LabelName
} from "./protocol.js";
import type {
  TreeGridOptions, HostOptions, Sources, ExpandPathOptions, NodeFilter, FilterOptions,
  InteractionOptions, DropPlacement, ExportFormat, ExportFormatOptions, ExportFormatResult, TreeExport, TreeExportOptions
} from "./hosts.js";
export * from "./protocol.js";
export * from "./hosts.js";

/** One mounted grid. Every method owns presentation only; host hooks own domain writes. */
export interface TreeGrid {
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
  toOutline(): string;
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
  /** Returns columns to their declared order, widths and visibility. */
  resetColumns(): void;
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
/** Mounts unmounted fragments below root. Requires a browser DOM. */
export function mount(root?: ParentNode): TreeGrid[];
export const sources: Readonly<Sources>;
export function badge(value: CanopyBadge): HTMLElement;
export const labels: Readonly<Record<LabelName, string>>;
/** Registers an export format for every grid and tree on the page that does not choose its own; returns a disposer. */
export function registerExportFormat(format: ExportFormat): () => void;

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
}>;
export default CanopyX;
