using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Flat record groups, full-query totals and responsive selection over the same inventory.</summary>
internal static class GroupedGridExample {
    internal static void Write(string output) {
        var view = new CanopyGridView("grouped-inventory", "Inventory by category") {
            Selection = CanopySelectionMode.Multiple, StateKey = "grouped-inventory",
            PageSize = 100, PageLength = 25, Presentation = CanopyGridPresentation.Paged,
            Reporting = new CanopyGridReporting {
                Grouping = new CanopyGridGrouping("category"), HeaderFilters = true, FilterGroups = true,
                SelectionControls = true, Responsive = true, ViewStorage = CanopyGridViewStorage.Local
            }
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Width = 180, Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Width = 150, Sortable = true });
        view.Columns.Add(new CanopyColumn("updated", "Updated") { Width = 180, Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Width = 120, Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.Ordering.Add("name", new CanopyGridOrdering(CanopyGridTextOrder.FoldedNatural));
        view.Reporting.Ordering.Add("category", new CanopyGridOrdering(CanopyGridTextOrder.Ordinal,
            new[] { "Needs review", "In progress", "Complete" }));
        view.Reporting.Layout.Add("name", new CanopyGridColumnLayout(160, 320, pin: CanopyGridColumnPin.Left, priority: 0, alwaysVisible: true));
        view.Reporting.Layout.Add("category", new CanopyGridColumnLayout(100, 260, priority: 1));
        view.Reporting.Layout.Add("updated", new CanopyGridColumnLayout(120, 300, priority: 3));
        view.Reporting.Layout.Add("amount", new CanopyGridColumnLayout(100, 220, pin: CanopyGridColumnPin.Right, priority: 2));
        view.Reporting.FacetColumns.Add("category");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("average", "amount", CanopyGridAggregateOperation.Average, "Average amount"));
        var categories = new[] { "Complete", "In progress", "Needs review" };
        for (var i = 0; i < 137; i++) {
            var row = new CanopyGridRow("record-" + i.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Record " + i.ToString(CultureInfo.InvariantCulture);
            row.Cells["category"] = categories[i % categories.Length];
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
