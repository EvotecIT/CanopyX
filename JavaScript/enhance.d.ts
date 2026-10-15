// Progressive enhancement of an existing table and simple init from data or a URL (docs/enhance.md).
import type { CanopyLabels } from "./protocol.js";
import type { DataGrid, GridColumn, GridHostOptions, GridPageLengthChoice, GridPaging, GridQuery, GridState, GridView } from "./grid.js";

/** What a column render is called for: the text shown, the sort value, the search value, and the value whose type sets the column kind. */
export type GridRenderPurpose = "display" | "sort" | "filter" | "type";

/** Where a render call happens: the record's position in the data, the column's position, and the column id. */
export interface GridRenderMeta {
  readonly row: number;
  readonly column: number;
  readonly id: string;
}

/** A column render: receives the column's field value, the purpose, the whole record and the position. */
export type GridRenderFunction<R = any> = (data: any, purpose: GridRenderPurpose, record: R, meta: GridRenderMeta) => unknown;

/** A render function, or per purpose a function or a field path of the record; "_" is the fallback for purposes not named. */
export type GridRender<R = any> = GridRenderFunction<R> | {
  readonly display?: GridRenderFunction<R> | string;
  readonly sort?: GridRenderFunction<R> | string;
  readonly filter?: GridRenderFunction<R> | string;
  readonly type?: GridRenderFunction<R> | string;
  readonly _?: GridRenderFunction<R> | string;
};

/**
 * A column of CanopyX.enhance or CanopyX.grid: the grid column fields, plus where its values come from and how they read.
 * For a table, the options at a header cell's index merge over that cell's data-* attributes.
 */
export interface GridColumnOptions<R = any> extends Partial<Omit<GridColumn, "id" | "title" | "kind" | "hidden">> {
  /** The column id; defaults to the field name, or c0, c1, ... for positions. */
  id?: string;
  /** The header text; defaults to the table header or the field name. */
  title?: string;
  /** A field name, a dotted path ("owner.name") or an array position; defaults to the column's position. */
  data?: string | number;
  /** The value kind; auto (the default) reads it from the values: numbers, ISO dates, else text. date is datetime. */
  type?: "text" | "number" | "datetime" | "date" | "auto";
  /** The same as type, in the grid column's own name. */
  kind?: "text" | "number" | "datetime";
  /** Display, sort, search and type values computed from the record. */
  render?: GridRender<R>;
  /** False leaves the column out of the search box. Default true. */
  searchable?: boolean;
  /** False hides the column at first; readers can show it from the Columns menu. Default true. */
  visible?: boolean;
  hidden?: boolean;
  /** Text an empty cell shows instead of the dash. */
  defaultContent?: string;
}

/** A URL source: read once for client-side processing, or asked for every query with serverSide. */
export interface GridUrlSource {
  url: string;
  /** Defaults to GET when there is no body, else POST. A server source posts the grid query as JSON. */
  method?: string;
  headers?: Readonly<Record<string, string>>;
  /** Extra request data: query parameters for GET, JSON fields otherwise; a function receives the grid query in server mode. */
  data?: Readonly<Record<string, unknown>> | ((query?: GridQuery) => Readonly<Record<string, unknown>> | undefined);
  /** Where the records are in the answer: a property path ("" for the answer itself) or a function. Default: the answer, its data or its items. */
  dataSrc?: string | ((answer: any) => any);
  credentials?: RequestCredentials;
  /** A function with the fetch signature, for authenticated clients or tests. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Ask the server for every query (sort, search, filters, page) with the canopyx/2 grid query; it answers a grid page or { total, matched, items }. */
  serverSide?: boolean;
  /** A server source's value-list endpoint (canopyx/2 grid facet queries), used by the reporting runtime's value lists. */
  facetUrl?: string;
}

/** What stateSave stores: the grid's state, its named views and when it was saved. */
export interface GridStoredState {
  time: number;
  current: GridState;
  views: { name: string; state: GridState }[];
}

/** State saving between visits. */
export interface GridStateSaveOptions {
  /** Default session. */
  storage?: "session" | "local";
  /** Seconds a stored state stays valid; 0 keeps it without a limit. Default 7200. */
  duration?: number;
  /** The storage key prefix; defaults to the page path. The grid id is added. */
  key?: string;
  /** Also keep the shareable part (sort, search, filters, page, page length) in the address. */
  url?: false | "query" | "hash";
  /** The address parameter; defaults to the grid id. */
  parameter?: string;
  /** Reads the state from the host's own store instead of browser storage. */
  load?(event: { key: string; view: string }): GridStoredState | null | PromiseLike<GridStoredState | null>;
  /** Writes the state to the host's own store instead of browser storage. */
  save?(event: { key: string; view: string; state: GridStoredState }): void | PromiseLike<void>;
}

/** Short names for the texts people change most; every other text is a CanopyX label (labels). Unknown names are ignored. */
export interface GridTexts {
  search?: string; info?: string; infoFiltered?: string; lengthMenu?: string; first?: string; previous?: string; next?: string; last?: string;
  page?: string; all?: string; empty?: string; emptyReason?: string; noMatches?: string; loading?: string; loadFailed?: string; retry?: string;
}

/** The detail of draw, order, search, page and length: the accepted query and the paging it produced. */
export interface GridDrawEvent {
  readonly query: GridQuery;
  readonly paging: GridPaging;
}

/** The options of CanopyX.grid and CanopyX.enhance. Host options of createDataGrid (renderers, actions, plugins, toolbar, onQuery, ...) pass through. */
export interface GridInitOptions<R = any> extends Omit<GridHostOptions, "source" | "viewStore" | "labels"> {
  /** The grid id; defaults to the element id. */
  id?: string;
  /** The accessible name; defaults to aria-label, the table caption or the title attribute. */
  label?: string;
  noun?: string;
  /** Columns; for a table, options by header position. Without columns, the first record's fields (or positions) become columns. */
  columns?: readonly (GridColumnOptions<R> | null | undefined)[];
  /** Records as arrays or objects. */
  data?: readonly R[];
  /** A URL source; without declared column types it is read before the grid appears. */
  url?: string | GridUrlSource;
  /** Ask the URL for every query. The same as url.serverSide. */
  serverSide?: boolean;
  /** The record field (or a function) that gives each row its stable id; missing ids are generated from positions. */
  rowId?: string | ((record: R, index: number) => string | number);
  /** False scrolls all rows instead of paging. Default true. */
  paging?: boolean;
  /** Rows per page. Default 25. */
  pageLength?: number;
  /** Page-size choices. Default 10, 25, 50, 100 and All. */
  pageLengths?: readonly GridPageLengthChoice[];
  /** False hides the rows-per-page menu. */
  lengthMenu?: boolean;
  /** "sentence" (default), "range" (compact), or false for no result text. */
  info?: boolean | "range" | "sentence";
  /** Numbered page buttons: true for seven (default), a count from 5 to 15, or false. */
  pageNumbers?: boolean | number;
  /** The page number field; shown by default only without numbered pages. */
  pageInput?: boolean;
  /** False hides the first-page and last-page buttons. */
  firstLast?: boolean;
  /** False removes the search box. Default true. */
  search?: boolean;
  /** The initial search. */
  searchText?: string;
  searchMode?: "substring" | "words";
  /** The initial sort: [[column position or id, "asc" | "desc"], ...] or [{ column, direction }, ...]. */
  order?: readonly (readonly [number | string, ("asc" | "desc")?] | { column: number | string; direction?: "asc" | "desc" })[];
  /** False makes every column unsortable unless a column says otherwise. Default true. */
  sortable?: boolean;
  selection?: "none" | "single" | "multiple";
  stateSave?: boolean | GridStateSaveOptions;
  texts?: GridTexts;
  labels?: Partial<CanopyLabels>;
  /** Keep the markup of table cells (links, badges) in the grid's cells. Default true. */
  markup?: boolean;
  /** False drops the table footer strip. Default: the table footer shows below the rows. */
  footer?: boolean;
  /** The grid's CSS height; paged grids default to the height of a page of rows. */
  height?: string;
  theme?: "light" | "dark" | "auto";
  density?: "compact" | "default" | "comfortable";
  zebra?: boolean;
  /** Further grid definition fields (rowHeight, statusBar, toolbar, reporting, timeZone, ...), merged last. */
  view?: Partial<GridView>;
  /** Handlers by event name, attached before the grid starts. */
  on?: Readonly<Record<string, (detail: any, grid: EnhancedGrid<R>, event?: CustomEvent) => void>>;
}

/** A header row above the bottom one: groups with their titles and the ids of the columns they span. */
export interface GridHeaderGroup {
  readonly title: string;
  readonly columns: readonly string[];
}

/** The controller CanopyX.enhance and CanopyX.grid resolve with: the grid's API plus events by name, records and the restored table. */
export interface EnhancedGrid<R = any> extends DataGrid {
  /** The original table, put back by destroy(); null for a grid built in another element. */
  readonly table: HTMLTableElement | null;
  /** Header rows above the bottom one, as levels of groups. */
  readonly headerGroups: readonly (readonly GridHeaderGroup[])[];
  on(name: "init", handler: (detail: { query: GridQuery }, grid: EnhancedGrid<R>) => void): this;
  on(name: "draw" | "order" | "search" | "page" | "length", handler: (detail: GridDrawEvent, grid: EnhancedGrid<R>, event?: CustomEvent) => void): this;
  /** Any canopyx:<name> event of the grid: select, query, state, error, rowActivate, link, columnResize, columnPin, ... */
  on(name: string, handler: (detail: any, grid: EnhancedGrid<R>, event?: CustomEvent) => void): this;
  off(name: string, handler: (...args: any[]) => void): this;
  /** Records as given (a table row's cell texts): all in data order, filtered in the accepted order, or the visible page. A server source returns its last loaded rows. */
  getRows(scope?: "all" | "filtered" | "page"): R[];
  getRow(id: string): R | undefined;
  /** Replaces the records; the sort, search, filters and page stay. Inline data only. */
  setData(data: readonly R[]): Promise<GridQuery>;
  addRows(data: readonly R[]): Promise<GridQuery>;
  removeRows(ids: readonly string[]): Promise<GridQuery>;
}

/** Turns an existing table into a grid, keeping the table as the script-free fallback; destroy() puts it back. */
export function enhance(table: HTMLTableElement | string, options?: GridInitOptions<string[]>): Promise<EnhancedGrid<string[]>>;
/** Builds a grid in an element from records or a URL source; given a table, it enhances it. */
export function grid<R = any>(element: HTMLElement | string, options: GridInitOptions<R>): Promise<EnhancedGrid<R>>;
