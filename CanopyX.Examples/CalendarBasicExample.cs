using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Calendars built from a list of events, with no grid schema to write (docs/calendar.md#quick-start). The basic calendar is
/// what <c>new CanopyCalendar(events)</c> gives: month, week, day and agenda with calendar controls only, read-only, and a
/// details popover. The other pages turn on one option at a time: the simple layouts (mini month, week and day lists, stacked
/// months, a year with its events), a scheduler (creating events, dropping work from a grid, sources with a legend, office
/// hours shaded outside, context menus), a right-to-left calendar and a timeline without resources. Writes calendar-basic.html
/// (and -dark), calendar-layouts.html, calendar-scheduler.html (and -dark), calendar-rtl.html and calendar-solo.html.
/// </summary>
internal static class CalendarBasicExample {
    private static DateTime Today => CalendarExample.Today;

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Basic().SaveHtmlPage(Path.Combine(output, "calendar-basic" + suffix + ".html"), new CanopyHtmlOptions { Title = "Team calendar", Theme = theme, Height = "720px" });
            WriteScheduler(output, theme, suffix);
        }
        Layouts().SaveHtmlPage(Path.Combine(output, "calendar-layouts.html"), new CanopyHtmlOptions { Title = "Calendar layouts", Height = "720px" });
        var rtl = Basic();
        rtl.WeekNumbers = CanopyCalendarWeekNumbers.Iso;
        rtl.SaveHtmlPage(Path.Combine(output, "calendar-rtl.html"), new CanopyHtmlOptions { Title = "Team calendar, right to left", Height = "720px", Language = "he", Direction = CanopyTextDirection.Rtl });
        Solo().SaveHtmlPage(Path.Combine(output, "calendar-solo.html"), new CanopyHtmlOptions { Title = "Release timeline", Height = "620px" });
    }

    /// <summary>A small team's month: meetings, a repeating stand-up, a trip, deadlines and a holiday.</summary>
    internal static List<CanopyCalendarEvent> Events() {
        DateTime At(int day, int hour = 0, int minute = 0) => new DateTime(2026, 10, day, hour, minute, 0, DateTimeKind.Utc);
        CanopyCalendarEvent Timed(string id, string title, DateTime start, DateTime end, CanopyTone tone, string? description = null, string? source = null) =>
            new(title, start, end) { Id = id, Tone = tone, Description = description, Source = source };
        CanopyCalendarEvent Day(string id, string title, DateTime start, DateTime end, CanopyTone tone, string? description = null, string? source = null) =>
            new(title, start, end) { Id = id, AllDay = true, Tone = tone, Description = description, Source = source };
        return new List<CanopyCalendarEvent> {
            new("Stand-up", At(1, 9), At(1, 9, 15)) { Id = "standup", Tone = CanopyTone.Neutral, Source = "team", Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday), Description = "Fifteen minutes, cameras optional." },
            Timed("planning", "Sprint planning", At(5, 10), At(5, 12), CanopyTone.Info, "Pick the work for the next two weeks.", "team"),
            Timed("review", "Design review: settings page", At(8, 14), At(8, 15, 30), CanopyTone.Info, "Bring the latest mock-ups.", "team"),
            Timed("dentist", "Dentist", At(13, 8), At(13, 9), CanopyTone.Muted, null, "team"),
            Timed("retro", "Retrospective", At(16, 13), At(16, 14), CanopyTone.Info, "What went well, what to change.", "team"),
            Timed("lunch", "Team lunch", At(16, 12), At(16, 13), CanopyTone.Success, "The new place on the corner.", "team"),
            Timed("interview", "Interview: frontend engineer", At(16, 15), At(16, 16), CanopyTone.Warning, null, "team"),
            Timed("oncall-1", "On call: Ana", At(12, 8), At(19, 8), CanopyTone.Danger, "Pager and the incident channel.", "oncall"),
            Timed("oncall-2", "On call: Tom", At(19, 8), At(26, 8), CanopyTone.Danger, "Pager and the incident channel.", "oncall"),
            Day("trip", "Conference trip", At(20), At(23), CanopyTone.Info, "Talks on Wednesday and Thursday.", "team"),
            Day("deadline", "Release candidate due", At(27), At(28), CanopyTone.Warning, null, "team"),
            Day("holiday", "Public holiday", At(26), At(27), CanopyTone.Success, null, "holidays"),
            Timed("offsite", "Quarterly offsite", At(29, 9), At(29, 17), CanopyTone.Info, "Bring a laptop and a jacket.", "team")
        };
    }

    /// <summary>The basic calendar: events in, every other setting at its default.</summary>
    internal static CanopyCalendar Basic() {
        var calendar = new CanopyCalendar("team-calendar", "Team calendar", Events());
        calendar.Date = Today; calendar.FirstDay = DayOfWeek.Monday;
        return calendar;
    }

    /// <summary>The simple layouts of the same events: mini month, week and day lists, three stacked months and the year with its events.</summary>
    private static CanopyCalendar Layouts() {
        var calendar = Basic();
        calendar.Views.Clear();
        foreach (var view in new[] { CanopyCalendarView.Mini, CanopyCalendarView.WeekList, CanopyCalendarView.DayList, CanopyCalendarView.Months, CanopyCalendarView.Year, CanopyCalendarView.Month })
            calendar.Views.Add(view);
        calendar.View = CanopyCalendarView.Mini;
        calendar.WeekNumbers = CanopyCalendarWeekNumbers.Iso;
        calendar.YearEvents = true;
        calendar.Months = 3;
        return calendar;
    }

    /// <summary>
    /// The scheduler: creating events, dropping unscheduled work from a grid beside it, three sources with a legend, the time
    /// outside office hours shaded (an inverse range) and the context menus, written into a page with both views.
    /// </summary>
    private static void WriteScheduler(string output, CanopyTheme theme, string suffix) {
        var calendar = new CanopyCalendar("team-scheduler", "Team scheduler", Events(), CanopyCalendarPreset.Scheduler) { Date = Today, FirstDay = DayOfWeek.Monday, View = CanopyCalendarView.Week, Drop = true };
        calendar.Sources.Add(new CanopyCalendarSource("team", "Team") { Tone = CanopyTone.Info });
        calendar.Sources.Add(new CanopyCalendarSource("oncall", "On call") { Tone = CanopyTone.Danger });
        calendar.Sources.Add(new CanopyCalendarSource("holidays", "Holidays") { Tone = CanopyTone.Success });
        calendar.Ranges.Add(new CanopyCalendarRange(new DateTime(2026, 10, 5, 8, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 5, 18, 0, 0, DateTimeKind.Utc), "Outside office hours") {
            Kind = CanopyCalendarRangeKind.Unavailable, Inverse = true,
            Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday)
        });
        calendar.ScrollTime = TimeSpan.FromHours(7);

        var work = new CanopyDataGridView("unscheduled", "Unscheduled work") { DragRows = true, Selection = CanopySelectionMode.Single, Noun = "tasks" };
        work.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true });
        work.Columns.Add(new CanopyColumn("minutes", "Minutes") { Kind = CanopyColumnKind.Number });
        foreach (var (id, title, minutes) in new[] { ("t1", "Write the release notes", 90), ("t2", "Pair on the login bug", 60), ("t3", "Update the runbook", 45), ("t4", "Review the dependency report", 30) }) {
            var row = new CanopyGridRow(id);
            row.Cells["title"] = title; row.Cells["minutes"] = minutes;
            work.Rows.Add(row);
        }

        var document = new CanopyHtmlDocument();
        CanopyHtmlOptions Options(string height) => new() { Theme = theme, Height = height, Document = document };
        var page = Template("calendar-scheduler.html")
            .Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
            .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
            .Replace("{{example-style}}", Template("examples.css"))
            .Replace("{{calendar}}", calendar.ToHtmlFragment(Options("700px")))
            .Replace("{{grid}}", work.ToHtmlFragment(Options("260px")));
        File.WriteAllText(Path.Combine(output, "calendar-scheduler" + suffix + ".html"), page);
    }

    /// <summary>A timeline without resources: release work packed into rows by overlap, over a span of six weeks.</summary>
    private static CanopyCalendar Solo() {
        DateTime At(int month, int day) => new(2026, month, day, 0, 0, 0, DateTimeKind.Utc);
        var events = new List<CanopyCalendarEvent>();
        void Add(string title, DateTime start, DateTime end, CanopyTone tone) => events.Add(new CanopyCalendarEvent(title, start, end) { AllDay = true, Tone = tone });
        Add("Design", At(10, 1), At(10, 14), CanopyTone.Info);
        Add("Backend work", At(10, 8), At(10, 30), CanopyTone.Info);
        Add("Frontend work", At(10, 12), At(11, 4), CanopyTone.Info);
        Add("Security review", At(10, 26), At(11, 2), CanopyTone.Warning);
        Add("Beta", At(10, 30), At(11, 11), CanopyTone.Success);
        Add("Documentation", At(10, 19), At(11, 6), CanopyTone.Neutral);
        Add("Translations", At(11, 2), At(11, 9), CanopyTone.Neutral);
        Add("Release", At(11, 11), At(11, 12), CanopyTone.Danger);
        var calendar = new CanopyCalendar("release-timeline", "Release timeline", events, CanopyCalendarPreset.Standard) { Date = At(10, 5), FirstDay = DayOfWeek.Monday, View = CanopyCalendarView.Timeline, Span = new CanopyCalendarSpan(6, CanopyCalendarSpanUnit.Week) };
        calendar.Views.Clear();
        calendar.Views.Add(CanopyCalendarView.Timeline); calendar.Views.Add(CanopyCalendarView.Month); calendar.Views.Add(CanopyCalendarView.Agenda);
        return calendar;
    }

    private static string Template(string name) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
