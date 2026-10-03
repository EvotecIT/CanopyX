namespace CanopyX.Html;

/// <summary>Selects a browser entry point. Include one entry point per page.</summary>
public enum CanopyRuntime {
    /// <summary>The virtual tree grid with selection, search, filters, and saved views.</summary>
    TreeGrid,

    /// <summary>The tree grid with optional checking controls and host interaction hooks.</summary>
    InteractiveTreeGrid,

    /// <summary>The flat data grid and both tree runtimes, for pages that combine their views.</summary>
    DataGrid
}
