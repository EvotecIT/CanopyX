// Type declarations for the matrix view (docs/matrix.md): the matrix document, its state and the API of createMatrix.
import type { CellValue } from "./protocol.js";

/** A state a cell can hold, listed worst first: a collapsed group shows the worst state of its cells. */
export interface MatrixState {
  /** A letter, then up to 63 letters, digits, hyphens and underscores. */
  id: string;
  label: string;
  /** A CanopyX tone (success, warning, danger, info, muted, neutral) or a host tone the theme defines. */
  tone?: string;
  /** The symbol cells and the legend draw, so a state never relies on colour alone. */
  symbol: "check" | "cross" | "warning" | "info" | "dot" | "dash" | "question" | "clock" | "pause";
  /** Cells in this state count in the totals and stay when the reader shows only problems. */
  attention?: boolean;
}

/** A property of an axis's items: shown in tooltips, used to group, sort and filter. */
export interface MatrixAttribute {
  id: string;
  title: string;
  kind?: "text" | "number" | "datetime";
  /** The filter panel lists its values with their counts. */
  facet?: boolean;
}

/** An entity on an axis: a row or a column. */
export interface MatrixItem {
  id: string;
  label: string;
  secondary?: string;
  /** An http, https or mailto address, or a relative one. */
  href?: string;
  values?: Record<string, CellValue | { value: CellValue; text?: string }>;
}

/** One axis of the matrix. */
export interface MatrixAxis {
  title?: string;
  noun?: string;
  attributes?: MatrixAttribute[];
  items: MatrixItem[];
  groupBy?: string;
  sort?: MatrixSort;
}

/** How an axis is sorted: by its labels, its totals or an attribute. */
export interface MatrixSort {
  by: "#label" | "#total" | (string & {});
  direction?: "asc" | "desc";
}

/** A cell's extras: [row index, column index, value, text, title, [label, value][]]. */
export type MatrixNote = [number, number, number | null, (string | null)?, (string | null)?, ([string, string][] | null)?];

/** The matrix document: `{ protocol: "canopyx/2", type: "matrix" }`. */
export interface MatrixDocument {
  protocol: "canopyx/2";
  type: "matrix";
  id: string;
  label: string;
  rows: MatrixAxis;
  /** The column axis; a square matrix has none and takes its columns from its rows. */
  columns?: MatrixAxis;
  square?: boolean;
  /** The column title of a square matrix. */
  columnTitle?: string;
  /** What the self cells of a square matrix show. */
  diagonal?: "self" | "data";
  states: MatrixState[];
  /** One string per row: a state digit (0-9, a-z) per column, "." for no data. */
  cells: string[];
  notes?: MatrixNote[];
  totals?: { states?: string[]; rows?: boolean; columns?: boolean };
  attentionOnly?: boolean;
  /** Opens hiding the rows and columns whose visible cells all lack data. */
  hideEmpty?: boolean;
  cellWidth?: number;
  density?: "compact" | "normal" | "comfortable";
  details?: "dialog" | "host";
  phone?: "scroll" | "cards";
  legend?: boolean;
  /** As tall as the content when it fits, with the host's height as the bound. Default true. */
  autoHeight?: boolean;
  labels?: Record<string, string>;
}

/** The reader's query: search, filters by attribute value, only problems, hide empty, and each axis's sort, groups and collapsed groups. */
export interface MatrixQueryState {
  search: string;
  attentionOnly: boolean;
  hideEmpty: boolean;
  filters: { rows: Record<string, string[]>; columns: Record<string, string[]> };
  sort: { rows: MatrixSort | null; columns: MatrixSort | null };
  group: { rows: string | null; columns: string | null };
  collapsed: { rows: string[]; columns: string[] };
}

/** What canopyx:matrixCell carries: the row and column (or their groups), the state and the cell's extras. */
export interface MatrixCellDetail {
  matrix: string;
  row: string | null;
  rowGroup: string | null;
  column: string | null;
  columnGroup: string | null;
  /** The state id, "self" for a self cell, or null without data. */
  state: string | null;
  value: number | null;
  text: string | null;
  title: string | null;
  details: [string, string][];
  /** The cells a rolled-up cell covers, and how many of them need attention. */
  members: number;
  attention: number;
}

/** A state to apply: any part of the query, down to one axis of filters, sorts, groups or collapsed groups. */
export interface MatrixStateInput {
  search?: string;
  attentionOnly?: boolean;
  hideEmpty?: boolean;
  filters?: { rows?: Record<string, string[] | null>; columns?: Record<string, string[] | null> };
  sort?: { rows?: MatrixSort | null; columns?: MatrixSort | null };
  group?: { rows?: string | null; columns?: string | null };
  collapsed?: { rows?: string[]; columns?: string[] };
}

/** Options of createMatrix and CanopyX.configure for a matrix fragment. */
export interface MatrixOptions {
  view: MatrixDocument;
  labels?: Record<string, string>;
  state?: MatrixStateInput;
  onReady?: (detail: { matrix: string }) => void;
  /** Called before the details dialog; preventDefault on the event keeps it closed. */
  onCell?: (detail: MatrixCellDetail, event: CustomEvent<MatrixCellDetail>) => void;
  onStateChange?: (state: MatrixQueryState) => void;
}

/** The API of a matrix. Call it once `ready` has settled; a call made before the matrix part is in waits for it and returns a promise instead. */
export interface MatrixApi {
  readonly element: HTMLElement;
  readonly view: MatrixDocument;
  readonly ready: Promise<MatrixApi>;
  sort(axis: "rows" | "columns", by: MatrixSort["by"] | null, direction?: "asc" | "desc"): void;
  group(axis: "rows" | "columns", attribute: string | null): void;
  filter(axis: "rows" | "columns", attribute: string, values: string[] | null): void;
  setSearch(text: string): void;
  setAttentionOnly(on: boolean): void;
  getState(): Readonly<MatrixQueryState>;
  setState(state: MatrixStateInput): void;
  /** The ids of the visible items, members of collapsed groups included, in order. */
  getVisible(): Readonly<{ rows: string[]; columns: string[] }>;
  /** Moves focus to a cell; false when the row or column is not shown. */
  focusCell(row: string, column: string): boolean;
  /** Replaces the document, keeping the query that still applies (live refresh). */
  update(view: MatrixDocument): void;
  destroy(): void;
}

/** Creates a status matrix in a host element (docs/matrix.md). Ships with the grid and reporting entry points. */
export declare function createMatrix(host: HTMLElement, options: MatrixOptions): MatrixApi;
