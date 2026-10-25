namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the plan text: Milestone</summary>
    public string PlanMilestone { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Critical path</summary>
    public string PlanCritical { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Baseline: {start} – {end}</summary>
    public string PlanBaseline { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: {from} finishes before {to} starts</summary>
    public string PlanDependency { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Dependency conflict with {task}</summary>
    public string PlanDependencyConflict { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Overlaps {task}</summary>
    public string PlanOverlapConflict { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: The complete task network is unavailable; the host must check this proposal.</summary>
    public string PlanIncomplete { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: The task must finish at or after its start.</summary>
    public string PlanInvalidRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Choose a task resource.</summary>
    public string PlanInvalidResource { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Proposed {task}: {start} – {end}</summary>
    public string PlanProposal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Alt+Left or Alt+Right proposes a new date; Alt+Up or Alt+Down proposes a resource.</summary>
    public string PlanMoveHint { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Actual</summary>
    public string PlanActual { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Proposal awaiting the host</summary>
    public string PlanPending { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Baseline</summary>
    public string PlanBaselineLabel { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the plan text: Dependencies</summary>
    public string PlanDependencies { get => Get(); set => Set(value); }

}
