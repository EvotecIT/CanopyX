using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Date-range answers: LINQ to objects matches the reference byte for byte, and the overlap rules hold at every boundary.</summary>
public sealed class RangeOracleTests {
    private static readonly List<Slot> Slots = Schedule.Slots(700);
    private static readonly DateTime From = Schedule.Epoch;
    private static readonly DateTime To = Schedule.Epoch.AddDays(7);

    [Fact]
    public async Task RandomRanges_LinqMatchesReference() {
        var map = Schedule.Map();
        var reference = Schedule.Reference(map.Schema, Slots);
        var linq = Schedule.Linq(map, Slots);
        var ranges = new RandomRanges(Slots, 41);
        var answers = new Answers();
        for (var i = 0; i < 500; i++) {
            var json = ranges.Next();
            var expected = answers.Note(await LinqOracleTests.Answer(() => reference.RangeAsync(json)));
            Assert.True(expected == await LinqOracleTests.Answer(() => linq.RangeAsync(json)), "Range " + i + " differs: " + json);
        }
        answers.AssertMostlyAnswered(500);
    }

    /// <summary>Hand-placed records around the window [From, To), with what each request must return.</summary>
    internal static List<Slot> Boundaries() {
        Slot Make(string id, DateTime? starts, DateTime? ends = null, string? rule = null, DateTime? seriesEnd = null, string host = "host-1") =>
            new Slot { Id = id, Title = id, Host = host, Kind = "maintenance", Starts = starts, Ends = ends, Rule = rule, SeriesEnd = seriesEnd, Severity = 1 };
        return new List<Slot> {
            Make("a-ends-at-from", From.AddHours(-2), From),
            Make("b-ends-after-from", From.AddHours(-2), From.AddMilliseconds(1)),
            Make("c-marker-at-from", From),
            Make("d-marker-at-to", To),
            Make("e-starts-before-to", To.AddMilliseconds(-1), To.AddDays(2)),
            Make("f-series-ended", From.AddDays(-30), null, "FREQ=DAILY", From.AddDays(-1)),
            Make("g-series-endless", From.AddDays(-30), From.AddDays(-30).AddHours(1), "FREQ=WEEKLY", null),
            Make("h-series-ends-at-from", From.AddDays(-30), null, "FREQ=DAILY", From),
            Make("i-empty-rule", From.AddDays(-3), From.AddDays(-2), "", null),
            Make("j-series-after-to", To, null, "FREQ=DAILY", null),
            Make("k-no-start", null, To),
            Make("l-ends-before-start", From.AddHours(-1), From.AddHours(-5)),
            Make("m-spans-window", From.AddDays(-1), To.AddDays(1), host: "HOST-2"),
            Make("n-marker-inside", From.AddDays(2), host: "host-3"),
            Make("o-marker-inside", From.AddDays(2), host: "host-2"),
            Make("p-series-ends-after-from", From.AddDays(-30), null, "RRULE:FREQ=DAILY", From.AddMilliseconds(1), host: "host-3")
        };
    }

    public static IEnumerable<object[]> BoundaryCases() {
        const string all = ",\"end\":\"ends\",\"recurrence\":\"rule\",\"seriesEnd\":\"seriesEnd\"";
        // Ordered by start, then identity: the series tie on their start, and so do the two markers inside the window.
        yield return new object[] { all, "", 8, new[] { "g-series-endless", "p-series-ends-after-from", "m-spans-window", "b-ends-after-from", "c-marker-at-from", "n-marker-inside", "o-marker-inside", "e-starts-before-to" } };
        // Without a series end every recurring record that starts before the window end overlaps.
        yield return new object[] { ",\"end\":\"ends\",\"recurrence\":\"rule\"", "", 10, new[] { "f-series-ended", "g-series-endless", "h-series-ends-at-from", "p-series-ends-after-from", "m-spans-window", "b-ends-after-from", "c-marker-at-from", "n-marker-inside", "o-marker-inside", "e-starts-before-to" } };
        // Without a recurrence column, recurring records are single events.
        yield return new object[] { ",\"end\":\"ends\"", "", 6, new[] { "m-spans-window", "b-ends-after-from", "c-marker-at-from", "n-marker-inside", "o-marker-inside", "e-starts-before-to" } };
        // Without an end column, only records starting inside the window count.
        yield return new object[] { "", "", 4, new[] { "c-marker-at-from", "n-marker-inside", "o-marker-inside", "e-starts-before-to" } };
        // Resources follow in-predicate semantics: case-insensitive.
        yield return new object[] { all + ",\"resource\":\"host\",\"resources\":[\"host-2\",\"HOST-3\"]", "", 4, new[] { "p-series-ends-after-from", "m-spans-window", "n-marker-inside", "o-marker-inside" } };
        // Limits keep the first records in order and report the rest as truncated.
        yield return new object[] { all, ",\"limit\":3", 8, new[] { "g-series-endless", "p-series-ends-after-from", "m-spans-window" } };
    }

    [Theory]
    [MemberData(nameof(BoundaryCases))]
    public async Task Boundaries_FollowTheOverlapRules(string columns, string extra, int matched, string[] expected) {
        var slots = Boundaries();
        var map = Schedule.Map();
        var json = Schedule.Range(From, To, columns, "{\"sort\":[{\"column\":\"title\",\"direction\":\"desc\"}]}", extra);
        foreach (var handler in new[] { Schedule.Reference(map.Schema, slots), Schedule.Linq(map, slots) }) {
            var answer = Read(await handler.RangeAsync(json));
            Assert.Equal(expected, answer.Ids);
            Assert.Equal(matched, answer.Matched);
            Assert.Equal(expected.Length < matched, answer.Truncated);
        }
    }

    [Fact]
    public async Task Answer_EchoesTheWindowAndRevision() {
        var map = Schedule.Map();
        var answer = await Schedule.Reference(map.Schema, Boundaries()).RangeAsync(Schedule.Range(From, To.AddMilliseconds(250)));
        using var document = JsonDocument.Parse(answer);
        var root = document.RootElement;
        Assert.Equal("gridRangePage", root.GetProperty("type").GetString());
        Assert.Equal("schedule", root.GetProperty("view").GetString());
        Assert.Equal("r1", root.GetProperty("revision").GetString());
        Assert.Equal("2026-10-01T00:00:00Z", root.GetProperty("from").GetString());
        Assert.Equal("2026-10-08T00:00:00.250Z", root.GetProperty("to").GetString());
        Assert.False(root.GetProperty("truncated").GetBoolean());
        Assert.Equal(new[] { "protocol", "type", "view", "revision", "from", "to", "matched", "truncated", "items" }, root.EnumerateObject().Select(property => property.Name));
    }

    internal static (string[] Ids, int Matched, bool Truncated) Read(string answer) {
        using var document = JsonDocument.Parse(answer);
        var root = document.RootElement;
        return (root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray(),
            root.GetProperty("matched").GetInt32(), root.GetProperty("truncated").GetBoolean());
    }
}
