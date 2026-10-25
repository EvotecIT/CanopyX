using System.Reflection;
using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>Keyed inventory versions and a host-supplied, read-only view proposal, with invented data.</summary>
internal static class DataViewsExample {
    internal static void Write(string output) {
        var before = new[] { Row("a", "Atlas", "North", "Active", 24), Row("b", "Birch", "South", "Paused", 8),
            Row("c", "Cedar", "North", "Active", 12), Row("d", "Delta", "West", "Active", 40) };
        var after = new[] { Row("a", "Atlas", "North", "Active", 32), Row("b", "Birch", "South", "Active", 8),
            Row("c", "Cedar", "North", "Active", 12), Row("e", "Elm", "West", "Paused", 16) };
        var comparison = CanopyDatasetComparer.Compare(before, after, new[] { "name", "location", "stage", "units" });
        var compare = comparison.ToView("inventory-compare", "Inventory changes", Columns());
        var ask = new CanopyDataGridView("inventory-intent", "Explore the current inventory") {
            ViewIntents = true, Reporting = new CanopyGridReporting { Groupable = true, Pivotable = true }
        };
        ask.Reporting.Aggregates.Add(new CanopyGridAggregate("units", "units", CanopyGridAggregateOperation.Sum, "Total units"));
        foreach (var column in Columns()) ask.Columns.Add(column);
        foreach (var row in after) ask.Rows.Add(row);
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            var options = new CanopyHtmlOptions { Theme = theme, Document = document, Height = "440px" };
            var page = Template().Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid))
                .Replace("{{theme}}", theme == CanopyTheme.Dark ? "dark" : "light")
                .Replace("{{compare}}", compare.ToHtmlFragment(options)).Replace("{{intent}}", ask.ToHtmlFragment(options));
            File.WriteAllText(Path.Combine(output, "data-views" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page, new UTF8Encoding(false));
        }
        foreach (var dark in new[] { false, true }) {
            var staticHtml = CanopyStaticHtml.RenderComparison(compare,
                new CanopyStaticHtmlOptions { Theme = dark ? CanopyStaticTheme.Dark() : new CanopyStaticTheme() });
            var background = dark ? "#16181c" : "#ffffff";
            File.WriteAllText(Path.Combine(output, "dataset-compare-static" + (dark ? "-dark" : "") + ".html"),
                "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Inventory changes</title>" +
                "<body style=\"font-family:Calibri,Arial,sans-serif;margin:16px;background:" + background + "\">" + staticHtml + "</body></html>", new UTF8Encoding(false));
        }
    }

    private static CanopyColumn[] Columns() => new[] {
        new CanopyColumn("name", "Item") { RowHeader = true, AlwaysVisible = true, Sortable = true },
        new CanopyColumn("location", "Location") { Sortable = true },
        new CanopyColumn("stage", "Stage") { Sortable = true },
        new CanopyColumn("units", "Units") { Kind = CanopyColumnKind.Number, Sortable = true }
    };

    private static CanopyGridRow Row(string id, string name, string location, string stage, int units) {
        var row = new CanopyGridRow(id);
        row.Cells.Add("name", new CanopyCell(name)); row.Cells.Add("location", new CanopyCell(location));
        row.Cells.Add("stage", new CanopyCell(stage)); row.Cells.Add("units", new CanopyCell(units)); return row;
    }

    private static string Template() {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.data-views.html")!;
        using var reader = new StreamReader(stream); return reader.ReadToEnd();
    }
}
