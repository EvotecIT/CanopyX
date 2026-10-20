namespace CanopyX;

/// <summary>How a flow opens its steps (<see cref="CanopyFlow.Mode"/>).</summary>
public enum CanopyFlowMode {
    /// <summary>A step opens when the visible steps before it are valid. The default.</summary>
    Linear,

    /// <summary>Any visible step opens at any time; the review page checks every step.</summary>
    Free,

    /// <summary>A hub lists the steps as tasks with their states; each opens on its own, and the review page opens once every required task is complete.</summary>
    Tasks
}