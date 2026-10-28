using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A large resource schedule, shared events, one-occurrence editing and an optional JSON source.</summary>
internal static class CalendarResourcesExample {
    internal static void Write(string output) {
        var start = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc);
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var events = new List<CanopyCalendarEvent>();
            for (var index = 1; index <= 48; index++) events.Add(new CanopyCalendarEvent("Room " + index + " planning", start.AddMinutes(index % 4 * 30)) {
                Id = "meeting-" + index, End = start.AddHours(1).AddMinutes(index % 4 * 30), Resource = "room-" + index, Source = "planning"
            });
            var shared = new CanopyCalendarEvent("Weekly design review", start.AddHours(2)) {
                Id = "review", End = start.AddHours(3), Recurrence = CanopyRecurrence.Weekly(DayOfWeek.Friday).Times(5), Source = "planning",
                Description = "A shared session in two rooms. Use the event menu to edit only this occurrence."
            };
            shared.ResourceIds.Add("room-1"); shared.ResourceIds.Add("room-2"); events.Add(shared);
            var calendar = new CanopyCalendar("resource-calendar", "Room schedule", events, CanopyCalendarPreset.Scheduler) {
                Date = start.Date, View = CanopyCalendarView.Day, PhoneView = CanopyCalendarView.Day, TimeZone = "utc", FirstDay = DayOfWeek.Monday,
                Details = CanopyCalendarDetails.Popover, MinTime = TimeSpan.FromHours(8), MaxTime = TimeSpan.FromHours(18), ScrollTime = TimeSpan.FromHours(8)
            };
            calendar.Grid!.Labels = new CanopyLabels { CalendarResources = "Rooms" };
            var resources = new CanopyTreeView("rooms", "Rooms"); resources.Columns.Add(new CanopyColumn("name", "Room"));
            for (var index = 1; index <= 48; index++) resources.Roots.Add(new CanopyNode("room-" + index, "Room " + index.ToString("D2")));
            calendar.Resources = new CanopyCalendarResources(resources);
            calendar.Sources.Add(new CanopyCalendarSource("planning", "Planning") { Color = "#2563eb" });
            // Serve this generated folder over HTTP to enable the optional feed; ordinary file viewing keeps it hidden.
            var feed = new CanopyCalendarSource("visitors", "Visitors") { Url = "calendar-visitors.json", Color = "#b45309", Hidden = true };
            feed.FetchParams.Add("location", "studio"); calendar.Sources.Add(feed);
            calendar.SaveHtmlPage(Path.Combine(output, "calendar-resource-window" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "Room schedule", Theme = theme, Height = "auto" });
        }
        File.WriteAllText(Path.Combine(output, "calendar-visitors.json"), "[{\"id\":\"welcome\",\"title\":\"Visitor briefing\",\"start\":\"2026-10-16T14:00:00Z\",\"end\":\"2026-10-16T15:00:00Z\",\"resourceIds\":[\"room-1\",\"room-2\"]}]");
    }
}
