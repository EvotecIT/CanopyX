using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A generic inventory with safe presentations and unchanged typed query values.</summary>
internal static class RichGridExample {
    internal static void Write(string output) {
        var view = new CanopyGridView("rich-grid", "Rich inventory") {
            Reporting = new CanopyGridReporting { HeaderFilters = true, ColumnReorder = true }, Selection = CanopySelectionMode.Multiple,
            Presentation = CanopyGridPresentation.Paged, PageLength = 25, PageSize = 100
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Width = 230, Sortable = true });
        view.Columns.Add(new CanopyColumn("url", "Record address") { Hidden = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Width = 160, Sortable = true });
        view.Columns.Add(new CanopyColumn("progress", "Completion") { Width = 170, Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("enabled", "Enabled") { Width = 110, Sortable = true });
        view.Columns.Add(new CanopyColumn("owners", "Owners") { Width = 220 });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Width = 280 });
        view.Reporting.Layout.Add("name", new CanopyGridColumnLayout(160, 320));
        view.Reporting.Layout.Add("owners", new CanopyGridColumnLayout(140, 380, 1));
        view.Reporting.Layout.Add("notes", new CanopyGridColumnLayout(180, 800, 2));
        view.Reporting.Presenters.Add("name", CanopyGridPresenter.Link("url", newWindow: true));
        view.Reporting.Presenters.Add("status", CanopyGridPresenter.Icon("●"));
        view.Reporting.Presenters.Add("progress", CanopyGridPresenter.Progress());
        view.Reporting.Presenters.Add("enabled", CanopyGridPresenter.Boolean());
        view.Reporting.Presenters.Add("owners", CanopyGridPresenter.List(", ", limit: 2));
        view.Reporting.Presenters.Add("notes", CanopyGridPresenter.LongText());
        view.Reporting.Ordering.Add("name", new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural));
        view.Reporting.Ordering.Add("status", new CanopyGridOrdering(CanopyGridTextOrder.Ordinal,
            new[] { "Needs review", "In progress", "Complete" }));
        var statuses = new[] { "Complete", "In progress", "Needs review" };
        var tones = new[] { CanopyTone.Success, CanopyTone.Info, CanopyTone.Warning };
        for (var i = 0; i < 137; i++) {
            var id = i.ToString("D3", CultureInfo.InvariantCulture);
            var row = new CanopyGridRow("record-" + id);
            row.Cells["name"] = "Record " + i.ToString(CultureInfo.InvariantCulture);
            row.Cells["url"] = "https://example.com/records/" + id;
            row.Cells["status"] = new CanopyCell(statuses[i % 3]) { Tone = tones[i % 3] };
            row.Cells["progress"] = new CanopyCell(i % 101) { Text = (i % 101).ToString(CultureInfo.InvariantCulture) + "%" };
            row.Cells["enabled"] = i % 4 != 0;
            row.Cells["owners"] = i % 3 == 0 ? "Alex, Sam, Kim, Pat" : "Alex, Sam";
            row.Cells["notes"] = "Review the complete record before the next reporting cycle.\n" +
                "The host supplies this text; CanopyX presents it without interpreting markup or changing its query/export value.";
            view.Rows.Add(row);
        }
        foreach (var presentation in new[] { CanopyGridPresentation.Paged, CanopyGridPresentation.Continuous }) {
            view.Presentation = presentation;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                var name = "rich-grid" + (presentation == CanopyGridPresentation.Continuous ? "-continuous" : "") +
                    (theme == CanopyTheme.Dark ? "-dark" : "") + ".html";
                view.SaveHtmlPage(Path.Combine(output, name), new CanopyHtmlOptions { Title = "CanopyX rich reporting grid", Theme = theme });
            }
        }
        view.Reporting.Responsive = true;
        view.Reporting.FilterGroups = true;
        view.Columns[0].Width = 180;
        view.Reporting.Layout["name"] = new CanopyGridColumnLayout(160, 320, pin: CanopyGridColumnPin.Left, priority: 0, alwaysVisible: true);
        view.Reporting.Layout["status"] = new CanopyGridColumnLayout(100, 240, pin: CanopyGridColumnPin.Right, priority: 1);
        view.Reporting.Layout["progress"] = new CanopyGridColumnLayout(100, 300, priority: 2);
        view.Reporting.Layout["enabled"] = new CanopyGridColumnLayout(80, 200, priority: 3);
        view.Reporting.Layout["owners"] = new CanopyGridColumnLayout(140, 380, 1, priority: 4);
        view.Reporting.Layout["notes"] = new CanopyGridColumnLayout(180, 800, 2, priority: 5);
        foreach (var presentation in new[] { CanopyGridPresentation.Paged, CanopyGridPresentation.Continuous }) {
            view.Presentation = presentation;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                var name = "responsive-grid" + (presentation == CanopyGridPresentation.Continuous ? "-continuous" : "") +
                    (theme == CanopyTheme.Dark ? "-dark" : "") + ".html";
                InventoryGridExample.WritePage(view, output, name, theme);
            }
        }
    }
}
