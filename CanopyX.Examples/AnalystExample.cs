using System.Globalization;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

internal static class AnalystExample {
    internal static void Write(string output) {
        var month = CanopyBucket.Calendar(CanopyBucketKind.Month);
        var view = new CanopyDataGridView("analysis", "Records by month") {
            Reporting = new CanopyGridReporting { Groupable = true, HeaderFilters = true, Responsive = true },
            Presentation = CanopyGridPresentation.Paged, PageLength = 20, Selection = CanopySelectionMode.Multiple,
            FacetPanel = new CanopyFacetPanel { Position = CanopyFacetPosition.Top }
        };
        view.Columns.Add(new CanopyColumn("record", "Record") { Sortable = true, AlwaysVisible = true });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        view.Columns.Add(new CanopyColumn("observed", "Observed") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true, Format = CanopyGridNumberFormat.Fixed(2) });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("observed", bucket: month));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.FacetColumns.Add("observed"); view.Reporting.FacetColumns.Add("amount");
        view.FacetPanel.Facets.Add(new CanopyFacet("observed") { Bucket = month });
        view.FacetPanel.Facets.Add(new CanopyFacet("amount") { Bucket = CanopyBucket.FixedWidth(250) });
        var regions = new[] { "North", "South", "Central" };
        for (var index = 0; index < 96; index++) {
            var row = new CanopyGridRow((index + 1).ToString(CultureInfo.InvariantCulture));
            row.Cells["record"] = "Record " + (index + 1).ToString("D3", CultureInfo.InvariantCulture);
            row.Cells["region"] = regions[index % regions.Length];
            row.Cells["observed"] = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc).AddDays(index * 2);
            row.Cells["amount"] = index % 11 == 0 ? new CanopyCell() : new CanopyCell((index * 73 % 1000) - 100d);
            view.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            File.WriteAllText(Path.Combine(output, "analysis-buckets" + suffix + ".html"), view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Title = view.Label }));
        }
        // A host can use the same accepted summary for a script-free document or email.
        var summary = new CanopyGridSummary(new CanopyGridQuery(view.Id) { Revision = "sample" }, view.Rows.Count);
        var offset = 0;
        foreach (var rows in view.Rows.GroupBy(row => month.Key(row.Cells["observed"].Value)).OrderBy(group => group.Key)) {
            var group = new CanopyGridGroup("month-" + rows.Key!.Value.ToString(CultureInfo.InvariantCulture), new CanopyCell(rows.Key.Value), offset, rows.Count());
            group.Aggregates["total"] = rows.Sum(row => row.Cells["amount"].Value == null ? 0 : Convert.ToDouble(row.Cells["amount"].Value, CultureInfo.InvariantCulture));
            summary.Groups.Add(group); offset += rows.Count();
        }
        summary.Aggregates["total"] = summary.Groups.Sum(group => group.Aggregates["total"]);
        WriteStatic(output, "analysis-summary", settings => CanopyStaticHtml.RenderGridSummary(view, summary, settings));
        view.Reporting.Aggregates[0] = view.Reporting.Aggregates[0].ShowValuesAs(CanopyShowAs.PercentGrandTotal);
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            File.WriteAllText(Path.Combine(output, "analysis-values" + suffix + ".html"), view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Title = "Shares by month" }));
        }
        WriteStatic(output, "analysis-values-summary", settings => CanopyStaticHtml.RenderGridSummary(view, summary, settings));
        view.Reporting.Aggregates[0] = view.Reporting.Aggregates[0].ShowValuesAs(CanopyShowAs.Value);
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("records", "record", CanopyGridAggregateOperation.Count, "Records"));
        view.Reporting.Pivotable = true;
        var pivot = view.Reporting.Pivot = new CanopyGridPivot();
        pivot.Rows.Add(new CanopyGridGroupLevel("region"));
        pivot.Columns.Add(new CanopyGridGroupLevel("observed", bucket: month));
        pivot.Values.Add("total"); pivot.Values.Add("records");
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            File.WriteAllText(Path.Combine(output, "analysis-pivot" + suffix + ".html"), view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Title = "Regions by month" }));
        }
        var result = CanopyPivot.Compute(view, pivot, view.Rows);
        WriteStatic(output, "analysis-pivot-static", settings => CanopyStaticHtml.RenderGridPivot(view, result, settings));
        CalculatedColumnExample.Write(output);
        BucketFilterExample.Write(output);
    }

    internal static void WriteStatic(string output, string name, Func<CanopyStaticHtmlOptions, string> render) {
        foreach (var dark in new[] { false, true }) {
            var theme = dark ? CanopyStaticTheme.Dark() : CanopyStaticTheme.Light();
            var table = render(new CanopyStaticHtmlOptions { Theme = theme });
            var page = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Analytical report</title></head>" +
                "<body style=\"margin:12px;background:" + theme.Surface + ";color:" + theme.Text + ";font-family:Calibri,Arial,sans-serif;\"><div tabindex=\"0\" role=\"region\" aria-label=\"Analytical report\" style=\"max-width:100%;overflow:auto;\">" + table + "</div></body></html>";
            File.WriteAllText(Path.Combine(output, name + (dark ? "-dark" : string.Empty) + ".html"), page);
        }
    }
}
