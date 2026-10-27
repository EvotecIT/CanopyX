import type { CanopyBadge } from "./protocol.js";

/** Optional inline stack explanation. The host supplies processing order, states, reasons and the winner. */
export interface GridStackDefinition {
  /** A declared column; defaults to the row-header column, then the first visible column. */
  titleColumn?: string;
  /** Up to 1,000 ordered layers. Empty is valid; a nonempty stack has exactly one winner. */
  layers: GridStackLayer[];
}

/** A layer's identity is independent of its record, so several layers can open the same record panel. */
export interface GridStackLayer {
  /** Unique, stable layer id. */
  id: string;
  /** Existing stable inline grid record id. */
  record: string;
  /** Nonblank host explanation; CanopyX performs no precedence calculations. */
  reason: string;
  /** Optional context in addition to the record title. */
  label?: string;
  /** Exactly one true value in a nonempty stack. A winner cannot be filtered. */
  winner?: boolean;
  /** Host-supplied state, independent of winner selection. */
  enforced?: boolean;
  /** Host-supplied exclusion, kept visible with its reason. */
  filtered?: boolean;
  badges?: CanopyBadge[];
}
