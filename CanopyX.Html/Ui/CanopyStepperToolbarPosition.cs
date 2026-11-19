namespace CanopyX.Html.Ui;

/// <summary>Where an interactive stepper's toolbar of Back, Next and Finish buttons shows (with <see cref="CanopyStepperOptions.ShowFooter"/>).</summary>
public enum CanopyStepperToolbarPosition {
    /// <summary>Under the steps' panels. The default.</summary>
    Bottom,
    /// <summary>Between the step rail and the panels.</summary>
    Top,
    /// <summary>Both above and under the panels; the two toolbars stay in step.</summary>
    Both
}
