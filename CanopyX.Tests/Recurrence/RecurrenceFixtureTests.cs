using Xunit;

namespace CanopyX.Tests.Recurrence;

/// <summary>
/// Every case of tests/fixtures/recurrence-cases.json: the RFC 5545 examples of the supported subset, daylight saving changes,
/// excluded occurrences, the forms of UNTIL and all-day series. The browser runtime checks the same cases.
/// </summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class RecurrenceFixtureTests {
    public static IEnumerable<object[]> CaseNames() => RecurrenceFixture.Cases.Select(item => new object[] { (string)item["name"]! });

    [Fact]
    public void Fixture_CoversTheSharedCases() {
        Assert.True(RecurrenceFixture.Cases.Count >= 40, "The fixture has " + RecurrenceFixture.Cases.Count + " cases.");
        Assert.Equal(RecurrenceFixture.Cases.Count, RecurrenceFixture.Cases.Select(item => (string)item["name"]!).Distinct().Count());
        foreach (var item in RecurrenceFixture.Cases) {
            // A case without "to" must describe a finite series.
            var rule = CanopyRecurrence.Parse(RecurrenceFixture.Text(item, "rule")!);
            Assert.True(RecurrenceFixture.Text(item, "to") != null || rule.Count.HasValue || rule.UntilValue.HasValue, (string)item["name"]!);
        }
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Occurrences_MatchTheSharedCase(string name) {
        var item = RecurrenceFixture.Case(name);
        var zone = RecurrenceFixture.Zone(RecurrenceFixture.Text(item, "zone")!);
        var rule = CanopyRecurrence.Parse(RecurrenceFixture.Text(item, "rule")!);
        var from = Moment(RecurrenceFixture.Text(item, "from"), zone);
        var to = Moment(RecurrenceFixture.Text(item, "to"), zone);
        var exceptions = string.Join(",", RecurrenceFixture.Texts(item, "exceptions"));

        var actual = rule.Occurrences(RecurrenceFixture.Wall(RecurrenceFixture.Text(item, "start")!), zone, from, to, exceptions)
            .Take(10000).Select(RecurrenceFixture.Format).ToList();

        Assert.Equal(RecurrenceFixture.Texts(item, "expected"), actual);
        // The canonical text reads back as the same rule.
        Assert.Equal(rule.ToString(), CanopyRecurrence.Parse(rule.ToString()).ToString());
    }

    /// <summary>A fixture's range bound: a wall time in the case's zone (the bounds avoid daylight saving changes).</summary>
    private static DateTimeOffset? Moment(string? wall, TimeZoneInfo zone) {
        if (wall == null) return null;
        var time = RecurrenceFixture.Wall(wall);
        return new DateTimeOffset(time, zone.GetUtcOffset(time));
    }
}
