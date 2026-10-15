using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Random record requests give byte-identical answers (or the same rejection) from LINQ to objects and the reference provider.</summary>
public sealed class RecordOracleTests {
    private static readonly List<Asset> All = Assets.Create(240, seed: 17);

    [Fact]
    public async Task RandomRecordRequests_LinqMatchesReference() {
        var records = Assets.Records(Assets.Columns(Assets.View()));
        var reference = Assets.Handler(records, new CanopyInMemoryRecordProvider<Asset>(records, () => Assets.Scoped(All)));
        var linq = Assets.Handler(records, new CanopyQueryableRecordProvider<Asset>(() => Assets.Scoped(All).AsQueryable(), records));
        var requests = new RandomRecordRequests(All, 23);
        var answered = 0;
        for (var i = 0; i < 600; i++) {
            var (json, canRead) = requests.Next();
            var expected = await Answer(() => reference.RecordAsync(json, canRead));
            if (!expected.StartsWith("rejected:", StringComparison.Ordinal)) answered++;
            Assert.True(expected == await Answer(() => linq.RecordAsync(json, canRead)), "Request " + i + " differs: " + json);
        }
        Assert.True(answered > 200, "Only " + answered + " random requests found a record.");
    }

    /// <summary>The document, or the rejection code, so rejections also have to agree.</summary>
    internal static async Task<string> Answer(Func<Task<string>> run) {
        try {
            return await run();
        } catch (CanopyRequestException error) {
            return "rejected:" + error.Code;
        }
    }
}

/// <summary>Random record requests over the asset fixture: whole records with and without rows, collection pages at random
/// windows, hidden, missing and non-canonical identities, stale revisions and random read checks.</summary>
public sealed class RandomRecordRequests {
    private static readonly string[] Hidable = { "serial", "purchased", "weight", "notes", "secret", "replaces", "parts", "peers", "events", "changes", "site" };
    private readonly IReadOnlyList<Asset> _assets;
    private readonly Random _random;

    public RandomRecordRequests(IReadOnlyList<Asset> assets, int seed) {
        _assets = assets;
        _random = new Random(seed);
    }

    public (string Json, Func<string, bool>? CanRead) Next() {
        var asset = _assets[_random.Next(_assets.Count)];
        var id = _random.Next(20) switch {
            0 => "9" + asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture) + "9",
            1 => "0" + asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            2 => "x" + asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            _ => asset.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)
        };
        var extra = "";
        if (_random.Next(10) == 0) extra += ",\"revision\":\"" + (_random.Next(3) == 0 ? "r0" : "r1") + "\"";
        if (_random.Next(2) == 0) {
            var field = _random.Next(3) == 0 ? "peers" : "parts";
            var total = field == "parts" ? asset.Parts.Count : asset.Group?.Members.Count ?? 0;
            var offset = _random.Next(4) == 0 ? 0 : _random.Next(0, total + 3);
            extra += ",\"field\":\"" + field + "\"";
            if (_random.Next(5) != 0) extra += ",\"offset\":" + offset;
            if (_random.Next(5) != 0) extra += ",\"limit\":" + _random.Next(1, 40);
        } else if (_random.Next(2) == 0) {
            extra += ",\"row\":true";
        }
        Func<string, bool>? canRead = null;
        if (_random.Next(3) == 0) {
            var hidden = new HashSet<string>(Hidable.Where(_ => _random.Next(3) == 0), StringComparer.Ordinal);
            canRead = field => !hidden.Contains(field);
        }
        return (Assets.Query(id, extra), canRead);
    }
}
