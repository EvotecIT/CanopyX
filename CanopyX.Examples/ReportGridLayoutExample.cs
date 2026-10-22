using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Preferred report widths and complete status labels in a three-row auto-height grid.</summary>
internal static partial class ReportGridLayoutExample {
    private sealed record ReviewRecord(string Id, string Name, string Team, string State, string Review, int Count);

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            WriteHostStyles(output, theme);
            var grid = Create();
            grid.View.SaveHtmlPage(Path.Combine(output, "report-grid-layout" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "Review queue column fitting", Theme = theme, Height = "480px" });
            var phone = Create(phone: true);
            phone.View.Reporting!.ColumnReorder = false;
            phone.View.Columns[2].ResponsivePriority = 1;
            phone.View.Columns[4].ResponsivePriority = 1;
            phone.View.SaveHtmlPage(Path.Combine(output, "report-grid-essential-fields" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "Essential fields on phones", Theme = theme, Height = "480px" });
            var context = new CanopyDataGridView<ReviewRecord>("phone-context", "Observation records", row => row.Id);
            context.View.Reporting = new CanopyGridReporting();
            context.View.Selection = CanopySelectionMode.None;
            context.Column(row => row.Name, "Check", column => column.Sizing = CanopyColumnSizing.Preferred(240));
            context.Column(row => row.State, "Outcome", column => column.ResponsivePriority = 1);
            context.Column(row => row.Team, "Domain", column => column.ResponsivePriority = 2);
            context.Column(row => row.Review, "Evidence");
            context.AddRows(new[] {
                new ReviewRecord("a", "Protocol support", "first.example.test", "Needs review", "Observed response", 1),
                new ReviewRecord("b", "Protocol support", "second.example.test", "Needs review", "Observed response", 1)
            });
            context.View.SaveHtmlPage(Path.Combine(output, "report-grid-record-context" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "Context beneath repeated record names", Theme = theme, Height = "360px" });
        }
    }

    private static CanopyDataGridView<ReviewRecord> Create(bool phone = false) {
        var grid = new CanopyDataGridView<ReviewRecord>("report-layout", "Review queue", row => row.Id);
        grid.View.Selection = CanopySelectionMode.Single;
        grid.View.RowHeight = 36;
        grid.View.Reporting = new CanopyGridReporting { ColumnReorder = true };
        grid.Column(row => row.Name, "Record", column => { column.Sizing = CanopyColumnSizing.Preferred(240); column.Sortable = true; });
        grid.Column(row => row.Team, "Responsible team", column => column.Sizing = CanopyColumnSizing.Preferred(260));
        grid.Column(row => row.State, phone ? "Signal" : "Latest verification outcome", column => {
            column.Sortable = true;
            column.Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> {
                ["Needs investigation"] = CanopyTone.Warning, ["Action required"] = CanopyTone.Danger, ["Verified"] = CanopyTone.Success
            });
        });
        grid.Column(row => row.Review, "Recommended follow-up decision", column => column.Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> {
            ["Schedule review"] = CanopyTone.Info, ["Awaiting confirmation"] = CanopyTone.Warning, ["No follow-up"] = CanopyTone.Success
        }));
        grid.Column(row => row.Count, phone ? "Days" : "Observations requiring attention");
        return grid.AddRows(new[] {
            new ReviewRecord("a", phone ? string.Concat(Enumerable.Repeat("server-01.branch-office.production-region.internal.", 5)) : "Warehouse inventory", "Operations", "Needs investigation", "Schedule review", 12),
            new ReviewRecord("b", "Quarterly service review", "Service delivery", "Action required", "Awaiting confirmation", 7),
            new ReviewRecord("c", "Regional capacity check", "Planning", "Verified", "No follow-up", 0)
        });
    }
}
