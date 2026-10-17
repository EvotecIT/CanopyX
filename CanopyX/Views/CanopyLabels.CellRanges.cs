namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the announcement of one cell range, with <c>{rows}</c> rows and <c>{columns}</c> columns. Default "{rows} rows × {columns} columns selected".</summary>
    public string GridCellRangeSelected { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of several cell ranges, with <c>{ranges}</c> ranges and <c>{cells}</c> cells in all. Default "{ranges} ranges selected, {cells} cells".</summary>
    public string GridCellRangesSelected { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement when the cell ranges are cleared. Default "Cell selection cleared".</summary>
    public string GridCellRangeCleared { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell-menu and more-menu command that copies the cell ranges. Default "Copy cells".</summary>
    public string GridCopyCells { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell-menu command that copies the cell ranges with their column titles. Default "Copy cells with headers".</summary>
    public string GridCopyCellsWithHeaders { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell-menu command that pastes the clipboard into the cells. Default "Paste".</summary>
    public string GridPasteCells { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell-menu command that selects every cell. Default "Select all cells".</summary>
    public string GridSelectAllCells { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after a copy of <c>{rows}</c> rows and <c>{columns}</c> columns. Default "Copied {rows} rows × {columns} columns".</summary>
    public string GridCellsCopied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after a paste changed <c>{count}</c> cells. Default "Pasted {count} cells".</summary>
    public string GridCellsPasted { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of <c>{count}</c> refused cells after a paste or fill. Default "{count} cells were not pasted".</summary>
    public string GridPasteRefused { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the reason a pasted value was refused by a read-only cell. Default "This cell cannot be changed.".</summary>
    public string GridPasteReadOnly { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the reason a pasted <c>{value}</c> was refused by column <c>{column}</c>, whose kind cannot read it. Default "“{value}” is not a valid value for {column}.".</summary>
    public string GridPasteType { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the name of the list of refused cells after a paste or fill. Default "Paste report".</summary>
    public string GridPasteReport { get => Get(); set => Set(value); }
    /// <summary>Gets or sets one refused cell in the paste report: the row <c>{row}</c> (its identity text), the <c>{column}</c> and the <c>{reason}</c>. Default "Row {row}, {column}: {reason}".</summary>
    public string GridPasteCell { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the tooltip of the fill handle. Default "Drag to fill the cells below".</summary>
    public string GridFillHandle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement after the fill handle changed <c>{count}</c> cells. Default "Filled {count} cells".</summary>
    public string GridCellsFilled { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the accessible name of the cell menu (copy, paste, select all, clear). Default "Cell actions".</summary>
    public string GridCellMenu { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell-menu command that clears the cell ranges. Default "Clear cell selection".</summary>
    public string GridClearCellRanges { get => Get(); set => Set(value); }
}
