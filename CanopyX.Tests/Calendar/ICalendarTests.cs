using System.Text;
using Xunit;

namespace CanopyX.Tests.Calendar;

/// <summary>iCalendar import: RFC 5545 reading, every limit, malicious text, zones, all-day events, durations and series.</summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class ICalendarTests {
    private const string Marker = "SECRETMARK";

    private static string Calendar(params string[] lines) => "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Example//Test//EN\r\n" + string.Join("\r\n", lines) + "\r\nEND:VCALENDAR\r\n";

    private static string Event(params string[] lines) => "BEGIN:VEVENT\r\n" + string.Join("\r\n", lines) + "\r\nEND:VEVENT";

    private static FormatException Refused(string text) {
        var error = Assert.Throws<FormatException>(() => CanopyICalendar.Parse(text));
        Assert.DoesNotContain(Marker, error.Message);
        Assert.True(error.Message.Length < 120, error.Message);
        return error;
    }

    [Fact]
    public void Parse_ReadsAnRfc5545Calendar() {
        var result = CanopyICalendar.Parse(Calendar(
            "BEGIN:VTIMEZONE", "TZID:America/New_York", "BEGIN:STANDARD", "DTSTART:19671029T020000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "END:STANDARD", "END:VTIMEZONE",
            Event("UID:19970610T172345Z-AF23B2@example.com", "DTSTAMP:19970610T172345Z", "DTSTART;TZID=America/New_York:19970714T170000", "DTEND;TZID=America/New_York:19970715T040000",
                "SUMMARY:Bastille Day Party", "LOCATION:Somewhere", "STATUS:confirmed", "CATEGORIES:PARTY,FUN", "CATEGORIES:SUMMER"),
            Event("UID:utc@example.com", "DTSTART:20261019T090000Z", "SUMMARY:Standup")));
        Assert.Equal(0, result.Skipped);
        Assert.Equal(2, result.Events.Count);
        var party = result.Events[0];
        Assert.Equal("19970610T172345Z-AF23B2@example.com", party.Uid);
        Assert.Equal("Bastille Day Party", party.Summary);
        Assert.Equal("Somewhere", party.Location);
        Assert.Equal(new DateTime(1997, 7, 14, 21, 0, 0, DateTimeKind.Utc), party.Start);
        Assert.Equal(new DateTime(1997, 7, 15, 8, 0, 0, DateTimeKind.Utc), party.End);
        Assert.Equal(DateTimeKind.Utc, party.Start.Kind);
        Assert.False(party.AllDay);
        Assert.Equal("America/New_York", party.TimeZone);
        Assert.Equal("CONFIRMED", party.Status);
        Assert.Equal(new[] { "PARTY", "FUN", "SUMMER" }, party.Categories);
        Assert.Null(result.Events[1].End);
        Assert.Null(result.Events[1].TimeZone);
        Assert.Empty(result.Notes);
    }

    [Fact]
    public void Parse_UnfoldsLines_InEveryLineEnding() {
        foreach (var newline in new[] { "\r\n", "\n", "\r" }) {
            var text = string.Join(newline, "BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART:20261019T090000Z", "SUMMARY:This is a lo", " ng title fol", "\tded twice", "DESCRIPTION:Line one\\nLine two", "END:VEVENT", "END:VCALENDAR");
            var item = Assert.Single(CanopyICalendar.Parse(text).Events);
            Assert.Equal("This is a long title folded twice", item.Summary);
            Assert.Equal("Line one\nLine two", item.Description);
        }
        // Empty lines between content lines are skipped, and property names are case-insensitive.
        var mixed = CanopyICalendar.Parse("begin:vcalendar\n\nBEGIN:VEVENT\n\ndtstart:20261019T090000Z\nsummary:lower\nEND:VEVENT\nEND:VCALENDAR");
        Assert.Equal("lower", Assert.Single(mixed.Events).Summary);
    }

    [Fact]
    public void Parse_UnescapesText_AndSplitsCategoriesAtUnescapedCommas() {
        var item = Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z",
            "SUMMARY:a\\, b\\; c\\\\ d\\Ne", "DESCRIPTION:keep \\x and a trailing backslash \\", "CATEGORIES:one\\,two,three"))).Events);
        Assert.Equal("a, b; c\\ d\ne", item.Summary);
        Assert.Equal("keep \\x and a trailing backslash \\", item.Description);
        Assert.Equal(new[] { "one,two", "three" }, item.Categories);
    }

    [Fact]
    public void Parse_KeepsScriptLikeText_AsPlainText_AndDropsControlCharacters() {
        var item = Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z",
            "SUMMARY:<script>alert('x')</script>\u0000\u0007\u001B[31m\u007F\u0085\uD800 end", "DESCRIPTION:tab\there\\nnew line \"quoted\" <img src=x onerror=alert(1)>"))).Events);
        Assert.Equal("<script>alert('x')</script>[31m� end", item.Summary);
        Assert.Equal("tab\there\nnew line \"quoted\" <img src=x onerror=alert(1)>", item.Description);
        // An emoji (a surrogate pair) is kept.
        Assert.Equal("party 🎉", Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY:party 🎉"))).Events).Summary);
    }

    [Fact]
    public void Parse_RefusesTextThatIsNotACalendar() {
        Assert.Throws<ArgumentNullException>(() => CanopyICalendar.Parse(null!));
        Refused("");
        Refused("BEGIN:VEVENT\r\nDTSTART:20261019T090000Z\r\nSUMMARY:" + Marker + "\r\nEND:VEVENT");
        Refused("<html><body>" + Marker + "</body></html>");
        // A calendar without events is fine; events outside the calendar are not read.
        Assert.Empty(CanopyICalendar.Parse("BEGIN:VCALENDAR\r\nEND:VCALENDAR").Events);
        Assert.Empty(CanopyICalendar.Parse("BEGIN:VEVENT\r\nDTSTART:20261019T090000Z\r\nEND:VEVENT\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR").Events);
    }

    [Fact]
    public void Parse_EnforcesTheSizeLimits() {
        Refused(Calendar(Event("DTSTART:20261019T090000Z", "DESCRIPTION:" + Marker + new string('x', CanopyICalendar.MaxTextLength))));
        var many = new StringBuilder();
        for (var index = 0; index <= CanopyICalendar.MaxEvents; index++) many.Append("BEGIN:VEVENT\r\nDTSTART:20261019T090000Z\r\nEND:VEVENT\r\n");
        Assert.Contains("5,000 events", Refused("BEGIN:VCALENDAR\r\n" + many + "END:VCALENDAR").Message);
        var exactly = new StringBuilder();
        for (var index = 0; index < CanopyICalendar.MaxEvents; index++) exactly.Append("BEGIN:VEVENT\r\nDTSTART:20261019T090000Z\r\nEND:VEVENT\r\n");
        Assert.Equal(CanopyICalendar.MaxEvents, CanopyICalendar.Parse("BEGIN:VCALENDAR\r\n" + exactly + "END:VCALENDAR").Events.Count);
        var lines = new StringBuilder("BEGIN:VCALENDAR\r\n");
        for (var index = 0; index < CanopyICalendar.MaxLines; index++) lines.Append("X-A:").Append(Marker).Append("\r\n");
        Assert.Contains("75,000 lines", Refused(lines + "END:VCALENDAR").Message);
        Assert.Contains("10,000 characters", Refused(Calendar("X-LONG:" + Marker + new string('x', CanopyICalendar.MaxLineLength))).Message);
        // Folding cannot get round the line limit.
        var folded = new StringBuilder("X-FOLDED:" + Marker);
        for (var index = 0; index < 200; index++) folded.Append("\r\n ").Append(new string('y', 70));
        Refused(Calendar(folded.ToString()));
        Assert.Contains("SUMMARY", Refused(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY:" + Marker + new string('s', 1000)))).Message);
        Assert.Contains("LOCATION", Refused(Calendar(Event("DTSTART:20261019T090000Z", "LOCATION:" + Marker + new string('l', 1000)))).Message);
        Assert.Contains("CATEGORIES", Refused(Calendar(Event("DTSTART:20261019T090000Z", "CATEGORIES:" + Marker + new string('c', 1000)))).Message);
        // A description past 10,000 characters also passes the line limit, which refuses it first.
        Refused(Calendar(Event("DTSTART:20261019T090000Z", "DESCRIPTION:" + Marker + new string('d', 9991))));
        Assert.Equal(1000, Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY:" + new string('s', 1000)))).Events).Summary!.Length);
        Assert.Equal(9000, Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "DESCRIPTION:" + new string('d', 9000)))).Events).Description!.Length);
        // Escapes count as the characters they stand for.
        Assert.Equal(1000, Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY:" + new StringBuilder().Insert(0, "\\,", 1000)))).Events).Summary!.Length);
        var exdates = string.Join(",", Enumerable.Range(0, 1001).Select(day => new DateTime(2026, 1, 1).AddDays(day).ToString("yyyyMMdd") + "T090000Z"));
        Refused(Calendar(Event("DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY", "EXDATE:" + exdates)));
        var split = string.Join("\r\n", Enumerable.Range(0, 11).Select(chunk => "EXDATE:" + string.Join(",", Enumerable.Range(chunk * 100, 100).Select(day => new DateTime(2026, 1, 1).AddDays(day).ToString("yyyyMMdd") + "T090000Z"))));
        Assert.Contains("1,000 EXDATE", Refused(Calendar(Event("DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY", split))).Message);
        Assert.Equal(1000, Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY",
            string.Join("\r\n", Enumerable.Range(0, 10).Select(chunk => "EXDATE:" + string.Join(",", Enumerable.Range(chunk * 100, 100).Select(day => new DateTime(2026, 1, 1).AddDays(day).ToString("yyyyMMdd") + "T090000Z"))))))).Events).Exceptions!.Split(',').Length);
    }

    [Fact]
    public void Parse_RefusesDeepNesting_AndIgnoresOtherComponents() {
        var deep = new StringBuilder("BEGIN:VCALENDAR\r\n");
        for (var depth = 0; depth < 20; depth++) deep.Append("BEGIN:X-").Append(Marker).Append(depth).Append("\r\n");
        Assert.Contains("16 deep", Refused(deep.ToString()).Message);
        var nested = new StringBuilder("BEGIN:VCALENDAR\r\n");
        for (var depth = 0; depth < 100000; depth++) nested.Append("BEGIN:VEVENT\r\n");
        Refused(nested.ToString());
        var result = CanopyICalendar.Parse(Calendar(
            "BEGIN:VTODO", "DTSTART:20261019T090000Z", "SUMMARY:Todo", "END:VTODO",
            Event("DTSTART:20261019T090000Z", "SUMMARY:Event", "DESCRIPTION:Event text", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Alarm text", "TRIGGER:-PT15M", "END:VALARM")));
        var item = Assert.Single(result.Events);
        Assert.Equal("Event text", item.Description);
    }

    [Fact]
    public void Parse_SkipsAndCountsBadEvents() {
        var result = CanopyICalendar.Parse(Calendar(
            Event("SUMMARY:No start"),
            Event("DTSTART:2026-10-19", "SUMMARY:Bad start"),
            Event("DTSTART:20261019T250000Z", "SUMMARY:Bad hour"),
            Event("DTSTART:20261019T090000Z", "A line without a colon", "SUMMARY:Broken line"),
            Event("DTSTART:20261019T090000Z", "SUMMARY:Good"),
            "BEGIN:VEVENT", "DTSTART:20261019T090000Z", "SUMMARY:Never closed"));
        Assert.Equal(5, result.Skipped);
        Assert.Equal("Good", Assert.Single(result.Events).Summary);
        // An unclosed event at the end of the text is skipped too.
        Assert.Equal(1, CanopyICalendar.Parse("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261019T090000Z").Skipped);
        // A repeated property keeps its first value.
        Assert.Equal("First", Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY:First", "SUMMARY:Second"))).Events).Summary);
    }

    [Fact]
    public void Parse_ResolvesTimeZones_AndReadsUnknownOnesAsUtc() {
        var result = CanopyICalendar.Parse(Calendar(
            Event("DTSTART;TZID=Europe/Warsaw:20260701T100000", "DTEND;TZID=\"Europe/Warsaw\":20260701T113000", "SUMMARY:Summer"),
            Event("DTSTART;TZID=Europe/Warsaw:20260115T100000", "SUMMARY:Winter"),
            Event("DTSTART;TZID=/Europe/Warsaw:20260115T100000", "SUMMARY:Global id"),
            Event("DTSTART;TZID=Mars/" + Marker + ":20260115T100000", "DTEND;TZID=Mars/" + Marker + ":20260115T110000", "SUMMARY:Unknown"),
            Event("DTSTART;TZID=../../etc/passwd:20260115T100000", "SUMMARY:Traversal"),
            Event("DTSTART:20260115T100000", "SUMMARY:Floating")));
        Assert.Equal(new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc), result.Events[0].Start);
        Assert.Equal(new DateTime(2026, 7, 1, 9, 30, 0, DateTimeKind.Utc), result.Events[0].End);
        Assert.Equal("Europe/Warsaw", result.Events[0].TimeZone);
        Assert.Equal(new DateTime(2026, 1, 15, 9, 0, 0, DateTimeKind.Utc), result.Events[1].Start);
        Assert.Equal(new DateTime(2026, 1, 15, 9, 0, 0, DateTimeKind.Utc), result.Events[2].Start);
        Assert.Equal(new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc), result.Events[3].Start);
        Assert.Null(result.Events[3].TimeZone);
        Assert.Equal(new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc), result.Events[4].Start);
        Assert.Equal(new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc), result.Events[5].Start);
        // One note per event with an unknown zone, naming it by position only.
        Assert.Equal(2, result.Notes.Count);
        Assert.Contains("Event 4", result.Notes[0]);
        Assert.All(result.Notes, note => Assert.DoesNotContain(Marker, note));
        Assert.All(result.Notes, note => Assert.DoesNotContain("passwd", note));
        // A Windows zone name works on Windows, where both test frameworks run.
        if (Environment.OSVersion.Platform == PlatformID.Win32NT) {
            var windows = Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART;TZID=W. Europe Standard Time:20260701T100000"))).Events);
            Assert.Equal(new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc), windows.Start);
        }
    }

    [Fact]
    public void Parse_ResolvesDaylightSavingGapsAndRepeats_AndCapsZoneLookups() {
        var result = CanopyICalendar.Parse(Calendar(
            Event("DTSTART;TZID=Europe/Warsaw:20260329T023000", "SUMMARY:Skipped hour"),
            Event("DTSTART;TZID=Europe/Warsaw:20261025T023000", "SUMMARY:Repeated hour")));
        Assert.Equal(new DateTime(2026, 3, 29, 1, 30, 0, DateTimeKind.Utc), result.Events[0].Start);
        Assert.Equal(new DateTime(2026, 10, 25, 0, 30, 0, DateTimeKind.Utc), result.Events[1].Start);
        Assert.Null(result.TimeZone);
        // After 100 distinct names, further zones are read as UTC.
        var lines = Enumerable.Range(0, 101).Select(index => Event("DTSTART;TZID=Fake/Zone" + index + ":20260701T100000")).ToList();
        lines.Add(Event("DTSTART;TZID=Europe/Warsaw:20260701T100000"));
        var capped = CanopyICalendar.Parse(Calendar(lines.ToArray()));
        Assert.Equal(new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc), capped.Events[101].Start);
        Assert.Equal(101, capped.Notes.Count);
        Assert.Equal("More notes were left out.", capped.Notes[100]);
    }

    [Fact]
    public void Parse_ReadsOnlyEventsDirectlyInsideTheCalendar_AndLimitsAllCategoriesOfAnEvent() {
        var nested = CanopyICalendar.Parse(Calendar("BEGIN:VTODO", Event("DTSTART:20261019T090000Z", "SUMMARY:Inside a todo"), "END:VTODO",
            "BEGIN:VTIMEZONE", Event("DTSTART:20261019T090000Z"), "END:VTIMEZONE"));
        Assert.Empty(nested.Events);
        Assert.Equal(0, nested.Skipped);
        var categories = Enumerable.Range(0, 11).Select(index => "CATEGORIES:" + new string((char)('a' + index), 99) + ",").ToArray();
        Assert.Contains("CATEGORIES", Refused(Calendar(Event(new[] { "DTSTART:20261019T090000Z" }.Concat(categories).ToArray()))).Message);
        Assert.Equal(10, Assert.Single(CanopyICalendar.Parse(Calendar(Event(new[] { "DTSTART:20261019T090000Z" }.Concat(categories.Take(10)).ToArray()))).Events).Categories.Count);
    }

    [Fact]
    public void Parse_ReadsAllDayEvents_WithAnExclusiveEnd() {
        var result = CanopyICalendar.Parse(Calendar(
            Event("DTSTART;VALUE=DATE:20261224", "SUMMARY:One day"),
            Event("DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227", "SUMMARY:Three days"),
            Event("DTSTART:20261224", "DURATION:P2D", "SUMMARY:Two days by duration"),
            Event("DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261224", "SUMMARY:Empty range")));
        Assert.All(result.Events, item => Assert.True(item.AllDay));
        Assert.Equal(new DateTime(2026, 12, 24, 0, 0, 0, DateTimeKind.Utc), result.Events[0].Start);
        Assert.Equal(new DateTime(2026, 12, 25, 0, 0, 0, DateTimeKind.Utc), result.Events[0].End);
        Assert.Equal(new DateTime(2026, 12, 27, 0, 0, 0, DateTimeKind.Utc), result.Events[1].End);
        Assert.Equal(new DateTime(2026, 12, 26, 0, 0, 0, DateTimeKind.Utc), result.Events[2].End);
        Assert.Equal(new DateTime(2026, 12, 25, 0, 0, 0, DateTimeKind.Utc), result.Events[3].End);
        Assert.Null(result.Events[0].TimeZone);
    }

    [Fact]
    public void Parse_ReadsDurations() {
        DateTime? End(string duration) => Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "DURATION:" + duration))).Events).End;
        Assert.Equal(new DateTime(2026, 10, 19, 10, 30, 0, DateTimeKind.Utc), End("PT1H30M"));
        Assert.Equal(new DateTime(2026, 10, 26, 9, 0, 0, DateTimeKind.Utc), End("P1W"));
        Assert.Equal(new DateTime(2026, 10, 20, 9, 0, 45, DateTimeKind.Utc), End("+P1DT45S"));
        Assert.Equal(new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc).AddSeconds(9999999), End("PT9999999S"));
        foreach (var bad in new[] { "-PT1H", "P", "PT", "PT1.5H", "1H", "P1Y", "P9999999W", "PT0S", "PT\u0661H", "P\uFF11D" }) Assert.Null(End(bad));
        // Days keep the wall time across a daylight saving change; hours are exact.
        DateTime? Zoned(string duration) => Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART;TZID=Europe/Warsaw:20261024T120000", "DURATION:" + duration))).Events).End;
        Assert.Equal(new DateTime(2026, 10, 25, 11, 0, 0, DateTimeKind.Utc), Zoned("P1D"));
        Assert.Equal(new DateTime(2026, 10, 25, 10, 0, 0, DateTimeKind.Utc), Zoned("PT24H"));
        Assert.Equal(new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc), Zoned("P1DT1H"));
        // An all-day event ends at a midnight.
        Assert.Equal(new DateTime(2026, 12, 26, 0, 0, 0, DateTimeKind.Utc), Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART;VALUE=DATE:20261224", "DURATION:PT36H"))).Events).End);
        // DTEND wins over DURATION.
        Assert.Equal(new DateTime(2026, 10, 19, 9, 15, 0, DateTimeKind.Utc), Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "DTEND:20261019T091500Z", "DURATION:PT1H"))).Events).End);
    }

    [Fact]
    public void Parse_ReadsRepeatRules_Exceptions_AndOverrides() {
        var result = CanopyICalendar.Parse(Calendar(
            Event("UID:series", "DTSTART;TZID=Europe/Warsaw:20261005T090000", "DTEND;TZID=Europe/Warsaw:20261005T093000", "SUMMARY:Weekly",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z", "EXDATE;TZID=Europe/Warsaw:20261012T090000,20261019T090000", "EXDATE:20261102T080000Z"),
            Event("UID:series", "RECURRENCE-ID;TZID=Europe/Warsaw:20261026T090000", "DTSTART;TZID=Europe/Warsaw:20261026T110000", "SUMMARY:Weekly (moved)"),
            Event("UID:series", "RECURRENCE-ID;TZID=Europe/Warsaw:20261109T090000", "DTSTART;TZID=Europe/Warsaw:20261109T090000", "STATUS:CANCELLED", "SUMMARY:Weekly (cancelled)"),
            Event("UID:days", "DTSTART;VALUE=DATE:20261001", "RRULE:FREQ=DAILY;COUNT=5", "EXDATE;VALUE=DATE:20261003", "SUMMARY:Daily"),
            Event("UID:hourly", "DTSTART:20261001T090000Z", "RRULE:FREQ=HOURLY;BYHOUR=9,10", "EXDATE:20261001T100000Z", "SUMMARY:Unsupported")));
        var weekly = result.Events[0];
        Assert.Equal("FREQ=WEEKLY;UNTIL=20261231T000000Z;BYDAY=MO", weekly.Recurrence);
        Assert.Equal("2026-10-12T07:00:00Z,2026-10-19T07:00:00Z,2026-11-02T08:00:00Z", weekly.Exceptions);
        Assert.Equal(new DateTime(2026, 10, 26, 8, 0, 0, DateTimeKind.Utc), result.Events[1].RecurrenceId);
        Assert.Equal("2026-10-03", result.Events[3].Exceptions);
        Assert.Null(result.Events[4].Recurrence);
        Assert.Null(result.Events[4].Exceptions);
        Assert.Contains(result.Notes, note => note.StartsWith("Event 5", StringComparison.Ordinal));

        // Series repeat in the zone the result names, so the UTC exceptions match the occurrences on both sides of the change.
        Assert.Equal("Europe/Warsaw", result.TimeZone);
        var occurrences = CanopyRecurrence.Parse(weekly.Recurrence!).Occurrences(new DateTimeOffset(weekly.Start), CanopyX.Tests.Recurrence.RecurrenceFixture.Zone(result.TimeZone!),
            null, null, result.ToCalendarEvents()[0].Exceptions).ToList();
        Assert.Equal(8, occurrences.Count);
        Assert.Contains(new DateTimeOffset(2026, 11, 16, 8, 0, 0, TimeSpan.Zero), occurrences);
        Assert.DoesNotContain(new DateTimeOffset(2026, 11, 2, 8, 0, 0, TimeSpan.Zero), occurrences);
        Assert.DoesNotContain(new DateTimeOffset(2026, 10, 26, 8, 0, 0, TimeSpan.Zero), occurrences);
        var events = result.ToCalendarEvents("work");
        // The cancelled override is left out; the moved one is an event of its own.
        Assert.Equal(new[] { "Weekly", "Weekly (moved)", "Daily", "Unsupported" }, events.Select(item => item.Title));
        Assert.Equal("2026-10-12T07:00:00Z,2026-10-19T07:00:00Z,2026-11-02T08:00:00Z,2026-10-26T08:00:00Z,2026-11-09T08:00:00Z", events[0].Exceptions);
        Assert.NotNull(events[0].Recurrence);
        Assert.Null(events[1].Recurrence);
        Assert.All(events, item => Assert.Equal("work", item.Source));
        Assert.True(events[2].AllDay);

        var calendar = new CanopyCalendar(events);
        var json = calendar.Grid!.ToJson();
        Assert.Contains("\"recurrence\":\"FREQ=WEEKLY;UNTIL=20261231T000000Z;BYDAY=MO\"", json);
        Assert.Contains("\"source\":\"work\"", json);
        Assert.Throws<ArgumentException>(() => result.ToCalendarEvents(""));
    }

    [Fact]
    public void ToCalendarEvents_PutsTheLocationUnderTheDescription_AndGivesUntitledEventsAnEmptyTitle() {
        var events = CanopyICalendar.Parse(Calendar(
            Event("DTSTART:20261019T090000Z", "SUMMARY:Review", "DESCRIPTION:Agenda", "LOCATION:Room 4"),
            Event("DTSTART:20261019T090000Z", "LOCATION:Room 5"),
            Event("DTSTART:20261019T090000Z", "STATUS:CANCELLED", "SUMMARY:Gone"))).ToCalendarEvents();
        Assert.Equal(2, events.Count);
        Assert.Equal("Agenda\nRoom 4", events[0].Description);
        Assert.Equal("", events[1].Title);
        Assert.Equal("Room 5", events[1].Description);
        Assert.Null(events[0].Source);
    }

    [Fact]
    public void Parse_ReadsQuotedParameters_AndKeepsColonsInValues() {
        var item = Assert.Single(CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z",
            "SUMMARY;LANGUAGE=en;X-NOTE=\"a;b:c\":Meeting: planning", "DESCRIPTION;ALTREP=\"cid:part1.0001@example.org\":See https://example.org/a?b=c"))).Events);
        Assert.Equal("Meeting: planning", item.Summary);
        Assert.Equal("See https://example.org/a?b=c", item.Description);
        // An unterminated quote makes the line, and so the event, malformed.
        Assert.Equal(1, CanopyICalendar.Parse(Calendar(Event("DTSTART:20261019T090000Z", "SUMMARY;X=\"open:Meeting"))).Skipped);
    }
}
