using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Built-in history caps preserve the endpoint's ellipsis contract at their own exact text boundaries.</summary>
public sealed class RecordHistoryTextTests {
    [Theory]
    [InlineData("memory", 256)]
    [InlineData("queryable", 256)]
    [InlineData("memory", 4096)]
    [InlineData("queryable", 4096)]
    [InlineData("memory", 8192)]
    [InlineData("queryable", 8192)]
    public async Task HistoryTextCaps_SignalShorteningAndPreserveFittingText(string providerKind, int maximum) {
        var textMaximum = Math.Min(maximum, 4096);
        var kindMaximum = Math.Min(maximum, 256);
        var longText = new string('a', 8193);
        var fittingText = new string('b', textMaximum);
        var fittingKind = new string('b', kindMaximum);
        // The emoji straddles the last retained position before the ellipsis; keep both halves out of the result.
        var pairedText = new string('c', textMaximum - 2) + "\U0001F600tail";
        var pairedKind = new string('c', kindMaximum - 2) + "\U0001F600tail";
        var asset = new Asset {
            Id = 1, Name = "one", Site = "Main",
            Events = {
                new AssetEvent { Id = 1, Summary = longText, Actor = longText, Kind = longText },
                new AssetEvent { Id = 2, Summary = fittingText, Actor = fittingText, Kind = fittingKind },
                new AssetEvent { Id = 3, Summary = pairedText, Actor = pairedText, Kind = pairedKind }
            },
            Changes = {
                new AssetChange { Id = 1, Setting = longText, Before = "old", After = "new" },
                new AssetChange { Id = 2, Setting = fittingText, Before = "old", After = "new" },
                new AssetChange { Id = 3, Setting = pairedText, Before = "old", After = "new" }
            }
        };
        var records = Assets.Records(Assets.Columns(Assets.View()));
        ICanopyRecordProvider provider = providerKind == "memory"
            ? new CanopyInMemoryRecordProvider<Asset>(records, () => new[] { asset })
            : new CanopyQueryableRecordProvider<Asset>(new[] { asset }.AsQueryable(), records);
        var options = new CanopyRemoteOptions();
        options.Limits.MaxRecordTextLength = maximum;
        using var document = JsonDocument.Parse(await Assets.Handler(records, provider, options).RecordAsync(Assets.Query("1")));
        var fields = document.RootElement.GetProperty("fields");
        var events = fields.GetProperty("events").GetProperty("events");
        var changes = fields.GetProperty("changes").GetProperty("changes");
        Assert.Multiple(
            () => Assert.Equal(new string('a', textMaximum - 1) + "…", events[0].GetProperty("summary").GetString()),
            () => Assert.Equal(new string('a', textMaximum - 1) + "…", events[0].GetProperty("actor").GetString()),
            () => Assert.Equal(new string('a', kindMaximum - 1) + "…", events[0].GetProperty("kind").GetString()),
            () => Assert.Equal(new string('a', textMaximum - 1) + "…", changes[0].GetProperty("name").GetString()));
        foreach (var name in new[] { "summary", "actor" }) {
            Assert.Equal(fittingText, events[1].GetProperty(name).GetString());
            Assert.Equal(new string('c', textMaximum - 2) + "…", events[2].GetProperty(name).GetString());
        }
        Assert.Equal(fittingKind, events[1].GetProperty("kind").GetString());
        Assert.Equal(new string('c', kindMaximum - 2) + "…", events[2].GetProperty("kind").GetString());
        Assert.Equal(fittingText, changes[1].GetProperty("name").GetString());
        Assert.Equal(new string('c', textMaximum - 2) + "…", changes[2].GetProperty("name").GetString());
    }
}
