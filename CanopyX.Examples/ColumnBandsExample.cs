using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Contiguous bands label the authored layout and continue across runs after individual column moves.</summary>
internal static class ColumnBandsExample {
    internal static void Write(string output) {
        var grid = new CanopyDataGridView("resource-bands", "Resource status") {
            ColumnGroupMode = CanopyColumnGroupMode.Presentation,
            Reporting = new CanopyGridReporting { Responsive = true, ColumnReorder = true }
        };
        var ids = new[] { "host", "domain", "served", "issuer" };
        var titles = new[] { "Resource", "Root domain", "Served status", "Issuer" };
        for (var index = 0; index < ids.Length; index++) grid.Columns.Add(new CanopyColumn(ids[index], titles[index]) {
            Sizing = CanopyColumnSizing.Preferred(index == 1 ? 300 : 200, minimum: index == 1 ? 300 : 200), Sortable = true, RowHeader = index == 0,
            ResponsivePriority = index == 1 ? 10000 : 0
        });
        grid.Columns[0].Pinned = CanopyGridColumnPin.None;
        grid.ColumnGroups.Add(new CanopyColumnGroup("identity", "Identity", "host", "domain"));
        grid.ColumnGroups.Add(new CanopyColumnGroup("live", "Live", "served", "issuer"));
        for (var index = 1; index <= 6; index++) {
            var row = new CanopyGridRow("r" + index);
            row.Cells["host"] = "Resource " + index.ToString("D2"); row.Cells["served"] = "Valid";
            row.Cells["domain"] = "example.test"; row.Cells["issuer"] = "Example Issuer"; grid.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) grid.SaveHtmlPage(
            Path.Combine(output, "column-bands" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
            new CanopyHtmlOptions { Title = "Responsive column bands", Theme = theme, Height = "480px" });
    }
}
