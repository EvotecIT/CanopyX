namespace CanopyX;

// The texts the matrix writes itself (docs/matrix.md#labels-and-right-to-left). A matrix document carries the changed ones.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the default title of the row axis. Default "Rows".</summary>
    public string MatrixRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the default title of the column axis. Default "Columns".</summary>
    public string MatrixColumns { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the search field placeholder and name. Default "Find rows and columns".</summary>
    public string MatrixSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort choice of an axis. Default "Sort by".</summary>
    public string MatrixSortBy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group choice of an axis. Default "Group by".</summary>
    public string MatrixGroupBy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort option that sorts by item labels. Default "Name".</summary>
    public string MatrixByLabel { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort option that sorts by totals. Default "Total".</summary>
    public string MatrixByTotal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the sort option that keeps the declared order. Default "As listed".</summary>
    public string MatrixAsListed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the group option that shows no groups. Default "No groups".</summary>
    public string MatrixNoGrouping { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that reverses an axis sort. Default "Descending".</summary>
    public string MatrixDescending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that keeps the rows and columns with cells that need attention. Default "Only problems".</summary>
    public string MatrixOnlyProblems { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the switch that hides the rows and columns whose visible cells all lack data. Default "Hide empty rows and columns".</summary>
    public string MatrixHideEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the size of the matrix, including <c>{rows}</c> and <c>{columns}</c>. Default "{rows} × {columns}".</summary>
    public string MatrixSize { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the size while filters hide items, including <c>{rows}</c>, <c>{totalRows}</c>, <c>{columns}</c> and <c>{totalColumns}</c>. Default "Rows: {rows} of {totalRows}, columns: {columns} of {totalColumns}".</summary>
    public string MatrixShown { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the count of cells that need attention, including <c>{count}</c>. Default "Need attention: {count}".</summary>
    public string MatrixAttention { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the legend. Default "States".</summary>
    public string MatrixLegend { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that opens the filter panel. Default "Filter".</summary>
    public string MatrixFilter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that clears the search and the filters. Default "Clear filters".</summary>
    public string MatrixClearFilters { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the message when the filters leave nothing. Default "No rows or columns match.".</summary>
    public string MatrixNoMatches { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a self cell of a square matrix. Default "Same item".</summary>
    public string MatrixSelf { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a cell without data. Default "No data".</summary>
    public string MatrixNoData { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a cell, including <c>{row}</c>, <c>{column}</c> and <c>{state}</c>. Default "{row} and {column}: {state}".</summary>
    public string MatrixCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the header of the totals column and row. Default "Total".</summary>
    public string MatrixTotal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of a total, including <c>{item}</c> and <c>{count}</c>. Default "{item}: {count}".</summary>
    public string MatrixItemTotal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that opens a collapsed group, including <c>{group}</c>. Default "Expand {group}".</summary>
    public string MatrixExpandGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that rolls a group up into one row or column, including <c>{group}</c>. Default "Collapse {group}".</summary>
    public string MatrixCollapseGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the number of items in a group, including <c>{count}</c>. Default "Items: {count}".</summary>
    public string MatrixGroupCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the title of the cell details dialog. Default "Details".</summary>
    public string MatrixDetails { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that closes a dialog or panel. Default "Close".</summary>
    public string MatrixClose { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the value row of the details. Default "Value".</summary>
    public string MatrixValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the state row of the details. Default "State".</summary>
    public string MatrixState { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a phone card whose cells are all fine. Default "Nothing needs attention".</summary>
    public string MatrixAllClear { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the button that shows more phone cards. Default "Show more".</summary>
    public string MatrixShowMore { get => Get(); set => Set(value); }
}
