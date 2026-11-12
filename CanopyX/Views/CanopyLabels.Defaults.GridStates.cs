using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddGridStatesDefaults(Dictionary<string, string> defaults) {
        defaults[nameof(GridNoMatchesSearch)] = "No {noun} match “{search}”.";
        defaults[nameof(GridNoMatchesSearchFilters)] = "[one]No {noun} match “{search}” with {count} filter.[other]No {noun} match “{search}” with {count} filters.";
        defaults[nameof(GridNoMatchesFilters)] = "[one]No {noun} match the {count} active filter.[other]No {noun} match the {count} active filters.";
        defaults[nameof(GridClearSearch)] = "Clear search";
    }
}
