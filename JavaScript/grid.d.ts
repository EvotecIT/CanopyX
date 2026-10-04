import CanopyX from "./index.js";
import type { TreeGrid } from "./index.js";
import type { CanopyColumn, CanopyLabels, Cell, CellValue, SortDirection, TimeZone } from "./protocol.js";
import type { HostOptions } from "./hosts.js";
export * from "./index.js";

/** A stable record identity and typed cells. Flat records have no tree fields. */
export interface GridRow { id: string; cells: Record<string, Cell>; }
/** An immutable record projected onto the declared export columns. */
export interface GridExportRow { readonly id: string; readonly cells: Readonly<Record<string, Readonly<Cell>>>; }
export type GridColumn = Omit<CanopyColumn, "editable"> & { editable?: false };
export interface GridSort { readonly column: string; readonly direction: SortDirection; }
export type GridFilter = {
  readonly column: string;
  readonly operator: "eq" | "ne" | "contains" | "startsWith" | "in" | "gt" | "ge" | "lt" | "le";
  readonly values: readonly Exclude<CellValue, null>[];
} | { readonly column: string; readonly operator: "isNull" | "isNotNull"; readonly values: readonly []; };

/** A nonempty nested expression: at most eight levels, 64 groups and 64 total predicates including flat filters. */
export interface GridFilterGroup {
  readonly operator: "and" | "or";
  readonly filters: readonly GridFilter[];
  readonly groups: readonly GridFilterGroup[];
}

/** A frozen accepted query. Sorting/filtering cover the entire source before the requested window. */
export interface GridQuery {
  readonly protocol: "canopyx/2";
  readonly type: "gridQuery";
  readonly view: string;
  readonly revision?: string;
  readonly offset: number;
  readonly limit: number;
  readonly search: string;
  /** Absent preserves substring matching; words matches all words/quoted phrases across searchable cells. */
  readonly searchMode?: "substring" | "words";
  readonly sort: readonly GridSort[];
  readonly filters: readonly GridFilter[];
  /** Combined with search and flat filters using AND. */
  readonly filterGroup?: GridFilterGroup;
}
export type GridQueryInput = Partial<GridQuery>;

interface GridDefinition {
  protocol: "canopyx/2";
  type: "grid";
  id: string;
  label: string;
  columns: GridColumn[];
  rowHeight: number;
  pageSize: number;
  /** Presentation only; pageSize remains the source fetch size. */
  presentation?: "continuous" | "paged";
  pageLength?: number;
  selection: "none" | "single" | "multiple";
  search: boolean;
  /** Search-input debounce (0..5000). Absent uses 0 for inline and 300 for host sources. */
  searchDelayMs?: number;
  /** Unique declared IDs; absent searches every column, including hidden columns. */
  searchColumns?: string[];
  stateKey?: string;
  timeZone?: TimeZone;
  labels?: Partial<CanopyLabels>;
  query?: GridQuery;
}
export interface InlineGridView extends GridDefinition { source: { kind: "inline"; navigation?: "offset" }; rows: GridRow[]; }
export interface HostGridView extends GridDefinition { source: { kind: "host"; navigation?: "offset" }; rows?: never; }
export type GridView = InlineGridView | HostGridView;

/** A complete requested window from one dataset revision, with full and matching counts. */
export interface GridPage {
  protocol: "canopyx/2";
  type: "gridPage";
  view: string;
  revision: string;
  offset: number;
  total: number;
  matched: number;
  items: GridRow[];
}
/** Hosts own data access, authorization and query execution; cancellation does not grant write authority. */
export interface GridSource { readonly navigation?: "offset"; query(query: GridQuery, options: { signal: AbortSignal }): GridPage | PromiseLike<GridPage>; }
/** Accepted presentation; indices are zero based, while the visible range is one based (0–0 when empty). */
export interface GridPaging {
  readonly presentation: "continuous" | "paged";
  readonly pageLength: number;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly first: number;
  readonly last: number;
  readonly matched: number;
  readonly total: number;
}
export interface GridQueryEvent { query: GridQuery; revision: string; total: number; matched: number; }
/** Exports retain the accepted revision, query ordering, columns and selected IDs at invocation. */
export interface GridExportRequest {
  readonly scope: "filtered" | "selected" | "all";
  readonly query: GridQuery;
  readonly revision: string;
  readonly total: number;
  readonly matched: number;
  readonly selection: readonly string[];
  readonly columns: readonly { readonly id: string; readonly title: string; readonly kind: "text" | "number" | "datetime" }[];
  readonly values: "raw" | "display";
  readonly timeZone: TimeZone;
}
export interface GridExportOptions {
  scope: GridExportRequest["scope"];
  /** Defaults to visible columns in their current order. */
  columns?: string[];
  values?: GridExportRequest["values"];
  signal?: AbortSignal;
  /** Client CSV defaults to 50000; clipboard to 10000. Larger results use a host hook. */
  maxRows?: number;
}
export interface GridExport {
  readonly request: GridExportRequest;
  /** Each enumeration requests fresh serial windows from the captured revision, independently of the viewport. */
  rows(): AsyncIterable<GridExportRow>;
}
export interface GridCellContext { column: string; index: number; }
/** Versioned view settings. Queries omit dataset revisions; restoration revalidates against the current source. */
export interface GridState {
  version: 1;
  view: string;
  columns: { id: string; width: number; hidden: boolean }[];
  query: GridQuery;
  timeZone: TimeZone;
  selection: string[];
  scrollTop: number;
  /** Optional for compatibility with existing continuous snapshots; restored offsets clamp to current results. */
  paging?: { pageLength: number; offset: number };
}
export interface GridHostOptions {
  /** False lets a host compose controls around the same grid controller. */
  toolbar?: boolean;
  /** Overrides the view's search-input debounce (0..5000); Enter always applies immediately. */
  searchDelayMs?: number;
  source?: GridSource;
  labels?: Partial<CanopyLabels>;
  renderers?: Record<string, (row: GridRow, element: HTMLElement, context: GridCellContext) => boolean | void>;
  cachePageLimit?: number;
  requestTimeoutMs?: number;
  onQuery?: (event: GridQueryEvent) => void;
  onSelect?: (event: { ids: string[] }) => void;
  onError?: (event: { error: Error }) => void;
  onState?: (event: { query: GridQuery | null; state: GridState }) => void;
  /** Hosts govern Office generation, authorization and delivery. CanopyX performs no domain write. */
  onExport?: (event: { format: string; request: GridExportRequest; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Hosts compose a drawer or details view and restore returnFocus when it closes. */
  onDetails?: (event: { row: GridExportRow; query: GridQuery; signal: AbortSignal; returnFocus: Element | null }) => void | PromiseLike<void>;
}
export type GridOptions = GridHostOptions & ({ view: InlineGridView } | { view: HostGridView; source: GridSource });

/** Presentation controller. Selection uses stable IDs independently of cached or visible rows. */
export interface DataGrid {
  readonly element: HTMLElement;
  readonly view: GridView;
  readonly ready: Promise<GridQuery>;
  getQuery(): GridQuery | null;
  setQuery(query: GridQueryInput): Promise<GridQuery>;
  sort(sorts: readonly GridSort[]): Promise<GridQuery>;
  getPaging(): GridPaging;
  goToPage(index: number): Promise<GridQuery>;
  setPageLength(length: number): Promise<GridQuery>;
  setColumnWidth(id: string, width: number): void;
  setColumnVisible(id: string, visible: boolean): void;
  setColumnOrder(ids: string[]): void;
  getState(): GridState;
  setState(state: GridState): Promise<GridQuery>;
  resetView(): Promise<GridQuery>;
  getSavedViews(): string[];
  saveView(name: string): void;
  applySavedView(name: string): Promise<GridQuery>;
  removeSavedView(name: string): void;
  setTimeZone(zone: TimeZone): void;
  getTimeZone(): TimeZone;
  getSelection(): string[];
  setSelection(ids: string[]): void;
  clearSelection(): void;
  prepareExport(options: GridExportOptions): GridExport;
  toCsv(options: GridExportOptions): Promise<string>;
  copy(options: GridExportOptions): Promise<string>;
  exportToHost(format: string, options: GridExportOptions): Promise<void>;
  /** Details are opened for loaded records, by toolbar, double click or Ctrl/Command+Enter. */
  openDetails(id: string): Promise<void>;
  focus(): void;
  /** Reveals a zero-based position in the accepted result without taking DOM focus from a host drawer. */
  scrollToRow(index: number): Promise<void>;
  retry(): Promise<GridQuery | void>;
  refresh(): void;
  destroy(): void;
}
/** Requires a browser DOM. The grid runtime also hosts both existing tree variants. */
export function createDataGrid(host: HTMLElement, options: GridOptions): DataGrid;
/** Registers options before either a tree or flat-grid fragment mounts. */
export function configure(viewId: string, options: HostOptions | GridHostOptions): () => void;
/** Mounts tree and flat-grid fragments below root. Narrow a controller before using view-specific methods. */
export function mount(root?: ParentNode): Array<TreeGrid | DataGrid>;

declare const gridRuntime: Omit<typeof CanopyX, "configure" | "mount"> & { createDataGrid: typeof createDataGrid; configure: typeof configure; mount: typeof mount };
export default gridRuntime;
