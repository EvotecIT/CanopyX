namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the action for adding a calculated column.</summary>
    public string GridCalculationAdd { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the calculated-column title field label.</summary>
    public string GridCalculationTitle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the calculated-column identity field label.</summary>
    public string GridCalculationId { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the expression field label.</summary>
    public string GridCalculationExpression { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cell error tooltip, including <c>{error}</c>.</summary>
    public string GridCalculationError { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the invalid calculated-column definition message.</summary>
    public string GridCalculationInvalid { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the expression syntax hint. Function names and column-reference syntax remain literal.</summary>
    public string GridCalculationHelp { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the numeric calculation kind label.</summary>
    public string GridCalculationNumber { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the date and time calculation kind label.</summary>
    public string GridCalculationDate { get => Get(); set => Set(value); }
}
