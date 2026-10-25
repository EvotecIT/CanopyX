using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class PivotSqlServerTranslationTests {
    [Theory]
    [InlineData(2, false)]
    [InlineData(4, false)]
    [InlineData(4, true)]
    public async Task PivotAllBuiltinsAndNestedCompositeKeysTranslateAsOneGroupedSelect(int rows, bool buckets) {
        using var database = new FleetDb(new DbContextOptionsBuilder<FleetDb>()
            .UseSqlServer("Server=translation-only.invalid;Database=canopyx;Integrated Security=true;TrustServerCertificate=true").Options);
        var view = PivotQueryTests.View(); var definition = PivotQueryTests.Definition(view, rows, 3);
        if (buckets) {
            definition.Rows[0] = new CanopyGridGroupLevel("lastSeen", bucket: CanopyBucket.Calendar(CanopyBucketKind.Month));
            definition.Columns[0] = new CanopyGridGroupLevel("memory", bucket: CanopyBucket.FixedWidth(10));
        }
        var map = Fleet.Map(view); var executor = new TranslationOnlyExecutor();
        var options = PivotQueryTests.Options(); options.Executor = executor;
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, options);
        const string query = """
            {"revision":"r1","filters":[{"column":"memory","operator":"ge","values":[0]}],
             "tupleFilters":[{"columns":[{"column":"site"},{"column":"online"}],"values":[["East",true],[null,false]],"exclude":true}]}
            """;
        var request = new CanopyPivotRequest(CanopyRequestParser.ParseQuery(query, map.Schema), definition);
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        await handler.PivotAsync(request);
        var sql = Assert.Single(executor.Queries);
        Assert.Contains("SELECT", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("GROUP BY", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("COUNT(", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("COUNT(DISTINCT", sql, StringComparison.OrdinalIgnoreCase);
        foreach (var aggregate in new[] { "SUM(", "AVG(", "MIN(", "MAX(" }) Assert.Contains(aggregate, sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("WHERE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("IS NULL", sql, StringComparison.OrdinalIgnoreCase);
        if (buckets) { Assert.Contains("DATEPART", sql, StringComparison.OrdinalIgnoreCase); Assert.Contains("FLOOR", sql, StringComparison.OrdinalIgnoreCase); }
    }

    private sealed class TranslationOnlyExecutor : CanopyQueryExecutor {
        internal List<string> Queries { get; } = new();
        public override Task<List<TSource>> ToListAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            Queries.Add(query.ToQueryString());
            return Task.FromResult(new List<TSource>());
        }
        public override Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Pivot translation must not issue a separate count or execute a database query.");
        public override IAsyncEnumerable<TSource> StreamAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Translation qualification must never connect or stream database rows.");
    }
}
