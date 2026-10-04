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
  /** Alternate flat-grid search text, independent of display, typed queries and export. */
  searchText?: string;
  title?: string;
  tone?: string;
  badges?: CanopyBadge[];
}
export type Cell = CellValue | CanopyCell;

export interface TableDetail {
  type: "table";
  height?: number;
  caption?: string;
  columns: string[];
  widths?: number[];
  rows: Cell[][];
}
export interface PropertiesDetail {
  type: "properties";
  height?: number;
  items: { name: string; value: Cell }[];
}
/** HTML details contain content the host explicitly trusts. */
export interface HtmlDetail { type: "html"; height?: number; html: string; }
export type CanopyDetail = TableDetail | PropertiesDetail | HtmlDetail;

/** A host-owned node. IDs are unique within the view; lazy nodes omit children. */
interface NodeDefinition {
  id: string;
  label: string;
  kind?: string;
  icon?: string;
  group?: boolean;
  cells?: Record<string, Cell>;
  badges?: CanopyBadge[];
  flags?: string[];
  data?: Record<string, string>;
  expanded?: boolean;
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
/** Source callbacks observe frozen query snapshots, including their sort and filter values. */
export interface ReadonlyViewQuery {
  readonly version: 1;
  readonly sort: Readonly<Sort> | null;
  readonly filters: readonly string[];
}
export type LeafNode = NodeDefinition & {
  hasChildren?: false; children?: []; childCount?: never; ref?: never; detail?: never;
};
export type DetailNode = NodeDefinition & {
  detail: CanopyDetail; hasChildren?: false; children?: never; childCount?: never; ref?: never;
};
export interface InlineBranch<TNode = CanopyNode> extends NodeDefinition {
  children: TNode[]; hasChildren?: true; childCount?: number; ref?: never; detail?: never;
}
export type LazyNode = NodeDefinition & {
  hasChildren: true; childCount?: number; ref?: string; children?: never; detail?: never;
};
/** A node chooses one leaf, detail, complete branch, or lazy branch payload. */
export type CanopyNode = LeafNode | DetailNode | InlineBranch | LazyNode;
/** Inline roots and every descendant are fully materialized. */
export type InlineNode = LeafNode | DetailNode | InlineBranch<InlineNode>;

/** Names accepted by the interactive runtime; omitted translations use English. */
export type LabelName =
  | "gridPaging" | "gridPageRange" | "gridPageNumber" | "gridPageLength" | "gridFirstPage" | "gridPreviousPage" | "gridNextPage" | "gridLastPage"
  | "gridUnknownCount" | "gridMatchedCount" | "gridCursorRange"
  | "gridResultCount" | "gridClearQuery" | "gridRemoveSearch" | "gridGroupedFilters" | "gridRemoveGroup" | "gridRemoveCondition"
  | "gridExport" | "gridFilteredResults" | "gridSelectedRows" | "gridAllResults" | "gridDownloadCsv" | "gridCopy" | "gridDetails"
  | "searchPlaceholder" | "searchResults" | "searchResultCount" | "searchResultCountOfTotal"
  | "searchResultCountOfMany" | "searchNoResults" | "searchTooShort" | "searchWordTooShort" | "searchFailed"
  | "columns" | "visibleColumns" | "resizeColumn" | "columnWidth" | "loading" | "loadError" | "queryFailed"
  | "showMore" | "showMoreUnknownTotal" | "pageLoaded" | "itemsLoaded" | "yes" | "no"
  | "utcTime" | "localTime" | "mountError" | "actions" | "editValue" | "saveEdit" | "cancelEdit"
  | "invalidEdit" | "interactionPending" | "interactionRejected" | "interactionFailed"
  | "markMove" | "moveHere" | "moveBefore" | "moveAfter" | "cancelMove"
  | "gridFilters" | "gridColumn" | "gridOperator" | "gridValue" | "gridValueType" | "gridText" | "gridBoolean" | "gridAddFilter" | "gridRemoveFilter" | "gridApply" | "gridClearFilters" | "gridMoveEarlier" | "gridMoveLater" | "gridViews" | "gridViewName" | "gridSaveView" | "gridRemoveView" | "gridResetView" | "gridChooseView" | "gridInvalidFilter" | "gridContains" | "gridStartsWith" | "gridIn" | "gridIsNull" | "gridIsNotNull"
  | "gridBetween" | "gridRangeEnd" | "gridInvalidRange" | "gridSuggestedCategory" | "gridChooseCategory" | "gridBooleanValue" | "gridTrue" | "gridFalse" | "gridHeaderFilter"
  | "gridExpandCell" | "gridCloseCell" | "gridMoveColumn" | "gridResizeHelp" | "gridColumnMoved"
  | "gridPinColumn" | "gridPinNone" | "gridPinLeft" | "gridPinRight" | "gridResponsiveHidden"
  | "gridFilterGroupTitle" | "gridFilterMatch" | "gridFilterAll" | "gridFilterAny" | "gridAddFilterGroup" | "gridDeleteFilterGroup"
  | "gridFacetValues" | "gridFacetSearch" | "gridFacetIncludeCurrent" | "gridFacetLoad" | "gridFacetChoose" | "gridFacetCounts" | "gridFacetReload";
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

interface ViewDefinitionBase {
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
  dragDrop?: boolean;
  contextActions?: ContextAction[];
}
/** Checking intents describe a view only when its checkbox mode is enabled. */
export type ViewDefinition = ViewDefinitionBase & (
  | { checkboxes: CheckMode; checkIntents?: readonly CheckIntent[] }
  | { checkboxes?: never; checkIntents?: never }
);
/** Inline views own roots. Sidecar and remote views read roots from their source. */
export type InlineView = ViewDefinition & { source: InlineSourceDefinition; roots: InlineNode[] };
export type SidecarView = ViewDefinition & { source: SidecarSourceDefinition; roots?: never };
export type RemoteView = ViewDefinition & { source: RemoteSourceDefinition; roots?: never };
export type CanopyView = InlineView | SidecarView | RemoteView;

export interface PageResult {
  items: CanopyNode[];
  next?: string | null;
  offset?: number;
  total?: number;
  revision?: string;
}
export interface PageDocument extends PageResult {
  protocol: "canopyx/2";
  type: "page";
  parent: string | null;
  next: string | null;
  offset: number;
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
