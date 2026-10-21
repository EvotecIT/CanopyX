namespace CanopyX.Data;

/// <summary>A task's state on a task-list flow, as the host sees it (<see cref="CanopyFlowStepStatus.State"/>).</summary>
public enum CanopyFlowTaskState {
    /// <summary>The task is done.</summary>
    Complete,

    /// <summary>The task needs the reader's attention.</summary>
    NeedsAction,

    /// <summary>The task cannot start yet; its blockers say why.</summary>
    Blocked,

    /// <summary>The task has not started.</summary>
    NotStarted
}