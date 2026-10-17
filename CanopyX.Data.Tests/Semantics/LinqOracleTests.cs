using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Random queries give byte-identical documents from LINQ to objects and from the reference implementation.</summary>
public sealed class LinqOracleTests {
    private static readonly List<Host> Hosts = Fleet.Hosts(600);

    [Fact]
    public async Task RandomQueries_LinqMatchesReference() {
        var reference = new Harness(Hosts, ProviderKind.Reference);
        var linq = new Harness(Hosts, ProviderKind.Linq);
        var queries = new RandomQueries(Hosts, 11);
        var answers = new Answers();
        for (var i = 0; i < 400; i++) {
            var json = queries.Query(40);
            Assert.True(answers.Note(await Answer(() => reference.Handler.QueryAsync(json))) == await Answer(() => linq.Handler.QueryAsync(json)), "Query " + i + " differs: " + json);
        }
        answers.AssertMostlyAnswered(400);
    }

    [Fact]
    public async Task RandomFacets_LinqMatchesReference() {
        var reference = new Harness(Hosts, ProviderKind.Reference);
        var linq = new Harness(Hosts, ProviderKind.Linq);
        var queries = new RandomQueries(Hosts, 12);
        var columns = new[] { "site", "os", "online", "cores", "owner", "memory", "lastSeen" };
        for (var i = 0; i < 150; i++) {
            var query = queries.Query(0).Replace("\"view\":\"fleet\"", "\"view\":\"fleet\",\"revision\":\"r1\"");
            var column = columns[i % columns.Length];
            var search = i % 3 == 0 && column != "lastSeen" ? (column == "cores" ? "6" : "O") : "";
            var json = "{\"column\":\"" + column + "\",\"search\":\"" + search + "\",\"limit\":" + (1 + i % 7) + ",\"includeCurrentFilter\":" + (i % 2 == 0 ? "true" : "false") + ",\"query\":" + query + "}";
            Assert.True(await Answer(() => reference.Handler.FacetAsync(json)) == await Answer(() => linq.Handler.FacetAsync(json)), "Facet " + i + " differs: " + json);
        }
    }

    [Fact]
    public async Task RandomSummariesAndGroupedPages_LinqMatchesReference() {
        var reference = new Harness(Hosts, ProviderKind.Reference, grouped: true);
        var linq = new Harness(Hosts, ProviderKind.Linq, grouped: true);
        var queries = new RandomQueries(Hosts, 13);
        var answers = new Answers();
        for (var i = 0; i < 120; i++) {
            var page = queries.Query(300, sortGroupingFirst: true);
            Assert.True(answers.Note(await Answer(() => reference.Handler.QueryAsync(page))) == await Answer(() => linq.Handler.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
            var summary = page.Replace("\"view\":\"fleet\"", "\"view\":\"fleet\",\"revision\":\"r1\"");
            var expected = await Answer(() => reference.Handler.SummaryAsync(summary));
            var actual = await Answer(() => linq.Handler.SummaryAsync(summary));
            AssertSameSummary(expected, actual, "Summary " + i + " differs: " + summary);
        }
        answers.AssertMostlyAnswered(120);
    }

    [Fact]
    public async Task ManySmallGroups_ReadInOneRankedQuery_MatchReference() {
        var view = Fleet.View(grouped: true, groupColumn: "memory");
        var reference = new Harness(Hosts, ProviderKind.Reference, view: view);
        var linq = new Harness(Hosts, ProviderKind.Linq, view: Fleet.View(grouped: true, groupColumn: "memory"));
        var random = new Random(5);
        for (var i = 0; i < 40; i++) {
            var page = "{\"offset\":" + random.Next(0, 550) + ",\"limit\":" + random.Next(1, 60) + ",\"sort\":[{\"column\":\"name\",\"direction\":\"desc\"}]}";
            Assert.True(await Answer(() => reference.Handler.QueryAsync(page)) == await Answer(() => linq.Handler.QueryAsync(page)), "Grouped page " + i + " differs: " + page);
        }
        var summary = "{\"revision\":\"r1\",\"filters\":[{\"column\":\"online\",\"operator\":\"eq\",\"values\":[true]}]}";
        AssertSameSummary(await Answer(() => reference.Handler.SummaryAsync(summary)), await Answer(() => linq.Handler.SummaryAsync(summary)), "Memory summary differs");
    }

    /// <summary>The document, or the rejection code, so rejected queries also have to agree.</summary>
    internal static async Task<string> Answer(Func<Task<string>> run) {
        try {
            return await run();
        } catch (CanopyRequestException error) {
            return "rejected:" + error.Code;
        }
    }

    private const string AggregateNumber = "(?<=\"(memorySum|memoryAvg)\":)-?[0-9.eE+-]+";

    /// <summary>Compensated and plain summation may differ in the last bits: the documents must match with aggregate sums and
    /// averages masked, and those numbers must agree to a relative 1e-9.</summary>
    internal static void AssertSameSummary(string expected, string actual, string message) {
        string Masked(string json) => System.Text.RegularExpressions.Regex.Replace(json, AggregateNumber, "#");
        double[] Numbers(string json) => System.Text.RegularExpressions.Regex.Matches(json, AggregateNumber).Cast<System.Text.RegularExpressions.Match>()
            .Select(match => double.Parse(match.Value, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        Assert.True(Masked(expected) == Masked(actual), message);
        var left = Numbers(expected);
        var right = Numbers(actual);
        Assert.Equal(left.Length, right.Length);
        for (var i = 0; i < left.Length; i++) Assert.True(Math.Abs(left[i] - right[i]) <= 1e-9 * Math.Max(1, Math.Abs(left[i])), message);
    }
}