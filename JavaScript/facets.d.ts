// The facet panel of flat grids (docs/facets.md): value lists with counts and ranges with histograms that filter each other.
import type { GridRow, GridColumnId, GridBucket } from "./grid.js";

/** One facet: a column id, or a column with its settings. */
export type GridFacet<Row extends GridRow = GridRow> = GridColumnId<Row> | {
  column: GridColumnId<Row>;
  /** Calendar or numeric partition, shown as a chronological value list. */
  bucket?: GridBucket;
  /** "list" (text columns by default) or "range" with a histogram (number and date columns by default). */
  kind?: "list" | "range";
  /** The facet's heading; the column's title by default. */
  label?: string;
  /** Values a list shows before "Show N more", 1..200 (default 8). */
  limit?: number;
  /** Bars in a range's histogram, 2..60 (default 16). */
  bins?: number;
  /** "count" (most frequent first) or "value"; omitted uses declared column order, otherwise count. */
  sort?: "count" | "value";
  /** Starts collapsed to its heading. */
  collapsed?: boolean;
};

/** The facet panel a grid definition carries (the C# CanopyFacetPanel writes it). */
export interface GridFacetPanelDefinition<Row extends GridRow = GridRow> {
  /** 1 to 24 distinct columns; a hosted grid's must be reporting facet columns. */
  columns: readonly GridFacet<Row>[];
  /** Beside the grid (default) or above it. */
  position?: "side" | "top";
  /** Starts open (default true); the grid state keeps the reader's choice. */
  open?: boolean;
  /** The reader can collapse the panel (default true). */
  collapsible?: boolean;
  /** A side panel's width, 180..480 pixels (default 260). */
  width?: number;
  /** The panel's heading; "Filter by" by default. */
  label?: string;
}

/** The host's facet options: the definition's fields, and an element the panel renders into. */
export interface GridFacetPanelOptions<Row extends GridRow = GridRow> extends Partial<GridFacetPanelDefinition<Row>> {
  /** An element the panel renders into, for a host that lays out the page itself; the grid element stays where it is. */
  target?: HTMLElement;
}

/** The facet panel's state, from getFacetPanel(). */
export interface GridFacetPanelState {
  /** Whether the panel is open; null before the facets part has started. */
  readonly open: boolean | null;
  /** The facet columns, in order; empty before the facets part has started. */
  readonly columns: readonly string[];
  /** Facets with a choice. */
  readonly active?: number;
}

/** Facet panel methods of a flat grid. */
export interface GridFacetPanelApi {
  getFacetPanel(): GridFacetPanelState;
  /** Opens or collapses the panel; loads the facets part on first use. */
  setFacetPanelOpen(open: boolean): Promise<GridFacetPanelState>;
}
