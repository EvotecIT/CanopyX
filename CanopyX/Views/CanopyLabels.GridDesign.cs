namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the accessible label of the record drawer's close button.</summary>
    public string GridCloseRecord { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the {count} groups label.</summary>
    public string GridGroupCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the of these label.</summary>
    public string GridOfThese { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the of these are true label.</summary>
    public string GridOfTheseAreTrue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the show rows where label.</summary>
    public string GridShowRowsWhere { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the remove condition label.</summary>
    public string GridDeleteCondition { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the upper value label.</summary>
    public string GridConditionUpperValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the value label.</summary>
    public string GridConditionValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count: {count} · sum: {sum} · average: {average} · minimum: {minimum} · maximum: {maximum} label.</summary>
    public string GridSelectionAggregate { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clear filter label.</summary>
    public string GridClearColumnFilter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the this column belongs to a mixed condition group edit it in filters label.</summary>
    public string GridComplexFilter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the where label.</summary>
    public string GridWhere { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the unpin label.</summary>
    public string GridUnpin { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the fit to content label.</summary>
    public string GridFitContent { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the more label.</summary>
    public string GridMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the done label.</summary>
    public string GridDone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clear all label.</summary>
    public string GridClearAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the empty state's button that clears a search when no filters are active. Default "Clear search".</summary>
    public string GridClearSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the rows label.</summary>
    public string GridRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the result noun label.</summary>
    public string GridResultNoun { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the search noun label.</summary>
    public string GridSearchNoun { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the chart label.</summary>
    public string GridChart { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the column menu label.</summary>
    public string GridColumnMenu { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort ascending label.</summary>
    public string GridSortAscending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort descending label.</summary>
    public string GridSortDescending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clear sort label.</summary>
    public string GridClearSort { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the filter column label.</summary>
    public string GridFilterColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hide column label.</summary>
    public string GridHideColumn { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the grouped by label.</summary>
    public string GridGroupedBy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the remove grouping label.</summary>
    public string GridRemoveGrouping { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the select all values label.</summary>
    public string GridSelectAllValues { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the filter values label.</summary>
    public string GridFilterValues { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the add condition label.</summary>
    public string GridAddCondition { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the add group label.</summary>
    public string GridAddGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the and label.</summary>
    public string GridAnd { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the or label.</summary>
    public string GridOr { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the edit as text label.</summary>
    public string GridEditAsText { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the filter text label.</summary>
    public string GridFilterText { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the deep filters label.</summary>
    public string GridDeepFilters { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the today label.</summary>
    public string GridToday { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the yesterday label.</summary>
    public string GridYesterday { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the last seven days label.</summary>
    public string GridLastSevenDays { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the last thirty days label.</summary>
    public string GridLastThirtyDays { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the this month label.</summary>
    public string GridThisMonth { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the date range label.</summary>
    public string GridDateRange { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the empty label.</summary>
    public string GridEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the empty reason label.</summary>
    public string GridEmptyReason { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the no matches label.</summary>
    public string GridNoMatches { get => Get(); set => Set(value); }
    /// <summary>Deprecated and no longer shown: the empty state uses <see cref="GridNoMatchesSearch"/>, <see cref="GridNoMatchesSearchFilters"/> or <see cref="GridNoMatchesFilters"/>. It stays so existing documents and packs that carry it still load.</summary>
    public string GridNoMatchesReason { get => Get(); set => Set(value); }
    /// <summary>Gets or sets why no rows match when only a search is active, with <c>{noun}</c> and <c>{search}</c>. Default "No {noun} match “{search}”.".</summary>
    public string GridNoMatchesSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets why no rows match a search and filters, with <c>{noun}</c>, <c>{search}</c> and the filter <c>{count}</c>; it can give plural forms.</summary>
    public string GridNoMatchesSearchFilters { get => Get(); set => Set(value); }
    /// <summary>Gets or sets why no rows match when only filters are active, with <c>{noun}</c> and the filter <c>{count}</c>; it can give plural forms.</summary>
    public string GridNoMatchesFilters { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the retry label.</summary>
    public string GridRetry { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the load failed label.</summary>
    public string GridLoadFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the all label.</summary>
    public string GridAll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the page of label.</summary>
    public string GridPageOf { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the status count label.</summary>
    public string GridStatusCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the details section label.</summary>
    public string GridDetailsSection { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the previous record label.</summary>
    public string GridPreviousRecord { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the next record label.</summary>
    public string GridNextRecord { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the show more label.</summary>
    public string GridShowMore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the no data label.</summary>
    public string GridNoData { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the period range label.</summary>
    public string GridPeriodRange { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the footer totals row group.</summary>
    public string GridFooterTotals { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text of a footer total the host did not supply.</summary>
    public string GridFooterUnavailable { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the healthy label.</summary>
    public string GridHealthy { get => Get(); set => Set(value); }
}
