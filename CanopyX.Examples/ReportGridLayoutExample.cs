using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Preferred report widths and complete status labels in a three-row auto-height grid.</summary>
internal static partial class ReportGridLayoutExample {
    private sealed record ReviewRecord(string Id, string Name, string Team, string State, string Review, int Count);

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var grid = Create();
            grid.View.SaveHtmlPage(Path.Combine(output, "report-grid-layout" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "Review queue column fitting", Theme = theme, Height = "480px" });
        }
    }

    private static CanopyDataGridView<ReviewRecord> Create() {
        var grid = new CanopyDataGridView<ReviewRecord>("report-layout", "Review queue", row => row.Id);
        grid.View.Selection = CanopySelectionMode.Single;
        grid.View.RowHeight = 36;
        grid.View.Reporting = new CanopyGridReporting { ColumnReorder = true };
        grid.Column(row => row.Name, "Record", column => { column.Sizing = CanopyColumnSizing.Preferred(240); column.Sortable = true; });
        grid.Column(row => row.Team, "Responsible team", column => column.Sizing = CanopyColumnSizing.Preferred(260));
        grid.Column(row => row.State, "Latest verification outcome", column => {
            column.Sortable = true;
            column.Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> {
                ["Needs investigation"] = CanopyTone.Warning, ["Action required"] = CanopyTone.Danger, ["Verified"] = CanopyTone.Success
            });
        });
        grid.Column(row => row.Review, "Recommended follow-up decision", column => column.Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> {
            ["Schedule review"] = CanopyTone.Info, ["Awaiting confirmation"] = CanopyTone.Warning, ["No follow-up"] = CanopyTone.Success
        }));
        grid.Column(row => row.Count, "Observations requiring attention");
        return grid.AddRows(new[] {
            new ReviewRecord("a", "Warehouse inventory", "Operations", "Needs investigation", "Schedule review", 12),
            new ReviewRecord("b", "Quarterly service review", "Service delivery", "Action required", "Awaiting confirmation", 7),
            new ReviewRecord("c", "Regional capacity check", "Planning", "Verified", "No follow-up", 0)
        });
    }
}
