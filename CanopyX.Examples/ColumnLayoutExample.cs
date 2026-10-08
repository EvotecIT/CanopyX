using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Generic grids that show content sizing, priorities and pinning in wide, narrow and phone-sized containers.</summary>
internal static class ColumnLayoutExample {
    private static readonly string[] Categories = { "Hardware", "Software", "Services", "Accessories" };
    private static readonly string[] Levels = { "Information", "Warning", "Error" };

    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.column-layout.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var options = new CanopyHtmlOptions { Theme = theme, Height = "420px" };
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
                .Replace("{{theme}}", theme == CanopyTheme.Dark ? "dark" : "light")
                .Replace("{{products}}", Products("products").ToHtmlFragment(options))
                .Replace("{{rules}}", Rules().ToHtmlFragment(options))
                .Replace("{{wide}}", Wide().ToHtmlFragment(options))
                .Replace("{{log}}", Log().ToHtmlFragment(options))
                .Replace("{{phone}}", Products("phone-products").ToHtmlFragment(options));
            File.WriteAllText(Path.Combine(output, "column-layout" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page);
        }
    }

    internal static CanopyDataGridView Products(string id) {
        var view = new CanopyDataGridView(id, "Products") { Noun = "products", RowAction = CanopyGridRowAction.Details };
        view.Columns.Add(new CanopyColumn("name", "Product") { Sortable = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true });
        view.Columns.Add(new CanopyColumn("sku", "SKU") { ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("stock", "In stock") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("price", "Price") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 0 });
        for (var i = 0; i < 6; i++) {
            var row = new CanopyGridRow("p" + i);
            row.Cells["name"] = "Product " + (char)('A' + i) + (i % 2 == 0 ? " with a longer catalogue name" : string.Empty);
            row.Cells["category"] = Categories[i % Categories.Length]; row.Cells["sku"] = "SKU-" + (1000 + i * 37);
            row.Cells["stock"] = 20 + i * 13; row.Cells["price"] = 19.5 + i * 7;
            view.Rows.Add(row);
        }
        return view;
    }

    private static CanopyDataGridView Rules() {
        var view = new CanopyDataGridView("rules", "Rules") { Noun = "rules" };
        view.Columns.Add(new CanopyColumn("rule", "Rule") { Presenter = CanopyGridPresenter.Link() });
        view.Columns.Add(new CanopyColumn("category", "Category"));
        view.Columns.Add(new CanopyColumn("owner", "Owner") { ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("failing", "Failing on") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("worst", "Worst") {
            ResponsivePriority = 0,
            Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> { ["Severe"] = CanopyTone.Danger, ["Passed"] = CanopyTone.Success }).WithQuietTones(CanopyTone.Success)
        });
        view.Columns.Add(new CanopyColumn("weight", "Weight") { Kind = CanopyColumnKind.Number, ResponsivePriority = 10000 });
        for (var i = 0; i < 12; i++) {
            var row = new CanopyGridRow("r" + i);
            row.Cells["rule"] = new CanopyCell("#rule-" + i) { Text = "Configuration rule " + (i + 1) + (i % 3 == 0 ? " with a descriptive name" : string.Empty) };
            row.Cells["category"] = Categories[i % Categories.Length]; row.Cells["owner"] = "Team " + (i % 4 + 1);
            row.Cells["failing"] = i % 5; row.Cells["worst"] = i % 5 == 0 ? "Passed" : "Severe"; row.Cells["weight"] = 50 - i * 3;
            view.Rows.Add(row);
        }
        return view;
    }

    private static CanopyDataGridView Wide() {
        var view = new CanopyDataGridView("wide", "Thirty measurements") { Noun = "rows" };
        view.Columns.Add(new CanopyColumn("name", "Device"));
        for (var c = 1; c <= 28; c++) view.Columns.Add(new CanopyColumn("m" + c, "Metric " + c) { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("status", "Status") { Pinned = CanopyGridColumnPin.Right, Presenter = CanopyGridPresenter.State() });
        for (var i = 0; i < 40; i++) {
            var row = new CanopyGridRow("d" + i);
            row.Cells["name"] = "device-" + i.ToString("000"); row.Cells["status"] = i % 7 == 0 ? new CanopyCell("Degraded") { Tone = CanopyTone.Warning } : new CanopyCell("Online") { Tone = CanopyTone.Success };
            for (var c = 1; c <= 28; c++) row.Cells["m" + c] = (i * 31 + c * 17) % 1000;
            view.Rows.Add(row);
        }
        return view;
    }

    private static CanopyDataGridView Log() {
        var view = new CanopyDataGridView("log", "Event log") { Noun = "events" };
        view.Columns.Add(new CanopyColumn("time", "Time") { Kind = CanopyColumnKind.DateTime, ResponsivePriority = 0 });
        view.Columns.Add(new CanopyColumn("level", "Level") { Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> { ["Error"] = CanopyTone.Danger, ["Warning"] = CanopyTone.Warning }) });
        view.Columns.Add(new CanopyColumn("source", "Source") { ResponsivePriority = 10000 });
        view.Columns.Add(new CanopyColumn("message", "Message") { RowHeader = true, Pinned = CanopyGridColumnPin.None, Sizing = CanopyColumnSizing.Content(maximum: 640) });
        for (var i = 0; i < 30; i++) {
            var row = new CanopyGridRow("e" + i);
            row.Cells["time"] = new CanopyCell(new DateTime(2026, 10, 1, 8, 0, 0, DateTimeKind.Utc).AddMinutes(i * 7));
            row.Cells["level"] = Levels[i % Levels.Length]; row.Cells["source"] = "Service " + (i % 5);
            row.Cells["message"] = "Request " + i + " completed after retrying the upstream connection; the response was cached for the next caller.";
            view.Rows.Add(row);
        }
        return view;
    }
}
