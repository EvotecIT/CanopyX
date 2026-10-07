using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Columns that fit loaded values without explicit widths, with optional bounds and flex.</summary>
internal static class ContentGridExample {
    internal static void Write(string output) {
        var view = new CanopyGridView("content-grid", "Records with content-sized columns") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true });
        view.Columns.Add(new CanopyColumn("reference", "Reference") { Sortable = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Wrap = true });
        view.AutoRowHeight = true;
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "Needs review"),
            CanopyTone.Warning, "needs-review"));
        view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, "Complete"),
            CanopyTone.Success, target: CanopyGridHighlightTarget.Cell));
        view.Reporting.Layout["name"] = new CanopyGridColumnLayout(120, 300);
        view.Reporting.Layout["notes"] = new CanopyGridColumnLayout(200, 500, flex: 1);
        for (var i = 0; i < 300; i++) {
            var row = new CanopyGridRow("record-" + i.ToString("D3", System.Globalization.CultureInfo.InvariantCulture));
            row.Cells["name"] = "Record " + i; row.Cells["status"] = i % 5 == 0 ? "Needs review" : "Complete";
            row.Cells["reference"] = "REPORT-REFERENCE-" + (10000 + i); row.Cells["notes"] = "A loaded sample sets a useful starting width. Saved widths keep the reader's choice.";
            view.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
            InventoryGridExample.WritePage(view, output, "content-grid" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html", theme);
    }
}
