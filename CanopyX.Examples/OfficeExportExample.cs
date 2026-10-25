using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A grouped, formatted grid with optional offline document exports and default printing.</summary>
internal static class OfficeExportExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var view = Create();
            view.SaveHtmlPage(Path.Combine(output, "office-export" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Theme = theme, Title = "Resource costs and offline exports", Height = "680px" });
        }
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("office-resources", "Resource costs") {
            ExportFormats = CanopyExportFormats.Office(), Selection = CanopySelectionMode.Multiple, PageSize = 100,
            Reporting = new CanopyGridReporting { Groupable = true, SelectionControls = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Resource") {
            RowHeader = true, Pinned = CanopyGridColumnPin.Left, Sortable = true, Sizing = CanopyColumnSizing.Preferred(220),
            Presenter = CanopyGridPresenter.Link("address")
        });
        view.Columns.Add(new CanopyColumn("address", "Address") { Hidden = true });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(130) });
        view.Columns.Add(new CanopyColumn("cost", "Monthly cost") {
            Kind = CanopyColumnKind.Number, Sortable = true, Format = CanopyGridNumberFormat.Fixed(2, "$ "), Sizing = CanopyColumnSizing.Preferred(150)
        });
        view.Columns.Add(new CanopyColumn("due", "Renewal") { Kind = CanopyColumnKind.DateTime, Sizing = CanopyColumnSizing.Preferred(200) });
        view.Columns.Add(new CanopyColumn("usage", "Usage %") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(120) });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("cost-total", "cost", CanopyGridAggregateOperation.Sum, "Monthly cost"));
        view.FormatRules.Add(CanopyFormatRule.ForCell("usage-bar", "usage", CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100)));
        view.FormatRules.Add(CanopyFormatRule.ForCell("cost-scale", "cost", CanopyFormatStyle.ColorScale(
            CanopyFormatColorScale.ThreeColor(CanopyTone.Success, CanopyTone.Warning, CanopyTone.Danger))));
        view.FormatRules.Add(new CanopyFormatRule("high-usage", CanopyFormatStyle.Highlight(CanopyTone.Warning)) {
            Target = CanopyFormatTarget.Row, When = CanopyFormatCondition.Where("usage", CanopyFormatOperator.GreaterThan, 90)
        });
        for (var index = 0; index < 60; index++) {
            var row = new CanopyGridRow("resource-" + index.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Compute node " + (index + 1).ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["address"] = "https://example.com/resources/" + index.ToString(CultureInfo.InvariantCulture);
            row.Cells["region"] = index % 2 == 0 ? "North" : "South";
            row.Cells["cost"] = 25.5 + index * 7.25;
            row.Cells["due"] = new DateTime(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc).AddDays(index);
            row.Cells["usage"] = (index * 13 + 17) % 101;
            view.Rows.Add(row);
        }
        return view;
    }
}
