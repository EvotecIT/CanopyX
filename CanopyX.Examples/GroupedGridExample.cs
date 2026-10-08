using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Flat record groups, full-query totals and responsive selection over the same inventory.</summary>
internal static class GroupedGridExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("grouped-inventory", "Inventory by category") {
            Selection = CanopySelectionMode.Multiple, StateKey = "grouped-inventory", StatusBar = true,
            PageSize = 100, PageLength = 25, Presentation = CanopyGridPresentation.Paged,
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("category"), HeaderFilters = true, FilterGroups = true,
                SelectionControls = true, Responsive = true, ViewStorage = CanopyGridViewStorage.Local
            }
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(180), Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sizing = CanopyColumnSizing.Preferred(150), Sortable = true });
        view.Columns.Add(new CanopyColumn("updated", "Updated") { Sizing = CanopyColumnSizing.Preferred(180), Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Sizing = CanopyColumnSizing.Preferred(120), Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "State") { Sizing = CanopyColumnSizing.Preferred(140), Presenter = CanopyGridPresenter.State() });
        view.GetColumn("name").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural);
        view.GetColumn("category").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Ordinal,
            new[] { "Needs review", "In progress", "Complete" });
        view.GetColumn("name").Sizing = CanopyColumnSizing.Preferred(180, 160, 320);
        view.GetColumn("name").Pinned = CanopyGridColumnPin.Left;
        view.GetColumn("name").ResponsivePriority = 0;
        view.GetColumn("name").AlwaysVisible = true;
        view.GetColumn("category").Sizing = CanopyColumnSizing.Preferred(150, 100, 260);
        view.GetColumn("category").ResponsivePriority = 1;
        view.GetColumn("updated").Sizing = CanopyColumnSizing.Preferred(180, 120, 300);
        view.GetColumn("updated").ResponsivePriority = 3;
        view.GetColumn("amount").Sizing = CanopyColumnSizing.Preferred(120, 100, 220);
        view.GetColumn("amount").Pinned = CanopyGridColumnPin.Right;
        view.GetColumn("amount").ResponsivePriority = 2;
        view.Reporting.FacetColumns.Add("category");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("average", "amount", CanopyGridAggregateOperation.Average, "Average amount"));
        var categories = new[] { "Complete", "In progress", "Needs review" };
        for (var i = 0; i < 137; i++) {
            var row = new CanopyGridRow("record-" + i.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Record " + i.ToString(CultureInfo.InvariantCulture);
            row.Cells["category"] = categories[i % categories.Length];
            row.Cells["state"] = new CanopyCell(i % 13 == 0 ? "Failed" : "Healthy") { Tone = i % 13 == 0 ? CanopyTone.Danger : CanopyTone.Success };
            row.Cells["updated"] = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc).AddDays(i);
            row.Cells["amount"] = i % 11 == 0 ? new CanopyCell() : new CanopyCell(i / 10d) {
                Text = (i / 10d).ToString("N1", CultureInfo.InvariantCulture)
            };
            view.Rows.Add(row);
        }
        foreach (var presentation in new[] { CanopyGridPresentation.Paged, CanopyGridPresentation.Continuous }) {
            view.Presentation = presentation;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                var name = "grouped-grid" + (presentation == CanopyGridPresentation.Continuous ? "-continuous" : "") +
                    (theme == CanopyTheme.Dark ? "-dark" : "") + ".html";
                InventoryGridExample.WritePage(view, output, name, theme);
            }
        }
    }
}
