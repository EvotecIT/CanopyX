/** Optional planning over the calendar resource timeline; durations and lags use elapsed time. */
export interface GridPlanDefinition {
  baselineStart?: string;
  baselineEnd?: string;
  /** Boolean or text 'true' cells declare milestones; zero-duration tasks are milestones too. */
  milestone?: string;
  /** Emphasize zero-slack tasks only when the complete task network is available. Defaults to true. */
  criticalPath?: boolean;
  proposeMoves?: boolean;
  avoidOverlap?: boolean;
  dependencies?: { predecessor: string; successor: string; lagMinutes?: number }[];
}

/** A proposal leaves actual dates and resources unchanged; the host validates, persists and refreshes them. */
export interface GridPlanChangeProposal {
  readonly id: string;
  readonly previous: { readonly start: string; readonly end: string; readonly resource: string | null };
  readonly proposed: { readonly start: string; readonly end: string; readonly resource: string | null };
  readonly conflicts: readonly { readonly kind: string; readonly id: string | null; readonly label: string }[];
}
export interface GridPlanOptions {
  propose?(proposal: GridPlanChangeProposal, context: { signal: AbortSignal }): void | PromiseLike<void>;
}
