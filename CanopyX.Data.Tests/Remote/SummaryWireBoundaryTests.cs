using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Typed provider queries must be representable in the summary's owned wire query.</summary>
public sealed class SummaryWireBoundaryTests {
    [Theory]
    [InlineData("global", true, 3)]
    [InlineData("global", false, 0)]
    [InlineData("and", true, 2)]
    [InlineData("and", false, 0)]
    [InlineData("or", true, 3)]
    [InlineData("or", false, 2)]
    public async Task Summary_RejectsConstantsBeforeProviderCallsWhileQueriesStillWork(string shape, bool value, int matched) {
        var harness = CreateHarness();
        var provider = new RecordingProvider(harness.Provider);
        CanopyFilterNode filter = value ? CanopyFilterConstant.True : CanopyFilterConstant.False;
        if (shape != "global") {
            var condition = new CanopyFilterCondition(harness.Schema.GetColumn("site"), CanopyGridFilterOperator.Equal, new object[] { "A" });
            filter = new CanopyFilterGroup(CanopyGridFilterJunction.All, new[] {
                new CanopyFilterGroup(shape == "and" ? CanopyGridFilterJunction.All : CanopyGridFilterJunction.Any, new[] { condition, filter })
            });
        }
        var query = new CanopyDataRequest(harness.Schema, filter: filter, revision: "r1");
        await AssertSummaryUnsupported(harness, provider, query, matched, "constant filters");
    }

    [Theory]
    [InlineData("include", 1)]
    [InlineData("exclude", 2)]
    public async Task Summary_RejectsIdentityRestrictionsBeforeProviderCallsWhileQueriesStillWork(string scope, int matched) {
        var harness = CreateHarness();
        var provider = new RecordingProvider(harness.Provider);
        var query = new CanopyDataRequest(harness.Schema, revision: "r1").WithIdentities(
            scope == "include" ? new[] { "1" } : null, scope == "exclude" ? new[] { "1" } : null);
        await AssertSummaryUnsupported(harness, provider, query, matched, "identity restrictions");
    }

    [Theory]
    [InlineData("fixed-empty")]
    [InlineData("fixed-column")]
    [InlineData("fixed-direction")]
    [InlineData("fixed-aggregate")]
    [InlineData("ungrouped")]
    public async Task Summary_RejectsUnrepresentableGroupingBeforeProviderCallsWhileQueriesStillWork(string shape) {
        var harness = CreateHarness(grouped: shape != "ungrouped");
        var schema = harness.Schema;
        var provider = new RecordingProvider(harness.Provider);
        var levels = shape == "fixed-empty" ? Array.Empty<CanopySummaryLevel>() : new[] {
            new CanopySummaryLevel(schema.GetColumn(shape == "fixed-column" ? "name" : "site"), shape == "fixed-direction",
                shape == "fixed-aggregate" ? schema.GetAggregate("coreCount") : null)
        };
        var query = new CanopyDataRequest(schema, revision: "r1", levels: levels);
        await AssertSummaryUnsupported(harness, provider, query, 3, "grouping levels");
    }

    [Fact]
    public async Task Summary_ExplicitLevelsMatchingFixedViewRemainRepresentable() {
        var harness = CreateHarness();
        var levels = new[] { new CanopySummaryLevel(harness.Schema.GetColumn("site"), false) };
        var query = new CanopyDataRequest(harness.Schema, revision: "r1", levels: levels);
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(new CanopySummaryRequest(query)));
        Assert.Equal(3, summary.RootElement.GetProperty("matched").GetInt32());
        using var repeated = JsonDocument.Parse(await harness.Handler.SummaryAsync(summary.RootElement.GetProperty("query").GetRawText()));
        Assert.Equal(summary.RootElement.GetProperty("groups").GetRawText(), repeated.RootElement.GetProperty("groups").GetRawText());
    }

    [Fact]
    public async Task Summary_EmptyIdentityExclusionsRemainUnrestricted() {
        var harness = CreateHarness();
        var query = new CanopyDataRequest(harness.Schema, revision: "r1").WithIdentities(null, Array.Empty<string>());
        using var summary = JsonDocument.Parse(await harness.Handler.SummaryAsync(new CanopySummaryRequest(query)));
        Assert.Equal(3, summary.RootElement.GetProperty("matched").GetInt32());
        using var repeated = JsonDocument.Parse(await harness.Handler.SummaryAsync(summary.RootElement.GetProperty("query").GetRawText()));
        Assert.Equal(summary.RootElement.GetProperty("groups").GetRawText(), repeated.RootElement.GetProperty("groups").GetRawText());
    }

    private static async Task AssertSummaryUnsupported(Harness harness, RecordingProvider provider, CanopyDataRequest query, int matched, string boundary) {
        var handler = new CanopyRemoteHandler(harness.Schema, provider);
        using var page = JsonDocument.Parse(await handler.QueryAsync(query));
        Assert.Equal(matched, page.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(matched, page.RootElement.GetProperty("items").GetArrayLength());
        var request = new CanopySummaryRequest(query);
        Assert.Equal(matched, (await harness.Provider.SummarizeAsync(request, CancellationToken.None)).Matched);
        provider.Calls = 0;

        string? response = null;
        var failure = await Record.ExceptionAsync(async () => response = await handler.SummaryAsync(request));
        Assert.True(provider.Calls == 0, "An unrepresentable query reached the provider " + provider.Calls + " times. Failure: " + failure?.Message + "; response: " + response);
        var error = Assert.IsType<CanopyRequestException>(failure);
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
        Assert.Contains(boundary, error.Message);
    }

    private static Harness CreateHarness(bool grouped = true) => new Harness(new[] {
        new Host { Id = 1, Name = "one", Site = "A" },
        new Host { Id = 2, Name = "two", Site = "B" },
        new Host { Id = 3, Name = "three", Site = "A" }
    }, ProviderKind.Reference, grouped: grouped);

    /// <summary>Records the real provider boundary without changing its query or summary results.</summary>
    private sealed class RecordingProvider : ICanopyDataProvider {
        private readonly ICanopyDataProvider _inner;
        public RecordingProvider(ICanopyDataProvider inner) { _inner = inner; }
        public int Calls { get; set; }
        public ValueTask<string> GetRevisionAsync(CancellationToken token) { Calls++; return _inner.GetRevisionAsync(token); }
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken token) { Calls++; return _inner.QueryAsync(request, token); }
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken token) { Calls++; return _inner.CountAsync(request, token); }
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken token) { Calls++; return _inner.ReadAsync(request, token); }
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken token) { Calls++; return _inner.FacetAsync(request, token); }
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken token) { Calls++; return _inner.SummarizeAsync(request, token); }
    }
}
