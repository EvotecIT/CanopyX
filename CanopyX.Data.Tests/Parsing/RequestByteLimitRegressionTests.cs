using System.Text;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The transport-neutral parser enforces request limits in UTF-8 bytes, including decoded GET parameters.</summary>
public sealed class RequestByteLimitRegressionTests {
    private const int ByteLimit = 1024;
    private static readonly CanopyDataSchema Schema = Fleet.Map(Fleet.EditableView()).Schema;

    [Theory]
    [InlineData("query")]
    [InlineData("facet")]
    [InlineData("summary")]
    [InlineData("export")]
    [InlineData("commit")]
    public void JsonEntryPoints_AcceptExactUtf8BoundaryAndRejectOneByteMore(string kind) {
        foreach (var unit in new[] { "a", "é漢😀" }) {
            var fields = kind switch {
                "query" => "",
                "facet" => "\"column\":\"site\",\"query\":{\"revision\":\"r1\"},",
                "summary" => "\"revision\":\"r1\",",
                "export" => "\"scope\":\"all\",\"revision\":\"r1\",\"query\":{},",
                "commit" => "\"rows\":[{\"id\":\"1\",\"values\":{\"name\":\"new\"},\"original\":{\"name\":\"old\"}}],",
                _ => throw new ArgumentOutOfRangeException(nameof(kind))
            };
            var prefix = "{" + fields + "\"future\":\"";
            var padding = Padding(unit, ByteLimit - Encoding.UTF8.GetByteCount(prefix + "\"}"));
            var json = prefix + padding + "\"}";
            Assert.Equal(ByteLimit, Encoding.UTF8.GetByteCount(json));
            Assert.NotNull(Parse(kind, json));
            var oversized = prefix + padding + "a\"}";
            Assert.Equal(ByteLimit + 1, Encoding.UTF8.GetByteCount(oversized));
            if (unit != "a") Assert.True(oversized.Length < ByteLimit);
            var error = Assert.Throws<CanopyRequestException>(() => Parse(kind, oversized));
            Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
            Assert.Equal("The request is too large.", error.Message);
        }
    }

    [Theory]
    [InlineData("a")]
    [InlineData("é")]
    [InlineData("漢")]
    [InlineData("😀")]
    public void DecodedQueryValues_UseUtf8BytesAtTheBoundary(string unit) {
        const string key = "future";
        var value = Padding(unit, ByteLimit - Encoding.UTF8.GetByteCount(key));
        Assert.Equal(ByteLimit, Encoding.UTF8.GetByteCount(key) + Encoding.UTF8.GetByteCount(value));
        CanopyRequestParser.ParseQuery(new[] { new KeyValuePair<string, string?>(key, value) }, Schema, Limits());
        AssertQueryStringLimit(new[] { new KeyValuePair<string, string?>(key, value + "a") });
    }

    [Fact]
    public void DecodedQueryKeys_UseUtf8BytesAtTheBoundary() {
        const string value = "unused";
        var key = Padding("漢", ByteLimit - Encoding.UTF8.GetByteCount(value));
        CanopyRequestParser.ParseQuery(new[] { new KeyValuePair<string, string?>(key, value) }, Schema, Limits());
        AssertQueryStringLimit(new[] { new KeyValuePair<string, string?>(key + "a", value) });
    }

    [Fact]
    public void DecodedQueryParameters_ShareOneUtf8ByteBudget() {
        var parameters = new[] {
            new KeyValuePair<string, string?>("future1", new string('é', 200)),
            new KeyValuePair<string, string?>("future2", new string('漢', 200)),
            new KeyValuePair<string, string?>("x", new string('a', 9))
        };
        Assert.Equal(ByteLimit, parameters.Sum(pair => Encoding.UTF8.GetByteCount(pair.Key) + Encoding.UTF8.GetByteCount(pair.Value!)));
        CanopyRequestParser.ParseQuery(parameters, Schema, Limits());
        parameters[2] = new KeyValuePair<string, string?>("x", new string('a', 10));
        AssertQueryStringLimit(parameters);
    }

    private static CanopyRemoteLimits Limits() => new CanopyRemoteLimits { MaxRequestBytes = ByteLimit };

    private static string Padding(string unit, int bytes) {
        var text = string.Concat(Enumerable.Repeat(unit, 64));
        return text + new string('a', bytes - Encoding.UTF8.GetByteCount(text));
    }

    private static object Parse(string kind, string json) => kind switch {
        "query" => CanopyRequestParser.ParseQuery(json, Schema, Limits()),
        "facet" => CanopyRequestParser.ParseFacet(json, Schema, Limits()),
        "summary" => CanopyRequestParser.ParseSummary(json, Schema, Limits()),
        "export" => CanopyRequestParser.ParseExport(json, Schema, Limits()),
        "commit" => CanopyRequestParser.ParseCommit(json, Schema, Limits()),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    private static void AssertQueryStringLimit(IEnumerable<KeyValuePair<string, string?>> parameters) {
        var error = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(parameters, Schema, Limits()));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        Assert.Equal("The query string is too long.", error.Message);
    }
}
