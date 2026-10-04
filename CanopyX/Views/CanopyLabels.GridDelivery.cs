namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets delivery progress with <c>{completed}</c> and known <c>{total}</c> record counts.</summary>
    public string GridExportProgress { get => Get(); set => Set(value); }
    /// <summary>Gets or sets delivery progress with <c>{completed}</c> when the source count is unknown.</summary>
    public string GridExportReading { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the confirmation that a delivery operation was cancelled.</summary>
    public string GridExportCancelled { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the cancel-delivery action label.</summary>
    public string GridCancelExport { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the host-governed print action label.</summary>
    public string GridPrint { get => Get(); set => Set(value); }
}
