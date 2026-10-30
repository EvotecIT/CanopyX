/** A group of columns drawn as a header above them (docs/column-groups.md). Groups nest up to three levels. */
export interface GridColumnGroup {
  readonly id: string;
  /** Header text, 1 to 256 characters. */
  readonly title: string;
  /** Columns directly below the group, in any order; a column belongs to one group at most. */
  readonly columns?: readonly string[];
  /** Groups nested below this one. */
  readonly groups?: readonly GridColumnGroup[];
  /** Initial pin of every column of a top-level semantic group; null scrolls. Not supported in presentation mode. */
  readonly pinned?: "left" | "right" | null;
}
/** A column group as the grid shows it now. */
export interface GridColumnGroupState {
  readonly id: string;
  readonly title: string;
  /** Every column below the group, in the current column order. */
  readonly columns: readonly string[];
  /** The columns of the group that are on screen. */
  readonly visibleColumns: readonly string[];
  /** The requested pin of the group's columns; presentation definitions can have mixed pins. */
  readonly pin: "none" | "left" | "right" | "mixed";
  readonly groups: readonly GridColumnGroupState[];
}

/** Column group members of every flat grid. Before the part loads the read answers empty and the action loads it; the action answers with a promise that rejects when it fails. */
export interface GridColumnGroupApi {
  /** The groups in their current order. */
  getColumnGroups(): readonly GridColumnGroupState[];
  /** Actual displayed spans, ordered by level then visible column position. Empty before the optional part loads. */
  getColumnBands(): readonly GridColumnBand[];
  /** Shows or hides every column of a semantic group; rejects for presentation bands. */
  setColumnGroupVisible(id: string, visible: boolean): Promise<void>;
}

/** One contiguous displayed header span. A logical group may appear in several bands. */
export interface GridColumnBand {
  readonly id: string;
  readonly title: string;
  readonly columns: readonly string[];
  /** One-based group level, visible column position and span. */
  readonly level: number;
  readonly columnIndex: number;
  readonly columnSpan: number;
  /** Effective pin of this span after the ordinary pin budget is applied. */
  readonly pin: "none" | "left" | "right";
}
