using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;

namespace CanopyX.Data.Tests;

public sealed class RemoteRevisionTests {
    private const string Query = "{\"revision\":\"r1\",\"limit\":2}";
    private const string Export = "{\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},\"columns\":[\"name\"],\"recordCount\":2}";
    private readonly ITestOutputHelper _output;

    public RemoteRevisionTests(ITestOutputHelper output) { _output = output; }

    [Theory]
    [InlineData("query")]
    [InlineData("initialQuery")]
    [InlineData("facet")]
    [InlineData("summary")]
    public async Task Read_RevisionChangesDuringProviderAwait_RejectsResultWithUnchangedCounts(string operation) {
        var fixture = new RevisionFixture(operation == "initialQuery" ? "query" : operation);
        var pending = Read(fixture.Handler, operation);
        await fixture.Provider.Entered.Task;
        fixture.ChangeValues();
        fixture.Provider.Resume.SetResult(true);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(async () => {
            var json = await pending;
            _output.WriteLine("Incorrectly accepted changed data: " + json);
        });
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
        Assert.Equal(2, fixture.Hosts.Count);
    }

    [Fact]
    public async Task Export_RevisionChangesDuringCount_RejectsBeforeCreatingJob() {
        var fixture = new RevisionFixture("count");
        var pending = fixture.Handler.PrepareExportAsync(Export, "csv");
        await fixture.Provider.Entered.Task;
        fixture.ChangeValues();
        fixture.Provider.Resume.SetResult(true);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(async () => await pending);
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
    }

    [Fact]
    public async Task Export_RevisionChangesAfterPreparation_RejectsBeforeWritingBytes() {
        var fixture = new RevisionFixture();
        var job = await fixture.Handler.PrepareExportAsync(Export, "csv");
        fixture.ChangeValues();
        using var stream = new MemoryStream();
        var error = await Assert.ThrowsAsync<CanopyRequestException>(() => job.WriteAsync(stream));
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
        Assert.Equal(0, stream.Length);
    }

    [Fact]
    public async Task Export_RevisionChangesDuringEnumeration_RejectsCompleteCountFile() {
        var fixture = new RevisionFixture("read");
        var job = await fixture.Handler.PrepareExportAsync(Export, "csv");
        using var stream = new MemoryStream();
        var pending = job.WriteAsync(stream);
        await fixture.Provider.Entered.Task;
        fixture.ChangeValues();
        fixture.Provider.Resume.SetResult(true);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(async () => await pending);
        Assert.Equal(CanopyRequestError.StaleRevision, error.Error);
        // Equal counts are insufficient: a transport must fail a file already written from changed values.
        Assert.Equal(2, fixture.Provider.ReadCount);
        Assert.True(stream.Length > 0);
    }

    [Fact]
    public async Task Query_CanceledWhileProviderIgnoresToken_DoesNotPublishPage() {
        var fixture = new RevisionFixture("query");
        using var cancellation = new CancellationTokenSource();
        var pending = fixture.Handler.QueryAsync(Query, cancellation.Token);
        await fixture.Provider.Entered.Task;
        cancellation.Cancel();
        fixture.Provider.Resume.SetResult(true);
        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await pending);
        Assert.Equal(cancellation.Token, error.CancellationToken);
    }

    [Theory]
    [InlineData("query", "gridPage")]
    [InlineData("facet", "gridFacetPage")]
    [InlineData("summary", "gridSummary")]
    public async Task Read_StableRevision_ReturnsCurrentDocument(string operation, string type) {
        var fixture = new RevisionFixture();
        using var document = JsonDocument.Parse(await Read(fixture.Handler, operation));
        var root = document.RootElement;
        Assert.Equal(type, root.GetProperty("type").GetString());
        Assert.Equal("r1", root.GetProperty("revision").GetString());
        Assert.Equal(2, root.GetProperty("matched").GetInt32());
    }

    [Fact]
    public async Task Export_StableRevision_WritesAllRowsAndLeavesOutputOpen() {
        var fixture = new RevisionFixture();
        var job = await fixture.Handler.PrepareExportAsync(Export, "csv");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        var csv = Encoding.UTF8.GetString(stream.ToArray());
        Assert.Contains("alpha\r\n", csv);
        Assert.Contains("beta\r\n", csv);
        Assert.Equal(2, fixture.Provider.ReadCount);
        Assert.True(stream.CanWrite);
    }

    private static Task<string> Read(CanopyRemoteHandler handler, string operation) => operation switch {
        "query" => handler.QueryAsync(Query),
        "initialQuery" => handler.QueryAsync("{\"limit\":2}"),
        "facet" => handler.FacetAsync("{\"column\":\"site\",\"query\":" + Query + "}"),
        "summary" => handler.SummaryAsync(Query),
        _ => throw new ArgumentOutOfRangeException(nameof(operation))
    };

    private sealed class RevisionFixture {
        internal RevisionFixture(string? pause = null) {
            Hosts = new List<Host> {
                new Host { Id = 1, Name = "alpha", Site = "Oslo", Memory = 1, Cores = 2 },
                new Host { Id = 2, Name = "beta", Site = "Oslo", Memory = 2, Cores = 4 }
            };
            var harness = new Harness(Hosts, ProviderKind.Linq, grouped: true);
            Provider = new PausingProvider(harness.Provider, pause);
            Handler = new CanopyRemoteHandler(harness.Schema, Provider);
        }

        internal List<Host> Hosts { get; }
        internal PausingProvider Provider { get; }
        internal CanopyRemoteHandler Handler { get; }

        internal void ChangeValues() {
            Hosts[1].Name = "changed-name";
            Hosts[1].Site = "Berlin";
            Hosts[1].Memory = 20;
            Provider.Revision = "r2";
        }
    }

    // This is a provider boundary that deliberately ignores cancellation, as a remote/custom provider may do.
    // Gates control actual awaits without timers; the normal LINQ provider still supplies all counts and values.
    private sealed class PausingProvider : ICanopyDataProvider {
        private readonly ICanopyDataProvider _inner;
        private readonly string? _pause;

        internal PausingProvider(ICanopyDataProvider inner, string? pause) { _inner = inner; _pause = pause; }
        internal string Revision { get; set; } = "r1";
        internal int ReadCount { get; private set; }
        internal TaskCompletionSource<bool> Entered { get; } = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource<bool> Resume { get; } = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => new ValueTask<string>(Revision);

        public async ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
            await Pause("query");
            return await _inner.QueryAsync(request, CancellationToken.None);
        }

        public async ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
            var count = await _inner.CountAsync(request, CancellationToken.None);
            await Pause("count");
            return count;
        }

        public async IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, [EnumeratorCancellation] CancellationToken cancellationToken) {
            await foreach (var row in _inner.ReadAsync(request, CancellationToken.None)) {
                if (ReadCount == 1) await Pause("read");
                ReadCount++;
                yield return row;
            }
        }

        public async ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) {
            await Pause("facet");
            return await _inner.FacetAsync(request, CancellationToken.None);
        }

        public async ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) {
            await Pause("summary");
            return await _inner.SummarizeAsync(request, CancellationToken.None);
        }

        private async Task Pause(string operation) {
            if (_pause != operation) return;
            Entered.SetResult(true);
            await Resume.Task;
        }
    }
}
