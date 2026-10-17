using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The public commit handler compares retained date values and bounds at the protocol's millisecond precision.</summary>
public sealed class CommitMomentBoundsTests {
    [Theory]
    [InlineData(true, 500, false)]
    [InlineData(true, 789, true)]
    [InlineData(true, 790, true)]
    [InlineData(false, 500, true)]
    [InlineData(false, 789, true)]
    [InlineData(false, 790, false)]
    public async Task FractionalBound_IsInclusiveWithoutAdmittingTheAdjacentInvalidMillisecond(bool earliest, int milliseconds, bool accepted) {
        var limit = new DateTimeOffset(2026, 3, 28, 14, 34, 56, 789, TimeSpan.FromHours(2));
        var rules = earliest ? new CanopyCellValidation { Earliest = limit } : new CanopyCellValidation { Latest = limit };
        var (handler, writer) = Handler(rules);
        var value = new DateTime(2026, 3, 28, 12, 34, 56, milliseconds, DateTimeKind.Utc);
        var response = await handler.CommitAsync(JsonCommit(CanopyDataValues.FormatDate(value)));
        using var document = JsonDocument.Parse(response);
        var row = Assert.Single(document.RootElement.GetProperty("rows").EnumerateArray());
        Assert.Equal(accepted ? "saved" : "error", row.GetProperty("status").GetString());
        if (accepted) Assert.Equal(value, Assert.IsType<DateTime>(Assert.Single(writer.Batch!.Rows).Values["lastSeen"]));
        else {
            Assert.Null(writer.Batch);
            Assert.Equal("Last seen must be " + (earliest ? "at least " : "at most ") + "2026-03-28T12:34:56.789Z.",
                row.GetProperty("errors").GetProperty("lastSeen").GetString());
        }
    }

    [Theory]
    [InlineData("json")]
    [InlineData("date")]
    [InlineData("offset")]
    public async Task SubmillisecondBounds_TieWithTheNormalizedPublicCommitValue(string input) {
        var instant = new DateTime(2026, 3, 28, 12, 34, 56, 789, DateTimeKind.Utc);
        var limit = new DateTimeOffset(instant).AddTicks(1234).ToOffset(TimeSpan.FromHours(2));
        var (handler, writer) = Handler(new CanopyCellValidation { Earliest = limit, Latest = limit });
        string response;
        if (input == "json") response = await handler.CommitAsync(JsonCommit("2026-03-28T14:34:56.7899876+02:00"));
        else {
            object raw = input == "date" ? (object)instant.AddTicks(9876) : new DateTimeOffset(instant.AddTicks(9876)).ToOffset(TimeSpan.FromHours(2));
            var row = new CanopyCommitRow("1", new Dictionary<string, object?> { ["lastSeen"] = raw },
                new Dictionary<string, object?> { ["lastSeen"] = null });
            response = await handler.CommitAsync(new CanopyCommitBatch(handler.Schema, "r5", new[] { row }));
        }
        using var document = JsonDocument.Parse(response);
        Assert.Equal("saved", Assert.Single(document.RootElement.GetProperty("rows").EnumerateArray()).GetProperty("status").GetString());
        Assert.Equal(instant, Assert.IsType<DateTime>(Assert.Single(writer.Batch!.Rows).Values["lastSeen"]));
    }

    private static string JsonCommit(string value) => "{\"view\":\"fleet\",\"revision\":\"r5\",\"rows\":[{\"id\":\"1\",\"values\":{\"lastSeen\":\"" +
        value + "\"},\"original\":{\"lastSeen\":null}}]}";

    private static (CanopyRemoteHandler Handler, RecordingWriter Writer) Handler(CanopyCellValidation rules) {
        var view = Fleet.EditableView();
        view.Columns.Single(column => column.Id == "lastSeen").Validation = rules;
        var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(Fleet.Hosts(2).AsQueryable(), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r5") });
        var writer = new RecordingWriter();
        return (new CanopyRemoteHandler(map.Schema, provider, null, writer), writer);
    }

    private sealed class RecordingWriter : ICanopyDataWriter {
        public CanopyCommitTransaction Transaction => CanopyCommitTransaction.PerRow;
        public CanopyCommitBatch? Batch { get; private set; }
        public ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
            Batch = batch;
            return new ValueTask<CanopyCommitResult>(new CanopyCommitResult(batch.Rows.Select(row => CanopyCommitRowResult.Saved(row.Id)), "r6"));
        }
    }
}
