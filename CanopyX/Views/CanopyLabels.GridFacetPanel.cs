namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the facet panel's heading and the toolbar button that opens it as a sheet. Default "Filter by".</summary>
    public string GridFacetPanel { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the switch that collapses the facet panel. Default "Hide the filter panel".</summary>
    public string GridFacetPanelHide { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the switch that opens the collapsed facet panel. Default "Show the filter panel".</summary>
    public string GridFacetPanelShow { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button under a value list that shows <c>{count}</c> more values. Default "Show {count} more".</summary>
    public string GridFacetShowMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that shortens an expanded value list. Default "Show fewer".</summary>
    public string GridFacetShowFewer { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a value list shows the empty value. Default "(Empty)".</summary>
    public string GridFacetEmptyValue { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the lower bound field of a range facet. Default "From".</summary>
    public string GridFacetFrom { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the upper bound field of a range facet. Default "To".</summary>
    public string GridFacetTo { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a range facet's histogram, including <c>{column}</c>. Default "Distribution of {column}".</summary>
    public string GridFacetHistogram { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip of a histogram bar, including <c>{from}</c>, <c>{to}</c> and <c>{count}</c>. Default "{from} to {to}: {count} rows".</summary>
    public string GridFacetBin { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note of a range facet whose values are too many to chart. Default "Too many values to chart".</summary>
    public string GridFacetNoChart { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a facet's Clear button, including <c>{column}</c>. Default "Clear {column}".</summary>
    public string GridFacetClear { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note of a facet whose column another condition filters. Default "Another condition filters this column.".</summary>
    public string GridFacetCustom { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after a facet choice, including <c>{count}</c>. Default "{count} matching rows".</summary>
    public string GridFacetResult { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a value list's badge, including <c>{count}</c>. Default "{count} selected".</summary>
    public string GridFacetSelected { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a value's checkbox, including <c>{value}</c> and <c>{count}</c>. Default "{value}, {count} rows".</summary>
    public string GridFacetValueCount { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a facet heading that collapses it, including <c>{column}</c>. Default "Collapse {column}".</summary>
    public string GridFacetCollapse { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a collapsed facet heading that expands it, including <c>{column}</c>. Default "Expand {column}".</summary>
    public string GridFacetExpand { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note of a range field that holds no valid number or date. Default "Enter a valid value.".</summary>
    public string GridFacetInvalid { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note of a range whose From value is after its To value. Default "From must not be after To.".</summary>
    public string GridFacetReversed { get => Get(); set => Set(value); }
}
