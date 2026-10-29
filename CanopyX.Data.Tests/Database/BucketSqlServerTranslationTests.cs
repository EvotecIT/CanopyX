using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class BucketSqlServerTranslationTests {
    [Theory]
    [InlineData(CanopyBucketKind.Day)]
    [InlineData(CanopyBucketKind.Week)]
    [InlineData(CanopyBucketKind.Month)]
    [InlineData(CanopyBucketKind.Quarter)]
    [InlineData(CanopyBucketKind.Year)]
    [InlineData(CanopyBucketKind.Hour)]
    [InlineData(CanopyBucketKind.Weekday)]
    [InlineData(CanopyBucketKind.Width)]
    [InlineData(CanopyBucketKind.Edges)]
    public async Task BucketGroupKeysTranslateToSqlServerWithoutClientEvaluation(CanopyBucketKind kind) {
        using var database = new FleetDb(new DbContextOptionsBuilder<FleetDb>().UseSqlServer("Server=translation-only.invalid;Database=canopyx;Integrated Security=true;TrustServerCertificate=true").Options);
        var view = Fleet.View(); view.Reporting!.Groupable = true;
        var bucket = kind == CanopyBucketKind.Width ? CanopyBucket.FixedWidth(10) : kind == CanopyBucketKind.Edges ? CanopyBucket.ExplicitEdges(-10, 0, 10) : CanopyBucket.Calendar(kind);
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel(kind >= CanopyBucketKind.Width ? "memory" : "lastSeen", bucket: bucket));
        var map = Fleet.Map(view); var capture = new TranslationExecutor();
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Executor = capture });
        var request = new CanopySummaryRequest(CanopyRequestParser.ParseQuery("{}", map.Schema));
        await provider.SummarizeAsync(request, CancellationToken.None);
        var sql = Assert.Single(capture.Queries);
        Assert.Contains("GROUP BY", sql, StringComparison.OrdinalIgnoreCase);
        if (kind < CanopyBucketKind.Width) Assert.Contains("DATEPART", sql, StringComparison.OrdinalIgnoreCase);
        else if (kind == CanopyBucketKind.Width) Assert.Contains("FLOOR", sql, StringComparison.OrdinalIgnoreCase);
        else Assert.Contains("CASE", sql, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class TranslationExecutor : CanopyQueryExecutor {
        internal List<string> Queries { get; } = new();
        public override Task<List<TSource>> ToListAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
            Queries.Add(query.ToQueryString());
            return Task.FromResult(new List<TSource>());
        }
    }
}
