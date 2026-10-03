/** Values carried by cells and host-governed edit proposals. Numbers must be finite. */
export type CellValue = string | number | boolean | null;
export type TimeZone = "utc" | "local";
export type CheckMode = "independent" | "hierarchical";
export type CheckState = boolean | "mixed";
export type SortDirection = "asc" | "desc";

export interface CanopyBadge { text: string; tone?: string; title?: string; }
export interface CanopyCell {
  value?: CellValue;
  text?: string;
  title?: string;
  tone?: string;
  badges?: CanopyBadge[];
}
export type Cell = CellValue | CanopyCell;

/** A host-owned node. IDs are unique within the view; lazy nodes omit children. */
export interface CanopyNode {
  id: string;
  label: string;
  kind?: string;
  icon?: string;
  group?: boolean;
  cells?: Record<string, Cell>;
  badges?: CanopyBadge[];
  flags?: string[];
  data?: Record<string, string>;
  hasChildren?: boolean;
  childCount?: number;
  ref?: string;
  children?: CanopyNode[];
  expanded?: boolean;
  detail?: { type: string; height?: number };
  className?: string;
}

export interface CanopyColumn {
  id: string;
  title: string;
  width: number;
  kind: "text" | "number" | "datetime";
  sortable?: boolean;
  hidden?: boolean;
  editable?: boolean;
}
export interface CanopyFilter {
  id: string;
  label: string;
  flag: string;
  ancestorFlag?: string;
  hidden?: boolean;
}
export interface ContextAction { id: string; label: string; }
export interface CheckIntent { readonly path: readonly string[]; readonly checked: boolean; }
export interface Sort { column: string; direction: SortDirection; }
export interface ViewQuery { version: 1; sort: Sort | null; filters: string[]; }

/** Names accepted by the interactive runtime; omitted translations use English. */
export type LabelName =
  | "searchPlaceholder" | "searchResults" | "searchResultCount" | "searchResultCountOfTotal"
  | "searchResultCountOfMany" | "searchNoResults" | "searchTooShort" | "searchWordTooShort" | "searchFailed"
  | "columns" | "visibleColumns" | "resizeColumn" | "columnWidth" | "loading" | "loadError" | "queryFailed"
  | "showMore" | "showMoreUnknownTotal" | "pageLoaded" | "itemsLoaded" | "yes" | "no"
  | "utcTime" | "localTime" | "mountError" | "actions" | "editValue" | "saveEdit" | "cancelEdit"
  | "invalidEdit" | "interactionPending" | "interactionRejected" | "interactionFailed"
  | "markMove" | "moveHere" | "moveBefore" | "moveAfter" | "cancelMove";
export type CanopyLabels = Partial<Record<LabelName, string>>;

export interface InlineSourceDefinition { kind: "inline"; }
export interface SidecarSourceDefinition { kind: "sidecar"; base: string; }
/** URL templates use the placeholders defined in docs/data-protocol.md. */
export interface RemoteSourceDefinition {
  kind: "remote";
  children: string;
  search?: string;
  counts?: string;
  queryAware?: boolean;
}
export type SourceDefinition = InlineSourceDefinition | SidecarSourceDefinition | RemoteSourceDefinition;

export interface ViewDefinition {
  protocol: "canopyx/2";
  type: "view";
  id: string;
  label: string;
  rowHeight: number;
  pageSize: number;
  selection: "single" | "multiple";
  columns: CanopyColumn[];
  icons?: Record<string, string>;
  search?: { minLength: number; maxResults: number; placeholder?: string; kinds?: string[] };
  filters?: CanopyFilter[];
  timeZone?: TimeZone;
  pinTreeColumn?: boolean;
  stateKey?: string;
  deepLink?: boolean;
  labels?: CanopyLabels;
  checkboxes?: CheckMode;
  checkIntents?: readonly CheckIntent[];
  dragDrop?: boolean;
  contextActions?: ContextAction[];
}
/** Inline views own roots. Sidecar and remote views read roots from their source. */
export type CanopyView = ViewDefinition & (
  | { source: InlineSourceDefinition; roots: CanopyNode[] }
  | { source: SidecarSourceDefinition | RemoteSourceDefinition; roots?: never }
);

export interface PageResult {
  items: CanopyNode[];
  next: string | null;
  offset: number;
  total?: number;
  revision?: string;
}
export interface PageDocument extends PageResult {
  protocol: "canopyx/2";
  type: "page";
  parent: string | null;
}
export interface SearchHit { path: string[]; label: string; kind?: string; context?: string; }
export interface SearchResult { hits: SearchHit[]; truncated: boolean; total?: number; revision?: string; }
export interface SearchDocument extends SearchResult { protocol: "canopyx/2"; type: "search"; query: string; }
export interface CountUpdate { id: string; childCount?: number; cells?: Record<string, Cell>; flags?: string[]; }
export interface CountsDocument {
  protocol: "canopyx/2";
  type: "counts";
  items: CountUpdate[];
  revision?: string;
}

/** Versioned presentation state. Paths can name unloaded nodes; restore validates before changing presentation. */
export interface ViewState {
  version: 1;
  expanded: string[][];
  selection: string[][];
  columns: { id: string; width: number; hidden: boolean }[];
  sort: Sort | null;
  filters: string[];
  timeZone: TimeZone;
  pinTreeColumn: boolean;
  focus: string[] | null;
  anchor: { path: string[]; offset: number } | null;
  checkboxes?: CheckMode;
  checkIntents?: readonly CheckIntent[];
}
export interface LegacyViewState { expanded: string[][]; version?: never; }
