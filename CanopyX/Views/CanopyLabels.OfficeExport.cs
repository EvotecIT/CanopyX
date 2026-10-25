namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the optional XLSX writer's Export menu action.</summary>
    public string GridDownloadXlsx { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the optional PDF writer's Export menu action.</summary>
    public string GridDownloadPdf { get => Get(); set => Set(value); }
}
