using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static Dictionary<string, string> WithForestDefaults(Dictionary<string, string> defaults) {
        defaults[nameof(PathEmpty)] = "No paths to show";
        defaults[nameof(PathSource)] = "Source";
        defaults[nameof(PathTarget)] = "Target";
        defaults[nameof(PathStep)] = "Step {number} of {total}";
        defaults[nameof(PathCycle)] = "Cycle";
        defaults[nameof(PathForeign)] = "Foreign";
        defaults[nameof(PathDisabled)] = "Disabled";
        defaults[nameof(PathKeys)] = "Use Tab or arrow keys to browse steps; Enter or Space opens the record.";
        defaults[nameof(PathPartial)] = "Showing {shown} of {total} steps.";
        defaults[nameof(StackWinner)] = "Winner";
        defaults[nameof(StackEnforced)] = "Enforced";
        defaults[nameof(StackFiltered)] = "Filtered";
        defaults[nameof(StackEmpty)] = "No layers to display.";
        defaults[nameof(StackOrder)] = "Processing order";
        defaults[nameof(StackTruncated)] = "{shown} of {total} layers shown in processing order; the winning layer is always included.";
        defaults[nameof(TimePlay)] = "Play";
        defaults[nameof(TimePause)] = "Pause";
        defaults[nameof(TimePrevious)] = "Previous snapshot";
        defaults[nameof(TimeNext)] = "Next snapshot";
        defaults[nameof(TimePosition)] = "Snapshot {index} of {count}";
        defaults[nameof(TimeFrame)] = "Snapshot at {time}";
        defaults[nameof(TimeReducedMotion)] = "Timed playback is off because reduced motion is enabled. Step through snapshots manually.";
        return defaults;
    }
}
