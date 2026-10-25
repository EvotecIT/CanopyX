using System.Collections.Generic;

namespace CanopyX;

// Optional data-view English labels share the default lookup without growing its original table.
public sealed partial class CanopyLabels {
    static CanopyLabels() {
        foreach (var item in new Dictionary<string, string> {
            [nameof(ViewIntentWords)] = "Whole words",
            [nameof(ViewIntentSubstring)] = "Text contains",
            [nameof(ViewIntentPreview)] = "Preview view changes",
            [nameof(ViewIntentApplied)] = "View changes applied.",
            [nameof(ViewIntentSuperseded)] = "The view changed. Preview the proposal again.",
            [nameof(ViewIntentSearch)] = "Search: {search}",
            [nameof(ViewIntentSort)] = "Sort: {columns}",
            [nameof(ViewIntentGroup)] = "Group by: {columns}",
            [nameof(ViewIntentColumns)] = "Columns: {columns}",
            [nameof(CompareSummary)] = "Dataset comparison",
            [nameof(CompareAdded)] = "Added",
            [nameof(CompareRemoved)] = "Removed",
            [nameof(CompareChanged)] = "Changed",
            [nameof(CompareUnchanged)] = "Unchanged",
            [nameof(CompareOnlyChanges)] = "Only changes",
            [nameof(CompareColumnChanges)] = "{column}: {count} changed cells",
        }) Defaults.Add(item.Key, item.Value);
    }
}
