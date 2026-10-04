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
/** Code-unit collation; natural digit runs never convert to floating-point numbers. */
export interface GridOrdering {
  readonly text: "ordinal" | "foldedOrdinal" | "natural" | "foldedNatural";
  /** At most 512 distinct values after selected folding; remaining values follow declared categories. */
  readonly categories?: readonly string[];
}
/** Safe DOM presentations; raw values retain their search, ordering and export meanings. */
export type GridPresenter =
  | { readonly kind: "link"; readonly hrefColumn?: string; readonly newWindow?: boolean }
  | { readonly kind: "icon"; readonly glyph: string }
  | { readonly kind: "progress"; readonly maximum: number }
  | { readonly kind: "boolean" }
  | { readonly kind: "list"; readonly separator: string; readonly limit: number }
  | { readonly kind: "longText" };
/** Include the reporting entry point when this optional capability set is present. */
export interface GridReporting {
  /** Fixed first ordering key. Group headings and collapse never change record paging/counts/exports. */
  readonly grouping?: GridSort;
  /** At most 32 generic aggregates over raw full-query and full-group values. */
  readonly aggregates?: readonly GridAggregate[];
  /** Adds row checkboxes and explicit page/all-matching selection controls. Requires an enabled selection mode. */
  readonly selectionControls?: boolean;
  /** Session preferences by default; local storage requires an explicit stateKey and retains sensitive query settings. */
  readonly viewStorage?: "session" | "local";
  readonly columnReorder?: boolean;
  readonly responsive?: boolean;
  /** Pins are temporarily suspended to leave this many CSS pixels for the center; default 128, range 40..4096. */
  readonly minimumCenterWidth?: number;
  readonly layout?: Readonly<Record<string, GridColumnLayout>>;
  readonly ordering?: Readonly<Record<string, GridOrdering>>;
  /** Header buttons open the complete-query filter editor. */
  readonly headerFilters?: boolean;
  /** Offer a bounded nested AND/OR editor over the accepted query's filterGroup. */
  readonly filterGroups?: boolean;
  /** Full accepted-query values/counts. Hosted grids require an explicit source facet capability. */
  readonly facetColumns?: readonly string[];
  /** Declared column identities; an explicit custom renderer takes precedence. */
  readonly presenters?: Readonly<Record<string, GridPresenter>>;
}
/** CSS pixel bounds and a weight from zero to 100 for unused viewport space. Manual sizing disables flex until reset/state restoration. */
export type GridColumnPin = "none" | "left" | "right";
export interface GridColumnLayout {
  readonly minimum: number; readonly maximum: number; readonly flex?: number;
  readonly pin?: GridColumnPin;
  /** Smaller values remain visible longer; equal priorities hide from the end of current order. */
  readonly priority?: number;
  /** Retain unless explicitly hidden by the user. */
  readonly alwaysVisible?: boolean;
}
/** Effective layout is distinct from saved intent; responsive fields retain query and explicit export meanings. */
export interface GridColumnPlacement {
  readonly id: string; readonly requestedPin: GridColumnPin; readonly pin: GridColumnPin;
  readonly visible: boolean; readonly responsiveHidden: boolean; readonly width: number;
}
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
/** Sequential host query. Tokens require their issuing revision; there is no random-access offset. */
export interface GridCursorQuery extends Omit<GridQuery, "type" | "offset"> {
  readonly type: "gridCursorQuery";
  readonly cursor?: string;
}
export type AcceptedGridQuery = GridQuery | GridCursorQuery;
export type GridQueryInput<Q extends AcceptedGridQuery = GridQuery> = Partial<Q>;
type GridCount<Q extends AcceptedGridQuery> = Q extends GridCursorQuery ? number | null : number;

interface GridDefinition<Q extends AcceptedGridQuery = GridQuery> {
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
  reporting?: GridReporting;
  stateKey?: string;
  timeZone?: TimeZone;
  labels?: Partial<CanopyLabels>;
  query?: Q;
}
export interface InlineGridView extends GridDefinition { source: { kind: "inline"; navigation?: "offset" }; rows: GridRow[]; }
export interface HostGridView extends GridDefinition { source: { kind: "host"; navigation?: "offset" }; rows?: never; }
export interface CursorGridView extends GridDefinition<GridCursorQuery> {
  source: { kind: "host"; navigation: "cursor" };
  presentation: "paged";
  rows?: never;
}
export type GridView = InlineGridView | HostGridView | CursorGridView;

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
export interface GridFacetOptions { readonly search?: string; readonly limit?: number; readonly includeCurrentFilter?: boolean; readonly signal?: AbortSignal; }
/** Facet values/counts ignore the query window and sort; excluding the current column replaces its predicates by true. */
export interface GridFacetQuery<Q extends AcceptedGridQuery = AcceptedGridQuery> {
  readonly protocol: "canopyx/2"; readonly type: "gridFacetQuery"; readonly query: Q & { readonly revision: string };
  readonly column: string; readonly search: string; readonly limit: number; readonly includeCurrentFilter: boolean;
}
export interface GridFacetPage {
  readonly protocol: "canopyx/2"; readonly type: "gridFacetPage"; readonly view: string; readonly revision: string;
  readonly column: string; readonly search: string; readonly includeCurrentFilter: boolean;
  readonly matched: number; readonly totalValues: number; readonly truncated: boolean;
  readonly items: readonly { readonly value: CellValue; readonly count: number }[];
}
export interface GridFacetSource<Q extends AcceptedGridQuery = AcceptedGridQuery> {
  facet?(request: GridFacetQuery<Q>, options: { signal: AbortSignal }): GridFacetPage | PromiseLike<GridFacetPage>;
}
export interface GridSource extends GridFacetSource<GridQuery> {
  readonly navigation?: "offset";
  query(query: GridQuery, options: { signal: AbortSignal }): GridPage | PromiseLike<GridPage>;
  /** Complete-query metadata, echoing the normalized accepted request, revision and matched count. */
  summary?(query: GridQuery & { readonly revision: string }, options: { signal: AbortSignal }): GridSummary | PromiseLike<GridSummary>;
}
export interface GridAggregate {
  readonly id: string; readonly column: string; readonly label: string;
  readonly operation: "count" | "sum" | "average" | "minimum" | "maximum";
}
export interface GridGroup {
  readonly key: string; readonly value: CellValue; readonly offset: number; readonly count: number;
  readonly aggregates: Readonly<Record<string, number | null>>;
}
export interface GridSummary {
  readonly protocol: "canopyx/2"; readonly type: "gridSummary"; readonly view: string; readonly revision: string;
  readonly query: GridQuery & { readonly revision: string }; readonly matched: number;
  readonly groups: readonly GridGroup[]; readonly aggregates: Readonly<Record<string, number | null>>;
}
/** One complete visible page. Null counts remain unknown; ordinal positions do not grant random access. */
export interface GridCursorPage extends Omit<GridPage, "type" | "total" | "matched"> {
  type: "gridCursorPage";
  total: number | null;
  matched: number | null;
  nextCursor?: string;
  previousCursor?: string;
}
export interface GridCursorSource extends GridFacetSource<GridCursorQuery> {
  readonly navigation: "cursor";
  query(query: GridCursorQuery, options: { signal: AbortSignal }): GridCursorPage | PromiseLike<GridCursorPage>;
}
/** Accepted presentation; indices are zero based, while the visible range is one based (0–0 when empty). */
export interface GridPaging<Q extends AcceptedGridQuery = GridQuery> {
  readonly presentation: "continuous" | "paged";
  readonly pageLength: number;
  readonly navigation?: Q extends GridCursorQuery ? "cursor" : "offset";
  readonly pageIndex: Q extends GridCursorQuery ? null : number;
  readonly pageCount: Q extends GridCursorQuery ? null : number;
  readonly first: number;
  readonly last: number;
  readonly matched: GridCount<Q>;
  readonly total: GridCount<Q>;
  readonly hasNext?: boolean;
  readonly hasPrevious?: boolean;
}
export interface GridQueryEvent<Q extends AcceptedGridQuery = GridQuery> { query: Q; revision: string; total: GridCount<Q>; matched: GridCount<Q>; }
/** A bounded selection of stable IDs, or an ephemeral complete accepted query with explicit exclusions. */
export type GridSelection<Q extends AcceptedGridQuery = GridQuery> =
  | { readonly kind: "ids"; readonly revision: string | null; readonly ids: readonly string[] }
  | GridQuerySelection<Q>;
export interface GridQuerySelection<Q extends AcceptedGridQuery = GridQuery> {
  readonly kind: "query";
  readonly query: Q;
  readonly revision: string;
  readonly matched: GridCount<Q>;
  readonly excludedIds: readonly string[];
}
/** Exports retain the accepted revision, query ordering, columns and selected IDs at invocation. */
export interface GridExportRequest<Q extends AcceptedGridQuery = GridQuery> {
  readonly scope: "filtered" | "selected" | "all";
  readonly query: Q;
  readonly revision: string;
  readonly total: GridCount<Q>;
  readonly matched: GridCount<Q>;
  readonly selection: readonly string[];
  /** All-matching selected exports keep these accepted criteria. Hosts validate them rather than treating an empty ID list as empty selection. */
  readonly querySelection?: GridQuerySelection<Q>;
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
export interface GridExport<Q extends AcceptedGridQuery = GridQuery> {
  readonly request: GridExportRequest<Q>;
  /** Each enumeration requests fresh serial windows from the captured revision, independently of the viewport. */
  rows(): AsyncIterable<GridExportRow>;
}
export interface GridCellContext { column: string; index: number; }
/** Versioned view settings. Queries omit dataset revisions; restoration revalidates against the current source. */
export interface GridState<Q extends AcceptedGridQuery = GridQuery> {
  version: 1;
  view: string;
  columns: { id: string; width: number; hidden: boolean; flex?: boolean; pin?: GridColumnPin }[];
  query: Q;
  timeZone: TimeZone;
  selection: string[];
  scrollTop: number;
  /** Reporting grouping only. At most 10000 bounded stable keys; omitted from shareable state. */
  collapsedGroups?: string[];
  /** Optional for compatibility with existing continuous snapshots; restored offsets clamp to current results. */
  paging?: { pageLength: number; offset: number };
}
/** Versioned, bounded preference envelope. Revisions/cursors belong to data, never durable settings. */
export type GridPreferenceQuery<Q extends AcceptedGridQuery = GridQuery> = Readonly<Omit<Q, "revision" | "cursor">> & {
  readonly revision?: never;
  readonly cursor?: never;
};
export type GridPreferenceState<Q extends AcceptedGridQuery = GridQuery> = Readonly<Omit<GridState<Q>, "columns" | "selection" | "paging" | "query">> & {
  readonly query: GridPreferenceQuery<Q>;
  readonly columns: readonly Readonly<GridState<Q>["columns"][number]>[];
  readonly selection: readonly string[];
  readonly paging?: Readonly<{ pageLength: number; offset: number }>;
};
export interface GridViewSettings<Q extends AcceptedGridQuery = GridQuery> {
  readonly version: 1;
  readonly view: string;
  readonly current?: GridPreferenceState<Q>;
  readonly views: readonly { readonly name: string; readonly state: GridPreferenceState<Q> }[];
  readonly defaultView?: string;
}
/** Hosts authenticate preference access and honor cancellation. Saves are serial/coalesced per grid instance. */
export interface GridViewStore<Q extends AcceptedGridQuery = GridQuery> {
  load(event: { key: string; view: string; signal: AbortSignal }): GridViewSettings<Q> | null | PromiseLike<GridViewSettings<Q> | null>;
  save(event: { key: string; view: string; settings: GridViewSettings<Q>; signal: AbortSignal }): void | PromiseLike<void>;
}
interface GridHostBehavior<Q extends AcceptedGridQuery = GridQuery> {
  /** False lets a host compose controls around the same grid controller. */
  toolbar?: boolean;
  /** Overrides the view's search-input debounce (0..5000); Enter always applies immediately. */
  searchDelayMs?: number;
  source?: Q extends GridCursorQuery ? GridCursorSource : GridSource;
  labels?: Partial<CanopyLabels>;
  renderers?: Record<string, (row: GridRow, element: HTMLElement, context: GridCellContext) => boolean | void>;
  cachePageLimit?: number;
  requestTimeoutMs?: number;
  onQuery?: (event: GridQueryEvent<Q>) => void;
  onSelect?: (event: { ids: string[]; selection?: GridSelection<Q> }) => void;
  onError?: (event: { error: Error }) => void;
  onState?: (event: { query: Q | null; state: GridState<Q> }) => void;
  /** Hosts govern Office generation, authorization and delivery. CanopyX performs no domain write. */
  onExport?: (event: { format: string; request: GridExportRequest<Q>; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Hosts compose a drawer or details view and restore returnFocus when it closes. */
  onDetails?: (event: { row: GridExportRow; query: Q; signal: AbortSignal; returnFocus: Element | null }) => void | PromiseLike<void>;
}
/** A host store binds to an explicit keyed reporting definition; ordinary grids have no store option. */
export type GridHostOptions<Q extends AcceptedGridQuery = GridQuery> = GridHostBehavior<Q> & (
  { viewStore?: never } | {
    viewStore: GridViewStore<Q>;
    view: (Q extends GridCursorQuery ? CursorGridView : InlineGridView | HostGridView) & { stateKey: string; reporting: GridReporting };
  }
);
export type GridOptions = GridHostOptions & ({ view: InlineGridView } | { view: HostGridView; source: GridSource });
export type CursorGridOptions = GridHostOptions<GridCursorQuery> & { view: CursorGridView; source: GridCursorSource };

/** Presentation controller. Selection uses stable IDs independently of cached or visible rows. */
export interface DataGrid<Q extends AcceptedGridQuery = GridQuery> {
  readonly element: HTMLElement;
  readonly view: GridView;
  readonly ready: Promise<Q>;
  getQuery(): Q | null;
  setQuery(query: GridQueryInput<Q>): Promise<Q>;
  sort(sorts: readonly GridSort[]): Promise<Q>;
  getPaging(): GridPaging<Q>;
  /** Offset sources only. Cursor sources reject random page access. */
  goToPage(index: number): Promise<Q>;
  firstPage(): Promise<Q>;
  previousPage(): Promise<Q>;
  nextPage(): Promise<Q>;
  setPageLength(length: number): Promise<Q>;
  setColumnWidth(id: string, width: number): void;
  /** Reporting runtime only: samples at most 200 cached accepted-query records and 2048 display code units per value, capped at 800 CSS pixels before declared constraints. No fetching or viewport scraping. */
  autoFitColumn?(id: string): Readonly<{ width: number; sampled: number; scope: "loaded" }>;
  setColumnPinned?(id: string, pin: GridColumnPin): void;
  getColumnLayout?(): readonly GridColumnPlacement[];
  /** Reporting runtime only: revisioned, bounded full-query aggregation. Never reads the viewport cache for counts. */
  getFacets?(column: string, options?: GridFacetOptions): Promise<GridFacetPage>;
  setColumnVisible(id: string, visible: boolean): void;
  setColumnOrder(ids: string[]): void;
  getState(): GridState<Q>;
  setState(state: GridState<Q> | GridPreferenceState<Q>): Promise<Q>;
  resetView(): Promise<Q>;
  getSavedViews(): string[];
  saveView(name: string): void;
  applySavedView(name: string): Promise<Q>;
  removeSavedView(name: string): void;
  /** Reporting runtime only: bounded, versioned preferences including current and named view snapshots. */
  getViewSettings?(): GridViewSettings<Q>;
  getDefaultView?(): string | null;
  setDefaultView?(name: string | null): void;
  renameSavedView?(oldName: string, newName: string): void;
  /** Reporting runtime only. Omits search, filters, selection, revision, cursor, page offset and scroll position. */
  getShareState?(): GridPreferenceState<Q>;
  /** Waits for serial/coalesced host saves; persistence failures leave the current grid usable and reject this call. */
  flushViewSettings?(): Promise<void>;
  /** Requires reporting selection controls: immutable IDs or accepted-query selection, never persisted in a saved view. */
  getSelectionDescriptor?(): GridSelection<Q>;
  /** Reporting summary capability only; null before acceptance. */
  getSummary?(): GridSummary | null;
  /** Flat grouping only. Collapse affects display; record query/selection/export scope remain intact. */
  setGroupCollapsed?(key: string, collapsed: boolean): void;
  getCollapsedGroups?(): string[];
  /** Requires selection controls and multiple selection. Query/revision changes retire this scope; paging preserves it. */
  selectAllMatching?(): void;
  /** Selects/deselects the full accepted page, including records outside the mounted viewport. */
  selectPage?(selected?: boolean, options?: { signal?: AbortSignal }): Promise<GridSelection<Q>>;
  /** Selects/deselects a currently loaded accepted record. */
  setRowSelected?(id: string, selected: boolean): void;
  /** Offset positions span accepted pages; cursor positions stay on the accepted page. At most 10000 records/IDs/exclusions. */
  selectRange?(start: number, end: number, options?: { selected?: boolean; additive?: boolean; signal?: AbortSignal }): Promise<GridSelection<Q>>;
  setTimeZone(zone: TimeZone): void;
  getTimeZone(): TimeZone;
  /** Explicit identities only. Throws in query-selection mode; use getSelectionDescriptor instead. */
  getSelection(): string[];
  setSelection(ids: string[]): void;
  clearSelection(): void;
  prepareExport(options: GridExportOptions): GridExport<Q>;
  toCsv(options: GridExportOptions): Promise<string>;
  copy(options: GridExportOptions): Promise<string>;
  exportToHost(format: string, options: GridExportOptions): Promise<void>;
  /** Details are opened for loaded records, by toolbar, double click or Ctrl/Command+Enter. */
  openDetails(id: string): Promise<void>;
  focus(): void;
  /** Reveals a zero-based position in the accepted result without taking DOM focus from a host drawer. */
  scrollToRow(index: number): Promise<void>;
  retry(): Promise<Q | void>;
  refresh(): void;
  destroy(): void;
}
/** Requires a browser DOM. The grid runtime also hosts both existing tree variants. */
export function createDataGrid(host: HTMLElement, options: GridOptions): DataGrid;
export function createDataGrid(host: HTMLElement, options: CursorGridOptions): DataGrid<GridCursorQuery>;
/** Registers options before either a tree or flat-grid fragment mounts. */
export function configure(viewId: string, options: HostOptions | GridHostOptions | GridHostOptions<GridCursorQuery>): () => void;
/** Mounts tree and flat-grid fragments below root. Narrow a controller before using view-specific methods. */
export function mount(root?: ParentNode): Array<TreeGrid | DataGrid<AcceptedGridQuery>>;

declare const gridRuntime: Omit<typeof CanopyX, "configure" | "mount"> & { createDataGrid: typeof createDataGrid; configure: typeof configure; mount: typeof mount };
export default gridRuntime;
