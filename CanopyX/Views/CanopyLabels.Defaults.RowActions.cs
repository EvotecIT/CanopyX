using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddRowActionsDefaults(Dictionary<string, string> defaults) {
        defaults[nameof(RowActionColumn)] = "Actions";
        defaults[nameof(RowActionMore)] = "More actions";
        defaults[nameof(RowActionLocked)] = "Read-only";
        defaults[nameof(RowActionDismiss)] = "Dismiss";
        defaults[nameof(RowActionPending)] = "{action}: working";
        defaults[nameof(RowActionDone)] = "{action}: done";
        defaults[nameof(RowActionRejected)] = "{action} was not carried out.";
        defaults[nameof(RowActionFailed)] = "{action} failed: {error}";
    }
}
