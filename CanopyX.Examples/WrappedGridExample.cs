using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Measured row heights for report text, in continuous, paged and grouped views.</summary>
internal static class WrappedGridExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("wrapped-grid", "Detailed records") { AutoRowHeight = true, PageSize = 100 };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(180), Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sizing = CanopyColumnSizing.Preferred(140), Sortable = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Sizing = CanopyColumnSizing.Preferred(320), Wrap = true });
        for (var i = 0; i < 2000; i++) {
            var row = new CanopyGridRow("record-" + i.ToString("D4", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Record " + i; row.Cells["category"] = i % 2 == 0 ? "Complete" : "Needs review";
            row.Cells["notes"] = i % 3 == 0 ? "A short note." : string.Join(" ", Enumerable.Repeat("A detailed observation stays readable as the column changes width.", i % 5 + 1));
            view.Rows.Add(row);
        }
        foreach (var mode in new[] { "continuous", "paged", "grouped" }) {
            view.Presentation = mode == "paged" ? CanopyGridPresentation.Paged : CanopyGridPresentation.Continuous;
            view.Reporting = mode == "grouped" ? new CanopyGridReporting { Grouping = new CanopyGridGrouping("category") } : null;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
                InventoryGridExample.WritePage(view, output, "wrapped-grid" + (mode == "continuous" ? "" : "-" + mode) +
                    (theme == CanopyTheme.Dark ? "-dark" : "") + ".html", theme);
        }
    }
}
