using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A calendar and a grid of the same records, linked both ways (docs/calendar.md#linked-views): selecting a day or a range of
/// slots in the calendar filters the grid to it through an external filter, and selecting rows in the grid highlights their
/// events in the calendar. The page script calls each view's link methods; neither view knows the other. calendar-linked.html.
/// </summary>
internal static class CalendarLinkedExample {
    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.calendar-linked.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        using var css = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.examples.css")!;
        using var cssReader = new StreamReader(css);
        var exampleStyle = cssReader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options(string height) {
                var options = new CanopyHtmlOptions { Theme = theme, Height = height, Document = document };
                options.Parts.Add("link");
                return options;
            }
            var calendar = CalendarExample.Create("linked-calendar", "Maintenance calendar").View;
            calendar.Calendar!.View = CanopyCalendarView.Week;
            var grid = CalendarExample.Create("linked-records", "Maintenance records").View;
            grid.Calendar = null;
            grid.Selection = CanopySelectionMode.Multiple;
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
                .Replace("{{example-style}}", exampleStyle)
                .Replace("{{calendar}}", calendar.ToHtmlFragment(Options("560px")))
                .Replace("{{grid}}", grid.ToHtmlFragment(Options("380px")));
            File.WriteAllText(Path.Combine(output, "calendar-linked" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"), page);
        }
    }
}
