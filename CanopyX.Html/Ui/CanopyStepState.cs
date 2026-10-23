namespace CanopyX.Html.Ui;

/// <summary>Progress state of a step.</summary>
public enum CanopyStepState {
    /// <summary>The step has not been visited.</summary>
    Upcoming,
    /// <summary>The selected step.</summary>
    Current,
    /// <summary>The step is complete.</summary>
    Done,
    /// <summary>The step needs attention.</summary>
    Error,
    /// <summary>The step is locked.</summary>
    Disabled,
    /// <summary>An optional step was skipped.</summary>
    Skipped,
}
