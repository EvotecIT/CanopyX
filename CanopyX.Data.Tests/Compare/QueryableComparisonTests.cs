using System.Runtime.CompilerServices;
using CanopyX.Data;
using Xunit;

namespace CanopyX.Data.Tests.Compare;

public sealed class QueryableComparisonTests {
    [Fact]
    public async Task CompareAsync_MapsTwoHostProjectedQueriesAndUsesCoreOrdinalJoinAndSourceOrder() {
        var before = new[] { "b", "gone", "a" }.AsQueryable();
        var after = new[] { 3, 1, 2 }.AsQueryable();
        var result = await CanopyQueryableComparison.CompareAsync(before, after,
            key => Row(key, key == "a" ? "old" : key),
            key => Row(key == 1 ? "a" : key == 2 ? "b" : "new", key == 1 ? "new value" : key == 2 ? "b" : "new"));
        Assert.Equal(new[] { "b", "gone", "a", "new" }, result.Rows.Select(row => row.Id));
        Assert.Equal((1, 1, 1, 1), (result.Counts.Added, result.Counts.Removed, result.Counts.Changed, result.Counts.Unchanged));
        Assert.Equal(1, result.ColumnChanges["value"]);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CompareAsync_RejectsOverflowInEitherVersionWithoutReturningPartialComparison(bool earlier) {
        var reads = 0;
        IEnumerable<int> Source() { for (var key = 0; key < 10; key++) { reads++; yield return key; } }
        var many = Source().AsQueryable(); var empty = Array.Empty<int>().AsQueryable();
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => CanopyQueryableComparison.CompareAsync(
            earlier ? many : empty, earlier ? empty : many, key => Row(key.ToString(), "x"), key => Row(key.ToString(), "x"), rowLimit: 2));
        Assert.Contains(earlier ? "before" : "after", error.Message);
        Assert.Equal(3, reads);
    }

    [Fact]
    public async Task CompareAsync_AcceptsExactLimitAndEnumeratesQueriesSequentiallyThroughHostExecutor() {
        using var cancellation = new CancellationTokenSource();
        var executor = new RecordingExecutor();
        var source = new[] { "a", "b" }.AsQueryable();
        var result = await CanopyQueryableComparison.CompareAsync(source, source,
            key => Row(key, key), key => Row(key, key), rowLimit: 2, executor: executor, cancellationToken: cancellation.Token);
        Assert.Equal(2, result.Counts.Unchanged);
        Assert.Equal(new[] { "start", "end", "start", "end" }, executor.Events);
        Assert.All(executor.Tokens, token => Assert.Equal(cancellation.Token, token));
        Assert.All(executor.QueryExpressions, expression => Assert.Contains("Take(3)", expression));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CompareAsync_PropagatesCancellationBeforeReadingAndDuringMapping(bool preCancelled) {
        using var cancellation = new CancellationTokenSource();
        var reads = 0;
        IEnumerable<string> Source() { reads++; yield return "a"; reads++; yield return "b"; }
        if (preCancelled) cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => CanopyQueryableComparison.CompareAsync(Source().AsQueryable(), Source().AsQueryable(),
            key => { cancellation.Cancel(); return Row(key, "value"); }, key => Row(key, "value"), cancellationToken: cancellation.Token));
        Assert.Equal(preCancelled ? 0 : 1, reads);
    }

    [Fact]
    public async Task CompareAsync_RejectsDuplicateMappedKeysNullRowsAndInvalidLimit() {
        var source = new[] { 1, 2 }.AsQueryable();
        await Assert.ThrowsAsync<ArgumentException>(() => CanopyQueryableComparison.CompareAsync(source, source, _ => Row("duplicate", "x"), _ => Row("duplicate", "x")));
        await Assert.ThrowsAsync<InvalidOperationException>(() => CanopyQueryableComparison.CompareAsync(source, source, _ => null!, _ => Row("row", "x")));
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => CanopyQueryableComparison.CompareAsync(source, source, _ => Row("row", "x"), _ => Row("row", "x"), rowLimit: 0));
    }

    private static CanopyGridRow Row(string key, string value) {
        var row = new CanopyGridRow(key); row.Cells["value"] = value; return row;
    }

    private sealed class RecordingExecutor : CanopyQueryExecutor {
        internal List<string> Events { get; } = new List<string>();
        internal List<CancellationToken> Tokens { get; } = new List<CancellationToken>();
        internal List<string> QueryExpressions { get; } = new List<string>();

        public override async IAsyncEnumerable<T> StreamAsync<T>(IQueryable<T> query, [EnumeratorCancellation] CancellationToken cancellationToken) {
            Events.Add("start"); Tokens.Add(cancellationToken); QueryExpressions.Add(query.Expression.ToString());
            await Task.Yield();
            foreach (var value in query) {
                cancellationToken.ThrowIfCancellationRequested();
                yield return value;
            }
            Events.Add("end");
        }
    }
}
