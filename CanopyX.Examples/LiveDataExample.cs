using System.Globalization;
using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Live data (docs/live-data.md): an endpoint monitor whose rows change in place from a simulated stream (batched, with a
/// stable order, flashing cells and an "Order changed" prompt), and a job queue served by a simulated server that the grid
/// polls with its revision-aware refresh. Adding <c>#manual</c> to the address stops the timers, so tests step them.
/// </summary>
internal static class LiveDataExample {
    private static readonly string[] Regions = { "eu-west", "eu-north", "us-east", "us-west", "ap-south" };
    private static readonly string[] Services = { "accounts", "billing", "catalog", "checkout", "files", "identity", "images", "mail", "orders", "search", "sessions", "telemetry" };

    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.live-data.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        using var css = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.examples.css")!;
        using var cssReader = new StreamReader(css);
        var exampleStyle = cssReader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options(string height) => new() { Theme = theme, Height = height, Document = document };
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
                .Replace("{{example-style}}", exampleStyle)
                .Replace("{{monitor}}", Monitor().ToHtmlFragment(Options("440px")))
                .Replace("{{queue}}", Queue().ToHtmlFragment(Options("300px")));
            File.WriteAllText(Path.Combine(output, "live-data" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"), page);
        }
    }

    private static string Id(int index) => "ep-" + index.ToString("D2", CultureInfo.InvariantCulture);

    internal static CanopyDataGridView Monitor() {
        var grid = new CanopyDataGridView("live-endpoints", "Endpoints") {
            Selection = CanopySelectionMode.Multiple, PageSize = 100, Noun = "endpoints", RowAction = CanopyGridRowAction.Details,
            Live = new CanopyGridLive { Flash = true, BatchMilliseconds = 250 }
        };
        grid.Columns.Add(new CanopyColumn("name", "Endpoint") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Flex(1, 120, 360, preferredWidth: 170) });
        grid.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true, ResponsivePriority = 4, Sizing = CanopyColumnSizing.Preferred(100) });
        grid.Columns.Add(new CanopyColumn("status", "Status") {
            Sortable = true, ResponsivePriority = 2,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Healthy"] = CanopyTone.Success, ["Degraded"] = CanopyTone.Warning, ["Down"] = CanopyTone.Danger })
        });
        grid.Columns.Add(new CanopyColumn("latency", "Latency (ms)") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 1, Aggregatable = true });
        grid.Columns.Add(new CanopyColumn("errors", "Errors / min") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 3 });
        grid.Columns.Add(new CanopyColumn("requests", "Requests / min") { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 5 });
        grid.Columns.Add(new CanopyColumn("updated", "Updated") { Kind = CanopyColumnKind.DateTime, Sortable = true, ResponsivePriority = 6 });
        grid.Query = new CanopyGridQuery(grid.Id);
        grid.Query.Sort.Add(new CanopyGridSort("latency", descending: true));
        var start = new DateTime(2026, 10, 15, 9, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 40; i++) {
            var row = new CanopyGridRow(Id(i));
            row.Cells["name"] = Services[i % Services.Length] + "-" + (i / Services.Length + 1).ToString(CultureInfo.InvariantCulture);
            row.Cells["region"] = Regions[i % Regions.Length];
            row.Cells["status"] = i % 11 == 4 ? "Down" : i % 7 == 2 ? "Degraded" : "Healthy";
            row.Cells["latency"] = 40 + i * 37 % 260;
            row.Cells["errors"] = i % 11 == 4 ? 42 : i % 7 == 2 ? 9 : i % 3;
            row.Cells["requests"] = 300 + i * 53 % 900;
            row.Cells["updated"] = start.AddSeconds(i * 7);
            grid.Rows.Add(row);
        }
        return grid;
    }

    internal static CanopyDataGridView Queue() {
        var grid = new CanopyDataGridView("live-jobs", "Job queue") {
            Source = CanopyGridSource.HostedOffset(), PageSize = 50, Noun = "jobs",
            Live = new CanopyGridLive { Flash = true, PollMilliseconds = 4000 }
        };
        grid.Columns.Add(new CanopyColumn("job", "Job") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Flex(1, 160, 480, preferredWidth: 220) });
        grid.Columns.Add(new CanopyColumn("state", "State") {
            Sortable = true,
            Presenter = CanopyGridPresenter.State(new Dictionary<string, CanopyTone> { ["Running"] = CanopyTone.Info, ["Queued"] = CanopyTone.Neutral, ["Failed"] = CanopyTone.Danger, ["Done"] = CanopyTone.Success })
        });
        grid.Columns.Add(new CanopyColumn("progress", "Progress (%)") { Kind = CanopyColumnKind.Number, Sortable = true });
        grid.Query = new CanopyGridQuery(grid.Id);
        grid.Query.Sort.Add(new CanopyGridSort("progress", descending: true));
        return grid;
    }
}
