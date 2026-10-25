using System.Globalization;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>An ordinary grid with visible page and matching totals, column defaults and a hidden raw sort key.</summary>
internal static class GridFootersExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("grid-footers", "Resource costs") {
            Presentation = CanopyGridPresentation.Paged, PageLength = 6, PageSize = 12,
            Query = new CanopyGridQuery("grid-footers")
        };
        view.Columns.Add(new CanopyColumn("name", "Resource") { Sizing = CanopyColumnSizing.Content(100, 260), RowHeader = true });
        view.Columns.Add(new CanopyColumn("cost", "Monthly cost") {
            Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Flex(1, 160), Alignment = "end",
            Format = CanopyGridNumberFormat.Fixed(2, "$ "), ClassName = "cost"
        });
        view.Columns.Add(new CanopyColumn("rank", "Order key") { Kind = CanopyColumnKind.Number, Hidden = true });
        var defaults = new CanopyGridColumnDefaults { Sortable = true, Filterable = true }; defaults.Targets.Add("*"); view.ColumnDefaults.Add(defaults);
        view.Columns[0].OrderData.Add("rank");
        view.Columns[1].OrderSequence.Add("desc"); view.Columns[1].OrderSequence.Add("asc"); view.Columns[1].OrderSequence.Add("none");
        view.PreSort.Add(new CanopyGridSort("rank"));
        view.Query.Sort.Add(new CanopyGridSort("name"));
        for (var index = 1; index <= 18; index++) {
            var row = new CanopyGridRow("resource-" + index.ToString(CultureInfo.InvariantCulture));
            row.Cells["name"] = "Compute node " + index.ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["cost"] = 25 + index * 7.25; row.Cells["rank"] = index; view.Rows.Add(row);
        }
        foreach (var scope in new[] { CanopyGridFooterScope.Page, CanopyGridFooterScope.All }) {
            var footer = new CanopyGridFooter(scope == CanopyGridFooterScope.Page ? "page" : "all", scope == CanopyGridFooterScope.Page ? "This page" : "All matching resources", scope);
            footer.Aggregates.Add(new CanopyGridAggregate("count", "name", CanopyGridAggregateOperation.Count, "Resources"));
            footer.Aggregates.Add(new CanopyGridAggregate("costSum", "cost", CanopyGridAggregateOperation.Sum, "Sum"));
            view.Footers.Add(footer);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            view.SaveHtmlPage(Path.Combine(output, theme == CanopyTheme.Dark ? "grid-footers-dark.html" : "grid-footers.html"),
                new CanopyHtmlOptions { Title = "CanopyX resource costs and totals", Theme = theme });
        }
        var page = new CanopyGridPage(view.Id, "example", 0, view.Rows.Count, view.Rows.Count);
        foreach (var row in view.Rows.Take(view.PageLength)) page.Rows.Add(row);
        page.FooterValues["all"] = new Dictionary<string, double?> {
            ["count"] = view.Rows.Count,
            ["costSum"] = view.Footers[1].Aggregates[1].Evaluate(view.Rows.Select(row => row.Cells["cost"]))
        };
        var fallback = CanopyStaticHtml.RenderGrid(view, page);
        File.WriteAllText(Path.Combine(output, "grid-footers-static.html"), "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Resource costs</title><body>" + fallback + "</body></html>");
    }
}
