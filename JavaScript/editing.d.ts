// Editing of flat grids (docs/editing.md): typed editors, validation, the change set, row and batch commit, undo and redo.
import type { CellValue, Cell, TimeZone } from "./protocol.js";
import type { GridRow, GridQuery, AcceptedGridQuery } from "./grid.js";

/** A built-in editor type, or the name of an editor a plugin or the host registers. */
export type GridEditorType = "text" | "number" | "date" | "datetime" | "time" | "select" | "toggle" | "lookup" | (string & {});

/** A select choice or a fixed lookup suggestion: a raw value, or a value with the label readers see. */
export type GridEditorOption = string | number | boolean | { value: string | number | boolean; label?: string };

/** The editor of an editable column; a name alone is shorthand for { type }. */
export type GridEditorDefinition = GridEditorType | {
  type: GridEditorType;
  /** Number editors: the smallest value, also the start of step. */
  min?: number;
  /** Number editors: the largest value. */
  max?: number;
  /** Number editors: Up and Down move by it; values keep its multiple. */
  step?: number;
  placeholder?: string;
  /** Select choices, or a lookup's fixed suggestions (at most 1000). */
  options?: readonly GridEditorOption[];
  /** Lookups: the column whose values it suggests through the data source (default the edited column), how many (1..50, default 20) and after how many characters (0..16, default 1). */
  lookup?: { column?: string; limit?: number; minLength?: number };
};

/** Checks an edited value must pass before its row commits; the messages are the gridEdit… labels unless message replaces them. */
export interface GridValidation {
  required?: boolean;
  /** A number, or an ISO 8601 moment with its time zone for date-and-time columns. */
  min?: number | string;
  max?: number | string;
  minLength?: number;
  maxLength?: number;
  /** A regular expression the whole text must match. */
  pattern?: string;
  message?: string;
}

/** The view document's editing settings; the editing option overrides them. */
export interface GridEditingSettings {
  /** The whole grid is read-only until setReadOnly(false). */
  readOnly?: boolean;
  /** One cell at a time (default), or every editable cell of a row. */
  mode?: "cell" | "row";
  /** When the record drawer becomes an edit form (default "phone"). */
  drawer?: "phone" | "always" | "never";
  /** The toolbar shows unsaved changes with Undo, Redo, Discard and Save (default true). */
  editBar?: boolean;
}

/** What an editor's create function receives. Frozen. */
export interface CanopyEditorContext {
  /** A unique id prefix for elements the editor creates. */
  readonly id: string;
  /** The cell's raw value when editing starts. */
  readonly value: CellValue;
  /** The cell's display text. */
  readonly text: string;
  /** A frozen copy of the record. */
  readonly row: Readonly<GridRow>;
  readonly column: Readonly<{ id: string; title: string; kind: "text" | "number" | "datetime" }>;
  /** The column's editor definition, with its type. */
  readonly editor: Readonly<Exclude<GridEditorDefinition, string>>;
  readonly options: readonly Readonly<{ value: string | number | boolean; label: string }>[] | null;
  readonly rules: Readonly<GridValidation & { step?: number }>;
  readonly labels: Readonly<Record<string, string>>;
  /** The page language, for parsing and formatting. */
  readonly locale: string | undefined;
  /** The grid's time zone: dates are shown and entered in it. */
  readonly timeZone: TimeZone;
  /** Where the editor is: a cell, a row in full-row mode, or the drawer's edit form. */
  readonly mode: "cell" | "row" | "form";
  /** The character the reader typed to start editing ("" for Backspace or Delete), when there is one. */
  readonly initial: string | undefined;
  /** Aborts when the editor closes. */
  readonly signal: AbortSignal;
  readonly lookupMinLength: number;
  /** Applies the editor's value and closes it. */
  commit(): void;
  /** Closes the editor without applying. */
  cancel(): void;
  /** Searches the column's suggestions as a lookup does. */
  lookup(search: string, signal: AbortSignal): Promise<readonly { value: string | number | boolean; label: string }[]>;
  /** Remembers a chosen suggestion, so the cell shows its label. */
  remember(option: { value: string | number | boolean; label: string }): void;
}

/** An editor instance. getValue returns the raw cell value; error returns a message while the input is not a value yet. */
export interface CanopyEditorInstance {
  /** What goes into the cell (or the form field). */
  readonly element: HTMLElement;
  /** The focusable control, when it is not element itself; it gets the accessible name and the invalid state. */
  readonly control?: HTMLElement;
  getValue(): CellValue;
  focus?(): void;
  error?(): string | null;
  destroy?(): void;
}

/** A typed cell editor a plugin (editors) or the host (editing.editors) registers under a name. */
export interface CanopyCellEditor {
  create(context: CanopyEditorContext): CanopyEditorInstance;
}

/** A row's change: the new values and the values the row started from. */
export interface GridChange {
  readonly id: string;
  readonly values: Readonly<Record<string, CellValue>>;
  readonly original: Readonly<Record<string, CellValue>>;
  /** Messages by column of the failed checks. */
  readonly errors?: Readonly<Record<string, string>>;
  /** The row's own message: a row check or a failed save. */
  readonly error?: string;
  readonly status?: "saving" | "error" | "conflict";
}

/** What a writer answers for one row of a gridCommit. */
export interface GridCommitRowResult {
  status: "saved" | "error" | "conflict";
  /** Saved rows: canonical cells that replace the shown ones. */
  cells?: Record<string, Cell>;
  error?: string;
  errors?: Record<string, string>;
}

/** Changed rows a grid asks its writer to save (docs/data-protocol.md#editing-and-commit). */
export interface GridCommit {
  readonly protocol: "canopyx/2";
  readonly type: "gridCommit";
  readonly view: string;
  /** The dataset revision the grid read, or null. */
  readonly revision: string | null;
  readonly rows: readonly { readonly id: string; readonly values: Readonly<Record<string, CellValue>>; readonly original: Readonly<Record<string, CellValue>> }[];
}

/** A writer's answer to gridCommit. A row it leaves out was not saved; revision is the dataset revision after the commit. */
export interface GridCommitResult {
  protocol: "canopyx/2";
  type: "gridCommitResult";
  view: string;
  revision?: string;
  rows: (GridCommitRowResult & { id: string })[];
}

/** The result of one row of a commit. */
export interface GridRowCommitOutcome {
  readonly id: string;
  readonly ok: boolean;
  readonly status: "saved" | "pending" | "unchanged" | "invalid" | "cancelled" | "error" | "conflict" | "superseded";
  readonly error?: string | null;
  readonly errors?: Readonly<Record<string, string>>;
}

/** What commitChanges resolves with. */
export interface GridCommitOutcome {
  readonly ok: boolean;
  readonly saved: number;
  readonly failed: number;
  readonly rows: readonly GridRowCommitOutcome[];
  /** The revision the writer answered with; the grid keeps reading pages at the one it accepted until it reloads. */
  readonly revision?: string;
}

/** cellValueChanging (cancelable) and cellValueChanged. */
export interface GridCellValueChange {
  readonly id: string;
  readonly column: string;
  readonly value: CellValue;
  readonly previous: CellValue;
  readonly row: Readonly<GridRow>;
  readonly source: "edit" | "form" | "api" | "undo" | "redo" | "revert";
}

/** canopyx:rowCommit and onRowCommit: a row whose edits are complete and valid. */
export interface GridRowCommit {
  readonly id: string;
  readonly values: Readonly<Record<string, CellValue>>;
  readonly original: Readonly<Record<string, CellValue>>;
  readonly row: Readonly<GridRow>;
  readonly revision: string | null;
  /** Answers for the row from an event listener: a result, true for saved, or a promise of one. */
  respondWith(result: GridCommitRowResult | true | PromiseLike<GridCommitRowResult | true>): void;
}

/** A lookup search the host answers itself. */
export interface GridLookupRequest {
  readonly column: string;
  readonly search: string;
  readonly limit: number;
  readonly row: Readonly<GridRow>;
  readonly signal: AbortSignal;
}

/** The host's editing option. */
export interface GridEditingOptions<Q extends AcceptedGridQuery = GridQuery> extends GridEditingSettings {
  /** Per-row read-only rule; runs synchronously for every cell it is asked about. */
  isEditable?(row: Readonly<GridRow>, column: string): boolean;
  /** Per-column checks: a message, null, or a promise of one. */
  validators?: Readonly<Record<string, (value: CellValue, row: Readonly<GridRow>) => string | null | undefined | PromiseLike<string | null | undefined>>>;
  /** A row check before it commits: a row message, messages by column, null, or a promise of them. */
  validateRow?(row: Readonly<GridRow>, change: GridChange): string | Record<string, string> | null | undefined | PromiseLike<string | Record<string, string> | null | undefined>;
  /** Lookup suggestions by column, in place of the editor's options and the data source. */
  lookups?: Readonly<Record<string, (request: GridLookupRequest) => readonly GridEditorOption[] | PromiseLike<readonly GridEditorOption[]>>>;
  /** The text edited cells of a column show, by column: the same formatter the host's source text comes from, so every cell of the column reads alike. Without one, edited cells use the column's default formatting (or a choice's label). */
  formatters?: Readonly<Record<string, (value: Exclude<CellValue, null>, row: Readonly<GridRow>) => string>>;
  /** Editors for this grid, beside the built-in ones and the plugins'. */
  editors?: Readonly<Record<string, CanopyCellEditor>>;
  /** The batch writer; wins over the source's commit. */
  commit?(batch: GridCommit, options: { signal: AbortSignal }): GridCommitResult | PromiseLike<GridCommitResult>;
  /** Undo steps kept (0..10000, default 100). */
  undoLimit?: number;
}

/** The editing members of a flat grid's API. */
export interface GridEditingApi {
  /** Opens the editor of a loaded record's cell (the first editable visible cell without column); false when it cannot. */
  beginEdit(id: string, column?: string, options?: { initial?: string }): Promise<boolean>;
  /** Applies the open editors; false while a value fails a check. */
  endEdit(): Promise<boolean>;
  cancelEdit(): void;
  isEditing(): boolean;
  /** A host's change with the same events, history and checks as an edit; read-only rules do not apply. */
  setCellValue(id: string, column: string, value: CellValue): Promise<{ applied: boolean; valid: boolean; error?: string }>;
  getChanges(): GridChange[];
  hasChanges(): boolean;
  /** Puts rows (all by default) back to their starting values, as one undoable step. */
  revertChanges(ids?: readonly string[]): void;
  validate(ids?: readonly string[]): Promise<{ valid: boolean; rows: { id: string; valid: boolean; errors: Record<string, string>; error?: string | null }[] }>;
  /** Checks a row and raises rowCommit; resolves with what the handler answered. */
  commitRow(id: string): Promise<GridRowCommitOutcome>;
  /** Sends every valid changed row (or the ids) to the writer in one gridCommit. */
  commitChanges(options?: { ids?: readonly string[]; signal?: AbortSignal }): Promise<GridCommitOutcome>;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  setReadOnly(readOnly: boolean): void;
}
