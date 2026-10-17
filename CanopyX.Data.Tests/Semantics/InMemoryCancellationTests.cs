using System.Globalization;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Cancellation belongs to every public in-memory operation, including the host's synchronous source callbacks.</summary>
public sealed class InMemoryCancellationTests {
    public static TheoryData<string, string> LoadCancellationCases {
        get {
            var cases = new TheoryData<string, string>();
            foreach (var operation in new[] { "query", "count", "facet", "summary", "export" })
                foreach (var stage in new[] { "move", "value" }) cases.Add(operation, stage);
            return cases;
        }
    }

    [Theory, MemberData(nameof(LoadCancellationCases))]
    public async Task CancellationDuringSourceWork_StopsBeforeTheNextAccessorOrRecord(string operation, string stage) {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture(stage, cancellation);

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => fixture.Run(operation, cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.Equal(stage == "move" ? 2 : 1, fixture.Moves);
        Assert.Equal(stage == "move" ? 3 : 1, fixture.Values);
        Assert.Equal(stage == "move" ? 1 : 0, fixture.Ids);
        Assert.Equal(1, fixture.Disposals);
    }

    [Theory]
    [InlineData("factory", 0, 0, 0)]
    [InlineData("id", 1, 3, 1)]
    [InlineData("empty-end", 0, 0, 0)]
    public async Task SharedSourceBoundaries_DoNotReturnAQueryAfterCancellation(string stage, int moves, int values, int ids) {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture(stage, cancellation);

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => fixture.Run("query", cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.Equal(moves, fixture.Moves);
        Assert.Equal(values, fixture.Values);
        Assert.Equal(ids, fixture.Ids);
        Assert.Equal(stage == "factory" ? 0 : 1, fixture.Disposals);
    }

    [Fact]
    public async Task RevisionCancellation_IsObservedAfterTheHostReturns() {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture("revision", cancellation);

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await fixture.Provider.GetRevisionAsync(cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.Equal(0, fixture.Moves);
    }

    [Fact]
    public async Task PreCanceledRequest_DoesNotInvokeTheSource() {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture("none", cancellation);
        cancellation.Cancel();

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => fixture.Run("query", cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.Equal(0, fixture.Factories);
    }

    [Fact]
    public async Task UncanceledOperations_PreserveWindowsFacetsGroupsAndExportOrder() {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture("none", cancellation);
        var query = CanopyRequestParser.ParseQuery("{\"offset\":1,\"limit\":2,\"sort\":[{\"column\":\"value\",\"direction\":\"desc\"}]}", fixture.Schema);
        var page = await fixture.Provider.QueryAsync(query, cancellation.Token);
        Assert.Equal(4, page.Total);
        Assert.Equal(4, page.Matched);
        Assert.Equal(new[] { "3", "2" }, page.Rows.Select(row => row.Id));
        Assert.Equal(4, await fixture.Provider.CountAsync(query, cancellation.Token));
        var facet = await fixture.Provider.FacetAsync(CanopyRequestParser.ParseFacet("{\"column\":\"group\",\"query\":{\"revision\":\"r1\"}}", fixture.Schema), cancellation.Token);
        Assert.Equal(4, facet.Matched);
        Assert.Equal(2, facet.TotalValues);
        Assert.Equal(new[] { "A", "B" }, facet.Items.Select(item => item.Value));
        Assert.Equal(new[] { 2, 2 }, facet.Items.Select(item => item.Count));
        var summary = await fixture.Provider.SummarizeAsync(CanopyRequestParser.ParseSummary("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"group\",\"direction\":\"asc\"}]}", fixture.Schema), cancellation.Token);
        Assert.Equal(4, summary.Matched);
        Assert.Equal(10, summary.Aggregates["sum"]);
        Assert.Equal(new double?[] { 4d, 6d }, summary.Groups.Select(group => group.Aggregates["sum"]));
        var exported = new List<string>();
        await foreach (var row in fixture.Provider.ReadAsync(query, cancellation.Token)) exported.Add(row.Id);
        Assert.Equal(new[] { "3", "2" }, exported);
    }

    [Fact]
    public async Task AccessorFailures_KeepTheOriginalExceptionAndDisposeTheSource() {
        using var cancellation = new CancellationTokenSource();
        var fixture = new Fixture("error", cancellation);

        var error = await Record.ExceptionAsync(() => fixture.Run("query", cancellation.Token));

        Assert.Same(fixture.Failure, error);
        Assert.Equal(1, fixture.Moves);
        Assert.Equal(1, fixture.Values);
        Assert.Equal(1, fixture.Disposals);
    }

    private sealed class Fixture {
        private readonly string _stage;
        private readonly CancellationTokenSource _cancellation;
        private static readonly Entry[] Entries = {
            new Entry(3, "Gamma", "A"), new Entry(1, "Alpha", "A"), new Entry(2, "Beta", "B"), new Entry(4, "Delta", "B")
        };
        internal Fixture(string stage, CancellationTokenSource cancellation) {
            _stage = stage; _cancellation = cancellation;
            var view = new CanopyDataGridView("cancel", "Cancellation") { Source = CanopyGridSource.HostedOffset() };
            view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
            view.Columns.Add(new CanopyColumn("group", "Group") { Sortable = true });
            view.Columns.Add(new CanopyColumn("value", "Value") { Sortable = true, Kind = CanopyColumnKind.Number });
            view.Reporting = new CanopyGridReporting { Groupable = true };
            view.Reporting.FacetColumns.Add("group");
            view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "value", CanopyGridAggregateOperation.Sum, "Sum"));
            Schema = new CanopyDataSchema(view);
            Provider = new CanopyInMemoryProvider<Entry>(Schema, Source, item => {
                Ids++;
                if (_stage == "id") _cancellation.Cancel();
                return item.Id.ToString(CultureInfo.InvariantCulture);
            }, new Dictionary<string, Func<Entry, object?>> {
                ["name"] = item => Value(item.Name), ["group"] = item => Value(item.Group), ["value"] = item => Value(item.Id)
            }, () => { if (_stage == "revision") _cancellation.Cancel(); return "r1"; });
        }
        internal CanopyDataSchema Schema { get; }
        internal CanopyInMemoryProvider<Entry> Provider { get; }
        internal int Factories { get; private set; }
        internal int Moves { get; private set; }
        internal int Values { get; private set; }
        internal int Ids { get; private set; }
        internal int Disposals { get; private set; }
        internal Exception Failure { get; } = new InvalidOperationException("Accessor unavailable.");
        private object Value(object value) {
            Values++;
            if (_stage == "value" && Values == 1) _cancellation.Cancel();
            if (_stage == "error") throw Failure;
            return value;
        }
        private IEnumerable<Entry> Source() {
            Factories++;
            if (_stage == "factory") _cancellation.Cancel();
            return Enumerate();
        }
        private IEnumerable<Entry> Enumerate() {
            try {
                if (_stage == "empty-end") { _cancellation.Cancel(); yield break; }
                foreach (var item in Entries) {
                    Moves++;
                    if (_stage == "move" && Moves == 2) _cancellation.Cancel();
                    yield return item;
                }
            } finally { Disposals++; }
        }
        internal async Task Run(string operation, CancellationToken token) {
            var query = CanopyRequestParser.ParseQuery("{}", Schema);
            switch (operation) {
                case "query": await Provider.QueryAsync(query, token); break;
                case "count": await Provider.CountAsync(query, token); break;
                case "facet": await Provider.FacetAsync(CanopyRequestParser.ParseFacet("{\"column\":\"group\",\"query\":{\"revision\":\"r1\"}}", Schema), token); break;
                case "summary": await Provider.SummarizeAsync(CanopyRequestParser.ParseSummary("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"group\",\"direction\":\"asc\"}]}", Schema), token); break;
                case "export": await foreach (var _ in Provider.ReadAsync(query, token)) { } break;
                default: throw new ArgumentOutOfRangeException(nameof(operation));
            }
        }
    }

    private sealed class Entry {
        internal Entry(int id, string name, string group) { Id = id; Name = name; Group = group; }
        internal int Id { get; }
        internal string Name { get; }
        internal string Group { get; }
    }
}
