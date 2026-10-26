import type { CellValue } from "./protocol.js";
import type { GridAggregateDisplayValue, GridGroupLevel, GridQuery } from "./grid.js";

/** A declared sortable/filterable field, optionally bucketed. Aggregate ordering uses sortByTotal instead. */
export type GridPivotLevel = Omit<GridGroupLevel, "aggregate">;
/** Bounded full-query cross-tabulation. The value axis names declared reporting aggregates. */
export interface GridPivotDefinition {
  /** Up to four levels, outermost first. Empty axes produce totals only. */
  readonly rows: readonly GridPivotLevel[];
  /** Up to two levels, outermost first. */
  readonly columns: readonly GridPivotLevel[];
  /** One to 32 distinct declared aggregate IDs. */
  readonly values: readonly string[];
  /** One to 200 leaf columns including Other; defaults to 200. */
  readonly maxColumns?: number;
  /** One to 200 highest-total complete column paths, ranked by the first value aggregate. */
  readonly topNColumns?: number;
  readonly sortByTotal?: { readonly aggregate: string; readonly direction: "asc" | "desc" };
}
/** Presentation intent saved with the view; collapsing never changes raw result aggregates. */
export interface GridPivotState extends GridPivotDefinition {
  readonly active: boolean;
  readonly collapsedRows: readonly string[];
  readonly collapsedColumns: readonly string[];
  /** The selected column on a compact screen. Keys are opaque result identities. */
  readonly columnKey?: string;
}
/** An offset query with a mandatory accepted revision, plus its pivot definition. Paging does not limit pivot input. */
export interface GridPivotQuery {
  readonly protocol: "canopyx/2";
  readonly type: "gridPivotQuery";
  readonly query: GridQuery & { readonly revision: string };
  readonly definition: GridPivotDefinition;
}
/** A raw prefix, total, or synthetic Other node. Datetime path operands retain explicit-zone ISO strings. */
export interface GridPivotAxisNode {
  /** Opaque bounded identity; at most 65536 UTF-16 code units. */
  readonly key: string;
  readonly parent?: string;
  readonly path: readonly CellValue[];
  readonly other: boolean;
}
/** A populated prefix intersection. Missing intersections have zero counts and operation-specific empty values. */
export interface GridPivotCell {
  readonly row: string;
  readonly column: string;
  readonly count: number;
  readonly aggregates: Readonly<Record<string, number | null>>;
}
/** The data-only result written by CanopyPivot.Compute(...).ToJson(); no dataset ownership is implied. */
export interface GridPivotResult {
  readonly protocol: "canopyx/2";
  readonly type: "gridPivot";
  readonly view: string;
  readonly definition: GridPivotDefinition;
  readonly matched: number;
  readonly distinctColumns: number;
  readonly columnsLimited: boolean;
  /** Total first, followed by depth-first prefixes; at most 10001 nodes. */
  readonly rows: readonly GridPivotAxisNode[];
  /** Total first, retained prefixes, then Other; at most 402 nodes. */
  readonly columns: readonly GridPivotAxisNode[];
  /** Complete retained column paths, used as one atomic exclusion predicate for Other drill-through. */
  readonly retainedColumns: readonly (readonly CellValue[])[];
  /** At most 100000 populated intersections, including exact prefix totals. */
  readonly cells: readonly GridPivotCell[];
}
/** Hosted and browser-accepted results echo the exact accepted offset query and its revision. */
export interface GridPivotAcceptedResult extends GridPivotResult {
  readonly query: GridQuery & { readonly revision: string };
  readonly revision: string;
}
/** Numeric export values stay numeric; adapters apply numberFormat instead of parsing text. */
export interface GridPivotExportValue extends GridAggregateDisplayValue { readonly text: string; }
/** Presentation of an accepted axis identity. Prefix summaries precede their descendants; grand totals follow them. */
export interface GridPivotExportAxisPresentation {
  /** Opaque key into rowAxis or columnAxis; do not infer identity from a localized title. */
  readonly axisKey: string;
  readonly outlineLevel: number;
  readonly summary: boolean;
  readonly grandTotal: boolean;
  readonly collapsed: boolean;
  readonly hidden: boolean;
}
export interface GridPivotExportRow extends GridPivotExportAxisPresentation {
  readonly id: string;
  readonly cells: Readonly<Record<string, GridPivotExportValue | { readonly value: string; readonly text: string }>>;
}
export interface GridPivotExportColumn extends GridPivotExportAxisPresentation {
  readonly id: string;
  readonly title: string;
  readonly kind: "number";
  readonly aggregate: string;
}
/** A contiguous descendant range, excluding its leading prefix summary columns. */
export interface GridPivotExportColumnGroup {
  readonly key: string;
  readonly parent?: string;
  /** Zero-based index into snapshot.columns, including the row-label column. */
  readonly firstColumn: number;
  readonly columnCount: number;
  /** One-based axis depth. */
  readonly depth: number;
  readonly collapsed: boolean;
  readonly hidden: boolean;
}
/** Frozen full-query pivot export, independent of flat-record export scopes. Includes all prefixes and descendants. */
export interface GridPivotExportSnapshot {
  readonly view: string;
  readonly query: GridQuery;
  readonly definition: GridPivotDefinition;
  readonly columns: readonly ({ readonly id: string; readonly title: string; readonly kind: "text" } | GridPivotExportColumn)[];
  readonly rows: readonly GridPivotExportRow[];
  readonly columnGroups: readonly GridPivotExportColumnGroup[];
  readonly rowAxis: readonly GridPivotAxisNode[];
  readonly columnAxis: readonly GridPivotAxisNode[];
  /** Underlying accepted records, not the number of projected prefix rows. */
  readonly matched: number;
  readonly distinctColumns: number;
  readonly retainedColumns: readonly (readonly CellValue[])[];
  /** Omitted complete paths are combined in Other; the accepted record scope and totals remain complete. */
  readonly columnsLimited: boolean;
}
/** Available only on reporting grids with an initial pivot or pivotable enabled. */
export interface GridPivotApi {
  getPivot?(): GridPivotState | null;
  /** False shows flat records while retaining the configured definition. Resolves after acceptance. */
  setPivot?(definition: GridPivotDefinition | false): Promise<void>;
  getPivotResult?(): GridPivotAcceptedResult | null;
  getPivotExport?(): Promise<GridPivotExportSnapshot>;
  setPivotCollapsed?(axis: "rows" | "columns", key: string, collapsed: boolean): Promise<void>;
}
