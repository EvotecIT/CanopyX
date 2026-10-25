namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the formatted workbook hint in the Export menu.</summary>
    public string GridExportWorkbookHint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the paged PDF hint in the Export menu.</summary>
    public string GridExportPdfHint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the plain text CSV hint in the Export menu.</summary>
    public string GridExportCsvHint { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clipboard action in the Export menu.</summary>
    public string GridExportCopy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the optional XLSX writer's Export menu action.</summary>
    public string GridDownloadXlsx { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the optional PDF writer's Export menu action.</summary>
    public string GridDownloadPdf { get => Get(); set => Set(value); }
}
