// The record panel (docs/record-panel.md): structured values, record-only fields, the record drawer's layout, record links,
// records loaded on demand (the gridRecord exchange) and the extension points of the drawer.
import type { Cell, CellValue } from "./protocol.js";

/** A link from a value to another record: of the value's own view, or of the grid or tree with id view. */
export interface RecordRef {
  readonly id: string;
  readonly view?: string;
  /** A tree record's id path from a top-level node, ending with id, so the tree can expand to it. */
  readonly path?: readonly string[];
}
/** One named value of an object value. */
export interface RecordFieldValue { readonly name: string; readonly value: Cell; readonly kind?: "number" | "datetime"; }
/** A field's value before and after a change. Lists (items) on both sides mark the items removed and added. */
export interface RecordChange { readonly name: string; readonly before: Cell; readonly after: Cell; readonly kind?: "number" | "datetime"; }
/** One timeline event. */
export interface RecordEvent {
  readonly time?: string; readonly summary: string; readonly actor?: string; readonly kind?: string; readonly tone?: string;
  readonly ref?: RecordRef; readonly changes?: readonly RecordChange[];
}
/** A column of a collection: a grid column (rows) or a tree column (roots). */
export interface RecordListColumn {
  readonly id: string; readonly title: string; readonly kind?: "text" | "number" | "datetime"; readonly width?: number;
  readonly sortable?: boolean; readonly presenter?: unknown; readonly [option: string]: unknown;
}
/** A row of a collection. */
export interface RecordListRow { readonly id: string; readonly cells: Readonly<Record<string, Cell>>; readonly [field: string]: unknown; }
/** The grid whose records a collection's rows are: rows open their record there, and Open all in grid filters it. */
export interface RecordTarget {
  readonly view: string; readonly column?: string; readonly values?: readonly CellValue[];
  readonly filters?: readonly { readonly column: string; readonly operator: string; readonly values: readonly CellValue[] }[];
}
/** A collection of records: rows (or tree roots), the total when rows are the first ones, and the target grid. */
export interface RecordList {
  readonly columns: readonly RecordListColumn[];
  readonly rows?: readonly RecordListRow[];
  readonly roots?: readonly unknown[];
  readonly total?: number; readonly pageLength?: number; readonly pageSize?: number;
  readonly target?: RecordTarget;
}
/** The structured members a cell object may carry (at most one of items, fields, records, events and changes) and a link. */
export interface StructuredCell {
  /** A list value: chips in the panel; the structured presenter summarises it in the grid. */
  items?: Cell[];
  /** An object value: a nested property list. */
  fields?: RecordFieldValue[];
  /** A collection: a nested grid or tree, cards on phones, a table in print. */
  records?: RecordList;
  /** A timeline. */
  events?: RecordEvent[];
  /** Before/after values. */
  changes?: RecordChange[];
  /** A link to another record. */
  ref?: RecordRef;
}

/** A record-only field: a value the drawer shows that is not a grid column. */
export interface RecordFieldDefinition {
  readonly id: string; readonly title: string; readonly kind?: "text" | "number" | "datetime";
  /** A flat-grid presenter descriptor (the grid runtimes apply it). */
  readonly presenter?: unknown; readonly wrap?: boolean; readonly section?: string;
  /** Visible wrapped lines, from 1 to 12. Default 2; the full value remains available in its tooltip. */
  readonly maxLines?: number;
}
export interface RecordSectionDefinition {
  readonly id: string; readonly label: string; readonly fields?: readonly string[]; readonly collapsed?: boolean;
  /** A plugin's drawerSections entry or the host's recordSections entry that draws content above the fields. */
  readonly renderer?: string; readonly sections?: readonly RecordSectionDefinition[];
}
export interface RecordTabDefinition { readonly id: string; readonly label: string; readonly sections: readonly string[]; }
/** The view's record panel (view.record). */
export interface RecordPanelDefinition {
  readonly fields?: readonly RecordFieldDefinition[];
  readonly header?: { readonly status?: string; readonly facts?: readonly string[] };
  readonly sections?: readonly RecordSectionDefinition[];
  readonly tabs?: readonly RecordTabDefinition[];
  /** Empty fields hide until the reader shows them. Default true. */
  readonly hideEmpty?: boolean;
  /** A jump list of sections; absent shows it from four sections. */
  readonly jumpList?: boolean;
  /** Record deep links (#record=<view>:<id>, or the key given). */
  readonly deepLink?: true | { readonly key?: string };
  readonly source?: { readonly kind: "inline" | "host" } | { readonly kind: "sidecar"; readonly base: string; readonly shards: number };
  readonly actions?: { readonly copy?: boolean; readonly print?: boolean; readonly export?: boolean; readonly link?: boolean };
}

/** The request for a record's details: the record, a collection field's next rows (field, offset, limit), or its row too. */
export interface GridRecordQuery {
  readonly protocol: "canopyx/2"; readonly type: "gridRecordQuery"; readonly view: string; readonly id: string;
  readonly revision?: string; readonly field?: string; readonly offset?: number; readonly limit?: number; readonly row?: true;
}
/** A record's details. Plain objects with cells, fields and row are accepted as well. */
export interface GridRecord {
  readonly protocol?: "canopyx/2"; readonly type?: "gridRecord"; readonly view?: string; readonly id?: string; readonly revision?: string;
  readonly cells?: Readonly<Record<string, Cell>>; readonly fields?: Readonly<Record<string, Cell>>;
  readonly row?: RecordListRow;
}
/** Loads a record's details when its drawer opens (the loadRecord option, or a hosted source's record hook). */
export type RecordLoader = (request: GridRecordQuery, options: { signal: AbortSignal }) => GridRecord | null | PromiseLike<GridRecord | null>;
/** The context of a drawer section renderer. */
export interface RecordSectionContext {
  readonly section: string; readonly view: string; readonly api: unknown; readonly labels: Readonly<Record<string, string>>;
  readonly signal: AbortSignal; readonly payload: GridRecord | null;
  /** Every field's value, columns and record fields, by id. */
  readonly values: Readonly<Record<string, Cell | undefined>>;
  /** True while the record prints. */
  readonly print: boolean; readonly width: number;
  onDispose(cleanup: () => void): void;
}
/** Draws a drawer section's content (a chart, for example) into element. */
export type RecordSectionRenderer = (record: Readonly<{ id: string; cells?: Readonly<Record<string, Cell>>; fields?: Readonly<Record<string, Cell>>; label?: string }>,
  element: HTMLElement, context: RecordSectionContext) => void | PromiseLike<void>;
/** An action of the record panel's actions menu. */
export interface RecordAction {
  readonly label: string;
  run(context: { readonly record: Readonly<{ id: string; cells?: Readonly<Record<string, Cell>>; fields?: Readonly<Record<string, Cell>> }>; readonly view: string; readonly api: unknown;
    readonly payload: GridRecord | null; readonly signal: AbortSignal }): void | PromiseLike<void>;
}
/** The canopyx:openAll event's detail (and onOpenAll's argument): cancel it to filter the target grid yourself. */
export interface RecordOpenAll {
  readonly view: string; readonly ids: readonly string[]; readonly field: string; readonly record: string; readonly total: number;
  readonly filters: readonly { readonly column: string; readonly operator: string; readonly values: readonly CellValue[] }[] | null;
}
/** Options that open a record (openRecord). */
export interface OpenRecordOptions { readonly returnFocus?: Element | null; readonly path?: readonly string[]; readonly tab?: string; }
/** Host options of the record panel, on grids and trees. */
export interface RecordPanelOptions {
  /** Loads a record's details when its drawer opens; used whatever the declared source. */
  loadRecord?: RecordLoader;
  /** Section renderers by name, beside the plugins' drawerSections. */
  recordSections?: Readonly<Record<string, RecordSectionRenderer>>;
  /** Actions of the record actions menu, after the built-in ones. */
  recordActions?: readonly RecordAction[];
  /** Open all in grid: return false (or cancel canopyx:openAll) to handle it yourself. */
  onOpenAll?: (event: RecordOpenAll) => boolean | void;
  /** Print one record: return false (or cancel canopyx:recordPrint) to print the sheet yourself. */
  onRecordPrint?: (event: { readonly id: string; readonly element: HTMLElement; readonly dispose: () => void }) => boolean | void;
}
