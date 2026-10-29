using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

internal static class CalculatedColumnExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("calculated-orders", "Calculated order values") {
            CalculatedColumnsEditable = true, Reporting = new CanopyGridReporting { HeaderFilters = true },
            Presentation = CanopyGridPresentation.Paged, PageLength = 20
        };
        view.Columns.Add(new CanopyColumn("item", "Item") { Sortable = true, AlwaysVisible = true, Sizing = CanopyColumnSizing.Flex(minimum: 140) });
        view.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Content(minimum: 140), Sortable = true });
        view.Columns.Add(new CanopyColumn("price", "Unit price") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Content(minimum: 140), Sortable = true, Format = CanopyGridNumberFormat.Fixed(2) });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Content(minimum: 140), Sortable = true, AlwaysVisible = true,
            Calculation = CanopyCalculation.Parse("[quantity] * [price]"), Format = CanopyGridNumberFormat.Fixed(2) });
        view.Columns.Add(new CanopyColumn("tax", "Tax (20%)") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Content(minimum: 140), Sortable = true,
            Calculation = CanopyCalculation.Parse("ROUND([amount] * 0.2, 2)"), Format = CanopyGridNumberFormat.Fixed(2) });
        view.Columns.Add(new CanopyColumn("perUnit", "Amount per unit") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Content(minimum: 140), Sortable = true,
            Calculation = CanopyCalculation.Parse("[amount] / [quantity]"), Format = CanopyGridNumberFormat.Fixed(2) });
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("revenue", "amount", CanopyGridAggregateOperation.Sum, "Revenue"));
        var names = new[] { "Desk", "Chair", "Lamp", "Shelf", "Monitor", "Cable" };
        for (var index = 0; index < names.Length; index++) {
            var row = new CanopyGridRow(index + 1); row.Cells["item"] = names[index]; row.Cells["quantity"] = index;
            row.Cells["price"] = 19.95 + index * 12.5; view.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            File.WriteAllText(Path.Combine(output, "analysis-calculations" + suffix + ".html"), view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Title = view.Label }));
        }
        AnalystExample.WriteStatic(output, "analysis-calculations-static", options => CanopyStaticHtml.RenderGrid(view, options: options));
    }
}
