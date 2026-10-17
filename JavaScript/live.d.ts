// Live data of flat grids (docs/live-data.md): rows added, changed and removed in place, the stable order, flashing cells,
// the batched update rate, polling and the revision-aware refresh of hosted grids.
import type { GridRow, GridQuery, AcceptedGridQuery } from "./grid.js";

/** The live settings a grid definition can carry (the C# CanopyGridLive writes them). */
export interface GridLiveDefinition {
  /** Rows whose sort keys change keep their places until the reader re-sorts (default true); false moves them at once. */
  stableOrder?: boolean;
  /** Changed cells flash briefly (a still outline with reduced motion); an object sets the duration, 100..10000 ms (default 1200). */
  flash?: boolean | { durationMs?: number };
  /** Changes arriving within this many milliseconds apply together, 0..60000 (default 0: at once). */
  batchMs?: number;
  /** Polls the source every pollMs, 250..86400000 (0 or absent: no polling). */
  pollMs?: number;
  /** Announce added and removed rows to screen readers, at most every two seconds (default true). */
  announce?: boolean;
  /** Skip polls while the page is hidden and catch up when it shows (default true). */
  pauseWhenHidden?: boolean;
}

/** What a live load function answers: complete rows (a full replacement, diffed by id), a transaction, or nothing. */
export type GridLiveAnswer<Row extends GridRow = GridRow> = readonly Row[] | GridTransaction<Row> | null | undefined;

/** The host's live options: the definition's settings plus the load function an inline grid polls. */
export interface GridLiveOptions<Row extends GridRow = GridRow, Q extends AcceptedGridQuery = GridQuery> extends GridLiveDefinition {
  /** An inline grid's source of fresh rows for refreshRows and polling. */
  load?: (context: { signal: AbortSignal; query: Q; rows: number }) => GridLiveAnswer<Row> | PromiseLike<GridLiveAnswer<Row>>;
}

/** A row update: the id, and the cells to change (null clears a nullable cell); tone, className, fields and detail replace the row's when given. */
export interface GridRowUpdate<Row extends GridRow = GridRow> {
  id: string;
  cells?: { [Column in keyof Row["cells"]]?: Row["cells"][Column] };
  tone?: string | null;
  className?: string | null;
  fields?: Row extends { fields?: infer Fields } ? Fields : Record<string, unknown>;
  detail?: Row["detail"];
}

/**
 * Changes to apply in place. Removes apply first, then adds (a row whose id the grid has replaces it), then updates. A
 * gridTransaction document (protocol, type, view) is accepted too. At most 100,000 rows in all.
 */
export interface GridTransaction<Row extends GridRow = GridRow> {
  add?: readonly Row[];
  update?: readonly GridRowUpdate<Row>[];
  remove?: readonly (string | { id: string })[];
  protocol?: "canopyx/2";
  type?: "gridTransaction";
  view?: string;
}

/** What a change did; canopyx:rowsChanged and onRowsChanged carry the same detail with its source. */
export interface GridLiveResult {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  /** Updates and removes of ids the grid did not have, which were skipped. */
  readonly missing: readonly string[];
  /** Kept rows are out of their sorted places and the "Order changed" prompt shows. */
  readonly orderChanged: boolean;
  /** A cursor grid's source has a newer revision and the "New data" prompt shows. */
  readonly newData: boolean;
  readonly revision: string | null;
  readonly source: "api" | "poll" | "refresh";
}

export interface GridLiveState {
  readonly orderChanged: boolean;
  readonly newData: boolean;
  /** Changes waiting for the batch window. */
  readonly pending: number;
  readonly polling: boolean;
  readonly revision: string | null;
}

export interface GridPollOptions<Row extends GridRow = GridRow, Q extends AcceptedGridQuery = GridQuery> {
  /** 250..86400000; defaults to the live pollMs. */
  intervalMs?: number;
  /** Poll at once instead of after the first interval. */
  immediate?: boolean;
  pauseWhenHidden?: boolean;
  /** An inline grid's load function (replaces live.load). */
  load?: GridLiveOptions<Row, Q>["load"];
}

/** A running poll; destroying the grid stops it. */
export interface GridPoller {
  pause(): void;
  resume(): void;
  stop(): void;
  /** Polls now (or joins a poll that runs). */
  refresh(): Promise<void>;
  readonly paused: boolean;
  readonly active: boolean;
}

/** Live data methods of a flat grid; they load the live part on first use. */
export interface GridLiveApi<Row extends GridRow = GridRow, Q extends AcceptedGridQuery = GridQuery> {
  /** Applies changes in place (inline rows; a hosted grid takes updates of its loaded rows). Settles when the batch applies. */
  applyTransaction(transaction: GridTransaction<Row>): Promise<GridLiveResult>;
  addRows(rows: readonly Row[]): Promise<GridLiveResult>;
  updateRows(rows: readonly GridRowUpdate<Row>[]): Promise<GridLiveResult>;
  removeRows(ids: readonly (string | { id: string })[]): Promise<GridLiveResult>;
  /** Inline grids: replaces every row, applying only the differences, so unchanged rows keep everything. */
  setRows(rows: readonly Row[]): Promise<GridLiveResult>;
  /** Applies changes waiting for the batch window now. */
  flushTransactions(): Promise<GridLiveResult | undefined>;
  /** A hosted grid's revision-aware refresh, or an inline grid's live load function. */
  refreshRows(): Promise<GridLiveResult>;
  /** Moves kept rows to their sorted places; shows a hosted grid's newest result, a cursor grid's first page. */
  resort(): Promise<void>;
  poll(options?: GridPollOptions<Row, Q>): Promise<GridPoller>;
  getLiveState(): GridLiveState;
}
