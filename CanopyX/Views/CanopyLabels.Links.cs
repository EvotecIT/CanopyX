namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the chip of an external filter another view applied, including <c>{source}</c> and <c>{values}</c>. Default "Filtered by {source}: {values}".</summary>
    public string LinkFilteredBy { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of an external filter chip, which removes it, including <c>{source}</c> and <c>{values}</c>. Default "Remove the filter from {source}: {values}".</summary>
    public string LinkRemoveFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when another view filters this one, including <c>{source}</c> and <c>{count}</c>. Default "Filtered by {source}: {count} rows".</summary>
    public string LinkFiltered { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when another view highlights rows, including <c>{count}</c> and <c>{source}</c>. Default "{count} rows highlighted from {source}".</summary>
    public string LinkHighlighted { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when rows are highlighted without a named source, including <c>{count}</c>. Default "{count} rows highlighted".</summary>
    public string LinkHighlightedRows { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when the last external filter is removed. Default "Linked filters removed".</summary>
    public string LinkCleared { get => Get(); set => Set(value); }
}
