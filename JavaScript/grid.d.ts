import CanopyX from "./index.js";
import type { TreeGrid } from "./index.js";
import type { CanopyColumn, CanopyLabels, Cell, CellValue, SortDirection, TimeZone, SearchHighlightOptions, LayoutOptions, LayoutState, ViewModeMethods } from "./protocol.js";
import type { HostOptions, ExportFormat, ExportFormatOptions, ExportFormatResult, LinkedView } from "./hosts.js";
import type { CanopyPlugin } from "./plugins.js";
import type { GridEditorDefinition, GridValidation, GridEditingSettings, GridEditingOptions, GridEditingApi, GridCellValueChange,
  GridRowCommit, GridCommitRowResult, GridCommitOutcome, GridCommit, GridCommitResult } from "./editing.js";
import type { RecordPanelDefinition, RecordLoader, RecordSectionRenderer, RecordAction, RecordOpenAll, OpenRecordOptions } from "./records.js";
export * from "./records.js";
export * from "./index.js";
export * from "./enhance.js";
import type { enhance, grid } from "./enhance.js";
export * from "./editing.js";
import type { GridExportFormat, GridFormatOptions, GridFormatRule } from "./formatting.js";
export * from "./formatting.js";
import type { GridColumnGroup, GridColumnGroupApi } from "./column-groups.js";
import type { GridRangeSelection, GridClipboardSettings, GridCellRange, GridPasteEvent, GridCellRangeApi } from "./cell-ranges.js";
export * from "./column-groups.js";
export * from "./cell-ranges.js";
import type { GridLiveDefinition, GridLiveOptions, GridLiveApi, GridLiveResult } from "./live.js";
import type { GridFacetPanelDefinition, GridFacetPanelOptions, GridFacetPanelApi } from "./facets.js";
import type { GridCalendarDefinition, GridCalendarOptions, GridCalendarApi, GridCalendarState, GridCalendarSavedState, GridOccurrenceChange, GridRangeSource, GridEventCreate, GridEventReceive, CalendarOptions } from "./calendar.js";
export * from "./facets.js";
export * from "./calendar.js";
export * from "./live.js";

/** A stable record identity and typed cells. Flat records have no tree fields. */
export interface GridRow { id: string; cells: Record<string, Cell>; tone?: string; className?: string;
  /** Reporting detail rows: the record's table, properties or trusted HTML payload, or its nested grid rows or tree roots. */
  detail?: GridRowDetail;
  /** Values of the view's record fields (record.fields): shown in the record drawer only, never queried, searched, sorted or exported. */
  fields?: Record<string, Cell>; }
/** A record's detail payload: a table, property list or trusted HTML, or the inline data of the definition's nested view. */
export type GridRowDetail =
  | { type: "table"; caption?: string; columns: string[]; widths?: number[]; rows: Cell[][] }
  | { type: "properties"; items: { name: string; value: Cell }[] }
  | { type: "html"; html: string }
  | { type: "grid"; rows: GridRow[] }
  | { type: "tree"; roots: unknown[] };
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
  /** Present when the export carries details (request.details): the record's detail as a table, properties or trusted HTML. */
  readonly detail?: Extract<GridRowDetail, { type: "table" | "properties" | "html" }>;
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
/**
 * The column ids of a row type: the keys of its cells, so `createDataGrid<Server>(…)` checks column ids, facets and column
 * methods against the row. Untyped rows (the default) take any string.
 */
export type GridColumnId<Row extends GridRow = GridRow> = string extends keyof Row["cells"] ? string : Extract<keyof Row["cells"], string>;
export type GridColumn<Row extends GridRow = GridRow> = Omit<CanopyColumn, "id" | "editable" | "width"> & {
  /** The column's id; for a typed row, one of its cells. */
  id: GridColumnId<Row>;
  /** Readers can edit the column's cells; the editing part loads with the grid (docs/editing.md). */
  editable?: boolean;
  /** The column's typed editor; without one the column's kind chooses text, number or datetime. */
  editor?: GridEditorDefinition;
  /** Checks an edited value must pass before its row commits. */
  validation?: GridValidation;
  wrap?: boolean;
  /** Declarative presentation; explicit host renderers take precedence. */
  presenter?: GridPresenter;
  /** Include selected numeric values in the optional status bar. */
  aggregatable?: boolean;
  /** Record drawer section label. */
  section?: string;
  /** false keeps the column out of the record drawer and record panel. Default true. */
  drawer?: boolean;
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
  /** How the column gives way when narrow. Integers: 0-1 essential, 10000+ optional, larger values hide first. */
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
  | { readonly kind: "tags"; readonly separator: string; readonly limit?: 3 }
  /** A structured value's summary: a count (countText with {count}), chips (limit) or the first item and +N. The record panel shows it whole. */
  | { readonly kind: "structured"; readonly display?: "count" | "chips" | "first"; readonly limit?: number; readonly countText?: string };
/** Ascending inclusive upper bounds; unmatched values use cell tones. */
export interface GridThreshold { readonly upperBound: number; readonly tone: string; }
/** Both shared scale bounds must be supplied together; otherwise each cell scales independently. */
export interface GridHistoryPresentation {
  readonly minimum?: number; readonly scaleMaximum?: number; readonly thresholds?: readonly GridThreshold[];
  readonly higherIsGood?: boolean; readonly mark?: "worst" | "last";
}
/** A page-size choice: rows per page, "all" for every row of inline data, or either with its own menu text. */
export type GridPageLengthChoice = number | "all" | { readonly value: number | "all"; readonly label: string };
/** Settings of a paged grid's pager; continuous grids ignore them (docs/paging.md). */
export interface GridPager {
  /** Page-size choices in menu order (at most 16); absent keeps 10, 25, 50, 100 and, for inline data, All. */
  readonly lengths?: readonly GridPageLengthChoice[];
  /** The rows-per-page menu. Default true. */
  readonly lengthMenu?: boolean;
  /** Numbered page buttons: 0 for none (default), or 5 to 15. */
  readonly numbers?: number;
  /** The page number field. Absent shows it unless numbered pages show. */
  readonly pageInput?: boolean;
  /** The first-page and last-page buttons. Default true. */
  readonly firstLast?: boolean;
  /** The result text: the compact range (default), a sentence with the unfiltered total while filtered, or none. */
  readonly info?: "range" | "sentence" | "none";
}
/** Include the reporting entry point when this optional capability set is present. */
export interface GridReporting {
  /** Fixed first ordering key. Group headings and collapse never change record paging/counts/exports. */
  readonly grouping?: GridSort;
  /** Initial runtime grouping levels, outermost first (at most four). Not combined with grouping. */
  readonly groupBy?: readonly GridGroupLevel[];
  /** Readers group by sortable columns from column menus, the group-by bar and dragged headers. Not combined with grouping. */
  readonly groupable?: boolean;
  /** Expandable detail rows under records; content loads on first expand. */
  readonly detail?: GridDetailDefinition;
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
  /** The match navigator and the Highlight matches switch of a grid with searchHighlight. */
  matches?: boolean;
  /** The Layout menu of a grid with layout options. */
  layout?: boolean;
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
  /** Runtime grouping levels (reporting groupBy/groupable definitions); omitted input uses the declared levels, [] ungroups. */
  readonly groupBy?: readonly GridGroupLevel[];
}
/** Sequential host query. Tokens require their issuing revision; there is no random-access offset. */
export interface GridCursorQuery extends Omit<GridQuery, "type" | "offset"> {
  readonly type: "gridCursorQuery";
  readonly cursor?: string;
}
export type AcceptedGridQuery = GridQuery | GridCursorQuery;
export type GridQueryInput<Q extends AcceptedGridQuery = GridQuery> = Partial<Q>;
type GridCount<Q extends AcceptedGridQuery> = Q extends GridCursorQuery ? number | null : number;

interface GridDefinition<Q extends AcceptedGridQuery = GridQuery, Row extends GridRow = GridRow> {
  protocol: "canopyx/2";
  type: "grid";
  id: string;
  label: string;
  columns: GridColumn<Row>[];
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
  /** How editable columns edit; the host's editing option overrides these. */
  editing?: GridEditingSettings;
  /** Marks search and column-filter matches in cells and the drawer, with a match count and next/previous (docs/search-highlight.md). */
  searchHighlight?: boolean | SearchHighlightOptions;
  /** The Layout menu: fit, scroll and cards, and the density (docs/layout-modes.md); layout.density starts the grid at that density. */
  layout?: LayoutOptions;
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
  /** Pager settings of a paged view, read by the pager part (canopyx-pager.js); absent keeps the built-in pager. */
  pager?: GridPager;
  selection: "none" | "single" | "multiple";
  search: boolean;
  /** Search-input debounce (0..5000). Absent uses 0 for inline and 300 for host sources. */
  searchDelayMs?: number;
  /** Unique declared IDs; absent searches every column, including hidden columns. */
  searchColumns?: GridColumnId<Row>[];
  reporting?: GridReporting;
  /** Header rows above the columns, up to three levels (docs/column-groups.md). */
  columnGroups?: readonly GridColumnGroup[];
  /** Cell ranges by mouse, keyboard and touch, the cell menu and the clipboard keys (docs/cell-ranges.md). */
  rangeSelection?: GridRangeSelection;
  /** How cell ranges copy and paste. */
  clipboard?: GridClipboardSettings;
  /** The record panel: record fields, sections, tabs, a pinned summary, deep links, record details on demand (records.d.ts). */
  record?: RecordPanelDefinition;
  /** Live data: rows that change in place, the stable order, flashing cells, batching and polling (live.d.ts). */
  live?: GridLiveDefinition;
  /** A facet panel beside or above the grid: value lists with counts and ranges with histograms (facets.d.ts). */
  facets?: GridFacetPanelDefinition<Row>;
  /** Shows the records as a calendar: month, week, day, N days, agenda, year and the resource timeline (calendar.d.ts). */
  calendar?: GridCalendarDefinition<Row>;
  /** Rows can be dragged out (or picked up with F2) onto a calendar that accepts drops. */
  dragRows?: boolean;
  stateKey?: string;
  timeZone?: TimeZone;
  labels?: Partial<CanopyLabels>;
  /** Sanitizes trusted host HTML details before insertion; shares the tree host's sanitizer contract. */
  sanitizeHtml?: HostOptions["sanitizeHtml"];
  query?: Q;
}
export interface InlineGridView<Row extends GridRow = GridRow> extends GridDefinition<GridQuery, Row> { source: { kind: "inline"; navigation?: "offset" }; rows: Row[]; rowData?: never; }
/**
 * A compact row: the row id (or `{ id, tone?, className? }`) followed by its cells in the order of `GridRowData.columns`.
 * Trailing empty cells may be left out; `null` is an empty cell.
 */
export type GridCompactRow = [string | { id: string; tone?: string; className?: string }, ...Cell[]];
/** Compact row data of an inline grid, in place of `rows` (docs/data-protocol.md, "Row data"). */
export interface GridRowData {
  /** Declared column ids, unique, in the order of each compact row's cells. */
  columns: string[];
  /** The number of rows in all chunks. */
  count: number;
  /** The rows are in ordinal identity order, so the first rows show before the last chunk is decoded. */
  ordered?: boolean;
  /** Each string chunk is base64 text of gzip-compressed JSON, inflated with DecompressionStream. */
  encoding?: "gzip";
  /** Folder of the sidecar files `rows/<n>.js`, relative to the page; requires a chunk count. */
  base?: string;
  /**
   * A count of `application/x-canopyx-rows` scripts inside the host element (or of sidecar files under `base`), or the chunks
   * themselves: arrays of compact rows, or strings of chunk JSON (base64 gzip with `encoding`).
   */
  chunks: number | Array<GridCompactRow[] | string>;
}
/** An inline grid whose rows the data part decodes from compact row data, chunk by chunk, after the first paint. */
export interface CompactGridView<Row extends GridRow = GridRow> extends GridDefinition<GridQuery, Row> { source: { kind: "inline"; navigation?: "offset" }; rowData: GridRowData; rows?: never; }
export interface HostGridView<Row extends GridRow = GridRow> extends GridDefinition<GridQuery, Row> { source: { kind: "host"; navigation?: "offset" }; rows?: never; }
export interface CursorGridView<Row extends GridRow = GridRow> extends GridDefinition<GridCursorQuery, Row> {
  source: { kind: "host"; navigation: "cursor" };
  presentation: "paged";
  rows?: never;
}
export type GridView<Row extends GridRow = GridRow> = InlineGridView<Row> | CompactGridView<Row> | HostGridView<Row> | CursorGridView<Row>;

/** A complete requested window from one dataset revision, with full and matching counts. */
export interface GridPage<Row extends GridRow = GridRow> {
  protocol: "canopyx/2";
  type: "gridPage";
  view: string;
  revision: string;
  offset: number;
  total: number;
  matched: number;
  items: Row[];
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
export interface GridSource<Row extends GridRow = GridRow> extends GridFacetSource<GridQuery>, GridRangeSource<Row> {
  readonly navigation?: "offset";
  query(query: GridQuery, options: { signal: AbortSignal }): GridPage<Row> | PromiseLike<GridPage<Row>>;
  /** Complete-query metadata, echoing the normalized accepted request, revision and matched count. */
  summary?(query: GridQuery & { readonly revision: string }, options: { signal: AbortSignal }): GridSummary | PromiseLike<GridSummary>;
  /** Saves changed rows (a remote source posts the gridCommit document to its commit endpoint) and answers per row. */
  commit?(batch: GridCommit, options: { signal: AbortSignal }): GridCommitResult | PromiseLike<GridCommitResult>;
  /** A record's details when its drawer opens (a gridRecordQuery answered with a gridRecord), as a remote protocol client sends it. */
  record?: RecordLoader;
  /** A record's position in the query's result, or -1, so openRecord and deep links scroll the grid to it. */
  position?(query: GridQuery, id: string, options: { signal: AbortSignal }): number | PromiseLike<number>;
}
/** Built-in operations, or the name of a custom aggregate a plugin registers (inline data) or the host source computes. */
export type GridAggregateOperation = "count" | "sum" | "average" | "minimum" | "maximum" | "distinctCount" | (string & {});
export interface GridAggregate {
  readonly id: string; readonly column: string; readonly label: string;
  readonly operation: GridAggregateOperation;
}
/** One runtime grouping level: groups order by value, or by a declared aggregate (nulls last, ties by value). */
export interface GridGroupLevel {
  readonly column: string; readonly direction: "asc" | "desc"; readonly aggregate?: string;
}
/** Declared detail rows: one content source (a page template, a plugin detail renderer or a nested view), else record payloads. */
export interface GridDetailDefinition {
  /** Id of a page &lt;template&gt;; elements with data-cx-field receive the record's cell text. */
  readonly template?: string;
  /** Name of a detail renderer a plugin registers in detailRenderers. */
  readonly renderer?: string;
  /** Nested grid or tree document whose inline data is each record's grid or tree payload. */
  readonly view?: object;
  /** Exports and print snapshots carry detail payloads; default true. */
  readonly print?: boolean;
  readonly label?: string;
}
/** The context of a detail callback. The signal aborts when the record collapses, leaves the result or the grid is destroyed. */
export interface GridDetailContext {
  readonly id: string; readonly signal: AbortSignal; readonly api: unknown; readonly labels: Readonly<Record<string, string>>;
  onDispose(cleanup: () => void): void;
}
/** A nested view a detail callback returns: a grid or tree document, an optional host source and options for createDataGrid/createTreeGrid. */
export interface GridNestedDetail {
  readonly view: object; readonly source?: unknown; readonly options?: Readonly<Record<string, unknown>>;
}
/** Host detail rows (the detail option): one callback draws the content; hasDetail limits which records offer it. */
export interface GridDetailOptions<Row extends GridRow = GridRow> {
  /** A host template: draws into element (the body inside the visible width). */
  render?(row: Readonly<Row>, element: HTMLElement, context: GridDetailContext): void | PromiseLike<void>;
  /** Trusted markup inserted as HTML: encode the record text you put into it. */
  html?(row: Readonly<Row>, context: GridDetailContext): string | PromiseLike<string>;
  grid?(row: Readonly<Row>, context: GridDetailContext): GridNestedDetail | PromiseLike<GridNestedDetail>;
  tree?(row: Readonly<Row>, context: GridDetailContext): GridNestedDetail | PromiseLike<GridNestedDetail>;
  /** A host source for the definition's nested view. */
  source?(row: Readonly<Row>, context: GridDetailContext): unknown;
  hasDetail?(row: Readonly<Row>): boolean;
  /** The detail exports and print snapshots carry for a record. */
  export?(row: Readonly<Row>): Extract<GridRowDetail, { type: "table" | "properties" | "html" }> | null;
}
export interface GridGroup {
  readonly key: string; readonly value: CellValue; readonly offset: number; readonly count: number;
  readonly aggregates: Readonly<Record<string, number | null>>;
  /** Host-owned complete-group display values; rendered with column presenters, excluded from record queries and exports. */
  readonly cells?: Readonly<Record<string, Cell>>;
  /** The next level's groups inside this one: present on every group of an outer level. Keys are unique across levels. */
  readonly groups?: readonly GridGroup[];
}
export interface GridSummary {
  readonly protocol: "canopyx/2"; readonly type: "gridSummary"; readonly view: string; readonly revision: string;
  readonly query: GridQuery & { readonly revision: string }; readonly matched: number;
  readonly groups: readonly GridGroup[]; readonly aggregates: Readonly<Record<string, number | null>>;
}
/** One complete visible page. Null counts remain unknown; ordinal positions do not grant random access. */
export interface GridCursorPage<Row extends GridRow = GridRow> extends Omit<GridPage<Row>, "type" | "total" | "matched"> {
  type: "gridCursorPage";
  total: number | null;
  matched: number | null;
  nextCursor?: string;
  previousCursor?: string;
}
export interface GridCursorSource<Row extends GridRow = GridRow> extends GridFacetSource<GridCursorQuery> {
  readonly navigation: "cursor";
  query(query: GridCursorQuery, options: { signal: AbortSignal }): GridCursorPage<Row> | PromiseLike<GridCursorPage<Row>>;
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
  /** Filtered exports of a grouped result: levels, totals and nested groups with record ranges for outline levels. */
  readonly grouping?: { readonly levels: readonly (GridGroupLevel & { readonly title: string })[]; readonly aggregates: readonly GridAggregate[];
    readonly totals: Readonly<Record<string, number | null>>; readonly groups: readonly (GridGroup & { readonly text: string })[] };
  /** Records carry their detail payloads. */
  readonly details?: true;
}
/** Record counts refer to the complete captured export scope, including selected-query exclusions. */
export interface GridExportProgress {
  readonly phase: "reading" | "generating" | "ready";
  readonly completed: number;
  readonly total: number | null;
}
/** The detail of canopyx:link and the argument of onLink: a link presenter cell the user follows (by click, Enter or the row's link action). */
export interface GridLinkActivation<Row extends GridRow = GridRow> {
  readonly id: string;
  /** A frozen copy of the loaded row. */
  readonly row: Readonly<Row>;
  /** The id of the column whose link it is. */
  readonly column: GridColumnId<Row>;
  /** The resolved address. */
  readonly href: string;
}
/** The detail of canopyx:rowActivate and the argument of onRowActivate on a flat grid. */
export interface GridRowActivation<Row extends GridRow = GridRow> {
  readonly id: string;
  /** A frozen copy of the loaded row. */
  readonly row: Readonly<Row>;
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
  /** The reader's layout, in a grid with layout options. */
  layout?: LayoutState;
  /** The reader's Highlight matches switch, in a grid with searchHighlight. */
  highlight?: boolean;
  /** Whether the reader left the facet panel open, in a grid with facets. */
  facets?: { open: boolean };
  /** The calendar's view, date, zoom and collapsed resources, in a grid with a calendar. */
  calendar?: GridCalendarSavedState;
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
interface GridHostBehavior<Q extends AcceptedGridQuery = GridQuery, Row extends GridRow = GridRow> {
  /** False hides the whole toolbar so a host can compose controls around the same grid controller; an object switches
   * single controls off (overriding the view's toolbar switches). Switched-off controls are not built. */
  toolbar?: boolean | GridToolbarOptions;
  /** Overrides the view's search-input debounce (0..5000); Enter always applies immediately. */
  searchDelayMs?: number;
  source?: Q extends GridCursorQuery ? GridCursorSource<Row> : GridSource<Row>;
  labels?: Partial<CanopyLabels>;
  renderers?: Record<string, (row: Row, element: HTMLElement, context: GridCellContext) => boolean | void>;
  cachePageLimit?: number;
  requestTimeoutMs?: number;
  /** Formats the Export menu lists after CSV: ids of registered formats or provider objects, in order. Wins over the view's exportFormats; absent offers every registered format. */
  exportFormats?: readonly (string | ExportFormat<GridExport<Q>>)[];
  /** Safety timeout for export format writers and onExport, 1..2147483647 ms (default 600000). Page reads keep requestTimeoutMs. */
  exportTimeoutMs?: number;
  onQuery?: (event: GridQueryEvent<Q>) => void;
  onSelect?: (event: { ids: string[]; selection?: GridSelection<Q> }) => void;
  onError?: (event: { error: Error }) => void;
  onColumnResize?: (event: { column: GridColumnId<Row>; width: number }) => void;
  onColumnPin?: (event: { column: GridColumnId<Row>; pin: GridColumnPin }) => void;
  onState?: (event: { query: Q | null; state: GridState<Q> }) => void;
  /** The grid's formatting rules changed (setFormatRules, the rule editor or a restored view); canopyx:format carries the same detail. */
  onFormat?: (event: { rules: readonly GridFormatRule[] }) => void;
  /** Hosts govern Office generation, authorization and delivery. CanopyX performs no domain write. Runs under exportTimeoutMs. */
  onExport?: (event: { format: string; request: GridExportRequest<Q>; capture: GridExport<Q>; signal: AbortSignal;
    /** Reporting runtime only. Monotonic record counts and phases; late calls after cancellation are ignored. */
    reportProgress?: (phase: GridExportProgress["phase"], completed: number) => void }) => void | PromiseLike<void>;
  /** Reporting runtime only. Render the complete snapshot through a host-owned renderer; honor cancellation before delivery. */
  /** After a layout or density switch; the canopyx:layout event carries the same detail. */
  onLayout?: (detail: LayoutState) => void | boolean;
  /** After each finished match count and each move between matches; the canopyx:matches event carries the same detail. */
  onMatches?: (detail: { total: number; current: number; complete: boolean }) => void | boolean;
  /** layout asks for stacked records from a grid in the card layout and a table otherwise; print never scrolls. */
  onPrint?: (event: { snapshot: GridExportSnapshot<Q>; signal: AbortSignal; layout: "table" | "stacked" }) => void | PromiseLike<void>;
  /** Hosts compose a drawer or details view and restore returnFocus when it closes. */
  onDetails?: (event: { row: Readonly<Row>; query: Q; signal: AbortSignal; returnFocus: Element | null }) => void | PromiseLike<void>;
  /** Loads a record's details when its record panel opens; used whatever the view's record source declares. */
  loadRecord?: RecordLoader;
  /** Record panel section renderers by name, beside the plugins' drawerSections. */
  recordSections?: Readonly<Record<string, RecordSectionRenderer>>;
  /** Actions of the record actions menu, after the built-in ones. */
  recordActions?: readonly RecordAction[];
  /** Open all in grid of a collection; return false (or cancel canopyx:openAll) to filter the target yourself. */
  onOpenAll?: (event: RecordOpenAll) => boolean | void;
  /** Print one record; return false (or cancel canopyx:recordPrint) to print the sheet yourself. */
  onRecordPrint?: (event: { readonly id: string; readonly element: HTMLElement; readonly dispose: () => void }) => boolean | void;
  /** Row activation: a double click, Enter on a focused row, Ctrl/Command+Enter in a cell, or a click with rowAction (or on a
   * phone). Runs before the row's own action (onDetails or the drawer, or the row's link); returning false keeps that from
   * running, so the host can open its own view of the row. The cancelable canopyx:rowActivate event carries the same detail. */
  onRowActivate?: (event: GridRowActivation<Row>) => boolean | void;
  /** A link cell being followed. Returning false (or cancelling the canopyx:link event) keeps the browser from following it,
   * so the host can route the address itself. */
  onLink?: (event: GridLinkActivation<Row>) => boolean | void;
  /** Adds Chart to the selection bar. The host owns chart generation. */
  onChart?: (event: { query: Q | null; selection: GridSelection<Q>; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Host-owned secondary actions in the more menu. Content entries (render) need the reporting runtime: render fills the
   * container on first open, focus moves to its first control, Escape folds it back, and close() closes the menu. */
  actions?: readonly GridAction<Q>[];
  /** Plugins for this grid only, after the page's (CanopyX.use); one replaces a page plugin of the same name. */
  plugins?: readonly CanopyPlugin[];
  /** Loads the link part when the grid is created and reports its selection and own conditions as canopyx:linkchange (LinkChange). */
  linkEvents?: boolean;
  /** Reporting detail rows drawn by the host (a template, trusted HTML or a nested grid or tree). */
  detail?: GridDetailOptions<Row>;
  /** Editing of editable columns: read-only rules, checks, lookups, editors and the batch writer (docs/editing.md). */
  editing?: GridEditingOptions<Q>;
  /** Before a value changes; returning false (or cancelling canopyx:cellValueChanging) keeps the old value. */
  onCellValueChanging?: (event: GridCellValueChange) => boolean | void;
  /** After a value changed. */
  onCellValueChanged?: (event: GridCellValueChange) => void;
  /** A row whose edits are complete and valid. Return a result (or true, or a promise) to save it, false to keep editing, nothing to leave it in the batch. */
  onRowCommit?: (event: GridRowCommit) => GridCommitRowResult | boolean | void | PromiseLike<GridCommitRowResult | true>;
  /** After commitChanges, with its result. */
  onCommit?: (event: GridCommitOutcome) => void;
  /** Optional host-governed removal of the report's fixed grouping. */
  onUngroup?: (event: { query: Q | null; signal: AbortSignal }) => void | PromiseLike<void>;
  /** Overrides the view's rangeSelection. */
  rangeSelection?: GridRangeSelection;
  /** Overrides the view's clipboard settings, switch by switch. */
  clipboard?: GridClipboardSettings;
  /** Live data settings, over the view's live object; true turns live data on with the defaults, false keeps the view's
   * settings from applying while the live methods still work (live.d.ts). */
  live?: boolean | GridLiveOptions<Row, Q>;
  /** After rows changed in place (a transaction, a poll, a refresh); canopyx:rowsChanged carries the same detail. */
  onRowsChanged?: (event: GridLiveResult) => void;
  /** Facet panel settings over the view's facets, and an element the panel renders into (facets.d.ts). */
  facets?: GridFacetPanelOptions<Row>;
  /** After the reader opened or collapsed the facet panel; canopyx:facetPanel carries the same detail. */
  onFacetPanel?: (event: { open: boolean }) => void;
  /** Calendar options: the template hook that draws event content (calendar.d.ts). */
  calendar?: GridCalendarOptions;
  /** After the calendar painted a view or range; canopyx:calendar carries the same detail. */
  onCalendar?: (event: GridCalendarState) => void;
  /** Before one occurrence of a series moves; returning false (or cancelling canopyx:occurrenceChange) keeps the series. */
  onOccurrenceChange?: (event: GridOccurrenceChange) => boolean | void;
  /** Before the calendar proposes a new event; returning false (or cancelling canopyx:eventCreate) lets the host open its own form. */
  onCreate?: (event: GridEventCreate) => boolean | void;
  /** Before a dropped item becomes a record; returning false (or cancelling canopyx:eventReceive) lets the host schedule it. */
  onReceive?: (event: GridEventReceive) => boolean | void;
  /** Cells pasted or filled into the grid, before anything changes; returning false (or cancelling canopyx:paste) refuses them all. */
  onPaste?: (event: GridPasteEvent) => boolean | void;
  /** After the cell ranges changed. */
  onCellRangeChange?: (event: { ranges: readonly GridCellRange[] }) => void;
}
/** A host store binds to an explicit keyed reporting definition; ordinary grids have no store option. */
export type GridHostOptions<Q extends AcceptedGridQuery = GridQuery, Row extends GridRow = GridRow> = GridHostBehavior<Q, Row> & (
  { viewStore?: never } | {
    viewStore: GridViewStore<Q>;
    view: (Q extends GridCursorQuery ? CursorGridView<Row> : InlineGridView<Row> | CompactGridView<Row> | HostGridView<Row>) & { stateKey: string; reporting: GridReporting };
  }
);
/** A flat grid's options; Row types the rows, columns, facets, events and live API (createDataGrid<Row>). */
export type GridOptions<Row extends GridRow = GridRow> = GridHostOptions<GridQuery, Row> & ({ view: InlineGridView<Row> | CompactGridView<Row> } | { view: HostGridView<Row>; source: GridSource<Row> });
export type CursorGridOptions<Row extends GridRow = GridRow> = GridHostOptions<GridCursorQuery, Row> & { view: CursorGridView<Row>; source: GridCursorSource<Row> };

/** Presentation controller. Selection uses stable IDs independently of cached or visible rows. Row (default GridRow) types its view, column methods and live API. */
export interface DataGrid<Q extends AcceptedGridQuery = GridQuery, Row extends GridRow = GridRow> extends GridEditingApi, LinkedView, ViewModeMethods, GridColumnGroupApi, GridCellRangeApi, GridLiveApi<Row, Q>, GridFacetPanelApi, GridCalendarApi {
  readonly element: HTMLElement;
  readonly view: GridView<Row>;
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
  setColumnWidth(id: GridColumnId<Row>, width: number): void;
  /** Samples at most 200 cached accepted-query records and 512 display code units per value, capped at 420 CSS pixels or maxWidth, and sets a sticky user width. No fetching or viewport scraping. */
  autoFitColumn(id: GridColumnId<Row>): Readonly<{ width: number; sampled: number; scope: "loaded" }>;
  /** Fits every declared column from the same bounded loaded sample, including hidden columns. */
  autoFitColumns(): Readonly<Record<string, Readonly<{ width: number; sampled: number; scope: "loaded" }>>>;
  setColumnPinned(id: GridColumnId<Row>, pin: GridColumnPin): void;
  /** Drops user widths so the columns return to automatic content sizing. */
  autoSizeColumns(ids?: readonly GridColumnId<Row>[]): void;
  setColumnPriority(id: GridColumnId<Row>, priority: GridColumnPriority): void;
  /** Restores the declared order, visibility, widths and pins; keeps the query. */
  resetColumns(): void;
  /** Reporting runtime only: effective layout for every declared column, with the reason a column is out of view. */
  getColumnLayout?(): readonly GridColumnPlacement[];
  /** Reporting runtime only: the stable container of a toolbar slot for the grid's lifetime. Host children marked
   * data-cx-slot move into their slot when the grid mounts and return to the host element on destroy. */
  toolbarSlot?(name: GridToolbarSlot): HTMLElement;
  /** Reporting runtime only: revisioned, bounded full-query aggregation. Never reads the viewport cache for counts. */
  getFacets?(column: GridColumnId<Row>, options?: GridFacetOptions): Promise<GridFacetPage>;
  setColumnVisible(id: GridColumnId<Row>, visible: boolean): void;
  setColumnOrder(ids: GridColumnId<Row>[]): void;
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
  /** Grouped reporting grids (fixed or runtime). Keys name groups of any level. Collapse affects display; record query/selection/export scope remain intact. */
  setGroupCollapsed?(key: string, collapsed: boolean): void;
  getCollapsedGroups?(): string[];
  /** Runtime grouping (groupBy or groupable): sets the levels, outermost first; [] ungroups. Resolves with the accepted query. */
  setGroupBy?(groupBy: readonly GridGroupLevel[]): Promise<Q>;
  getGroupBy?(): readonly GridGroupLevel[];
  expandAllGroups?(): Promise<void>;
  collapseAllGroups?(): Promise<void>;
  /** Level 1 is the outermost; 0 means every level. */
  setGroupLevelCollapsed?(level: number, collapsed: boolean): Promise<void>;
  /** Detail rows: expanding loads the content once and resolves when it is drawn. */
  expandDetail?(id: string): Promise<void>;
  collapseDetail?(id: string): Promise<void>;
  toggleDetail?(id: string): Promise<void>;
  getExpandedDetails?(): string[];
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
  /** Opens any record in the record drawer: a loaded row, one the grid scrolls to, or one its record source returns. */
  openRecord(id: string, options?: OpenRecordOptions): Promise<void>;
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
/**
 * Requires a browser DOM. The grid runtime also hosts both existing tree variants. Name a row type to check columns, rows,
 * facets, events and the live API against it: `createDataGrid<Server>(element, { view })`, where `Server extends GridRow`.
 */
/** Keeps a type parameter from being inferred from an argument (the deferred form works on every supported compiler). */
type GridNamedRow<Row> = [Row][Row extends unknown ? 0 : never];
// The row type is named, never inferred from the options: without one, rows are plain GridRow.
export function createDataGrid<Row extends GridRow = GridRow>(host: HTMLElement, options: GridOptions<GridNamedRow<Row>>): DataGrid<GridQuery, Row>;
export function createDataGrid<Row extends GridRow = GridRow>(host: HTMLElement, options: CursorGridOptions<GridNamedRow<Row>>): DataGrid<GridCursorQuery, Row>;
/** A calendar from a list of events, with no grid schema to write: a preset (basic by default) and options over it (calendar.d.ts). */
export function createCalendar(host: HTMLElement, options?: CalendarOptions): DataGrid<GridQuery, GridRow>;
/** Registers options before either a tree or flat-grid fragment mounts. */
export function configure(viewId: string, options: HostOptions | GridHostOptions | GridHostOptions<GridCursorQuery>): () => void;
/**
 * Mounts tree and flat-grid fragments below root, or root itself when it is a fragment. Fragments marked
 * `data-cx-mount="visible"` below root wait until they come near the viewport; passing such a fragment as root mounts it at once.
 * Narrow a controller before using view-specific methods.
 */
export function mount(root?: ParentNode): Array<TreeGrid | DataGrid<AcceptedGridQuery>>;

declare const gridRuntime: Omit<typeof CanopyX, "configure" | "mount"> & { createDataGrid: typeof createDataGrid; createCalendar: typeof createCalendar; enhance: typeof enhance; grid: typeof grid; configure: typeof configure; mount: typeof mount };
export default gridRuntime;
