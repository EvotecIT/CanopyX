import type { AcceptedGridQuery, GridFilter, GridFilterGroup, GridGroupLevel, GridSort } from "./grid.js";

/** A data-only view proposal. Missing fields preserve the current view; empty arrays clear the corresponding setting. */
export interface GridViewIntent {
  readonly protocol: "canopyx/2";
  readonly type: "viewIntent";
  readonly version: 1;
  readonly view: string;
  readonly query?: {
    readonly search?: string;
    readonly searchMode?: "substring" | "words";
    readonly sort?: readonly GridSort[];
    readonly filters?: readonly GridFilter[];
    readonly filterGroup?: GridFilterGroup | null;
    readonly groupBy?: readonly GridGroupLevel[];
  };
  /** Visible column identities in display order. Hidden columns remain available to queries and host policy. */
  readonly columns?: readonly string[];
}

/** A one-use proposal preview, tied to the grid's accepted state. It never grants data or write authorization. */
export interface GridViewIntentPreview<Q extends AcceptedGridQuery = AcceptedGridQuery> {
  readonly element: HTMLElement;
  readonly intent: GridViewIntent;
  /** Apply the captured proposal. Rejects if the grid changed, was destroyed, or this handle was already consumed. */
  apply(): Promise<Q>;
  cancel(): void;
}

export interface GridViewIntentApi<Q extends AcceptedGridQuery = AcceptedGridQuery> {
  /** Export the accepted query and visible columns as a versioned proposal. Loads the optional part. */
  getViewIntent(): Promise<GridViewIntent>;
  /** Validate against actual column identities, types and capabilities; never changes the view. */
  validateViewIntent(input: unknown): Promise<GridViewIntent>;
  /** Render preview chips without applying the proposal. */
  previewViewIntent(input: GridViewIntent, container?: HTMLElement): Promise<GridViewIntentPreview<Q>>;
  /** Validate and render preview chips. The reader's Apply action or returned handle applies the proposal. */
  applyViewIntent(input: GridViewIntent): Promise<GridViewIntentPreview<Q>>;
}
