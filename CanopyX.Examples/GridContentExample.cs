using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Content a DataTables report used to build with trusted HTML and scripts: rich cells (badges, emphasis, links), a footer
/// row of plain text beside an aggregate, and a fixed grouping whose footer rows close each group with its total.
/// </summary>
internal static class GridContentExample {
    internal static CanopyDataGridView View() {
        var view = new CanopyDataGridView("grid-content", "Service accounts") {
            Reporting = new CanopyGridReporting { Grouping = new CanopyGridGrouping("team") { FooterTemplate = "{value}: {count} accounts" } }
        };
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("logons", "logons", CanopyGridAggregateOperation.Sum, "Logons"));
        view.Columns.Add(new CanopyColumn("name", "Account") { RowHeader = true, Sizing = CanopyColumnSizing.Content(120, 220) });
        view.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "State") { Sizing = CanopyColumnSizing.Content(160, 320) });
        view.Columns.Add(new CanopyColumn("logons", "Logons") { Kind = CanopyColumnKind.Number, Sortable = true });
        string[] teams = { "Finance", "Platform", "Support" };
        for (var index = 1; index <= 12; index++) {
            var row = new CanopyGridRow("svc-" + index.ToString("D2", CultureInfo.InvariantCulture));
            var enabled = index % 4 != 0;
            row.Cells["name"] = "svc-app" + index.ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["team"] = teams[index % teams.Length];
            row.Cells["state"] = CanopyCell.FromHtml(enabled
                ? "<span class=\"badge\" title=\"Signs in normally\">Enabled</span> <a href=\"https://example.test/accounts/" + index.ToString(CultureInfo.InvariantCulture) + "\" target=\"_blank\">details</a>"
                : "<span class=\"badge\" style=\"text-decoration:line-through\">Enabled</span> <strong>Disabled</strong> <em>since rotation</em>");
            row.Cells["logons"] = index * 37 % 200;
            view.Rows.Add(row);
        }
        var footer = new CanopyGridFooter("total", "All accounts");
        footer.Cells["name"] = "Total";
        footer.Cells["state"] = "Logons are counted for the last 30 days.";
        footer.Aggregates.Add(new CanopyGridAggregate("logons", "logons", CanopyGridAggregateOperation.Sum, "Logons"));
        view.Footers.Add(footer);
        return view;
    }

    internal static void Write(string output) {
        View().Save(Path.Combine(output, "grid-content.html"), new CanopyHtmlOptions { Title = "CanopyX rich cells, footer text and group footers" });
        var folder = Path.Combine(output, "csp");
        Directory.CreateDirectory(folder);
        View().Save(Path.Combine(folder, "grid-content.html"), new CanopyHtmlOptions { Title = "CanopyX rich cells under a strict policy", Nonce = CspExamples.NoncePlaceholder });
    }
}
