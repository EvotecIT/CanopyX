/** Values carried by cells and host-governed edit proposals. Numbers must be finite. */
export type CellValue = string | number | boolean | null;
export type TimeZone = "utc" | "local";
export type CheckMode = "independent" | "hierarchical";
export type CheckState = boolean | "mixed";
export type SortDirection = "asc" | "desc";

export interface CanopyBadge { text: string; tone?: string; title?: string; }
/** Ordered visual history metadata; raw cell values still drive queries and exports. */
export interface CellPeriod { period: string; value?: number | null; state?: string | null; tone?: string; }
import type { StructuredCell, RecordPanelDefinition } from "./records.js";
/** A cell: a value with display text, tooltip, tone and badges; it may hold a structured value or a record link (records.d.ts). */
export interface CanopyCell extends StructuredCell {
  value?: CellValue;
  text?: string;
  /** Alternate flat-grid search text, independent of display, typed queries and export. */
  searchText?: string;
  title?: string;
  tone?: string;
  badges?: CanopyBadge[];
  /** Secondary identifier text, independent of the raw value. */
  secondary?: string;
  /** At most 4096 ordered periods for a flat-grid history presenter. */
  series?: CellPeriod[];
  /** Sort key when it differs from the value (text or a number); filters, value lists, search and display keep reading value and text. */
  sort?: string | number;
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
  /** Values of the view's record fields (record.fields), shown in the record drawer only. */
  fields?: Record<string, Cell>;
  expanded?: boolean;
  className?: string;
}

export interface CanopyColumn {
  id: string;
  title: string;
  width: number;
  /** Minimum manual width in CSS pixels; defaults to 40. */
  minWidth?: number;
  /** Maximum manual width in CSS pixels; defaults to 2147483647. */
  maxWidth?: number;
  kind: "text" | "number" | "datetime";
  sortable?: boolean;
  hidden?: boolean;
  editable?: boolean;
  /** Fit the visible rows' content (the tree tools part measures it); width is the fallback until then. Otherwise width is preferred. */
  autoWidth?: boolean;
  /** The width stays during fitting; the reader can still resize the column. */
  fixed?: boolean;
  /** Share of spare width, given before the tree column. */
  flex?: number;
  /** What content measuring reads. Default content. */
  autoSize?: "content" | "header" | "none";
  /** How the column gives way when narrow: 0-1 essential, 10000+ optional; or the named levels. */
  priority?: "essential" | "normal" | "optional" | number;
  /** Retained during responsive fitting. */
  alwaysVisible?: boolean;
  /** Hover tooltip: "auto" shows a cell's full value while it is cut off; a declared column id shows that column's text. */
  tooltip?: string;
  /** Wrap text; maxLines is 1..12, default 2. Automatic row heights measure the visible lines. */
  wrap?: boolean;
  maxLines?: number;
  /** Host-authored labels keyed by exact raw category token; query and group identities stay raw. */
  valueLabels?: Readonly<Record<string, string>>;
  /** Declared tokens precede unknown ordinal tokens in ascending order; null keeps the missing-value policy. */
  valueOrder?: readonly string[];
  /** Semantic tones keyed by raw category token. */
  valueTones?: Readonly<Record<string, string>>;
  /** Ordered first-match rules color plain numeric text; labels explain the rule in tooltips and the drawer. */
  numericTones?: readonly { operator: "atMost" | "atLeast" | "below" | "above"; value: number; tone: string; label: string }[];
  /** The tree column pins left by default and null lets it scroll; other columns pin left (after the tree column) or right. */
  pinned?: "left" | "right" | null;
  /** The name of a cell renderer a plugin registers (cellRenderers); an unregistered name keeps the built-in painter. */
  renderer?: string;
  /** The record drawer section of the column. */
  section?: string;
  /** false keeps the column out of the record drawer. Default true. */
  drawer?: boolean;
}
/** Per-control tree toolbar switches in the view document; an absent switch keeps its control. */
export interface TreeToolbarControls {
  filters?: boolean;
  columns?: boolean;
  views?: boolean;
  export?: boolean;
  more?: boolean;
  /** The match navigator and the Highlight matches switch of a view with searchHighlight. */
  matches?: boolean;
  /** The Layout menu of a view with layout options. */
  layout?: boolean;
}
/** Search-hit highlighting (docs/search-highlight.md). true in a view document uses every default. */
export interface SearchHighlightOptions {
  /** Marks shown when the view opens; the reader can switch them. Default true. */
  enabled?: boolean;
  /** Mark quick-search text. Default true. */
  search?: boolean;
  /** Mark the values a flat grid's column filters match, styled apart from search hits. Default true. */
  filters?: boolean;
  /** Compare case exactly when marking. Default false: the search's own case folding. */
  matchCase?: boolean;
  /** A letter with accents matches its base letter when marking. Default false. */
  ignoreAccents?: boolean;
  /** The shortest term that is marked, 1..32. Default 1. */
  minLength?: number;
  /** A tone per column id for its filter hits. */
  filterTones?: Record<string, string>;
}
/** How a view lays out its columns (docs/layout-modes.md). Trees offer fit and scroll. */
export type LayoutMode = "fit" | "scroll" | "cards";
/** Row spacing; "default" is the Normal density. */
export type LayoutDensity = "compact" | "default" | "comfortable";
/** The Layout menu of a view: the layouts the reader can choose, and the starting layout and density. */
export interface LayoutOptions<M extends LayoutMode = LayoutMode> {
  mode?: M;
  modes?: readonly M[];
  density?: LayoutDensity;
}
/** The reader's layout choice, as saved state keeps it. */
export interface LayoutState { mode: LayoutMode; density: LayoutDensity; }
/** The current layout and the layouts the view offers. */
export interface LayoutInfo extends LayoutState { readonly modes: readonly LayoutMode[]; }
/** The match count: total matches (in the loaded rows while complete is false) and the 1-based current match, or 0. */
export interface MatchInfo { readonly enabled: boolean; readonly total: number; readonly current: number; readonly complete: boolean; }
/** Search highlighting and layout methods of every tree and flat grid; they reject when the view does not declare the feature. */
export interface ViewModeMethods {
  getLayout(): LayoutInfo;
  /** Switches the layout and/or density, keeping the query, selection, focus and the first row in view. */
  setLayout(change: Partial<LayoutState>): Promise<LayoutInfo>;
  getMatches(): MatchInfo;
  /** The Highlight matches switch. */
  setSearchHighlight(enabled: boolean): Promise<void>;
  /** Moves to the next match and scrolls its row into view; focus (default true) focuses its cell. False when nothing matches. */
  nextMatch(options?: { focus?: boolean }): Promise<boolean>;
  previousMatch(options?: { focus?: boolean }): Promise<boolean>;
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
  | "gridPaging" | "gridPageRange" | "gridPageNumber" | "gridPageLength" | "gridFirstPage" | "gridPreviousPage" | "gridNextPage" | "gridLastPage" | "gridPageInfo" | "gridPageInfoFiltered" | "gridPageButton"
  | "gridUnknownCount" | "gridMatchedCount" | "gridCursorRange"
  | "gridResultCount" | "gridClearQuery" | "gridRemoveSearch" | "gridGroupedFilters" | "gridRemoveGroup" | "gridRemoveCondition"
  | "gridExport" | "gridFilteredResults" | "gridSelectedRows" | "gridAllResults" | "gridVisibleRows" | "gridAllRows" | "gridDownloadCsv" | "gridCopy" | "gridDetails"
  | "searchPlaceholder" | "searchResults" | "searchResultCount" | "searchResultCountOfTotal"
  | "searchResultCountOfMany" | "searchNoResults" | "searchTooShort" | "searchWordTooShort" | "searchFailed"
  | "columns" | "hiddenColumns" | "visibleColumns" | "resizeColumn" | "columnWidth" | "loading" | "loadError" | "queryFailed"
  | "showMore" | "showMoreUnknownTotal" | "pageLoaded" | "itemsLoaded" | "yes" | "no"
  | "utcTime" | "localTime" | "mountError" | "actions" | "editValue" | "saveEdit" | "cancelEdit"
  | "invalidEdit" | "interactionPending" | "interactionRejected" | "interactionFailed"
  | "markMove" | "moveHere" | "moveBefore" | "moveAfter" | "cancelMove"
  | "gridFilters" | "gridColumn" | "gridOperator" | "gridValue" | "gridValueType" | "gridText" | "gridBoolean" | "gridAddFilter" | "gridRemoveFilter" | "gridApply" | "gridClearFilters" | "gridMoveEarlier" | "gridMoveLater" | "gridViews" | "gridViewName" | "gridSaveView" | "gridRemoveView" | "gridResetView" | "gridChooseView" | "gridInvalidFilter" | "gridContains" | "gridStartsWith" | "gridIn" | "gridIsNull" | "gridIsNotNull"
  | "gridBetween" | "gridRangeEnd" | "gridInvalidRange" | "gridSuggestedCategory" | "gridChooseCategory" | "gridBooleanValue" | "gridTrue" | "gridFalse" | "gridHeaderFilter"
  | "gridExpandCell" | "gridCloseCell" | "gridCloseRecord" | "gridMoveColumn" | "gridResizeHelp" | "gridColumnMoved" | "gridFitColumn" | "gridFitAllColumns"
  | "gridPinColumn" | "gridPinNone" | "gridPinLeft" | "gridPinRight" | "gridResponsiveHidden"
  | "gridFindColumn" | "gridShowAllColumns" | "gridResetColumns" | "gridReorderColumn" | "gridPinnedLeft" | "gridPinnedRight"
  | "gridFilterGroupTitle" | "gridFilterMatch" | "gridFilterAll" | "gridFilterAny" | "gridAddFilterGroup" | "gridDeleteFilterGroup"
  | "gridFacetValues" | "gridFacetSearch" | "gridFacetIncludeCurrent" | "gridFacetLoad" | "gridFacetChoose" | "gridFacetCounts" | "gridFacetReload"
  | "gridRenameView" | "gridDefaultView" | "gridClearDefaultView" | "gridDefaultViewName" | "gridNoDefaultView" | "gridDefaultViewOption"
  | "gridSelection" | "gridSelectPage" | "gridSelectMatching" | "gridClearSelection" | "gridSelectionCount"
  | "gridSelectionQueryCount" | "gridSelectionQueryUnknown" | "gridSelectRecord"
  | "gridGroupHeading" | "gridGroupMissing" | "gridGroupExpand" | "gridGroupCollapse" | "gridSummary" | "gridGroupOrder" | "gridAggregateCount" | "gridAggregateSum" | "gridAggregateAverage" | "gridAggregateMinimum" | "gridAggregateMaximum" | "gridGroupBy" | "gridUngroup" | "gridGroupDrop" | "gridExpandAll" | "gridCollapseAll" | "gridExpandLevel" | "gridCollapseLevel" | "gridGroupMove" | "gridGroupSortBy" | "gridGroupSortValue" | "gridGroupSortAggregate" | "gridSelectGroup" | "gridAggregateDistinct" | "gridShowDetail" | "gridHideDetail" | "gridDetailOf" | "gridDetailFailed"
  | "gridExportProgress" | "gridExportReading" | "gridExportCancelled" | "gridCancelExport" | "gridNoExportColumns" | "gridPrint"
  | "matchesHighlight" | "matchesCount" | "matchesPosition" | "matchesNone" | "matchesLoaded" | "matchesPrevious" | "matchesNext" | "matchesAnnounce"
  | "layoutMenu" | "layoutFit" | "layoutScroll" | "layoutCards" | "layoutDensity" | "layoutCompact" | "layoutNormal" | "layoutComfortable" | "layoutChanged" | "layoutSort"
  | "gridFitContent"
  | "gridUnpin"
  | "gridWhere"
  | "gridComplexFilter"
  | "gridClearColumnFilter"
  | "gridSelectionAggregate"
  | "gridConditionValue"
  | "gridConditionUpperValue"
  | "gridDeleteCondition"
  | "gridShowRowsWhere"
  | "gridOfTheseAreTrue"
  | "gridOfThese"
  | "gridGroupCount"
  // The editing part's labels (docs/editing.md).
  | "gridEditCell" | "gridEditSave" | "gridEditCancel" | "gridEditDiscard" | "gridEditUndo" | "gridEditRedo" | "gridEditEdited" | "gridEditChanges"
  | "gridEditErrors" | "gridEditSaving" | "gridEditSaved" | "gridEditFailed" | "gridEditRequired" | "gridEditNumber" | "gridEditDate" | "gridEditMin"
  | "gridEditMax" | "gridEditStep" | "gridEditMinLength" | "gridEditMaxLength" | "gridEditPattern" | "gridEditChoice" | "gridEditConflict" | "gridEditRejected"
  | "gridEditNotSaved" | "gridEditNoMatches" | "gridEditSearching" | "gridEditUndone" | "gridEditRedone" | "gridEditNone"
  | "gridMore" | "gridDone" | "gridClearAll" | "gridRows" | "gridResultNoun" | "gridSearchNoun" | "gridChart" | "gridColumnMenu" | "gridSortAscending" | "gridSortDescending" | "gridClearSort" | "gridFilterColumn" | "gridHideColumn" | "gridGroupedBy" | "gridRemoveGrouping" | "gridSelectAllValues" | "gridFilterValues" | "gridAddCondition" | "gridAddGroup" | "gridAnd" | "gridOr" | "gridEditAsText" | "gridFilterText" | "gridDeepFilters" | "gridToday" | "gridYesterday" | "gridLastSevenDays" | "gridLastThirtyDays" | "gridThisMonth" | "gridDateRange" | "gridEmpty" | "gridEmptyReason" | "gridNoMatches" | "gridNoMatchesReason" | "gridRetry" | "gridLoadFailed" | "gridAll" | "gridPageOf" | "gridStatusCount" | "gridDetailsSection" | "gridPreviousRecord" | "gridNextRecord" | "gridShowMore" | "gridNoData" | "gridPeriodRange" | "gridHealthy"
  /** Conditional formatting (the formatting and rule editor parts of flat grids); trees ignore them. */
  | "formatRules" | "formatLegend" | "formatUpTo" | "formatAbove" | "formatHiddenFlagged" | "formatRule" | "formatAddRule" | "formatEditRule"
  | "formatDeleteRule" | "formatMoveUp" | "formatMoveDown" | "formatEnableRule" | "formatNoRules" | "formatName" | "formatDescription" | "formatOnlyRowsWhere"
  | "formatEveryRow" | "formatNone" | "formatApplyTo" | "formatTargetCell" | "formatTargetRow" | "formatTargetColumns" | "formatStyle" | "formatHighlight"
  | "formatDataBar" | "formatColorScale" | "formatBands" | "formatTone" | "formatEmphasis" | "formatFill" | "formatTextOnly" | "formatStrong"
  | "formatIcon" | "formatNoIcon" | "formatAutomatic" | "formatBadge" | "formatCue" | "formatLowest" | "formatMidpoint" | "formatHighest"
  | "formatAddBand" | "formatRemoveBand" | "formatSave" | "formatCancel" | "formatShowLegend" | "formatInvalid" | "formatMatchCase" | "formatToneDanger"
  | "formatToneWarning" | "formatToneSuccess" | "formatToneInfo" | "formatToneNeutral" | "formatToneMuted" | "formatNotContains" | "formatEndsWith" | "formatNotIn"
  | "formatBetween" | "formatLike" | "formatMatches" | "formatOlderThan" | "formatWithinLast" | "formatNotLike" | "formatNotMatches" | "formatBetweenExclusive"
  /** Cell ranges and the clipboard (docs/cell-ranges.md). */
  | "gridCellRangeSelected" | "gridCellRangesSelected" | "gridCellRangeCleared" | "gridCopyCells" | "gridCopyCellsWithHeaders" | "gridPasteCells"
  | "gridSelectAllCells" | "gridCellsCopied" | "gridCellsPasted" | "gridPasteRefused" | "gridPasteReadOnly" | "gridPasteType" | "gridPasteReport"
  | "gridPasteCell" | "gridFillHandle" | "gridCellsFilled" | "gridCellMenu" | "gridClearCellRanges"
  /** Linked views (docs/linked-views.md). */
  | "linkFilteredBy" | "linkRemoveFilter" | "linkFiltered" | "linkHighlighted" | "linkHighlightedRows" | "linkCleared"
  /** The record panel (docs/record-panel.md). */
  | "recordBack" | "recordBackTo" | "recordTrail" | "recordShowing" | "recordTabs" | "recordSections" | "recordOtherFields" | "recordShowEmpty" | "recordHideEmpty" | "recordActions" | "recordCopyValues" | "recordCopyJson" | "recordCopyLink" | "recordCopied" | "recordPrint" | "recordExportCsv" | "recordExportJson" | "recordOpenAll" | "recordLoadMore" | "recordCount" | "recordItems" | "recordMore" | "recordShowAll" | "recordRetry" | "recordLoadFailed" | "recordUnavailable" | "recordField" | "recordValue" | "recordSection" | "recordBefore" | "recordAfter" | "recordAdded" | "recordRemoved" | "recordChanged"
  /** The calendar and resource timeline (the calendar and timeline parts of flat grids). */
  | "calendarToday" | "calendarPrevious" | "calendarNext" | "calendarViews" | "calendarMonth" | "calendarWeek" | "calendarDay" | "calendarDays"
  | "calendarAgenda" | "calendarYear" | "calendarTimeline" | "calendarGoTo" | "calendarAllDay" | "calendarMore" | "calendarMoreLabel" | "calendarDayEvents"
  | "calendarNoEvents" | "calendarEvents" | "calendarShowing" | "calendarRepeats" | "calendarTruncated" | "calendarLoading" | "calendarLoadError" | "calendarNow"
  | "calendarZoom" | "calendarZoomHour" | "calendarZoomDay" | "calendarZoomWeek" | "calendarZoomMonth" | "calendarZoomQuarter" | "calendarResources" | "calendarCapacity"
  | "calendarCapacityAt" | "calendarBusy" | "calendarOverlaps" | "calendarUnavailable" | "calendarOutsideHours" | "calendarConflict" | "calendarNotAllowed" | "calendarMoved"
  | "calendarResized" | "calendarSeriesMoved" | "calendarSeriesTime" | "calendarMoveHelp" | "calendarEdit" | "calendarSaveFailed" | "calendarExport" | "calendarTimeRange" | "calendarSelected"
  | "calendarLane" | "calendarHighlighted";
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
  /** Marks the search box's words in the tree column (docs/search-highlight.md). */
  searchHighlight?: boolean | SearchHighlightOptions;
  /** The Layout menu: fit and scroll, and the density (docs/layout-modes.md). */
  layout?: LayoutOptions<"fit" | "scroll">;
  /** Per-control toolbar switches (the search box is the search property). */
  toolbar?: TreeToolbarControls;
  /** Identities of registered export formats the Export menu offers after CSV, in order. */
  exportFormats?: string[];
  /** A tree whose visible rows fit is as tall as its rows; false keeps the host height. Default true. */
  autoHeight?: boolean;
  stateKey?: string;
  deepLink?: boolean;
  /** The record panel of the tree's drawer (records.d.ts, docs/record-panel.md). */
  record?: RecordPanelDefinition;
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
  /** The reader's layout, in a view with layout options. */
  layout?: LayoutState;
  /** The reader's Highlight matches switch, in a view with searchHighlight. */
  highlight?: boolean;
  focus: string[] | null;
  anchor: { path: string[]; offset: number } | null;
  checkboxes?: CheckMode;
  checkIntents?: readonly CheckIntent[];
}
export interface LegacyViewState { expanded: string[][]; version?: never; }
