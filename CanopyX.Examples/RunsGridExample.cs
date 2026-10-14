using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Pipeline runs whose Run column shows each run's name and sorts by its start time: the cell's sort key orders it, while the
/// column filter's value list and the search read the names.
/// </summary>
internal static class RunsGridExample {
    private static readonly string[] Pipelines = { "Nightly build", "Release candidate", "Security scan", "Docs publish" };

    internal static void Write(string output) =>
        Create().SaveHtmlPage(Path.Combine(output, "runs-grid.html"), new CanopyHtmlOptions { Title = "Pipeline runs" });

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("runs", "Pipeline runs") { Selection = CanopySelectionMode.Single };
        view.Columns.Add(new CanopyColumn("run", "Run") { Sortable = true });
        view.Columns.Add(new CanopyColumn("result", "Result") { Sortable = true });
        view.Columns.Add(new CanopyColumn("duration", "Duration (min)") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Query = new CanopyGridQuery(view.Id);
        view.Query.Sort.Add(new CanopyGridSort("run", descending: true));
        var start = new DateTime(2026, 10, 1, 1, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 24; i++) {
            var row = new CanopyGridRow("run-" + i);
            // The name is the value (filters and search); the start time is the sort key, so runs order by time, not by name.
            row.Cells["run"] = new CanopyCell(Pipelines[i % Pipelines.Length] + " #" + (100 + i)) { SortKey = start.AddHours(i * 7 + (i % 3) * 2) };
            row.Cells["result"] = i % 5 == 0 ? "Failed" : "Passed";
            row.Cells["duration"] = 4 + (i * 7) % 23;
            view.Rows.Add(row);
        }
        return view;
    }
}
