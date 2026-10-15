using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Orders grouped by region and status with labelled sum, average, count and distinct-count aggregates in the headings and
/// the totals row; each order expands into a nested grid of its order lines. Readers regroup from the column menus or the
/// group-by bar (docs/grouping.md).
/// </summary>
internal static class OrdersByRegionExample {
    private static readonly string[] Regions = { "North", "South", "East", "West", "Central" };
    private static readonly string[] Statuses = { "Open", "Shipped", "Delivered", "Returned" };
    private static readonly string[] Products = { "Standing desk", "Task chair", "Desk lamp", "Bookshelf", "Monitor arm", "Cable tray", "Footrest", "Whiteboard" };
    private static readonly string[] Customers = { "Alder & Co", "Birch Works", "Cedar Labs", "Dune Retail", "Elm Studio", "Fjord Freight", "Grove Health", "Harbor Bank",
        "Iris Media", "Juniper Farms", "Kite Logistics", "Lumen Energy", "Maple School", "Nimbus Air", "Oak Partners", "Pine Hotels" };

    internal static void Write(string output) {
        var lines = new CanopyDataGridView("order-lines", "Order lines") { PageSize = 50 };
        lines.Columns.Add(new CanopyColumn("product", "Product") { Sortable = true });
        lines.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number, Sortable = true });
        lines.Columns.Add(new CanopyColumn("price", "Unit price") { Kind = CanopyColumnKind.Number, Sortable = true });
        lines.Columns.Add(new CanopyColumn("total", "Line total") { Kind = CanopyColumnKind.Number, Sortable = true });

        var view = new CanopyDataGridView("orders-by-region", "Orders by region") {
            Selection = CanopySelectionMode.Multiple, StatusBar = true, PageSize = 100, StateKey = "orders-by-region",
            Reporting = new CanopyGridReporting { Groupable = true, SelectionControls = true, HeaderFilters = true, ColumnReorder = true,
                Detail = new CanopyGridDetail { View = lines, Label = "Order lines" } }
        };
        view.Columns.Add(new CanopyColumn("order", "Order") { Sortable = true });
        view.Columns.Add(new CanopyColumn("customer", "Customer") { Sortable = true });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Presenter = CanopyGridPresenter.State() });
        view.Columns.Add(new CanopyColumn("placed", "Placed") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("items", "Lines") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("region"));
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("status"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("orders", "order", CanopyGridAggregateOperation.Count, "Orders"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("customers", "customer", CanopyGridAggregateOperation.DistinctCount, "Customers"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("total", "amount", CanopyGridAggregateOperation.Sum, "Total amount"));
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("average", "amount", CanopyGridAggregateOperation.Average, "Average order"));
        view.GetColumn("status").Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Ordinal, Statuses);

        var start = new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 160; i++) {
            var row = new CanopyGridRow("order-" + i.ToString("D4", CultureInfo.InvariantCulture));
            var detail = new CanopyGridRowsDetail();
            double amount = 0;
            for (var j = 0; j < 2 + i % 4; j++) {
                var quantity = 1 + (i * 3 + j) % 6; var price = 40 + (i * 37 + j * 53) % 460;
                var line = new CanopyGridRow(row.Id + "-" + j.ToString(CultureInfo.InvariantCulture));
                line.Cells["product"] = Products[(i + j * 3) % Products.Length];
                line.Cells["quantity"] = quantity; line.Cells["price"] = price; line.Cells["total"] = quantity * price;
                detail.Rows.Add(line); amount += quantity * price;
            }
            row.Cells["order"] = "SO-" + (24100 + i).ToString(CultureInfo.InvariantCulture);
            row.Cells["customer"] = Customers[(i * 7) % Customers.Length];
            row.Cells["region"] = Regions[(i * 11) % Regions.Length];
            row.Cells["status"] = new CanopyCell(Statuses[(i * 5 + i / 7) % Statuses.Length]) { Tone = (i * 5 + i / 7) % Statuses.Length == 3 ? CanopyTone.Warning : CanopyTone.None };
            row.Cells["placed"] = start.AddHours(i * 13);
            row.Cells["items"] = detail.Rows.Count;
            row.Cells["amount"] = amount;
            row.Detail = detail;
            view.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX orders by region", Theme = theme });
            File.WriteAllText(Path.Combine(output, "orders-by-region" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page);
        }
    }
}
