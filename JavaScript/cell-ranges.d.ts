import type { CellValue } from "./protocol.js";

/** Cell-range selection (docs/cell-ranges.md): true, or the switches. */
export type GridRangeSelection = boolean | {
  /** False turns the pointer and keyboard input off; the API still works. */
  readonly enabled?: boolean;
  /** Ctrl or Cmd adds ranges (default true). */
  readonly multiple?: boolean;
  /** Shows the fill handle on a single range (default false). */
  readonly fillHandle?: boolean;
};
/** How cell ranges copy and paste. */
export interface GridClipboardSettings {
  /** Copies start with the column titles and the group rows (default false). */
  readonly copyHeaders?: boolean;
  /** The shown text or raw values (default "display"). */
  readonly copyValues?: "display" | "raw";
  /** Ctrl/Cmd+V and the cell menu paste (default true). */
  readonly paste?: boolean;
}
/** A range: row positions in the shown order and column ids, both inclusive. */
export interface GridCellRange {
  readonly startRow: number;
  readonly endRow: number;
  readonly startColumn: string;
  readonly endColumn: string;
}
/** A cell a paste or fill offers: its row id, column, position, the pasted text, the value read from it and the old value. */
export interface GridPasteCell {
  readonly id: string;
  readonly column: string;
  readonly row: number;
  readonly text: string;
  readonly value: CellValue;
  readonly previous: CellValue;
}
/** A cell that did not take its value, and why. */
export interface GridPasteRefusal extends GridPasteCell { readonly reason: string; }
/** The detail of the cancelable canopyx:paste event and the argument of onPaste. */
export interface GridPasteEvent {
  readonly source: "clipboard" | "api" | "fill";
  /** The cells whose text reads as a value of their column. */
  readonly cells: readonly GridPasteCell[];
  /** The cells refused already: text their column cannot read. */
  readonly refused: readonly GridPasteRefusal[];
  /**
   * A grid without the editing part applies nothing itself: a handler that applies the values answers with the cells it
   * refused (or false for all), so the grid can report them. With the editing part the cells go through editing after the event.
   */
  respondWith(result: { readonly refused?: readonly { readonly id: string; readonly column: string; readonly reason?: string }[] } | boolean |
    PromiseLike<{ readonly refused?: readonly { readonly id: string; readonly column: string; readonly reason?: string }[] } | boolean>): void;
}
/** What a paste or fill did. */
export interface GridPasteResult {
  readonly applied: number;
  readonly refused: readonly GridPasteRefusal[];
  readonly cancelled: boolean;
}
export interface GridCopyOptions {
  readonly headers?: boolean;
  readonly values?: "display" | "raw";
}
/** Cell-range members of every flat grid. Before the part loads the read answers empty and the actions load it; actions run at once once it is in and answer with a promise that rejects when they fail. */
export interface GridCellRangeApi {
  getCellRanges(): readonly GridCellRange[];
  /** Replaces the ranges; omitted ends make a range of one cell. */
  setCellRanges(ranges: readonly (Pick<GridCellRange, "startRow" | "startColumn"> & Partial<GridCellRange>)[]): Promise<void>;
  clearCellRanges(): Promise<void>;
  selectAllCells(): Promise<void>;
  /** The ranges (or the focused cell) as tab-separated text, loading rows that are not cached. */
  getCellRangeText(options?: GridCopyOptions): Promise<string>;
  /** Copies the ranges (or the focused cell) as text and a typed table; resolves with the text. */
  copyCellRanges(options?: GridCopyOptions): Promise<string>;
  /** Pastes tab-separated text at a row position and column, or at the ranges. */
  pasteCells(text: string, at?: { readonly row: number; readonly column: string }): Promise<GridPasteResult>;
}
