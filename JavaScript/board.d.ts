import type { CellValue } from "./protocol.js";
import type { GridCommit } from "./editing.js";

/** Optional board renderer over the grid's records and accepted query. */
export interface GridBoardDefinition {
  /** Column whose raw scalar values identify the lanes. */
  column: string;
  titleColumn?: string;
  swimlaneColumn?: string;
  /** Up to eight card fields; the compact card displays the first two and the record panel exposes the rest. */
  fields?: string[];
  /** Permit drag, Alt+Left/Right and lane selection to propose an edit. Requires stable keys and an editable lane column. */
  editable?: boolean;
  /** Ordered lane labels and work limits. Values present in records add further lanes. */
  lanes?: { value: CellValue; label: string; wipLimit?: number }[];
}

/** A move changes nothing until a host accepts it or the configured editing writer saves it. */
export interface GridBoardMove {
  readonly id: string;
  readonly column: string;
  readonly previous: CellValue;
  readonly value: CellValue;
  readonly proposal: GridCommit;
  /** Accept with true; reject with false. One event responder may answer. */
  respondWith(answer: boolean | PromiseLike<boolean>): void;
}

/** Phone lane preference; saved views retain the same query, facets and columns as a grid. */
export interface GridBoardState { lane: string; }
