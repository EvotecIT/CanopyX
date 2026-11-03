using System.Reflection;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A family week for a shared screen (docs/calendar.md#shared-screens): each person is a source with a face, plans that several
/// people share merge into one event with every face, finished events fade, day headers carry notes, and the week shows fewer
/// days as it narrows while keeping today, with a Reset button for whoever paged away. The routines repeat weekly, so the page
/// opens on the reader's own week. A compact list of the next three days sits beside it. Writes calendar-family.html (and -dark).
/// </summary>
internal static class CalendarFamilyExample {
    private const string Zone = "Europe/Warsaw";
    private static readonly DateTime Monday = new(2026, 9, 7);

    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options(string height) => new() { Theme = theme, Height = height, Document = document };
            var page = Template("calendar-family.html")
                .Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
                .Replace("{{example-style}}", Template("examples.css"))
                .Replace("{{week}}", Week().ToHtmlFragment(Options("760px")))
                .Replace("{{next}}", Next().ToHtmlFragment(Options("760px")));
            File.WriteAllText(Path.Combine(output, "calendar-family" + suffix + ".html"), page);
        }
    }

    /// <summary>The week on the wall: hours, faces, merged plans, faded past, notes, fitted days and Reset.</summary>
    internal static CanopyCalendar Week() {
        var calendar = Family("family-week", "Family week");
        calendar.View = CanopyCalendarView.Week;
        foreach (var view in new[] { CanopyCalendarView.Week, CanopyCalendarView.Days, CanopyCalendarView.WeekList, CanopyCalendarView.Month, CanopyCalendarView.Agenda }) calendar.Views.Add(view);
        calendar.MinTime = TimeSpan.FromHours(7); calendar.MaxTime = TimeSpan.FromHours(21); calendar.ScrollTime = TimeSpan.FromHours(7);
        calendar.DayWidth = 116;
        calendar.Reset = true;
        return calendar;
    }

    /// <summary>The same family as a compact list of the next three days, stacked when its column is narrow.</summary>
    internal static CanopyCalendar Next() {
        var calendar = Family("family-next", "Next three days");
        calendar.View = CanopyCalendarView.WeekList;
        calendar.Views.Add(CanopyCalendarView.WeekList);
        calendar.ListDays = 3; calendar.ListBelow = 3; calendar.DayWidth = 150;
        return calendar;
    }

    private static CanopyCalendar Family(string id, string label) {
        var calendar = new CanopyCalendar(id, label, Events()) { FirstDay = DayOfWeek.Monday, TimeZone = Zone, FadePast = 0.55, Merge = new CanopyCalendarMerge() };
        calendar.Sources.Add(new CanopyCalendarSource("anna", "Anna") { Color = "#2563eb", Initials = "A", Avatar = Avatar("#2563eb", "#bfdbfe") });
        calendar.Sources.Add(new CanopyCalendarSource("tom", "Tom") { Color = "#059669", Initials = "T", Avatar = Avatar("#059669", "#a7f3d0") });
        calendar.Sources.Add(new CanopyCalendarSource("mia", "Mia") { Color = "#db2777", Initials = "MI" });
        calendar.Sources.Add(new CanopyCalendarSource("leo", "Leo") { Color = "#d97706", Initials = "LE" });
        calendar.Sources.Add(new CanopyCalendarSource("home", "Home") { Color = "#7c3aed", Icon = "🏠" });
        // Bin day every Monday and a few dated notes, for the weeks around the routines' start.
        for (var week = Monday; week < Monday.AddDays(7 * 70); week = week.AddDays(7)) calendar.DayNotes.Add(new CanopyCalendarDayNote(week, "♻ Bin day") { Tone = CanopyTone.Success });
        calendar.DayNotes.Add(new CanopyCalendarDayNote(new DateTime(2026, 11, 11), "Holiday") { Tone = CanopyTone.Info });
        calendar.DayNotes.Add(new CanopyCalendarDayNote(new DateTime(2026, 12, 24), "🎄 Christmas Eve") { Tone = CanopyTone.Danger });
        return calendar;
    }

    /// <summary>The family's weekly routines: some belong to one person, some (swimming, dinner, the match) to several.</summary>
    internal static List<CanopyCalendarEvent> Events() {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(Zone);
        var list = new List<CanopyCalendarEvent>();
        void Add(string source, string title, DayOfWeek[] days, int hour, int minute, int minutes, string? location = null) {
            var first = Monday.AddDays(((int)days[0] - (int)DayOfWeek.Monday + 7) % 7).AddHours(hour).AddMinutes(minute);
            var start = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(first, DateTimeKind.Unspecified), zone);
            list.Add(new CanopyCalendarEvent(title, start, start.AddMinutes(minutes)) { Id = source + "-" + list.Count, Source = source, Location = location, Recurrence = CanopyRecurrence.Weekly(days) });
        }
        var weekdays = new[] { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday };
        Add("tom", "School run", new[] { DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday }, 7, 45, 30);
        Add("anna", "School run", new[] { DayOfWeek.Tuesday, DayOfWeek.Thursday }, 7, 45, 30);
        Add("anna", "Studio", new[] { DayOfWeek.Monday, DayOfWeek.Wednesday }, 9, 0, 420, "Old Town studio");
        Add("tom", "Office", new[] { DayOfWeek.Tuesday, DayOfWeek.Thursday }, 8, 30, 480, "Riverside office");
        Add("mia", "School", weekdays, 8, 15, 375, "Primary school");
        Add("leo", "School", weekdays, 8, 15, 375, "Primary school");
        Add("mia", "Swimming", new[] { DayOfWeek.Monday }, 17, 0, 60, "City pool");
        Add("leo", "Swimming", new[] { DayOfWeek.Monday }, 17, 0, 60, "City pool");
        Add("mia", "Piano lesson", new[] { DayOfWeek.Tuesday }, 16, 30, 45, "Music school");
        Add("leo", "Football practice", new[] { DayOfWeek.Wednesday }, 17, 30, 90, "Park field");
        Add("anna", "Yoga", new[] { DayOfWeek.Thursday }, 19, 0, 60);
        Add("tom", "Climbing", new[] { DayOfWeek.Tuesday }, 19, 30, 90, "Boulder hall");
        foreach (var source in new[] { "anna", "tom", "mia", "leo" }) Add(source, "Family dinner", new[] { DayOfWeek.Friday }, 18, 30, 90);
        Add("leo", "Football match", new[] { DayOfWeek.Saturday }, 10, 0, 120, "Park field");
        Add("tom", "Football match", new[] { DayOfWeek.Saturday }, 10, 0, 120, "Park field");
        Add("home", "Grocery delivery", new[] { DayOfWeek.Saturday }, 14, 0, 60);
        Add("home", "Lunch at Grandma's", new[] { DayOfWeek.Sunday }, 12, 30, 150);
        Add("mia", "Art club", new[] { DayOfWeek.Thursday }, 15, 30, 60, "Primary school");
        return list;
    }

    /// <summary>A small head-and-shoulders avatar as a base64 SVG data URL, so the page needs no image files.</summary>
    private static string Avatar(string background, string figure) {
        var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='" + background + "'/>" +
            "<circle cx='20' cy='16' r='7' fill='" + figure + "'/><path d='M6 40c1-9 7-13 14-13s13 4 14 13z' fill='" + figure + "'/></svg>";
        return "data:image/svg+xml;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes(svg));
    }

    private static string Template(string name) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
