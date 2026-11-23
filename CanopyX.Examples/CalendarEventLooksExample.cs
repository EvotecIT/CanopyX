using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Events with their own tones and addresses, as a report's calendar of changes and tickets uses them
/// (docs/calendar.md#events): a change window in its team's tone, a ticket that opens its page, and a release that opens in
/// a new window. Writes calendar-event-looks.html.
/// </summary>
internal static class CalendarEventLooksExample {
    internal static CanopyCalendar Calendar() {
        DateTime At(int day, int hour) => new DateTime(2026, 10, day, hour, 0, 0, DateTimeKind.Utc);
        var events = new[] {
            new CanopyCalendarEvent("Network change window", At(14, 9), At(14, 12)) { Id = "network", Tone = Tone.Success, Description = "Core switches, one rack at a time." },
            new CanopyCalendarEvent("Database patching", At(15, 13), At(15, 15)) { Id = "database", Tone = Tone.Info, Url = "changes/database-patching.html" },
            new CanopyCalendarEvent("Ticket 4821: certificate renewal", At(16, 10), At(16, 11)) { Id = "ticket", Tone = Tone.Warning, Url = "https://tickets.example.test/4821" },
            new CanopyCalendarEvent("Quarterly release", new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc)) { Id = "release", AllDay = true, Tone = Tone.Named("accent"), Url = "https://releases.example.test/2026-q4" }
        };
        return new CanopyCalendar("event-looks", "Changes and tickets", events) { Date = new DateTime(2026, 10, 16), OpenUrlInNewWindow = true };
    }

    internal static void Write(string output) =>
        Calendar().Save(Path.Combine(output, "calendar-event-looks.html"), new CanopyHtmlOptions { Title = "Changes and tickets", Height = "720px" });
}
