using System.Globalization;
using CanopyX;
using CanopyX.Examples;
using CanopyX.Html;

namespace SiteDemos;

/// <summary>
/// The views beyond the tree and the grid, written from the repository's examples so the site shows what the library ships:
/// a board, a calendar, a plan, a resource timeline, a pivot, a status matrix, dataset comparison, snapshots over time,
/// a guided flow, approval paths and configuration layers. Each page follows the site theme inside a frame.
/// </summary>
internal static class ViewDemos {
    /// <summary>Writes the pages and returns a one-line summary of each, keyed by the view id the site uses.</summary>
    internal static Dictionary<string, string> Write(string demos) {
        CanopyHtmlOptions Options(string title) => new CanopyHtmlOptions { Title = "CanopyX " + title, Theme = CanopyTheme.Auto, Height = "100vh" };
        var calendar = CalendarExample.Create().View;
        calendar.SaveHtmlPage(Path.Combine(demos, "calendar.html"), Options("operations calendar"));
        var timeline = CalendarTimelineExample.Create();
        timeline.SaveHtmlPage(Path.Combine(demos, "timeline.html"), Options("resource timeline"));
        var matrix = MatrixExamples.Services();
        matrix.SaveHtmlPage(Path.Combine(demos, "matrix.html"), new CanopyHtmlOptions { Title = "CanopyX services by server", Theme = CanopyTheme.Auto });
        var board = BoardExample.Create();
        board.SaveHtmlPage(Path.Combine(demos, "board.html"), Options("migration board"));
        var plan = PlanExample.Create();
        plan.SaveHtmlPage(Path.Combine(demos, "plan.html"), Options("migration plan"));
        var path = PathExample.Create();
        path.SaveHtmlPage(Path.Combine(demos, "path.html"), Options("approval routes"));
        var stack = StackExample.Create();
        stack.SaveHtmlPage(Path.Combine(demos, "stack.html"), Options("configuration layers"));

        // The flow example writes a light and a dark page; the site picks the one that matches its theme.
        FlowSetupTasksExample.Write(demos);

        // The pivot, the dataset comparison and the snapshots write their own light and dark pages; the site keeps those.
        Copy(demos, AnalystExample.Write, "analysis-pivot", "pivot");
        Copy(demos, DataViewsExample.Write, "data-views", "compare");
        Copy(demos, TimeSliderExample.Write, "time-matrix", "time");

        return new Dictionary<string, string> {
            ["board"] = Count(board.Rows.Count) + " tasks in " + Count(board.Board!.Lanes.Count) + " lanes",
            ["calendar"] = Count(calendar.Rows.Count) + " operations, month to agenda",
            ["plan"] = Count(plan.Rows.Count) + " tasks with a baseline and dependencies",
            ["timeline"] = Count(timeline.Rows.Count) + " events across a host tree",
            ["pivot"] = "96 records by region and month",
            ["matrix"] = Count(matrix.Rows.Items.Count) + " servers by " + Count(matrix.Columns.Items.Count) + " services",
            ["compare"] = "Two inventory snapshots, matched by key",
            ["time"] = "Three snapshots of a rollout",
            ["flow"] = "Tasks, checks and a review page",
            ["path"] = Count(path.Path!.Chains.Count) + " approval routes over " + Count(path.Rows.Count) + " steps",
            ["stack"] = Count(stack.Stack!.Layers.Count) + " layers and the one that wins"
        };
    }

    /// <summary>Runs an example writer in a temporary folder and keeps its light and dark page under the view's name.</summary>
    private static void Copy(string demos, Action<string> write, string page, string view) {
        var folder = Path.Combine(Path.GetTempPath(), "canopyx-site-" + view + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try {
            write(folder);
            File.Copy(Path.Combine(folder, page + ".html"), Path.Combine(demos, view + ".html"), overwrite: true);
            File.Copy(Path.Combine(folder, page + "-dark.html"), Path.Combine(demos, view + "-dark.html"), overwrite: true);
        } finally {
            Directory.Delete(folder, recursive: true);
        }
    }

    private static string Count(int value) => value.ToString("N0", CultureInfo.InvariantCulture);
}
