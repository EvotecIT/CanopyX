import CanopyX from "./index.js";
import type { TreeGrid } from "./index.js";
import type { CanopyColumn, CanopyLabels, Cell, CellValue, SortDirection, TimeZone } from "./protocol.js";
import type { HostOptions, ExportFormat, ExportFormatOptions, ExportFormatResult } from "./hosts.js";
import type { CanopyPlugin } from "./plugins.js";
import type { GridExportFormat, GridFormatOptions, GridFormatRule } from "./formatting.js";
export * from "./index.js";
export * from "./formatting.js";

/** A stable record identity and typed cells. Flat records have no tree fields. */
export interface GridRow { id: string; cells: Record<string, Cell>; tone?: string; className?: string; }
/** First match wins separately for the row and each condition-column cell; raw filter semantics apply. */
export type GridHighlightRule = GridFilter & { target?: "row" | "cell" } &
  ({ tone: string; className?: string } | { tone?: string; className: string });
/** Portable cell semantics, independent of DOM renderers and stylesheet rules. Datetime values retain the original ISO string and its explicit time zone and precision. */
export interface GridExportCell {
  readonly value: CellValue;
  readonly text: string;
  readonly tone?: string;
  readonly link?: { readonly target: string; readonly tooltip?: string };
  /** The cell's conditional formatting, present when the grid has rules that format it. CSV reads only value and text. */
  readonly format?: GridExportFormat;
  /** Unsupported presentation must be rejected by strict adapters or explicitly accepted as text-only. */
  readonly diagnostics?: readonly string[];
}
/** An immutable record projected onto the declared export columns. Group headings and summaries are not records. */
export interface GridExportRow {
  readonly id: string; readonly cells: Readonly<Record<string, GridExportCell>>;
  readonly tone?: string; readonly diagnostics?: readonly string[];
  /** The record's row formatting, present when a row rule matched it. */
  readonly format?: GridExportFormat;
}
/** Captured column intent. Hosts map semantic tones and CSS pixel widths into their output format. */
export interface GridExportColumn {
  readonly id: string; readonly title: string; readonly kind: "text" | "number" | "datetime";
  /** Reporting runtime only. */
  readonly width?: { readonly unit: "css-px"; readonly preferred: number; readonly minimum: number; readonly maximum?: number };
  readonly wrap?: boolean; readonly alignment?: "left" | "right";
  readonly presenter?: GridPresenter;
  readonly diagnostics?: readonly string[];
}
export type GridColumn = Omit<CanopyColumn, "editable" | "width"> & {
  editable?: false; wrap?: boolean;
  /** Declarative presentation; explicit host renderers take precedence. */
  presenter?: GridPresenter;
  /** Include selected numeric values in the optional status bar. */
  aggregatable?: boolean;
  /** Record drawer section label. */
  section?: string;
  /** Preferred width; the column grows to its header and loaded content. Omit to use the content width. Saved user widths take precedence. */
  width?: number;
  /** Wire documents retain a numeric width and set this flag for initial content fitting. */
  autoWidth?: boolean;
  /** The width is hard: it neither grows nor shrinks. Requires width. */
  fixed?: boolean;
  minWidth?: number;
  /** Widest width and the content measuring cap (default cap 420). */
  maxWidth?: number;
  /** Share of spare width (0..100), given before the identity column. */
  flex?: number;
  autoSize?: "content" | "header" | "none";
  /** How the column gives way when narrow. Integers rank responsive priority: 0-1 essential, 10000+ optional. */
  priority?: GridColumnPriority;
  /** Requested edge; null unpins. Omitted: the identity column pins left. */
  pinned?: "left" | "right" | null;
  /** Marks the identity column; defaults to the first column. */
  rowHeader?: boolean;
  /** Retain this column during responsive fitting; explicit user hiding still applies. */
  alwaysVisible?: boolean;
  /** Hover tooltip: "auto" shows a cell's full value while it is cut off; a declared column id shows that column's text. */
  tooltip?: string;
};
export type GridColumnPriority = "essential" | "normal" | "optional" | number;
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
  | { readonly kind: "progress"; readonly maximum: number; readonly thresholds?: readonly GridThreshold[] }
  | { readonly kind: "boolean"; readonly inverted?: boolean }
  | { readonly kind: "list"; readonly separator: string; readonly limit: number }
  | { readonly kind: "longText"; readonly mono?: boolean }
  | { readonly kind: "enum" | "state"; readonly tones?: Readonly<Record<string,string>>; /** Tones shown as plain text instead of a chip or dot. */ readonly quietTones?: readonly string[]; /** Quiet values muted (default) or in the normal text colour. */ readonly quietStyle?: "muted" | "plain" }
  | { readonly kind: "change"; readonly deltaColumn: string; readonly higherIsGood?: boolean }
  | { readonly kind: "statusStrip" | "missing" }
  | ({ readonly kind: "sparklineBars" | "sparklineLine" } & GridHistoryPresentation)
  | { readonly kind: "identifier"; readonly secondaryColumn?: string; readonly mono?: boolean }
  | { readonly kind: "tags"; readonly separator: string; readonly limit?: 3 };
/** Ascending inclusive upper bounds; unmatched values use cell tones. */
export interface GridThreshold { readonly upperBound: number; readonly tone: string; }
/** Both shared scale bounds must be supplied together; otherwise each cell scales independently. */
export interface GridHistoryPresentation {
  readonly minimum?: number; readonly scaleMaximum?: number; readonly thresholds?: readonly GridThreshold[];
  readonly higherIsGood?: boolean; readonly mark?: "worst" | "last";
}
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
  /** Accepted for existing hosts: column menus offer Filter…, and a filter button appears only on a filtered column. */
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
  /** False whenever the column is out of view; hiddenReason says why. */
  readonly visible: boolean;
  /** null when shown; "user" when hidden by the reader or host, "priority" when it gave way to the width or a responsive
   * policy, "phone" when the phone layout (640 px and below) hid a normal column. */
  readonly hiddenReason: GridColumnHiddenReason | null;
  /** True only for the reporting.responsive policy; kept for existing hosts. */
  readonly responsiveHidden: boolean; readonly width: number;
}
export type GridColumnHiddenReason = "user" | "priority" | "phone";
/** Per-control toolbar switches; an absent switch keeps its control, and a control switched off is not built. */
export interface GridToolbarControls {
  /** Filters menu. */
  filters?: boolean;
  /** Columns menu. */
  columns?: boolean;
  /** Saved views menu with Reset view. */
  views?: boolean;
  /** Export menu. */
  export?: boolean;
  /** More menu: host actions, Record details and Print. */
  more?: boolean;
  /** Each header's column menu button; switched off, column fitting keeps no room for it. */
  columnMenus?: boolean;
  /** Result count shown with the query chips. */
  count?: boolean;
}
/** Runtime switches add the search box; documents keep it in the view's search property. */
export interface GridToolbarOptions extends GridToolbarControls {
  search?: boolean;
}
/** The reporting runtime's host slots in toolbar order; afterSearch follows start directly when there is no search box, and
 * end starts the right-hand group before Export and the more menu. */
export type GridToolbarSlot = "start" | "afterSearch" | "afterViews" | "end";
/** A more-menu entry: a handler, or (reporting runtime) host content disclosed inside the menu. */
export type GridAction<Q extends AcceptedGridQuery = GridQuery> =
  | { label: string; run: (event: { query: Q | null; signal: AbortSignal; api: DataGrid<Q> }) => void | PromiseLike<void>; render?: never }
  /** render fills container on the entry's first open (and again after a render that threw); close() closes the menu and
   * focuses its button; signal aborts when the grid is destroyed. */
  | { label: string; render: (container: HTMLElement, context: { close(): void; signal: AbortSignal }) => void; run?: never };
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
  /** Fixed CSS pixel height (20..64), or content measurement. Fixed is the default writer behavior. */
  rowHeight?: number | "auto";
  /** Graphite spacing; an explicit rowHeight remains authoritative. */
  density?: "compact" | "default" | "comfortable";
  /** Subtle alternate-row backgrounds. Off by default. */
  zebra?: boolean;
  /** Host-owned plural noun, such as "servers". */
  noun?: string;
  /** Host-owned explanation for an empty source. */
  emptyReason?: string;
  /** Optional result and selected-record counts. */
  statusBar?: boolean;
  /** Per-control toolbar switches (the search box is the search property). */
  toolbar?: GridToolbarControls;
  /** Ids of browser-registered export formats the Export menu offers after CSV, in order; an id the page does not register is skipped. */
  exportFormats?: string[];
  /** A grid whose rows fit is as tall as its rows (default true). */
  autoHeight?: boolean;
  /** What a plain row click does; it never selects (default "none"). */
  rowAction?: "none" | "details" | "link";
  /** Draw a row tone as a bar at the row start (default false). */
  rowAccents?: boolean;
  /** Wire documents retain numeric rowHeight and enable measurement with this optional flag. */
  autoRowHeight?: boolean;
  /** Minimum and estimate for the rowHeight: "auto" API shorthand (20..64, default 28). */
  estimatedRowHeight?: number;
  /** At most 64 ordered rules; a tone or className is required on each rule. */
  highlightRules?: readonly GridHighlightRule[];
  /** At most 64 conditional formatting rules in priority order; the formatting part evaluates them (docs/conditional-formatting.md). */
  formatRules?: readonly GridFormatRule[];
  /** The legend and the rule editor. */
  formatting?: GridFormatOptions;
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
  /** Host-owned complete-group display values; rendered with column presenters, excluded from record queries and exports. */
  readonly cells?: Readonly<Record<string, Cell>>;
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
  /** Ordinary grids capture text only; the reporting runtime resolves semantic presentation and diagnostics. */
  readonly presentation: "text" | "semantic";
  readonly scope: "filtered" | "selected" | "all";
  readonly query: Q;
  readonly revision: string;
  readonly total: GridCount<Q>;
  readonly matched: GridCount<Q>;
  readonly selection: readonly string[];
  /** Exact captured export count, including selected-query exclusions; null means unknown. */
  readonly recordCount: number | null;
  /** All-matching selected exports keep these accepted criteria. Hosts validate them rather than treating an empty ID list as empty selection. */
  readonly querySelection?: GridQuerySelection<Q>;
  readonly columns: readonly GridExportColumn[];
  readonly values: "raw" | "display";
  readonly timeZone: TimeZone;
  /** Reporting delivery captures the canonical locale and a safe suggested basename without a format extension. */
  readonly locale?: string;
  readonly fileName?: string;
}
/** Record counts refer to the complete captured export scope, including selected-query exclusions. */
export interface GridExportProgress {
  readonly phase: "reading" | "generating" | "ready";
  readonly completed: number;
  readonly total: number | null;
}
/** The detail of canopyx:link and the argument of onLink: a link presenter cell the user follows (by click, Enter or the row's link action). */
export interface GridLinkActivation {
  readonly id: string;
  /** A frozen copy of the loaded row. */
  readonly row: Readonly<GridRow>;
  /** The id of the column whose link it is. */
  readonly column: string;
  /** The resolved address. */
  readonly href: string;
}
/** The detail of canopyx:rowActivate and the argument of onRowActivate on a flat grid. */
export interface GridRowActivation {
  readonly id: string;
  /** A frozen copy of the loaded row. */
  readonly row: Readonly<GridRow>;
  /** True for Enter or Ctrl/Command+Enter, false for a click or double click. */
  readonly keyboard: boolean;
}
export interface GridExportOptions {
  scope: GridExportRequest["scope"];
  /** Defaults to visible columns in their current order. */
  columns?: string[];
  values?: GridExportRequest["values"];
  signal?: AbortSignal;
  /** Client CSV defaults to 50000; clipboard to 10000. Larger results use a host hook. */
  maxRows?: number;
  /** Reporting runtime only. A safe basename up to 100 UTF-16 units; hosts append their format extension. */
  fileName?: string;
  /** Reporting runtime only. A browser-supported locale; display formatting is captured at invocation. */
  locale?: string;
  /** Reporting runtime only. Overrides the captured display zone without changing the view. */
  timeZone?: TimeZone;
  /** Reporting runtime only. Observational synchronous progress; a throwing callback aborts the operation. */
  onProgress?: (progress: GridExportProgress) => void;
}
/** A complete bounded snapshot for a host renderer: at most 10000 records and 4 Mi UTF-16 units. */
export interface GridExportSnapshot<Q extends AcceptedGridQuery = GridQuery> {
  readonly request: GridExportRequest<Q>;
  readonly rows: readonly GridExportRow[];
}
export interface GridExport<Q extends AcceptedGridQuery = GridQuery> {
  readonly request: GridExportRequest<Q>;
  /** Each enumeration requests fresh serial windows from the captured revision, independently of the viewport. */
  rows(options?: { signal?: AbortSignal }): AsyncIterable<GridExportRow>;
}
export interface GridCellContext {
  column: string; index: number;
  /** Aborts before replacement, recycling, failed rendering or destruction. */
  readonly signal: AbortSignal;
  /** Registers cleanup for this cell paint. Called once in reverse registration order. */
  onDispose(cleanup: () => void): void;
}
/** Versioned view settings. Queries omit dataset revisions; restoration revalidates against the current source. */
export interface GridState<Q extends AcceptedGridQuery = GridQuery> {
  version: 1;
  view: string;
  columns: { id: string; width: number; hidden: boolean; flex?: boolean; pin?: GridColumnPin; sized?: boolean; priority?: GridColumnPriority }[];
  query: Q;
  timeZone: TimeZone;
  selection: string[];
  scrollTop: number;
  /** Reporting grouping only. At most 10000 bounded stable keys; omitted from shareable state. */
  collapsedGroups?: string[];
  /** Optional for compatibility with existing continuous snapshots; restored offsets clamp to current results. */
  paging?: { pageLength: number; offset: number; allRows?: boolean };
  /** Formatting rules edited at run time, when they differ from the view's; restored with the view. */
  formatRules?: GridFormatRule[];
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
  readonly paging?: Readonly<{ pageLength: number; offset: number; allRows?: boolean }>;
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
  /** False hides the whole toolbar so a host can compose controls around the same grid controller; an object switches
   * single controls off (overriding the view's toolbar switches). Switched-off controls are not built. */
  toolbar?: boolean | GridToolbarOptions;
  /** Overrides the view's search-input debounce (0..5000); Enter always applies immediately. */
  searchDelayMs?: number;
  source?: Q extends GridCursorQuery ? GridCursorSource : GridSource;
  labels?: Partial<CanopyLabels>;
  renderers?: Record<string, (row: GridRow, element: HTMLElement, context: GridCellContext) => boolean | void>;
  cachePageLimit?: number;
  requestTimeoutMs?: number;
  /** Formats the Export menu lists after CSV: ids of registered formats or provider objects, in order. Wins over the view's exportFormats; absent offers every registered format. */
  exportFormats?: readonly (string | ExportFormat<GridExport<Q>>)[];
  /** Safety timeout for export format writers and onExport, 1..2147483647 ms (default 600000). Page reads keep requestTimeoutMs. */
  exportTimeoutMs?: number;
  onQuery?: (event: GridQueryEvent<Q>) => void;
  onSelect?: (event: { ids: string[]; selection?: GridSelection<Q> }) => void;
  onError?: (event: { error: Error }) => void;
  onColumnResize?: (event: { column: string; width: number }) => void;
  onColumnPin?: (event: { column: string; pin: GridColumnPin }) => void;
  onState?: (event: { query: Q | null; state: GridState<Q> }) => void;
  /** The grid's formatting rules changed (setFormatRules, the rule editor or a restored view); canopyx:format carries the same detail. */
  onFormat?: (event: { rules: readonly GridFormatRule[] }) => void;
  /** Hosts govern Office generation, authorization and delivery. CanopyX performs no domain write. Runs under exportTimeoutMs. */
  onExport?: (event: { format: string; request: GridExportRequest<Q>; capture: GridExport<Q>; signal: AbortSignal;
    /** Reporting runtime only. Monotonic record counts and phases; late calls after cancellation are ignored. */
    reportProgress?: (phase: GridExportProgress["phase"], completed: number) => void }) => void | PromiseLike<void>;
  /** Reporting runtime only. Render the complete snapshot through a host-owned renderer; honor cancellation before delivery. */
  onPrint?: (event: { snapshot: GridExportSnapshot<Q>; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Hosts compose a drawer or details view and restore returnFocus when it closes. */
  onDetails?: (event: { row: Readonly<GridRow>; query: Q; signal: AbortSignal; returnFocus: Element | null }) => void | PromiseLike<void>;
  /** Row activation: a double click, Enter on a focused row, Ctrl/Command+Enter in a cell, or a click with rowAction (or on a
   * phone). Runs before the row's own action (onDetails or the drawer, or the row's link); returning false keeps that from
   * running, so the host can open its own view of the row. The cancelable canopyx:rowActivate event carries the same detail. */
  onRowActivate?: (event: GridRowActivation) => boolean | void;
  /** A link cell being followed. Returning false (or cancelling the canopyx:link event) keeps the browser from following it,
   * so the host can route the address itself. */
  onLink?: (event: GridLinkActivation) => boolean | void;
  /** Adds Chart to the selection bar. The host owns chart generation. */
  onChart?: (event: { query: Q | null; selection: GridSelection<Q>; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Host-owned secondary actions in the more menu. Content entries (render) need the reporting runtime: render fills the
   * container on first open, focus moves to its first control, Escape folds it back, and close() closes the menu. */
  actions?: readonly GridAction<Q>[];
  /** Plugins for this grid only, after the page's (CanopyX.use); one replaces a page plugin of the same name. */
  plugins?: readonly CanopyPlugin[];
  /** Optional host-governed removal of the report's fixed grouping. */
  onUngroup?: (event: { query: Q | null; signal: AbortSignal }) => void | PromiseLike<void>;
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
  setPageLength(length: number | "all"): Promise<Q>;
  setColumnWidth(id: string, width: number): void;
  /** Samples at most 200 cached accepted-query records and 512 display code units per value, capped at 420 CSS pixels or maxWidth, and sets a sticky user width. No fetching or viewport scraping. */
  autoFitColumn(id: string): Readonly<{ width: number; sampled: number; scope: "loaded" }>;
  /** Fits every declared column from the same bounded loaded sample, including hidden columns. */
  autoFitColumns(): Readonly<Record<string, Readonly<{ width: number; sampled: number; scope: "loaded" }>>>;
  setColumnPinned(id: string, pin: GridColumnPin): void;
  /** Drops user widths so the columns return to automatic content sizing. */
  autoSizeColumns(ids?: readonly string[]): void;
  setColumnPriority(id: string, priority: GridColumnPriority): void;
  /** Restores the declared order, visibility, widths and pins; keeps the query. */
  resetColumns(): void;
  /** Reporting runtime only: effective layout for every declared column, with the reason a column is out of view. */
  getColumnLayout?(): readonly GridColumnPlacement[];
  /** Reporting runtime only: the stable container of a toolbar slot for the grid's lifetime. Host children marked
   * data-cx-slot move into their slot when the grid mounts and return to the host element on destroy. */
  toolbarSlot?(name: GridToolbarSlot): HTMLElement;
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
  /** Runs onExport under the export safety timeout (timeoutMs, else exportTimeoutMs); page reads keep requestTimeoutMs. */
  exportToHost(format: string, options: GridExportOptions & { timeoutMs?: number }): Promise<void>;
  /** Captures now (invalid capture options throw synchronously), then runs a registered or configured export format (the same writers the Export menu lists) and downloads its file. */
  exportAs(format: string, options: Omit<GridExportOptions, "onProgress" | "maxRows"> & ExportFormatOptions): Promise<ExportFormatResult>;
  /** Reporting runtime only. Complete bounded record snapshot; default maxRows is 1000, never silently truncates. */
  materializeExport?(options: GridExportOptions): Promise<GridExportSnapshot<Q>>;
  /** Reporting runtime only. Passes the same bounded snapshot to onPrint; never prints viewport DOM. */
  print?(options: GridExportOptions): Promise<void>;
  /** Details are opened for loaded records, by toolbar, double click or Ctrl/Command+Enter. */
  openDetails(id: string): Promise<void>;
  /** The current formatting rules: the view's, or the ones set since. */
  getFormatRules(): readonly GridFormatRule[];
  /** Replaces the formatting rules after validating them as a whole (a bad set changes nothing); loads the formatting part on first use. */
  setFormatRules(rules: readonly GridFormatRule[]): Promise<readonly GridFormatRule[]>;
  /** Opens the rule editor; loads the formatting and rule editor parts on first use. */
  openFormatRules(): Promise<void>;
  focus(): void;
  /** Reveals a zero-based position in the accepted result without taking DOM focus from a host drawer. */
  scrollToRow(index: number): Promise<void>;
  retry(): Promise<Q | void>;
  /** Closes this grid's toolbar menus and column popover. To close the menus of every view, dispatch canopyx:closemenus on the document. */
  closeMenus(): void;
  /** Repaints the accepted data without querying the source. */
  refresh(): void;
  /** Requests a fresh source revision with accepted filters and ordering, or initial definition criteria before acceptance. Traversal restarts at the first page. */
  reload(): Promise<Q>;
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
