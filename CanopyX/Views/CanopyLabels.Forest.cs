namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the text for path empty.</summary>
    public string PathEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path source.</summary>
    public string PathSource { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path target.</summary>
    public string PathTarget { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path step.</summary>
    public string PathStep { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path cycle.</summary>
    public string PathCycle { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path foreign.</summary>
    public string PathForeign { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path disabled.</summary>
    public string PathDisabled { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path keys.</summary>
    public string PathKeys { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for path partial.</summary>
    public string PathPartial { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack winner.</summary>
    public string StackWinner { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack enforced.</summary>
    public string StackEnforced { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack filtered.</summary>
    public string StackFiltered { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack empty.</summary>
    public string StackEmpty { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack order.</summary>
    public string StackOrder { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for stack truncated.</summary>
    public string StackTruncated { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time play.</summary>
    public string TimePlay { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time pause.</summary>
    public string TimePause { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time previous.</summary>
    public string TimePrevious { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time next.</summary>
    public string TimeNext { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time position.</summary>
    public string TimePosition { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time frame.</summary>
    public string TimeFrame { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text for time reduced motion.</summary>
    public string TimeReducedMotion { get => Get(); set => Set(value); }

    private static bool IsTimeLabel(string name) => name.StartsWith("Time", System.StringComparison.Ordinal) && name.Length > 4 && char.IsUpper(name[4]);
}
