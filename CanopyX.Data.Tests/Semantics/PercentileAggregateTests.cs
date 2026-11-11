using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Medians and percentiles: the in-memory provider ranks every group's values; a translated query answers groups and
/// totals as unsupported rather than reading the whole table.</summary>
public sealed class PercentileAggregateTests {
    private static readonly List<Host> Hosts = new() {
        new Host { Id = 1, Name = "a", Site = "x", Memory = 1 }, new Host { Id = 2, Name = "b", Site = "x", Memory = 2 },
        new Host { Id = 3, Name = "c", Site = "x", Memory = 3 }, new Host { Id = 4, Name = "d", Site = "x", Memory = 4 },
        new Host { Id = 5, Name = "e", Site = "x", Memory = 10 }, new Host { Id = 6, Name = "f", Site = "y", Memory = 8 }
    };

    private static CanopyDataGridView View() {
        var view = Fleet.View(); view.Reporting!.Groupable = true;
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("memoryMedian", "memory", CanopyGridAggregateOperation.Median, "Memory"));
        view.Reporting.Aggregates.Add(CanopyGridAggregate.AtPercentile("memoryP90", "memory", 90, "Memory"));
        return view;
    }

    [Fact]
    public async Task InMemorySummary_RanksEveryGroupAndTheTotal() {
        var harness = new Harness(Hosts, ProviderKind.Reference, view: View());
        var root = JsonDocument.Parse(await harness.Handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"asc\"}]}")).RootElement;
        // All six: 1, 2, 3, 4, 8, 10. The median falls between ranks 2 and 3; P90 at rank 4.5 between 8 and 10.
        Assert.Equal(3.5, root.GetProperty("aggregates").GetProperty("memoryMedian").GetDouble());
        Assert.Equal(9, root.GetProperty("aggregates").GetProperty("memoryP90").GetDouble(), 12);
        var groups = root.GetProperty("groups").EnumerateArray().ToList();
        Assert.Equal(3, groups[0].GetProperty("aggregates").GetProperty("memoryMedian").GetDouble());
        Assert.Equal(7.6, groups[0].GetProperty("aggregates").GetProperty("memoryP90").GetDouble(), 12);
        Assert.Equal(8, groups[1].GetProperty("aggregates").GetProperty("memoryP90").GetDouble());
    }

    [Fact]
    public async Task TranslatedQuerySummary_AnswersUnsupported() {
        var view = View(); var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(Hosts.AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"asc\"}]}"));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        Assert.Contains("percentile", error.Message, StringComparison.Ordinal);
    }
}
