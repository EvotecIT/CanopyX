using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A complete inline inventory demonstrating raw values and full-dataset queries.</summary>
internal static class InventoryGridExample {
    internal static void Write(string output) {
        var view = new CanopyGridView("inventory-grid", "File inventory") {
            Selection = CanopySelectionMode.Multiple, PageSize = 100, TimeZone = CanopyTimeZone.Utc
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Width = 300, Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Width = 140, Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Width = 130, Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Width = 200, Kind = CanopyColumnKind.DateTime, Sortable = true });
        var categories = new[] { "Document", "Image", "Source", "Archive" };
        for (var index = 0; index < 5000; index++) {
            var row = new CanopyGridRow("file-" + index.ToString("D4", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Record " + index.ToString("D4", CultureInfo.InvariantCulture);
            row.Cells["category"] = categories[index % categories.Length];
            row.Cells["size"] = new CanopyCell((long)index * 1024) { Text = index.ToString("N0", CultureInfo.InvariantCulture) + " KiB" };
            row.Cells["modified"] = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddHours(index);
            view.Rows.Add(row);
        }
        view.Query = new CanopyGridQuery(view.Id) { Limit = view.PageSize };
        view.Query.Filters.Add(new CanopyGridFilter("category", CanopyGridFilterOperator.Equal, "Archive"));
        view.Query.Sort.Add(new CanopyGridSort("size", descending: true));
        view.SaveHtmlPage(Path.Combine(output, "inventory-grid.html"), new CanopyHtmlOptions { Title = "CanopyX file inventory", Theme = CanopyTheme.Light });
        view.SaveHtmlPage(Path.Combine(output, "inventory-grid-dark.html"), new CanopyHtmlOptions { Title = "CanopyX file inventory", Theme = CanopyTheme.Dark });
    }
}
