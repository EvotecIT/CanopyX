using System.Collections.Generic;

namespace CanopyX;

// Optional data-view English labels share the default lookup without growing its original table.
public sealed partial class CanopyLabels {
    /// <summary>Adds the comparison and view-intent labels to the shared English defaults.</summary>
    private static void AddDataViewsDefaults(Dictionary<string, string> defaults) {
        foreach (var item in new Dictionary<string, string> {
            [nameof(ViewIntentWords)] = "Whole words",
            [nameof(ViewIntentSubstring)] = "Text contains",
            [nameof(ViewIntentPreview)] = "Proposed changes",
            [nameof(ViewIntentApplied)] = "View changes applied.",
            [nameof(ViewIntentSuperseded)] = "The view changed. Preview the proposal again.",
            [nameof(ViewIntentSearch)] = "Search: {search}",
            [nameof(ViewIntentSort)] = "Sort by {columns}",
            [nameof(ViewIntentGroup)] = "Group rows by {columns}",
            [nameof(ViewIntentColumns)] = "Show columns: {columns}",
            [nameof(CompareSummary)] = "Dataset comparison",
            [nameof(CompareAdded)] = "Added",
            [nameof(CompareRemoved)] = "Removed",
            [nameof(CompareChanged)] = "Changed",
            [nameof(CompareUnchanged)] = "Unchanged",
            [nameof(CompareOnlyChanges)] = "Changed only",
            [nameof(CompareColumnChanges)] = "[one]{column}: {count} changed cell[other]{column}: {count} changed cells",
            [nameof(CompareChanges)] = "Changes",
            [nameof(ViewIntentClearSearch)] = "Clear search",
            [nameof(ViewIntentRemoveGrouping)] = "Remove grouping",
            [nameof(ViewIntentFlat)] = "Show records",
            [nameof(ViewIntentAscending)] = "ascending",
            [nameof(ViewIntentDescending)] = "descending",
            [nameof(ViewIntentNotEqual)] = "is not",
            [nameof(ViewIntentGreater)] = "greater than",
            [nameof(ViewIntentAtLeast)] = "at least",
            [nameof(ViewIntentLess)] = "less than",
            [nameof(ViewIntentAtMost)] = "at most",
            [nameof(ViewIntentFilter)] = "Show rows where {column} {operator} {values}",
            [nameof(ViewIntentOnly)] = "Show only {column}: {values}",
            [nameof(ViewIntentPivot)] = "Rows: {rows}; columns: {columns}; values: {values}",
            [nameof(ViewIntentAllRows)] = "all records",
            [nameof(ViewIntentTotals)] = "totals",
            [nameof(ViewIntentTuples)] = "Show matching combinations of {columns}: {values}",
            [nameof(ViewIntentExcludeTuples)] = "Exclude matching combinations of {columns}: {values}",
            [nameof(ViewIntentNoChanges)] = "This view is already selected.",
        }) defaults.Add(item.Key, item.Value);
    }
}
