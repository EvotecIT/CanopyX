namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the dataset comparison summary's accessible name.</summary>
    public string CompareSummary { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the label for rows added to the newer dataset.</summary>
    public string CompareAdded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the label for rows absent from the newer dataset.</summary>
    public string CompareRemoved { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the label for rows with changed values.</summary>
    public string CompareChanged { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the label for rows whose values stayed the same.</summary>
    public string CompareUnchanged { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the comparison switch's label.</summary>
    public string CompareOnlyChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the header description with <c>{column}</c> and <c>{count}</c>.</summary>
    public string CompareColumnChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent preview label.</summary>
    public string ViewIntentPreview { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent applied label.</summary>
    public string ViewIntentApplied { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent superseded label.</summary>
    public string ViewIntentSuperseded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent search label.</summary>
    public string ViewIntentSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent sort label.</summary>
    public string ViewIntentSort { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent group label.</summary>
    public string ViewIntentGroup { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the view-intent columns label.</summary>
    public string ViewIntentColumns { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the preview chip for whole-word search.</summary>
    public string ViewIntentWords { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the preview chip for substring search.</summary>
    public string ViewIntentSubstring { get => Get(); set => Set(value); }
}
