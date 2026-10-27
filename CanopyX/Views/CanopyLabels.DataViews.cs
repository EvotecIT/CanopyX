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
    /// <summary>Gets or sets the pluralized column-change summary with <c>{column}</c> and <c>{count}</c>.</summary>
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
    /// <summary>Gets or sets the Changes label.</summary>
    public string CompareChanges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Clear search label.</summary>
    public string ViewIntentClearSearch { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Remove grouping label.</summary>
    public string ViewIntentRemoveGrouping { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Show records label.</summary>
    public string ViewIntentFlat { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the ascending label.</summary>
    public string ViewIntentAscending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the descending label.</summary>
    public string ViewIntentDescending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the is not label.</summary>
    public string ViewIntentNotEqual { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the greater than label.</summary>
    public string ViewIntentGreater { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the at least label.</summary>
    public string ViewIntentAtLeast { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the less than label.</summary>
    public string ViewIntentLess { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the at most label.</summary>
    public string ViewIntentAtMost { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Show rows where {column} {operator} {values} label.</summary>
    public string ViewIntentFilter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Show only {column}: {values} label.</summary>
    public string ViewIntentOnly { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Switch to pivot: {rows} by {columns}, values {values} label.</summary>
    public string ViewIntentPivot { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the all records label.</summary>
    public string ViewIntentAllRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the totals label.</summary>
    public string ViewIntentTotals { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Show matching combinations of {columns}: {values} label.</summary>
    public string ViewIntentTuples { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Exclude matching combinations of {columns}: {values} label.</summary>
    public string ViewIntentExcludeTuples { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the This view is already selected. label.</summary>
    public string ViewIntentNoChanges { get => Get(); set => Set(value); }
}
