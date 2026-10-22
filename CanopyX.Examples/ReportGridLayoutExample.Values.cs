using CanopyX.Html;

namespace CanopyX.Examples;

internal static partial class ReportGridLayoutExample {
    private static void WriteValuePolicies(string output, CanopyTheme theme) {
        var view = new CanopyDataGridView("review-values", "Review observations") {
            AutoRowHeight = true, Selection = CanopySelectionMode.None, Reporting = new CanopyGridReporting()
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(200) });
        var state = new CanopyColumn("state", "Outcome") { Sortable = true, Presenter = CanopyGridPresenter.Enum() };
        state.ValueLabels.Add("needs-review", "Needs review"); state.ValueLabels.Add("verified", "Verified");
        state.ValueOrder.Add("needs-review"); state.ValueOrder.Add("verified");
        state.ValueTones.Add("needs-review", CanopyTone.Warning); state.ValueTones.Add("verified", CanopyTone.Success);
        view.Columns.Add(state);
        var days = new CanopyColumn("days", "Days remaining") { Kind = CanopyColumnKind.Number, Sortable = true };
        days.NumericTones.Add(new(CanopyNumericToneOperator.Below, 0, CanopyTone.Danger, "Overdue"));
        days.NumericTones.Add(new(CanopyNumericToneOperator.AtMost, 14, CanopyTone.Warning, "Review soon"));
        days.NumericTones.Add(new(CanopyNumericToneOperator.AtLeast, 30, CanopyTone.Success, "Time available"));
        view.Columns.Add(days);
        view.Columns.Add(new CanopyColumn("notes", "Observation") { Wrap = true, MaxLines = 3, Tooltip = CanopyColumn.AutoTooltip,
            Sizing = CanopyColumnSizing.Preferred(240, 100, 300) });
        for (var i = 0; i < 10; i++) view.Rows.Add(new CanopyGridRow("review-" + i) { Cells = {
            ["name"] = "Record " + (i + 1), ["state"] = i % 3 == 0 ? "verified" : "needs-review",
            ["days"] = i == 0 ? -1 : i * 7,
            ["notes"] = i % 2 == 0 ? "A short observation." : "This observation includes the reason for the review and the evidence that supports the next step. Its complete text stays available in the record drawer."
        } });
        var suffix = theme == CanopyTheme.Dark ? "-dark" : "";
        view.SaveHtmlPage(Path.Combine(output, "report-grid-value-policies" + suffix + ".html"),
            new CanopyHtmlOptions { Theme = theme, Height = "720px", Title = "Column labels, ordered categories and numeric text tones" });
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards };
        // Full-page examples normally fill the viewport. This embedded-report example gives its host a 2400px cap instead.
        var cards = view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Title = "Ten review cards within a 2400 pixel height cap" })
            .Replace("</head>", "<style>body.cx-page>.cx-main>.cx-host{height:2400px;max-height:2400px}</style></head>");
        File.WriteAllText(Path.Combine(output, "report-grid-ten-cards" + suffix + ".html"), cards);
        var record = new CanopyDataGridView("record-fields", "Record-only presentations") { Record = new CanopyRecordPanel(), Selection = CanopySelectionMode.None };
        record.Columns.Add(new CanopyColumn("name", "Record"));
        record.Record.Fields.Add(new CanopyColumn("identifier", "Identifier") { Presenter = CanopyGridPresenter.Identifier(mono: true) });
        record.Record.Fields.Add(new CanopyColumn("observation", "Observation") { Wrap = true, MaxLines = 2 });
        record.Rows.Add(new CanopyGridRow("one") { Cells = { ["name"] = "Record one" }, Fields = {
            ["identifier"] = "record-only-identifier", ["observation"] = "A record-only observation with complete supporting evidence and a wrapped two-line preview."
        } });
        record.SaveHtmlPage(Path.Combine(output, "report-grid-record-fields" + suffix + ".html"), new CanopyHtmlOptions { Theme = theme });
    }
}
