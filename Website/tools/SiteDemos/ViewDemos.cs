using System.Globalization;
using CanopyX;
using CanopyX.Examples;
using CanopyX.Html;

namespace SiteDemos;

/// <summary>
/// The views beyond the tree and the grid, written from the repository's examples so the site shows what the library ships:
/// a calendar, a resource timeline, a status matrix and a guided flow. Each page follows the site theme inside a frame.
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

        // The flow example writes a light and a dark page; the site picks the one that matches its theme.
        FlowSetupTasksExample.Write(demos);

        return new Dictionary<string, string> {
            ["calendar"] = Count(calendar.Rows.Count) + " operations, month to agenda",
            ["timeline"] = Count(timeline.Rows.Count) + " events across a host tree",
            ["matrix"] = Count(matrix.Rows.Items.Count) + " servers by " + Count(matrix.Columns.Items.Count) + " services",
            ["flow"] = "Tasks, checks and a review page"
        };
    }

    private static string Count(int value) => value.ToString("N0", CultureInfo.InvariantCulture);
}
