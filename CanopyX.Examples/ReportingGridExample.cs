using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A standalone report with explicit text and category ordering policies.</summary>
internal static class ReportingGridExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("reporting-grid", "Ordered inventory") {
            Reporting = new CanopyGridReporting { HeaderFilters = true, SelectionControls = true }, Selection = CanopySelectionMode.Multiple,
            Presentation = CanopyGridPresentation.Paged, PageLength = 25, PageSize = 100
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(240), Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sizing = CanopyColumnSizing.Preferred(150), Sortable = true });
        view.Columns.Add(new CanopyColumn("reference", "Exact reference") { Sizing = CanopyColumnSizing.Preferred(230) });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Sizing = CanopyColumnSizing.Preferred(120), Kind = CanopyColumnKind.Number, Sortable = true });
        view.GetColumn("name").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
        view.GetColumn("category").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedOrdinal,
            new[] { "Critical", "Warning", "Healthy" });
        var categories = new[] { "Healthy", "Warning", "Critical", "Other" };
        for (var i = 0; i < 137; i++) {
            var row = new CanopyGridRow("record-" + i.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Item " + i.ToString(CultureInfo.InvariantCulture);
            row.Cells["category"] = categories[i % categories.Length];
            row.Cells["reference"] = "9007199254740993123456" + i.ToString("D3", CultureInfo.InvariantCulture);
            row.Cells["amount"] = new CanopyCell(i / 10d) { Text = (i / 10d).ToString("N1", CultureInfo.InvariantCulture) };
            view.Rows.Add(row);
        }
        view.Query = new CanopyGridQuery(view.Id);
        view.Query.Sort.Add(new CanopyGridSort("category"));
        view.Query.Sort.Add(new CanopyGridSort("name"));
        foreach (var presentation in new[] { CanopyGridPresentation.Paged, CanopyGridPresentation.Continuous }) {
            view.Presentation = presentation;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                var name = "reporting-grid" + (presentation == CanopyGridPresentation.Continuous ? "-continuous" : "") +
                    (theme == CanopyTheme.Dark ? "-dark" : "") + ".html";
                view.SaveHtmlPage(Path.Combine(output, name), new CanopyHtmlOptions { Title = "CanopyX ordered reporting grid", Theme = theme });
            }
        }
    }
}
