using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A quarterly budget: months under quarters under half years (three header levels), the budget line pinned at the left,
/// cell ranges with copy and the fill handle, and paste into the month columns (docs/column-groups.md, docs/cell-ranges.md).
/// </summary>
internal static class QuarterlyBudgetExample {
    private static readonly string[] Months = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };
    private static readonly string[] MonthTitles = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };
    private static readonly string[] Lines = { "Salaries", "Contractors", "Rent", "Utilities", "Travel", "Software", "Hardware", "Training", "Marketing", "Events", "Insurance", "Legal" };
    private static readonly string[] Teams = { "Platform", "Product", "Operations", "Sales" };

    // The page takes pasted and filled amounts into its own rows: only months change, amounts are zero or more, and the
    // line total follows. A grid with the editing part applies them through editing instead (docs/editing.md).
    private const string PasteScript = """
<script>
CanopyX.configure("budget", { onPaste(paste) {
  const api = document.querySelector(".cx-data-grid").canopyx, months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], refused = [];
  for (const cell of paste.cells) {
    if (!months.includes(cell.column)) { refused.push({ id: cell.id, column: cell.column, reason: "Only the months take amounts." }); continue; }
    if (typeof cell.value !== "number" || cell.value < 0) { refused.push({ id: cell.id, column: cell.column, reason: "Amounts are numbers of zero or more." }); continue; }
    const row = api.view.rows.find(item => item.id === cell.id);
    row.cells[cell.column] = Math.round(cell.value);
    row.cells.total = months.reduce((sum, month) => sum + (row.cells[month] || 0), 0);
  }
  paste.respondWith({ refused });
  api.reload();
} });
</script>
""";
    internal static void Write(string output) {
        var grid = Build();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = grid.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX quarterly budget", Theme = theme });
            File.WriteAllText(Path.Combine(output, "quarterly-budget" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page.Insert(page.LastIndexOf("</body>", StringComparison.Ordinal), PasteScript));
        }
        // The reporting runtime adds move handles to the headers: a group's handle moves the whole group, a column's stays in its group.
        var reporting = Build();
        reporting.Reporting = new CanopyGridReporting { ColumnReorder = true };
        var reorder = reporting.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX quarterly budget with header moves" });
        File.WriteAllText(Path.Combine(output, "quarterly-budget-reorder.html"), reorder.Insert(reorder.LastIndexOf("</body>", StringComparison.Ordinal), PasteScript));
    }

    internal static CanopyDataGridView Build() {
        var grid = new CanopyDataGridView("budget", "Quarterly budget") {
            Selection = CanopySelectionMode.Multiple, Noun = "budget lines", StatusBar = true, AutoHeight = false,
            RangeSelection = new CanopyGridRangeSelection { FillHandle = true }
        };
        grid.Columns.Add(new CanopyColumn("line", "Budget line") { RowHeader = true, Sortable = true, Sizing = CanopyColumnSizing.Preferred(170) });
        grid.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true });
        for (var i = 0; i < Months.Length; i++)
            grid.Columns.Add(new CanopyColumn(Months[i], MonthTitles[i]) { Kind = CanopyColumnKind.Number, Sortable = true, Aggregatable = true });
        grid.Columns.Add(new CanopyColumn("total", "Year total") { Kind = CanopyColumnKind.Number, Sortable = true, Aggregatable = true });
        grid.Columns.Add(new CanopyColumn("reviewed", "Reviewed") { Kind = CanopyColumnKind.DateTime, Sortable = true });

        CanopyColumnGroup Quarter(int index) => new CanopyColumnGroup("q" + (index + 1).ToString(CultureInfo.InvariantCulture), "Q" + (index + 1).ToString(CultureInfo.InvariantCulture),
            Months[index * 3], Months[index * 3 + 1], Months[index * 3 + 2]);
        var first = new CanopyColumnGroup("h1", "First half") { Groups = { Quarter(0), Quarter(1) } };
        var second = new CanopyColumnGroup("h2", "Second half") { Groups = { Quarter(2), Quarter(3) } };
        grid.ColumnGroups.Add(first);
        grid.ColumnGroups.Add(second);

        for (var r = 0; r < 48; r++) {
            var row = new CanopyGridRow("line-" + r.ToString("D2", CultureInfo.InvariantCulture));
            row.Cells["line"] = Lines[r % Lines.Length] + (r >= Lines.Length ? " " + (r / Lines.Length + 1).ToString(CultureInfo.InvariantCulture) : "");
            row.Cells["team"] = Teams[r % Teams.Length];
            var total = 0;
            for (var m = 0; m < Months.Length; m++) {
                var amount = 1200 + (r * 389 + m * 127) % 4800 / 10 * 10;
                row.Cells[Months[m]] = amount;
                total += amount;
            }
            row.Cells["total"] = total;
            row.Cells["reviewed"] = new DateTimeOffset(2026, 1 + r % 9, 3 + r % 25, 9 + r % 8, 0, 0, TimeSpan.Zero);
            grid.Rows.Add(row);
        }
        return grid;
    }
}
