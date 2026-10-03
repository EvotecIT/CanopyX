import CanopyX from "./index.js";
import type { CanopyColumn, CanopyLabels, Cell, CellValue, SortDirection, TimeZone } from "./protocol.js";
import type { HostOptions } from "./hosts.js";
export * from "./index.js";

/** A stable record identity and typed cells. Flat records have no tree fields. */
export interface GridRow { id: string; cells: Record<string, Cell>; }
export type GridColumn = Omit<CanopyColumn, "editable"> & { editable?: false };
export interface GridSort { readonly column: string; readonly direction: SortDirection; }
export type GridFilter = {
  readonly column: string;
  readonly operator: "eq" | "ne" | "contains" | "startsWith" | "in" | "gt" | "ge" | "lt" | "le";
  readonly values: readonly Exclude<CellValue, null>[];
} | { readonly column: string; readonly operator: "isNull" | "isNotNull"; readonly values: readonly []; };

/** A frozen accepted query. Sorting/filtering cover the entire source before the requested window. */
export interface GridQuery {
  readonly protocol: "canopyx/2";
  readonly type: "gridQuery";
  readonly view: string;
  readonly revision?: string;
  readonly offset: number;
  readonly limit: number;
  readonly search: string;
  readonly sort: readonly GridSort[];
  readonly filters: readonly GridFilter[];
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
  selection: "none" | "single" | "multiple";
  search: boolean;
  stateKey?: string;
  timeZone?: TimeZone;
  labels?: Partial<CanopyLabels>;
  query?: GridQuery;
}
export interface InlineGridView extends GridDefinition { source: { kind: "inline" }; rows: GridRow[]; }
export interface HostGridView extends GridDefinition { source: { kind: "host" }; rows?: never; }
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
export interface GridSource { query(query: GridQuery, options: { signal: AbortSignal }): GridPage | PromiseLike<GridPage>; }
export interface GridQueryEvent { query: GridQuery; revision: string; total: number; matched: number; }
export interface GridCellContext { column: string; index: number; }
export interface GridHostOptions {
  source?: GridSource;
  labels?: Partial<CanopyLabels>;
  renderers?: Record<string, (row: GridRow, element: HTMLElement, context: GridCellContext) => boolean | void>;
  cachePageLimit?: number;
  requestTimeoutMs?: number;
  onQuery?: (event: GridQueryEvent) => void;
  onSelect?: (event: { ids: string[] }) => void;
  onError?: (event: { error: Error }) => void;
  onState?: (event: { query: GridQuery | null }) => void;
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
  setColumnWidth(id: string, width: number): void;
  setColumnVisible(id: string, visible: boolean): void;
  setTimeZone(zone: TimeZone): void;
  getTimeZone(): TimeZone;
  getSelection(): string[];
  setSelection(ids: string[]): void;
  clearSelection(): void;
  focus(): void;
  retry(): Promise<GridQuery | void>;
  refresh(): void;
  destroy(): void;
}
/** Requires a browser DOM. The grid runtime also hosts both existing tree variants. */
export function createDataGrid(host: HTMLElement, options: GridOptions): DataGrid;
/** Registers options before either a tree or flat-grid fragment mounts. */
export function configure(viewId: string, options: HostOptions | GridHostOptions): () => void;
declare const gridRuntime: Omit<typeof CanopyX, "configure"> & { createDataGrid: typeof createDataGrid; configure: typeof configure };
export default gridRuntime;
