using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The texts CanopyX writes itself, in the browser and in the static outline: the search box, "show more" and error
/// rows, the column chooser, screen-reader announcements, date suffixes, and the notes of the outline. They are
/// English by default; a host that shows its pages in another language sets them once on
/// <see cref="CanopyTreeView.Labels"/>, and the view document carries them to the browser.
/// </summary>
/// <remarks>
/// <para>
/// A text can hold placeholders in braces, which CanopyX replaces: <c>{count}</c>, <c>{total}</c>, <c>{loaded}</c>,
/// <c>{shown}</c>, <c>{min}</c>, <c>{error}</c>, <c>{column}</c>, <c>{width}</c>, and <c>{time}</c>, as each
/// property says. Numbers are formatted in the page language (in the browser) or in
/// <c>CanopyStaticHtmlOptions.Culture</c> (in the outline). For a language with plural forms, phrase the text so the
/// number stands on its own, for example <c>Wyniki: {count}</c>.
/// </para>
/// <para>
/// Host data is never translated here: node labels, column titles, cells, badges, and the view's accessible name are
/// the host's own text. A browser host can also pass <c>labels</c> to <c>createTreeGrid</c> or
/// <c>CanopyX.configure</c>, which applies on top of the view's.
/// </para>
/// </remarks>
public sealed partial class CanopyLabels {
    private static readonly Dictionary<string, string> Defaults = new Dictionary<string, string>(StringComparer.Ordinal) {
        [nameof(SearchPlaceholder)] = "Search",
        [nameof(SearchResults)] = "Search results",
        [nameof(SearchResultCount)] = "{count} results",
        [nameof(SearchResultCountOfTotal)] = "{count} of {total} results",
        [nameof(SearchResultCountOfMany)] = "{count} of many results",
        [nameof(SearchNoResults)] = "No results",
        [nameof(SearchTooShort)] = "Type at least {min} characters",
        [nameof(SearchWordTooShort)] = "Type a word of at least {min} characters",
        [nameof(SearchFailed)] = "Search failed: {error}",
        [nameof(Columns)] = "Columns",
        [nameof(GridFilters)] = "Filters",
        [nameof(GridFitContent)] = "Fit to content",
        [nameof(GridUnpin)] = "Unpin",
        [nameof(GridWhere)] = "Where",
        [nameof(GridComplexFilter)] = "This column belongs to a mixed condition group. Edit it in Filters.",
        [nameof(GridClearColumnFilter)] = "Clear filter",
        [nameof(GridSelectionAggregate)] = "Count: {count} · Sum: {sum} · Average: {average} · Minimum: {minimum} · Maximum: {maximum}",
        [nameof(GridConditionValue)] = "Value",
        [nameof(GridConditionUpperValue)] = "Upper value",
        [nameof(GridDeleteCondition)] = "Remove condition",
        [nameof(GridShowRowsWhere)] = "Show rows where",
        [nameof(GridOfTheseAreTrue)] = "of these are true",
        [nameof(GridOfThese)] = "of these",
        [nameof(GridGroupCount)] = "{count} groups",
        [nameof(GridMore)] = "More",
        [nameof(GridDone)] = "Done",
        [nameof(GridClearAll)] = "Clear all",
        [nameof(GridRows)] = "rows",
        [nameof(GridResultNoun)] = "{count} of {total} {noun}",
        [nameof(GridSearchNoun)] = "Search {noun}",
        [nameof(GridChart)] = "Chart",
        [nameof(GridColumnMenu)] = "Menu for {column}",
        [nameof(GridSortAscending)] = "Sort ascending",
        [nameof(GridSortDescending)] = "Sort descending",
        [nameof(GridClearSort)] = "Clear sort",
        [nameof(GridFilterColumn)] = "Filter…",
        [nameof(GridHideColumn)] = "Hide column",
        [nameof(GridGroupedBy)] = "Grouped by",
        [nameof(GridRemoveGrouping)] = "Remove grouping",
        [nameof(GridSelectAllValues)] = "Select all values",
        [nameof(GridFilterValues)] = "Search values",
        [nameof(GridAddCondition)] = "+ Condition",
        [nameof(GridAddGroup)] = "+ Group",
        [nameof(GridAnd)] = "and",
        [nameof(GridOr)] = "or",
        [nameof(GridEditAsText)] = "Edit as text",
        [nameof(GridFilterText)] = "Filter expression",
        [nameof(GridDeepFilters)] = "This saved filter has more than two nesting levels.",
        [nameof(GridToday)] = "Today",
        [nameof(GridYesterday)] = "Yesterday",
        [nameof(GridLastSevenDays)] = "Last 7 days",
        [nameof(GridLastThirtyDays)] = "Last 30 days",
        [nameof(GridThisMonth)] = "This month",
        [nameof(GridDateRange)] = "Range",
        [nameof(GridEmpty)] = "No {noun}",
        [nameof(GridEmptyReason)] = "There are no records to display.",
        [nameof(GridNoMatches)] = "No matching {noun}",
        [nameof(GridNoMatchesReason)] = "Search: {search}. Active filters: {count}.",
        [nameof(GridRetry)] = "Retry",
        [nameof(GridLoadFailed)] = "Could not load records",
        [nameof(GridAll)] = "All",
        [nameof(GridPageOf)] = "{page} of {pages}",
        [nameof(GridStatusCount)] = "{count} {noun} · {selected} selected",
        [nameof(GridDetailsSection)] = "Details",
        [nameof(GridPreviousRecord)] = "Previous record",
        [nameof(GridNextRecord)] = "Next record",
        [nameof(GridShowMore)] = "Show more",
        [nameof(GridNoData)] = "No data",
        [nameof(GridPeriodRange)] = "{from}–{to}: {state}",
        [nameof(GridHealthy)] = "Healthy",
        [nameof(GridResultCount)] = "{count} of {total} rows",
        [nameof(GridUnknownCount)] = "Result count unavailable",
        [nameof(GridMatchedCount)] = "{count} matching rows",
        [nameof(GridCursorRange)] = "Rows {first}–{last}",
        [nameof(GridPaging)] = "Result pages",
        [nameof(GridPageRange)] = "{first}–{last} of {count} rows",
        [nameof(GridPageNumber)] = "Page",
        [nameof(GridPageLength)] = "Rows per page",
        [nameof(GridFirstPage)] = "First page",
        [nameof(GridPreviousPage)] = "Previous page",
        [nameof(GridNextPage)] = "Next page",
        [nameof(GridLastPage)] = "Last page",
        [nameof(GridClearQuery)] = "Clear search and filters",
        [nameof(GridRemoveSearch)] = "Clear search: {search}",
        [nameof(GridGroupedFilters)] = "Grouped filters ({count} conditions)",
        [nameof(GridRemoveGroup)] = "Clear grouped filters",
        [nameof(GridRemoveCondition)] = "Remove condition: {condition}",
        [nameof(GridExport)] = "Export",
        [nameof(GridFilteredResults)] = "Filtered results",
        [nameof(GridSelectedRows)] = "Selected rows",
        [nameof(GridAllResults)] = "All results",
        [nameof(GridVisibleRows)] = "Visible rows",
        [nameof(GridAllRows)] = "All rows",
        [nameof(GridDownloadCsv)] = "Download CSV",
        [nameof(GridCopy)] = "Copy",
        [nameof(GridDetails)] = "Record details",
        [nameof(GridColumn)] = "Column",
        [nameof(GridOperator)] = "Condition",
        [nameof(GridValue)] = "Value (UTC for dates)",
        [nameof(GridValueType)] = "Raw value type",
        [nameof(GridText)] = "Text",
        [nameof(GridBoolean)] = "Boolean",
        [nameof(GridAddFilter)] = "Add filter",
        [nameof(GridRemoveFilter)] = "Remove {column} filter",
        [nameof(GridApply)] = "Apply",
        [nameof(GridClearFilters)] = "Clear all filters",
        [nameof(GridMoveEarlier)] = "Move {column} earlier",
        [nameof(GridMoveLater)] = "Move {column} later",
        [nameof(GridViews)] = "Views",
        [nameof(GridViewName)] = "View name",
        [nameof(GridSaveView)] = "Save view",
        [nameof(GridRemoveView)] = "Remove view",
        [nameof(GridResetView)] = "Reset view",
        [nameof(GridChooseView)] = "Choose a saved view",
        [nameof(GridInvalidFilter)] = "Enter a valid filter value.",
        [nameof(GridBetween)] = "between (inclusive)",
        [nameof(GridRangeEnd)] = "Upper value (UTC for dates)",
        [nameof(GridInvalidRange)] = "Enter an upper value greater than or equal to the lower value.",
        [nameof(GridSuggestedCategory)] = "Suggested category",
        [nameof(GridChooseCategory)] = "Choose a category",
        [nameof(GridBooleanValue)] = "Boolean value",
        [nameof(GridTrue)] = "True",
        [nameof(GridFalse)] = "False",
        [nameof(GridHeaderFilter)] = "Filter {column}",
        [nameof(GridExpandCell)] = "{column}: show complete text",
        [nameof(GridCloseCell)] = "Close complete text",
        [nameof(GridMoveColumn)] = "{column}: drag to move, or use Left/Right",
        [nameof(GridResizeHelp)] = "Enter fits up to 200 loaded rows; Left/Right resizes.",
        [nameof(GridFitColumn)] = "Fit {column}",
        [nameof(GridFitAllColumns)] = "Fit all columns",
        [nameof(GridColumnMoved)] = "{column} moved to position {position}",
        [nameof(GridPinColumn)] = "{column}: pinned region",
        [nameof(GridPinNone)] = "Scroll",
        [nameof(GridPinLeft)] = "Pin left",
        [nameof(GridPinRight)] = "Pin right",
        [nameof(GridResponsiveHidden)] = "Hidden at this width",
        [nameof(GridFindColumn)] = "Find a column…",
        [nameof(GridShowAllColumns)] = "Show all",
        [nameof(GridResetColumns)] = "Reset columns",
        [nameof(GridReorderColumn)] = "{column}: drag, or press Alt+Up or Alt+Down to move",
        [nameof(GridPinnedLeft)] = "Pinned left",
        [nameof(GridPinnedRight)] = "Pinned right",
        [nameof(GridFilterGroupTitle)] = "Additional grouped conditions",
        [nameof(GridFilterMatch)] = "Match",
        [nameof(GridFilterAll)] = "All",
        [nameof(GridFilterAny)] = "Any",
        [nameof(GridAddFilterGroup)] = "Add condition group",
        [nameof(GridDeleteFilterGroup)] = "Remove condition group",
        [nameof(GridFacetValues)] = "Values and counts from applied filters",
        [nameof(GridFacetSearch)] = "Search values",
        [nameof(GridFacetIncludeCurrent)] = "Include this column's applied filters",
        [nameof(GridFacetLoad)] = "Load values",
        [nameof(GridFacetChoose)] = "Choose a value",
        [nameof(GridFacetCounts)] = "{count} matching rows; {shown} of {total} values.",
        [nameof(GridFacetReload)] = "Values changed or the request was cancelled. Load values again.",
        [nameof(GridRenameView)] = "Rename view",
        [nameof(GridDefaultView)] = "Make default",
        [nameof(GridClearDefaultView)] = "Clear default",
        [nameof(GridDefaultViewName)] = "Default view: {name}",
        [nameof(GridNoDefaultView)] = "No default view",
        [nameof(GridDefaultViewOption)] = "{name} (default)",
        [nameof(GridSelection)] = "Selection",
        [nameof(GridSelectPage)] = "Select page",
        [nameof(GridSelectMatching)] = "Select all matching",
        [nameof(GridClearSelection)] = "Clear selection",
        [nameof(GridSelectionCount)] = "{count} selected",
        [nameof(GridSelectionQueryCount)] = "{count} matching records selected; {excluded} excluded",
        [nameof(GridSelectionQueryUnknown)] = "All matching records selected; {excluded} excluded",
        [nameof(GridSelectRecord)] = "Select record {id}",
        [nameof(GridGroupHeading)] = "{column}: {value} ({count} records)",
        [nameof(GridGroupMissing)] = "Missing value",
        [nameof(GridGroupExpand)] = "Expand group",
        [nameof(GridGroupCollapse)] = "Collapse group",
        [nameof(GridSummary)] = "Query totals",
        [nameof(GridGroupOrder)] = "Group order is fixed by this report",
        [nameof(GridExportProgress)] = "{completed} of {total} records",
        [nameof(GridExportReading)] = "{completed} records",
        [nameof(GridExportCancelled)] = "Export cancelled",
        [nameof(GridCancelExport)] = "Cancel export",
        [nameof(GridPrint)] = "Print",
        [nameof(GridCloseRecord)] = "Close record details",
        [nameof(GridContains)] = "contains",
        [nameof(GridStartsWith)] = "starts with",
        [nameof(GridIn)] = "is any of",
        [nameof(GridIsNull)] = "is missing",
        [nameof(GridIsNotNull)] = "is present",
        [nameof(VisibleColumns)] = "Visible columns",
        [nameof(ResizeColumn)] = "Resize {column}",
        [nameof(ColumnWidth)] = "{width} pixels",
        [nameof(Loading)] = "Loading…",
        [nameof(LoadError)] = "Could not load: {error} (Enter to retry)",
        [nameof(QueryFailed)] = "Could not update the view: {error}",
        [nameof(Actions)] = "Actions",
        [nameof(EditValue)] = "Edit {column}",
        [nameof(SaveEdit)] = "Save",
        [nameof(CancelEdit)] = "Cancel",
        [nameof(InvalidEdit)] = "Enter a valid {column} value.",
        [nameof(InteractionPending)] = "Waiting for the host…",
        [nameof(InteractionRejected)] = "The host declined the operation.",
        [nameof(InteractionFailed)] = "Operation failed: {error}",
        [nameof(MarkMove)] = "Move this node",
        [nameof(MoveHere)] = "Move here",
        [nameof(MoveBefore)] = "Move before",
        [nameof(MoveAfter)] = "Move after",
        [nameof(CancelMove)] = "Cancel move",
        [nameof(ShowMore)] = "Show more ({loaded} of {total} loaded)",
        [nameof(ShowMoreUnknownTotal)] = "Show more ({loaded} loaded)",
        [nameof(PageLoaded)] = "{loaded} of {total} loaded",
        [nameof(ItemsLoaded)] = "{count} items",
        [nameof(Yes)] = "Yes",
        [nameof(No)] = "No",
        [nameof(UtcTime)] = "{time} UTC",
        [nameof(LocalTime)] = "{time} local time",
        [nameof(MountError)] = "This view could not be displayed: {error}",
        [nameof(OverflowNote)] = "Showing {shown} of {total} rows.",
        [nameof(UnknownTotal)] = "unknown",
        [nameof(HiddenRows)] = "{count} rows below are not shown",
        [nameof(FullReport)] = "Open the full report"
    };

    /// <summary>The labels the browser runtime reads from the view document, in document order.</summary>
    private static readonly string[] RuntimeNames = {
        nameof(GridGroupCount),
        nameof(GridOfThese),
        nameof(GridOfTheseAreTrue),
        nameof(GridShowRowsWhere),
        nameof(GridDeleteCondition),
        nameof(GridConditionUpperValue),
        nameof(GridConditionValue),
        nameof(GridSelectionAggregate),
        nameof(GridClearColumnFilter),
        nameof(GridComplexFilter),
        nameof(GridWhere),
        nameof(GridUnpin),
        nameof(GridFitContent),
        nameof(GridMore), nameof(GridDone), nameof(GridClearAll), nameof(GridRows), nameof(GridResultNoun), nameof(GridSearchNoun), nameof(GridChart), nameof(GridColumnMenu), nameof(GridSortAscending), nameof(GridSortDescending), nameof(GridClearSort), nameof(GridFilterColumn), nameof(GridHideColumn), nameof(GridGroupedBy), nameof(GridRemoveGrouping), nameof(GridSelectAllValues), nameof(GridFilterValues), nameof(GridAddCondition), nameof(GridAddGroup), nameof(GridAnd), nameof(GridOr), nameof(GridEditAsText), nameof(GridFilterText), nameof(GridDeepFilters), nameof(GridToday), nameof(GridYesterday), nameof(GridLastSevenDays), nameof(GridLastThirtyDays), nameof(GridThisMonth), nameof(GridDateRange), nameof(GridEmpty), nameof(GridEmptyReason), nameof(GridNoMatches), nameof(GridNoMatchesReason), nameof(GridRetry), nameof(GridLoadFailed), nameof(GridAll), nameof(GridPageOf), nameof(GridStatusCount), nameof(GridDetailsSection), nameof(GridPreviousRecord), nameof(GridNextRecord), nameof(GridShowMore), nameof(GridNoData), nameof(GridPeriodRange), nameof(GridHealthy),
        nameof(GridBetween), nameof(GridRangeEnd), nameof(GridInvalidRange), nameof(GridSuggestedCategory), nameof(GridChooseCategory),
        nameof(GridBooleanValue), nameof(GridTrue), nameof(GridFalse), nameof(GridHeaderFilter), nameof(GridExpandCell), nameof(GridCloseCell), nameof(GridCloseRecord),
        nameof(GridMoveColumn), nameof(GridResizeHelp), nameof(GridColumnMoved), nameof(GridFitColumn), nameof(GridFitAllColumns),
        nameof(GridPinColumn), nameof(GridPinNone), nameof(GridPinLeft), nameof(GridPinRight), nameof(GridResponsiveHidden), nameof(GridFindColumn), nameof(GridShowAllColumns), nameof(GridResetColumns), nameof(GridReorderColumn), nameof(GridPinnedLeft), nameof(GridPinnedRight),
        nameof(GridFilterGroupTitle), nameof(GridFilterMatch), nameof(GridFilterAll), nameof(GridFilterAny), nameof(GridAddFilterGroup), nameof(GridDeleteFilterGroup),
        nameof(GridFacetValues), nameof(GridFacetSearch), nameof(GridFacetIncludeCurrent), nameof(GridFacetLoad), nameof(GridFacetChoose), nameof(GridFacetCounts), nameof(GridFacetReload),
        nameof(GridRenameView), nameof(GridDefaultView), nameof(GridClearDefaultView), nameof(GridDefaultViewName), nameof(GridNoDefaultView), nameof(GridDefaultViewOption),
        nameof(GridSelection), nameof(GridSelectPage), nameof(GridSelectMatching), nameof(GridClearSelection), nameof(GridSelectionCount),
        nameof(GridSelectionQueryCount), nameof(GridSelectionQueryUnknown), nameof(GridSelectRecord),
        nameof(GridGroupHeading), nameof(GridGroupMissing), nameof(GridGroupExpand), nameof(GridGroupCollapse), nameof(GridSummary), nameof(GridGroupOrder),
        nameof(GridExportProgress), nameof(GridExportReading), nameof(GridExportCancelled), nameof(GridCancelExport), nameof(GridPrint),
        nameof(GridResultCount), nameof(GridClearQuery), nameof(GridRemoveSearch), nameof(GridGroupedFilters), nameof(GridRemoveGroup), nameof(GridRemoveCondition),
        nameof(GridUnknownCount), nameof(GridMatchedCount), nameof(GridCursorRange),
        nameof(GridPaging), nameof(GridPageRange), nameof(GridPageNumber), nameof(GridPageLength), nameof(GridFirstPage), nameof(GridPreviousPage), nameof(GridNextPage), nameof(GridLastPage),
        nameof(GridExport), nameof(GridFilteredResults), nameof(GridSelectedRows), nameof(GridAllResults), nameof(GridVisibleRows), nameof(GridAllRows), nameof(GridDownloadCsv), nameof(GridCopy), nameof(GridDetails),
        nameof(SearchPlaceholder), nameof(SearchResults), nameof(SearchResultCount), nameof(SearchResultCountOfTotal), nameof(SearchResultCountOfMany),
        nameof(GridFilters), nameof(GridColumn), nameof(GridOperator), nameof(GridValue), nameof(GridValueType), nameof(GridText), nameof(GridBoolean), nameof(GridAddFilter), nameof(GridRemoveFilter), nameof(GridApply), nameof(GridClearFilters), nameof(GridMoveEarlier), nameof(GridMoveLater), nameof(GridViews), nameof(GridViewName), nameof(GridSaveView), nameof(GridRemoveView), nameof(GridResetView), nameof(GridChooseView), nameof(GridInvalidFilter), nameof(GridContains), nameof(GridStartsWith), nameof(GridIn), nameof(GridIsNull), nameof(GridIsNotNull),
        nameof(SearchNoResults), nameof(SearchTooShort), nameof(SearchWordTooShort), nameof(SearchFailed), nameof(Columns), nameof(VisibleColumns),
        nameof(ResizeColumn), nameof(ColumnWidth), nameof(Loading), nameof(LoadError), nameof(QueryFailed), nameof(ShowMore), nameof(ShowMoreUnknownTotal),
        nameof(PageLoaded), nameof(ItemsLoaded), nameof(Yes), nameof(No), nameof(UtcTime), nameof(LocalTime), nameof(MountError),
        nameof(Actions), nameof(EditValue), nameof(SaveEdit), nameof(CancelEdit), nameof(InvalidEdit), nameof(InteractionPending),
        nameof(InteractionRejected), nameof(InteractionFailed), nameof(MarkMove), nameof(MoveHere), nameof(MoveBefore), nameof(MoveAfter), nameof(CancelMove)
    };

    private static readonly string[] InteractionNames = {
        nameof(Actions), nameof(EditValue), nameof(SaveEdit), nameof(CancelEdit), nameof(InvalidEdit), nameof(InteractionPending),
        nameof(InteractionRejected), nameof(InteractionFailed), nameof(MarkMove), nameof(MoveHere), nameof(MoveBefore), nameof(MoveAfter), nameof(CancelMove)
    };

    private readonly Dictionary<string, string> _values = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the placeholder and accessible name of the search box when the view's search options set none (<see cref="CanopySearchOptions.Placeholder"/>). Default "Search".</summary>
    public string SearchPlaceholder { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the result summary when a source cannot provide a matching count. Default "Result count unavailable".</summary>
    public string GridUnknownCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the known matching count when the unfiltered total is unknown, including <c>{count}</c>. Default "{count} matching rows".</summary>
    public string GridMatchedCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the returned range when its matching total is unknown, including <c>{first}</c> and <c>{last}</c>. Default "Rows {first}–{last}".</summary>
    public string GridCursorRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grid export panel label. Default "Export".</summary>
    public string GridExport { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the filtered export scope label. Default "Filtered results".</summary>
    public string GridFilteredResults { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the selected export scope label. Default "Selected rows".</summary>
    public string GridSelectedRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the full dataset export scope label. Default "All results".</summary>
    public string GridAllResults { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a tree's visible-rows export scope label. Default "Visible rows".</summary>
    public string GridVisibleRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a tree's every-row export scope label. Default "All rows".</summary>
    public string GridAllRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the client CSV action label. Default "Download CSV".</summary>
    public string GridDownloadCsv { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clipboard action label. Default "Copy".</summary>
    public string GridCopy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the host record-details action label. Default "Record details".</summary>
    public string GridDetails { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the list of search results. Default "Search results".</summary>
    public string SearchResults { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when a search found <c>{count}</c> results. Default "{count} results".</summary>
    public string SearchResultCount { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when the list shows <c>{count}</c> of <c>{total}</c> matches. Default "{count} of {total} results".</summary>
    public string SearchResultCountOfTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when the list shows <c>{count}</c> of an unknown number of matches. Default "{count} of many results".</summary>
    public string SearchResultCountOfMany { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a search found nothing. Default "No results".</summary>
    public string SearchNoResults { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the hint for a query shorter than <c>{min}</c> characters. Default "Type at least {min} characters".</summary>
    public string SearchTooShort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the hint when every word of a query is one character long, which a bundle's index cannot look up; <c>{min}</c> is 2. Default "Type a word of at least {min} characters".</summary>
    public string SearchWordTooShort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a search failed with <c>{error}</c>. Default "Search failed: {error}".</summary>
    public string SearchFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button of the column chooser. Default "Columns".</summary>
    public string Columns { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Filters".</summary>
    public string GridFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accepted-result summary using <c>{count}</c> and <c>{total}</c>. Default "{count} of {total} rows".</summary>
    public string GridResultCount { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the page navigation form name. Default "Result pages".</summary>
    public string GridPaging { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the visible range using <c>{first}</c>, <c>{last}</c> and <c>{count}</c>. Default "{first}–{last} of {count} rows".</summary>
    public string GridPageRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the page jump input label. Default "Page".</summary>
    public string GridPageNumber { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the visible page length label. Default "Rows per page".</summary>
    public string GridPageLength { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the first-page action. Default "First page".</summary>
    public string GridFirstPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the previous-page action. Default "Previous page".</summary>
    public string GridPreviousPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the next-page action. Default "Next page".</summary>
    public string GridNextPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the last-page action. Default "Last page".</summary>
    public string GridLastPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the action that clears search and every filter. Default "Clear search and filters".</summary>
    public string GridClearQuery { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the search-chip action using <c>{search}</c>. Default "Clear search: {search}".</summary>
    public string GridRemoveSearch { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grouped-filter chip using <c>{count}</c>. Default "Grouped filters ({count} conditions)".</summary>
    public string GridGroupedFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grouped-filter removal action. Default "Clear grouped filters".</summary>
    public string GridRemoveGroup { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the predicate removal action using <c>{condition}</c>. Default "Remove condition: {condition}".</summary>
    public string GridRemoveCondition { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Column".</summary>
    public string GridColumn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Condition".</summary>
    public string GridOperator { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Value (UTC for dates)".</summary>
    public string GridValue { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Raw value type".</summary>
    public string GridValueType { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Text".</summary>
    public string GridText { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Boolean".</summary>
    public string GridBoolean { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Add filter".</summary>
    public string GridAddFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Remove {column} filter".</summary>
    public string GridRemoveFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Apply".</summary>
    public string GridApply { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Clear filters".</summary>
    public string GridClearFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Move {column} earlier".</summary>
    public string GridMoveEarlier { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Move {column} later".</summary>
    public string GridMoveLater { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Saved views".</summary>
    public string GridViews { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "View name".</summary>
    public string GridViewName { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Save view".</summary>
    public string GridSaveView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Remove view".</summary>
    public string GridRemoveView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Reset view".</summary>
    public string GridResetView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Choose a saved view".</summary>
    public string GridChooseView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Enter a valid filter value.".</summary>
    public string GridInvalidFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "contains".</summary>
    public string GridContains { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "starts with".</summary>
    public string GridStartsWith { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is any of".</summary>
    public string GridIn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is missing".</summary>
    public string GridIsNull { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is present".</summary>
    public string GridIsNotNull { get => Get(); set => Set(value); }

    /// <summary>
    /// Gets whether a flat-grid label is translated. Flat grids always use a grid runtime; a tree view writes only the
    /// labels the tree runtimes read (its toolbar menus' grid labels among them), so its translations never require one.
    /// </summary>
    public bool RequiresDataGridRuntime {
        get {
            foreach (var name in _values.Keys) if (name.StartsWith("Grid", StringComparison.Ordinal)) return true;
            return false;
        }
    }

    /// <summary>Gets or sets the accessible name of the column chooser's list. Default "Visible columns".</summary>
    public string VisibleColumns { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the handle that resizes column <c>{column}</c>. Default "Resize {column}".</summary>
    public string ResizeColumn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears as a column's width of <c>{width}</c> pixels. Default "{width} pixels".</summary>
    public string ColumnWidth { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the row shown while children load. Default "Loading…".</summary>
    public string Loading { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the row shown when children could not be loaded because of <c>{error}</c>. Default "Could not load: {error} (Enter to retry)".</summary>
    public string LoadError { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a view query failed with <c>{error}</c>. Default "Could not update the view: {error}".</summary>
    public string QueryFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the context menu. Default "Actions".</summary>
    public string Actions { get => Get(); set => Set(value); }
    /// <summary>Gets or sets an editor's label, including <c>{column}</c>. Default "Edit {column}".</summary>
    public string EditValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the editor's submit button. Default "Save".</summary>
    public string SaveEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the editor's cancel button. Default "Cancel".</summary>
    public string CancelEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the invalid value message, including <c>{column}</c>. Default "Enter a valid {column} value.".</summary>
    public string InvalidEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement while a host hook is pending. Default "Waiting for the host…".</summary>
    public string InteractionPending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement for a declined proposal. Default "The host declined the operation.".</summary>
    public string InteractionRejected { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the failure announcement, including <c>{error}</c>. Default "Operation failed: {error}".</summary>
    public string InteractionFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the menu command that marks a node for moving. Default "Move this node".</summary>
    public string MarkMove { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving into a node. Default "Move here".</summary>
    public string MoveHere { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving before a node. Default "Move before".</summary>
    public string MoveBefore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving after a node. Default "Move after".</summary>
    public string MoveAfter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that clears a move intent. Default "Cancel move".</summary>
    public string CancelMove { get => Get(); set => Set(value); }

    /// <summary>Gets whether translations use labels supplied by the interactive browser entry point.</summary>
    public bool RequiresInteractiveRuntime {
        get {
            foreach (var name in InteractionNames) if (_values.ContainsKey(name)) return true;
            return false;
        }
    }

    /// <summary>Gets or sets the "show more" row, with <c>{loaded}</c> of <c>{total}</c> children loaded. Default "Show more ({loaded} of {total} loaded)".</summary>
    public string ShowMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the "show more" row when the number of children is not known. Default "Show more ({loaded} loaded)".</summary>
    public string ShowMoreUnknownTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement after a page of children, <c>{loaded}</c> of <c>{total}</c>. Default "{loaded} of {total} loaded".</summary>
    public string PageLoaded { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement after the last page, <c>{count}</c> children in all. Default "{count} items".</summary>
    public string ItemsLoaded { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a true value without display text is shown. Default "Yes".</summary>
    public string Yes { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a false value without display text is shown. Default "No".</summary>
    public string No { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a date in UTC is shown; it must hold <c>{time}</c>, the date and time. Default "{time} UTC".</summary>
    public string UtcTime { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip that gives a UTC date in the reader's time zone; it must hold <c>{time}</c>. Default "{time} local time".</summary>
    public string LocalTime { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the notice shown in place of a view that failed with <c>{error}</c>. Default "This view could not be displayed: {error}".</summary>
    public string MountError { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note under a shortened static outline, <c>{shown}</c> of <c>{total}</c> rows. Default "Showing {shown} of {total} rows.".</summary>
    public string OverflowNote { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what the static outline writes for <c>{total}</c> when children a source would load have no count. Default "unknown".</summary>
    public string UnknownTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip of the "(+N)" marker in the static outline, <c>{count}</c> rows not shown. Default "{count} rows below are not shown".</summary>
    public string HiddenRows { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the text of the link to the full report under a shortened static outline. Default "Open the full report".</summary>
    public string FullReport { get => Get(); set => Set(value); }

    /// <summary>Copies every label, so one set of translations can serve several views.</summary>
    /// <returns>A new set of labels with the same texts.</returns>
    public CanopyLabels Clone() {
        var copy = new CanopyLabels();
        foreach (var item in _values) {
            copy._values[item.Key] = item.Value;
        }

        return copy;
    }

    /// <summary>Whether any label the browser reads differs from English, so the view document carries it.</summary>
    /// <param name="tree">Count only the labels the tree runtimes read (a tree view's document).</param>
    internal bool HasRuntimeLabels(bool tree) {
        foreach (var name in RuntimeNames) {
            if (_values.ContainsKey(name) && (!tree || ReadByTrees(name))) {
                return true;
            }
        }

        return false;
    }

    /// <summary>Writes the view document's <c>labels</c>: the labels the browser reads that differ from English.</summary>
    /// <param name="writer">The view document's writer.</param>
    /// <param name="tree">Write only the labels the tree runtimes read (a tree view's document).</param>
    internal void WriteJson(CanopyJsonWriter writer, bool tree) {
        writer.BeginObject();
        foreach (var name in RuntimeNames) {
            if ((!tree || ReadByTrees(name)) && _values.TryGetValue(name, out var value)) {
                writer.Property(char.ToLowerInvariant(name[0]) + name.Substring(1), value);
            }
        }

        writer.EndObject();
    }

    private string Get([System.Runtime.CompilerServices.CallerMemberName] string name = "") =>
        _values.TryGetValue(name, out var value) ? value : Defaults[name];

    private void Set(string value, [System.Runtime.CompilerServices.CallerMemberName] string name = "") {
        // Visible text as the browser judges it, where U+FEFF counts as white space too.
        if (value == null || value.Trim().Trim('\uFEFF').Trim().Length == 0) {
            throw new ArgumentException("Label " + name + " needs visible text.", nameof(value));
        }

        if ((name == nameof(UtcTime) || name == nameof(LocalTime)) && value.IndexOf("{time}", StringComparison.Ordinal) < 0) {
            throw new ArgumentException("Label " + name + " must hold {time}, where the date goes.", nameof(value));
        }

        if (value == Defaults[name]) {
            _values.Remove(name);
        } else {
            _values[name] = value;
        }
    }
}
