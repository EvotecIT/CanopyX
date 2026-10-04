using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A complete inline inventory demonstrating raw values and full-dataset queries.</summary>
internal static class InventoryGridExample {
    internal static void Write(string output) {
        var view = new CanopyGridView("inventory-grid", "File inventory") {
            Selection = CanopySelectionMode.Multiple, PageSize = 100, TimeZone = CanopyTimeZone.Utc, StateKey = "file-inventory"
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
        WritePage(view, output, "inventory-grid.html", CanopyTheme.Light);
        WritePage(view, output, "inventory-grid-dark.html", CanopyTheme.Dark);
        view.Presentation = CanopyGridPresentation.Paged;
        view.PageLength = 50;
        view.StateKey = "file-inventory-paged";
        WritePage(view, output, "inventory-grid-paged.html", CanopyTheme.Light);
        WritePage(view, output, "inventory-grid-paged-dark.html", CanopyTheme.Dark);
        view.Presentation = CanopyGridPresentation.Continuous;
        view.StateKey = "file-inventory-query";
        view.SearchColumns.Add("name");
        view.SearchColumns.Add("category");
        view.Rows[4998].Cells["name"].SearchText = "Record 4998 source code";
        view.Query = new CanopyGridQuery(view.Id) {
            Search = "source record", SearchMode = CanopyGridSearchMode.Words, Limit = view.PageSize,
            FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.Any,
                new CanopyGridFilter("size", CanopyGridFilterOperator.GreaterThanOrEqual, 4900L * 1024),
                new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, "Record 0002"))
        };
        view.Query.Sort.Add(new CanopyGridSort("size", descending: true));
        WritePage(view, output, "inventory-grid-query.html", CanopyTheme.Light);
        WritePage(view, output, "inventory-grid-query-dark.html", CanopyTheme.Dark);
    }

    private static void WritePage(CanopyGridView view, string output, string name, CanopyTheme theme) {
        var page = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX file inventory", Theme = theme });
        const string details = """
<dialog id="record-details" aria-labelledby="record-title" style="max-width:min(36rem,80vw);border:1px solid #8c959f;border-radius:8px">
<h2 id="record-title">Record details</h2><dl id="record-fields"></dl><form method="dialog"><button>Close details</button></form></dialog>
<script>
(() => {
  const dialog = document.getElementById('record-details'), fields = document.getElementById('record-fields');
  let back;
  dialog.addEventListener('close', () => { if (back && back.isConnected) back.focus({preventScroll:true}); });
  CanopyX.configure('inventory-grid', { onDetails({row, returnFocus}) {
    back = returnFocus; fields.replaceChildren();
    for (const [name, cell] of Object.entries(row.cells)) {
      const value = cell && typeof cell === 'object' ? (cell.text ?? cell.value) : cell;
      const term = fields.appendChild(document.createElement('dt')); term.textContent = name;
      const description = fields.appendChild(document.createElement('dd')); description.textContent = value == null ? '—' : String(value);
    }
    if (!dialog.open) dialog.showModal();
  }});
})();
</script>
""";
        File.WriteAllText(Path.Combine(output, name), page.Replace("</body>", details + "</body>"));
    }
}
