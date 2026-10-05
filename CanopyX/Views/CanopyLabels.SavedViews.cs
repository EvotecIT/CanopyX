namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the saved-view rename control label.</summary>
    public string GridRenameView { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the make-default saved-view control label.</summary>
    public string GridDefaultView { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clear-default saved-view control label.</summary>
    public string GridClearDefaultView { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the default-view status text including <c>{name}</c>.</summary>
    public string GridDefaultViewName { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the status text when no default view is selected.</summary>
    public string GridNoDefaultView { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the default saved-view choice text including <c>{name}</c>.</summary>
    public string GridDefaultViewOption { get => Get(); set => Set(value); }
}
