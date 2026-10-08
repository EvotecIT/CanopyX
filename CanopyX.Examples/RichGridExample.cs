using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A generic inventory with safe presentations and unchanged typed query values.</summary>
internal static class RichGridExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("rich-grid", "Rich inventory") {
            Reporting = new CanopyGridReporting { HeaderFilters = true, ColumnReorder = true }, Selection = CanopySelectionMode.Multiple,
            Presentation = CanopyGridPresentation.Paged, PageLength = 25, PageSize = 100
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(230), Sortable = true });
        view.Columns.Add(new CanopyColumn("url", "Record address") { Hidden = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sizing = CanopyColumnSizing.Preferred(160), Sortable = true });
        view.Columns.Add(new CanopyColumn("progress", "Completion") { Sizing = CanopyColumnSizing.Preferred(170), Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("enabled", "Enabled") { Sizing = CanopyColumnSizing.Preferred(110), Sortable = true });
        view.Columns.Add(new CanopyColumn("owners", "Owners") { Sizing = CanopyColumnSizing.Preferred(220) });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Sizing = CanopyColumnSizing.Preferred(280) });
        view.GetColumn("name").Sizing = CanopyColumnSizing.Preferred(230, 160, 320);
        view.GetColumn("owners").Sizing = CanopyColumnSizing.Flex(1, 140, 380, preferredWidth: 220);
        view.GetColumn("notes").Sizing = CanopyColumnSizing.Flex(2, 180, 800, preferredWidth: 280);
        view.GetColumn("name").Presenter = CanopyGridPresenter.Link("url", newWindow: true);
        view.GetColumn("status").Presenter = CanopyGridPresenter.Icon("●");
        view.GetColumn("progress").Presenter = CanopyGridPresenter.Progress();
        view.GetColumn("enabled").Presenter = CanopyGridPresenter.Boolean();
        view.GetColumn("owners").Presenter = CanopyGridPresenter.List(", ", limit: 2);
        view.GetColumn("notes").Presenter = CanopyGridPresenter.LongText();
        view.GetColumn("name").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
        view.GetColumn("status").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Ordinal,
            new[] { "Needs review", "In progress", "Complete" });
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
        view.Reporting.SelectionControls = true;
        view.StateKey = "responsive-inventory";
        view.Reporting.ViewStorage = CanopyGridViewStorage.Local;
        view.Reporting.FilterGroups = true;
        view.Reporting.FacetColumns.Add("status");
        view.Reporting.FacetColumns.Add("enabled");
        view.Columns[0].Sizing = CanopyColumnSizing.Preferred(180);
        view.GetColumn("name").Sizing = CanopyColumnSizing.Preferred(180, 160, 320);
        view.GetColumn("name").Pinned = CanopyGridColumnPin.Left;
        view.GetColumn("name").ResponsivePriority = 0;
        view.GetColumn("name").AlwaysVisible = true;
        view.GetColumn("status").Sizing = CanopyColumnSizing.Preferred(160, 100, 240);
        view.GetColumn("status").Pinned = CanopyGridColumnPin.Right;
        view.GetColumn("status").ResponsivePriority = 1;
        view.GetColumn("progress").Sizing = CanopyColumnSizing.Preferred(170, 100, 300);
        view.GetColumn("progress").ResponsivePriority = 2;
        view.GetColumn("enabled").Sizing = CanopyColumnSizing.Preferred(110, 80, 200);
        view.GetColumn("enabled").ResponsivePriority = 3;
        view.GetColumn("owners").Sizing = CanopyColumnSizing.Flex(1, 140, 380, preferredWidth: 220);
        view.GetColumn("owners").ResponsivePriority = 4;
        view.GetColumn("notes").Sizing = CanopyColumnSizing.Flex(2, 180, 800, preferredWidth: 280);
        view.GetColumn("notes").ResponsivePriority = 5;
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
