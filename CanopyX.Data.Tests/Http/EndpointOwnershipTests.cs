using System.Text;
using System.Text.Json;
using CanopyX.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>What the endpoint derives from the query callback (the write scope) and what it owns per request (disposal).</summary>
public sealed class EndpointOwnershipTests : IAsyncLifetime {
    private readonly List<Host> _hosts = Fleet.Hosts(30);
    private int _storesDisposed;
    private int _providersDisposed;
    private WebApplication? _app;
    private HttpClient _client = null!;

    public async Task InitializeAsync() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        _app = builder.Build();
        // The caller reads hosts 1 to 10 only, so its commits must not change host 20.
        _app.MapCanopyRemote("/api/hosts", _ => _hosts.Where(host => host.Id <= 10).AsQueryable(), Fleet.Map(Fleet.EditableView()), options => {
            options.AllowAnonymous = true;
            options.AllowAnonymousWrites = true;
            options.Query.Revision = _ => new ValueTask<string>("r1");
            options.UseQueryableWriter(_ => new DisposableStore(_hosts, () => Interlocked.Increment(ref _storesDisposed)),
                (_, writer) => writer.Revision = _ => new ValueTask<string>("r1"));
        });
        var map = Fleet.Map(Fleet.View());
        _app.MapCanopyRemote("/api/custom", map.Schema, _ => new DisposableProvider(new CanopyQueryableProvider<Host>(_hosts.AsQueryable(), map),
            () => Interlocked.Increment(ref _providersDisposed)), options => options.AllowAnonymous = true);
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync() {
        _client.Dispose();
        if (_app != null) await _app.DisposeAsync();
    }

    private Task<HttpResponseMessage> Post(string path, string body) =>
        _client.PostAsync(path, new StringContent(body, Encoding.UTF8, "application/json"));

    [Fact]
    public async Task QueryableWriter_IsScopedToTheReadQuery_AndItsStoreIsDisposed() {
        var body = "{\"revision\":\"r1\",\"rows\":[" +
            "{\"id\":\"2\",\"values\":{\"online\":" + (!_hosts[1].Online).ToString().ToLowerInvariant() + "},\"original\":{\"online\":" + _hosts[1].Online.ToString().ToLowerInvariant() + "}}," +
            "{\"id\":\"20\",\"values\":{\"online\":" + (!_hosts[19].Online).ToString().ToLowerInvariant() + "},\"original\":{\"online\":" + _hosts[19].Online.ToString().ToLowerInvariant() + "}}]}";
        var before = _hosts[19].Online;
        var response = await Post("/api/hosts/commit", body);
        var rows = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("rows");
        Assert.Equal("saved", rows[0].GetProperty("status").GetString());
        Assert.Equal("conflict", rows[1].GetProperty("status").GetString());
        Assert.Equal(before, _hosts[19].Online);
        // Disposal runs as the response completes, which can follow the client reading it.
        Assert.True(SpinWait.SpinUntil(() => Volatile.Read(ref _storesDisposed) == 1, TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public async Task ProvidersFromAFactory_AreDisposedWithTheirRequest() {
        Assert.True((await Post("/api/custom/query", "{}")).IsSuccessStatusCode);
        Assert.True(SpinWait.SpinUntil(() => Volatile.Read(ref _providersDisposed) == 1, TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public void MappingRefuses_RegexOverQueries_AndQueryableWritersWithoutAQuery() {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        using var app = builder.Build();
        var view = Fleet.View(); view.AllowRegexSearch = true;
        Assert.Contains("regex", Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/a", _ => _hosts.AsQueryable(), Fleet.Map(view))).Message);
        var map = Fleet.Map(Fleet.EditableView());
        Assert.Throws<InvalidOperationException>(() => app.MapCanopyRemote("/b", map.Schema, _ => new CanopyQueryableProvider<Host>(_hosts.AsQueryable(), map), options => {
            options.WriteAuthorizationPolicy = "write";
            options.UseQueryableWriter(_ => new DisposableStore(_hosts, () => { }));
        }));
    }

    private sealed class DisposableStore : ICanopyWriteStore<Host>, IDisposable {
        private readonly List<Host> _records;
        private readonly Action _disposed;
        public DisposableStore(List<Host> records, Action disposed) { _records = records; _disposed = disposed; }
        public IQueryable<Host> Records => _records.AsQueryable();
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) => new ValueTask<ICanopyWriteTransaction>(new Nothing());
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) => default;
        public void DiscardChanges() { }
        public void Dispose() => _disposed();
        private sealed class Nothing : ICanopyWriteTransaction {
            public ValueTask CommitAsync(CancellationToken cancellationToken) => default;
            public ValueTask RollbackAsync(CancellationToken cancellationToken) => default;
            public ValueTask DisposeAsync() => default;
        }
    }

    private sealed class DisposableProvider : ICanopyDataProvider, IAsyncDisposable {
        private readonly ICanopyDataProvider _inner;
        private readonly Action _disposed;
        public DisposableProvider(ICanopyDataProvider inner, Action disposed) { _inner = inner; _disposed = disposed; }
        public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) => _inner.GetRevisionAsync(cancellationToken);
        public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.QueryAsync(request, cancellationToken);
        public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.CountAsync(request, cancellationToken);
        public IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken) => _inner.ReadAsync(request, cancellationToken);
        public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) => _inner.FacetAsync(request, cancellationToken);
        public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) => _inner.SummarizeAsync(request, cancellationToken);
        public ValueTask DisposeAsync() { _disposed(); return default; }
    }
}
