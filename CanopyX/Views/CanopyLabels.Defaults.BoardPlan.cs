using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Adds the optional layout labels to the shared English defaults.</summary>
    private static Dictionary<string, string> WithBoardPlanDefaults(Dictionary<string, string> defaults) {
        defaults[nameof(BoardLane)] = "Lane";
        defaults[nameof(BoardUnassigned)] = "Unassigned";
        defaults[nameof(BoardEmpty)] = "No records in this lane";
        defaults[nameof(BoardWip)] = "{count} / {limit}";
        defaults[nameof(BoardWipFull)] = "{lane} has reached its work limit ({limit}).";
        defaults[nameof(BoardMove)] = "Move to lane";
        defaults[nameof(BoardMoved)] = "{title} moved to {lane}.";
        defaults[nameof(BoardRejected)] = "Move was not accepted.";
        defaults[nameof(BoardPending)] = "Waiting for the host to accept the move…";
        defaults[nameof(BoardPartial)] = "Showing the first {count} records. Narrow the filters to see the rest.";
        defaults[nameof(BoardKeys)] = "Use Alt+Left or Alt+Right to move between lanes; Up and Down to browse cards.";
        defaults[nameof(PlanMilestone)] = "Milestone";
        defaults[nameof(PlanCritical)] = "Critical path";
        defaults[nameof(PlanBaseline)] = "Baseline: {start} – {end}";
        defaults[nameof(PlanDependency)] = "{from} finishes before {to} starts";
        defaults[nameof(PlanDependencyConflict)] = "Dependency conflict with {task}";
        defaults[nameof(PlanOverlapConflict)] = "Overlaps {task}";
        defaults[nameof(PlanIncomplete)] = "The complete task network is unavailable; the host must check this proposal.";
        defaults[nameof(PlanInvalidRange)] = "The task must finish at or after its start.";
        defaults[nameof(PlanInvalidResource)] = "Choose a task resource.";
        defaults[nameof(PlanProposal)] = "Proposed {task}: {start} – {end}";
        defaults[nameof(PlanMoveHint)] = "Alt+Left or Alt+Right proposes a new date; Alt+Up or Alt+Down proposes a resource.";
        defaults[nameof(PlanActual)] = "Actual";
        defaults[nameof(PlanPending)] = "Proposal awaiting the host";
        defaults[nameof(PlanBaselineLabel)] = "Baseline";
        defaults[nameof(PlanDependencies)] = "Dependencies";
        return defaults;
    }
}
