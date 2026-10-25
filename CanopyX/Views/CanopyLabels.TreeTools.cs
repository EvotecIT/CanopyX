using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>
    /// The flat-grid labels a tree's toolbar menus (Columns, Views, Export and more) and its record drawer read. Every tree runtime knows them, so
    /// a tree view writes them with its own texts and stays on the tree runtimes.
    /// </summary>
    private static readonly HashSet<string> TreeToolNames = new HashSet<string>(StringComparer.Ordinal) {
        nameof(GridViews), nameof(GridViewName), nameof(GridSaveView), nameof(GridRemoveView), nameof(GridResetView), nameof(GridChooseView),
        nameof(GridApply), nameof(GridFindColumn), nameof(GridShowAllColumns), nameof(GridResetColumns), nameof(GridReorderColumn),
        nameof(GridPinnedLeft), nameof(GridPinnedRight), nameof(GridResponsiveHidden), nameof(GridExport), nameof(GridVisibleRows),
        nameof(GridSelectedRows), nameof(GridAllRows), nameof(GridDownloadCsv), nameof(GridDownloadXlsx), nameof(GridDownloadPdf), nameof(GridCopy), nameof(GridExportProgress),
        nameof(GridExportReading), nameof(GridExportCancelled), nameof(GridCancelExport), nameof(GridMore), nameof(GridPrint),
        nameof(GridDetails), nameof(GridDetailsSection), nameof(GridPreviousRecord), nameof(GridNextRecord), nameof(GridCloseRecord)
    };

    /// <summary>
    /// Whether the tree runtimes read a label: the core texts, the interaction texts and the tree menus' labels. The other
    /// flat-grid labels, the calendar's among them, reach only flat grids, so a tree view leaves them out of its document.
    /// </summary>
    private static bool ReadByTrees(string name) =>
        !name.StartsWith("Grid", StringComparison.Ordinal) && !name.StartsWith("Format", StringComparison.Ordinal) && !name.StartsWith("Calendar", StringComparison.Ordinal) || TreeToolNames.Contains(name);
}
