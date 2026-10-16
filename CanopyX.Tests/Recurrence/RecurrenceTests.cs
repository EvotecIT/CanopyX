using Xunit;

namespace CanopyX.Tests.Recurrence;

/// <summary>Recurrence rules: the builder, canonical text, reading rule text, daylight saving moments, exceptions and the series end.</summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class RecurrenceTests {
    [Fact]
    public void Builder_WritesCanonicalText() {
        Assert.Equal("FREQ=DAILY", CanopyRecurrence.Daily().ToString());
        Assert.Equal("FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR;WKST=SU",
            CanopyRecurrence.Weekly(DayOfWeek.Monday, DayOfWeek.Wednesday).On(DayOfWeek.Friday).Every(2).Times(10).WeekStartsOn(DayOfWeek.Sunday).ToString());
        Assert.Equal("FREQ=MONTHLY;BYMONTHDAY=1,-1", CanopyRecurrence.Monthly().OnMonthDays(1, -1).ToString());
        Assert.Equal("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
            CanopyRecurrence.Monthly().On(DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday).AtPositions(-1).ToString());
        Assert.Equal("FREQ=YEARLY;UNTIL=20301231;BYMONTH=11;BYDAY=4TH",
            CanopyRecurrence.Yearly().On(4, DayOfWeek.Thursday).InMonths(11).Until(new DateTime(2030, 12, 31)).ToString());
        Assert.Equal("FREQ=DAILY;UNTIL=20261008T070000Z", CanopyRecurrence.Daily().Until(new DateTimeOffset(2026, 10, 8, 9, 0, 0, TimeSpan.FromHours(2))).ToString());
        Assert.Equal("FREQ=DAILY;UNTIL=20261008T090000", CanopyRecurrence.Daily().Until(new DateTime(2026, 10, 8, 9, 0, 0)).ToString());
        Assert.Equal("FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYMONTHDAY=2,3,4,5,6,7,8;BYDAY=TU",
            CanopyRecurrence.Yearly().Every(4).InMonths(11).OnMonthDays(2, 3, 4, 5, 6, 7, 8).On(DayOfWeek.Tuesday).ToString());
    }

    [Fact]
    public void Builder_RefusesValuesAndCombinationsTheSubsetDoesNotAllow() {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Daily().Every(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Daily().Every(10000));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Daily().Times(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().OnMonthDays(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().OnMonthDays(32));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Yearly().InMonths(13));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().AtPositions(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().AtPositions(367));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().On(0, DayOfWeek.Monday));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Monthly().On(54, DayOfWeek.Monday));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Weekly((DayOfWeek)7));
        Assert.Throws<InvalidOperationException>(() => CanopyRecurrence.Weekly().On(2, DayOfWeek.Monday));
        Assert.Throws<InvalidOperationException>(() => CanopyRecurrence.Daily().On(-1, DayOfWeek.Friday));
        Assert.Throws<InvalidOperationException>(() => CanopyRecurrence.Weekly().OnMonthDays(1));
        Assert.Throws<InvalidOperationException>(() => CanopyRecurrence.Daily().Times(3).Until(new DateTime(2026, 1, 1)));
        Assert.Throws<InvalidOperationException>(() => CanopyRecurrence.Daily().Until(new DateTime(2026, 1, 1)).Times(3));
        Assert.Throws<ArgumentNullException>(() => CanopyRecurrence.Daily().On(null!));
    }

    [Theory]
    [InlineData("FREQ=WEEKLY;BYDAY=MO,WE", "FREQ=WEEKLY;BYDAY=MO,WE")]
    [InlineData("RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "FREQ=WEEKLY;BYDAY=MO,WE")]
    [InlineData("rrule:freq=monthly;byday=-1fr;count=3", "FREQ=MONTHLY;COUNT=3;BYDAY=-1FR")]
    [InlineData("WKST=SU;BYSETPOS=2;BYDAY=TU;BYMONTH=6;INTERVAL=3;FREQ=YEARLY", "FREQ=YEARLY;INTERVAL=3;BYMONTH=6;BYDAY=TU;BYSETPOS=2;WKST=SU")]
    [InlineData("FREQ=DAILY;INTERVAL=1;WKST=MO", "FREQ=DAILY")]
    [InlineData("FREQ=DAILY;UNTIL=2026-10-08", "FREQ=DAILY;UNTIL=20261008")]
    [InlineData("FREQ=DAILY;UNTIL=2026-10-08T09:30:00", "FREQ=DAILY;UNTIL=20261008T093000")]
    [InlineData("FREQ=DAILY;UNTIL=2026-10-08T09:30:00Z", "FREQ=DAILY;UNTIL=20261008T093000Z")]
    [InlineData("FREQ=DAILY;UNTIL=20261008t093000z", "FREQ=DAILY;UNTIL=20261008T093000Z")]
    [InlineData("FREQ=MONTHLY;BYDAY=+2TU", "FREQ=MONTHLY;BYDAY=2TU")]
    [InlineData(" FREQ = YEARLY ; BYMONTH = 1 , 2 ", "FREQ=YEARLY;BYMONTH=1,2")]
    public void Parse_ReadsTheSubsetAndToStringWritesItCanonically(string text, string canonical) {
        Assert.Equal(canonical, CanopyRecurrence.Parse(text).ToString());
        Assert.True(CanopyRecurrence.TryParse(text, out var rule));
        Assert.Equal(canonical, rule!.ToString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("RRULE:")]
    [InlineData("INTERVAL=2")]
    [InlineData("FREQ=HOURLY")]
    [InlineData("FREQ=DAILY;FREQ=WEEKLY")]
    [InlineData("FREQ=DAILY;freq=DAILY")]
    [InlineData("FREQ=DAILY;BYHOUR=9")]
    [InlineData("FREQ=YEARLY;BYYEARDAY=100")]
    [InlineData("FREQ=YEARLY;BYWEEKNO=20")]
    [InlineData("FREQ=DAILY;COUNT=3;UNTIL=20261008")]
    [InlineData("FREQ=DAILY;INTERVAL=0")]
    [InlineData("FREQ=DAILY;INTERVAL=10000")]
    [InlineData("FREQ=DAILY;COUNT=0")]
    [InlineData("FREQ=DAILY;COUNT=x")]
    [InlineData("FREQ=WEEKLY;BYDAY=2MO")]
    [InlineData("FREQ=DAILY;BYDAY=-1FR")]
    [InlineData("FREQ=MONTHLY;BYDAY=0MO")]
    [InlineData("FREQ=MONTHLY;BYDAY=54MO")]
    [InlineData("FREQ=MONTHLY;BYDAY=XX")]
    [InlineData("FREQ=WEEKLY;BYMONTHDAY=1")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=0")]
    [InlineData("FREQ=MONTHLY;BYMONTHDAY=32")]
    [InlineData("FREQ=YEARLY;BYMONTH=13")]
    [InlineData("FREQ=MONTHLY;BYSETPOS=0")]
    [InlineData("FREQ=MONTHLY;BYSETPOS=367")]
    [InlineData("FREQ=WEEKLY;WKST=XX")]
    [InlineData("FREQ=DAILY;UNTIL=20261308")]
    [InlineData("FREQ=DAILY;UNTIL=20261008Z")]
    [InlineData("FREQ=DAILY;UNTIL=tomorrow")]
    [InlineData("FREQ=DAILY;")]
    [InlineData("FREQ=DAILY;COUNT")]
    [InlineData("FREQ=MONTHLY;BYDAY=001MO")]
    [InlineData("FREQ=MONTHLY;BYDAY=-001FR")]
    public void Parse_RefusesTextOutsideTheSubset(string text) {
        Assert.Throws<FormatException>(() => CanopyRecurrence.Parse(text));
        Assert.False(CanopyRecurrence.TryParse(text, out var rule));
        Assert.Null(rule);
    }

    [Fact]
    public void Parse_ReadsRulesUpTo1024Characters_AndKeepsTheTextOutOfItsMessage() {
        var padded = "FREQ=DAILY" + new string(' ', 1024 - 10);
        Assert.Equal(1024, padded.Length);
        Assert.Equal("FREQ=DAILY", CanopyRecurrence.Parse(padded).ToString());
        Assert.False(CanopyRecurrence.TryParse(padded + " ", out _));
        var error = Assert.Throws<FormatException>(() => CanopyRecurrence.Parse("FREQ=HOURLY;X-SECRET=<script>"));
        Assert.DoesNotContain("<script>", error.Message);
    }

    [Fact]
    public void Parse_ExposesTheRuleParts() {
        var rule = CanopyRecurrence.Parse("FREQ=MONTHLY;INTERVAL=2;UNTIL=20261231T235959Z;BYMONTH=1,7;BYMONTHDAY=-1;BYDAY=2TU,FR;BYSETPOS=1,-1;WKST=SU");
        Assert.Equal(CanopyRecurrenceFrequency.Monthly, rule.Frequency);
        Assert.Equal(2, rule.Interval);
        Assert.Null(rule.Count);
        Assert.Equal(new DateTime(2026, 12, 31, 23, 59, 59, DateTimeKind.Utc), rule.UntilValue);
        Assert.Equal(DateTimeKind.Utc, rule.UntilValue!.Value.Kind);
        Assert.False(rule.UntilIsDate);
        Assert.Equal(new[] { 1, 7 }, rule.Months);
        Assert.Equal(new[] { -1 }, rule.MonthDays);
        Assert.Equal(new[] { new CanopyRecurrenceDay(DayOfWeek.Tuesday, 2), new CanopyRecurrenceDay(DayOfWeek.Friday) }, rule.Days);
        Assert.Equal(new[] { 1, -1 }, rule.Positions);
        Assert.Equal(DayOfWeek.Sunday, rule.WeekStart);
        Assert.Equal("2TU", rule.Days[0].ToString());
        Assert.True(CanopyRecurrence.Parse("FREQ=DAILY;UNTIL=20261008").UntilIsDate);
        Assert.Throws<ArgumentNullException>(() => CanopyRecurrence.Parse(null!));
        Assert.False(CanopyRecurrence.TryParse(null, out _));
    }

    [Fact]
    public void Occurrences_SkippedWallTimeKeepsTheOffsetBeforeTheGap_AndARepeatedOneIsTheFirst() {
        var warsaw = RecurrenceFixture.Zone("Europe/Warsaw");
        var spring = CanopyRecurrence.Daily().Times(3).Occurrences(new DateTime(2026, 3, 28, 2, 30, 0), warsaw).ToList();
        Assert.Equal(new DateTimeOffset(2026, 3, 28, 2, 30, 0, TimeSpan.FromHours(1)), spring[0]);
        // 02:30 does not exist on 29 March: it is 02:30 at the winter offset, which the clock shows as 03:30 summer time.
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 3, 30, 0, TimeSpan.FromHours(2)), spring[1]);
        Assert.Equal(TimeSpan.FromHours(2), spring[1].Offset);
        Assert.Equal(new DateTimeOffset(2026, 3, 30, 2, 30, 0, TimeSpan.FromHours(2)), spring[2]);

        var autumn = CanopyRecurrence.Daily().Times(2).Occurrences(new DateTime(2026, 10, 25, 2, 30, 0), warsaw).ToList();
        // 02:30 happens twice on 25 October; the series means the first, still at summer time.
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 2, 30, 0, TimeSpan.FromHours(2)), autumn[0]);
        Assert.Equal(new DateTimeOffset(2026, 10, 26, 2, 30, 0, TimeSpan.FromHours(1)), autumn[1]);

        var york = RecurrenceFixture.Zone("America/New_York");
        var fallBack = CanopyRecurrence.Daily().Times(1).Occurrences(new DateTime(2026, 11, 1, 1, 30, 0), york).Single();
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 1, 30, 0, TimeSpan.FromHours(-4)), fallBack);
    }

    [Fact]
    public void Occurrences_TakeMomentsAsTheirWallTimeInTheZone() {
        var warsaw = RecurrenceFixture.Zone("Europe/Warsaw");
        var fromUtc = CanopyRecurrence.Weekly().Times(2).Occurrences(new DateTime(2026, 3, 23, 8, 0, 0, DateTimeKind.Utc), warsaw).ToList();
        // 09:00 in winter stays 09:00 after the change to summer time.
        Assert.Equal(new[] { new DateTimeOffset(2026, 3, 23, 9, 0, 0, TimeSpan.FromHours(1)), new DateTimeOffset(2026, 3, 30, 9, 0, 0, TimeSpan.FromHours(2)) }, fromUtc);
        var fromOffset = CanopyRecurrence.Weekly().Times(2).Occurrences(new DateTimeOffset(2026, 3, 23, 9, 0, 0, TimeSpan.FromHours(1)), warsaw).ToList();
        Assert.Equal(fromUtc, fromOffset);
    }

    [Fact]
    public void Occurrences_ExceptionsRemoveInstantsAndWholeDays() {
        var utc = TimeZoneInfo.Utc;
        var start = new DateTime(2026, 10, 5, 9, 0, 0);
        var rule = CanopyRecurrence.Daily().Times(6);
        string Days(string? exceptions) => string.Join(" ", rule.Occurrences(start, utc, exceptions: exceptions).Select(item => item.Day));
        Assert.Equal("5 6 7 8 9 10", Days(null));
        Assert.Equal("5 7 9 10", Days("2026-10-06T09:00:00Z, 2026-10-08"));
        Assert.Equal("5 6 7 8 9", Days("2026-10-10T11:00:00+02:00"));
        // A moment that is not an occurrence's start removes nothing; an instant without an offset is a wall time of the zone.
        Assert.Equal("5 6 7 8 9 10", Days("2026-10-06T09:30:00Z"));
        Assert.Equal("6 7 8 9 10", Days("2026-10-05T09:00:00"));
        Assert.Throws<FormatException>(() => rule.Occurrences(start, utc, exceptions: "next tuesday"));
        Assert.Throws<FormatException>(() => rule.Occurrences(start, utc, exceptions: "2026-13-01"));
        // Semicolons separate as commas and white space do; a series takes at most 1,000 exceptions.
        Assert.Equal("5 8 10", Days("2026-10-06;2026-10-07T09:00;2026-10-09T09:00:00.0000000"));
        Assert.Equal("5 6 7 8 9 10", Days(string.Join(";", Enumerable.Repeat("2026-01-01", 1000))));
        Assert.Throws<FormatException>(() => rule.Occurrences(start, utc, exceptions: string.Join(";", Enumerable.Repeat("2026-01-01", 1001))).ToList());
    }

    [Fact]
    public void Occurrences_UntilBeforeTheStart_HaveNone_AndRangesAtTheCalendarsEdgesDoNotOverflow() {
        var utc = TimeZoneInfo.Utc;
        Assert.Empty(CanopyRecurrence.Daily().Until(new DateTime(2026, 10, 1)).Occurrences(new DateTime(2026, 10, 5, 9, 0, 0), utc));
        Assert.Empty(CanopyRecurrence.Daily().Until(new DateTimeOffset(2026, 10, 5, 8, 0, 0, TimeSpan.Zero)).Occurrences(new DateTime(2026, 10, 5, 9, 0, 0), utc));
        Assert.Equal(3, CanopyRecurrence.Yearly().Times(3).Occurrences(new DateTime(2026, 1, 1), utc, DateTimeOffset.MinValue, DateTimeOffset.MaxValue).Count());
        Assert.Equal(2, CanopyRecurrence.Daily().Occurrences(new DateTime(9999, 12, 30), utc, to: DateTimeOffset.MaxValue).Count());
        // COUNT stops the walk at its last occurrence, and the start skips counted dates far before the range.
        Assert.Single(CanopyRecurrence.Yearly().InMonths(2).OnMonthDays(29).Times(2).Occurrences(new DateTime(2024, 2, 29), utc, new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero)));
        Assert.Equal(new[] { 2026 }, CanopyRecurrence.Daily().Times(3000).Occurrences(new DateTime(2020, 1, 1), utc, new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 3, 2, 0, 0, 0, TimeSpan.Zero)).Select(item => item.Year));
    }

    [Fact]
    public void Occurrences_KeepToTheRangeAndCountWhatTheyLeaveOut() {
        var utc = TimeZoneInfo.Utc;
        var rule = CanopyRecurrence.Daily().Times(5);
        var range = rule.Occurrences(new DateTime(2026, 10, 1, 12, 0, 0), utc, new DateTimeOffset(2026, 10, 3, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 10, 10, 0, 0, 0, TimeSpan.Zero));
        Assert.Equal(new[] { 3, 4, 5 }, range.Select(item => item.Day));
        // An endless series is lazy: a range or Take bounds it.
        Assert.Equal(1000, CanopyRecurrence.Daily().Occurrences(new DateTime(2026, 1, 1), utc).Take(1000).Count());
        Assert.Throws<ArgumentNullException>(() => rule.Occurrences(DateTime.UtcNow, null!));
        Assert.Throws<ArgumentException>(() => rule.Occurrences(DateTime.UtcNow, utc, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(-1)));
        // The series start counts first even when the rule would not produce it.
        Assert.Equal(new[] { 1, 6, 13 }, CanopyRecurrence.Weekly(DayOfWeek.Sunday).Times(3).Occurrences(new DateTime(2026, 9, 1), utc).Select(item => item.Day));
        // A rule that never matches again ends at its range.
        Assert.Single(CanopyRecurrence.Yearly().InMonths(2).OnMonthDays(30).Occurrences(new DateTime(2026, 1, 1), utc, to: new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero)));
    }

    [Fact]
    public void SeriesEnd_IsTheEndOfTheLastOccurrence_OrNullForAnEndlessSeries() {
        var warsaw = RecurrenceFixture.Zone("Europe/Warsaw");
        var start = new DateTime(2026, 10, 19, 9, 0, 0);
        Assert.Null(CanopyRecurrence.Weekly().SeriesEnd(start, TimeSpan.FromHours(1), warsaw));
        Assert.Equal(new DateTimeOffset(2026, 11, 2, 10, 0, 0, TimeSpan.FromHours(1)), CanopyRecurrence.Weekly().Times(3).SeriesEnd(start, TimeSpan.FromHours(1), warsaw));
        Assert.Equal(new DateTimeOffset(2026, 10, 27, 10, 30, 0, TimeSpan.FromHours(1)),
            CanopyRecurrence.Daily().Until(new DateTime(2026, 10, 27)).SeriesEnd(start, TimeSpan.FromMinutes(90), warsaw));
        // An excluded last occurrence leaves the one before it last.
        Assert.Equal(new DateTimeOffset(2026, 10, 26, 10, 0, 0, TimeSpan.FromHours(1)),
            CanopyRecurrence.Weekly().Times(3).SeriesEnd(start, TimeSpan.FromHours(1), warsaw, "2026-11-02T09:00:00"));
        Assert.Equal(new DateTimeOffset(2026, 10, 19, 10, 0, 0, TimeSpan.FromHours(2)),
            CanopyRecurrence.Daily().Times(1).SeriesEnd(new DateTimeOffset(2026, 10, 19, 7, 0, 0, TimeSpan.Zero), TimeSpan.FromHours(1), warsaw, "2026-10-19"));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecurrence.Daily().Times(1).SeriesEnd(start, TimeSpan.FromHours(-1), warsaw));
        Assert.Throws<ArgumentNullException>(() => CanopyRecurrence.Daily().SeriesEnd(start, TimeSpan.Zero, null!));
    }

    [Fact]
    public void Day_ComparesAndValidates() {
        Assert.Equal(new CanopyRecurrenceDay(DayOfWeek.Friday, -1), new CanopyRecurrenceDay(DayOfWeek.Friday, -1));
        Assert.True(new CanopyRecurrenceDay(DayOfWeek.Friday, -1) != new CanopyRecurrenceDay(DayOfWeek.Friday));
        Assert.Equal("-1FR", new CanopyRecurrenceDay(DayOfWeek.Friday, -1).ToString());
        Assert.Equal("SU", default(CanopyRecurrenceDay).ToString());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRecurrenceDay(DayOfWeek.Monday, 54));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRecurrenceDay((DayOfWeek)(-1)));
    }
}
