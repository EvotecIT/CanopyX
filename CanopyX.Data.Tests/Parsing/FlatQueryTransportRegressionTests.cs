using System.Text;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Flat GET requests spend their byte budget on decoded parameters, independent of internal JSON escaping.</summary>
public sealed class FlatQueryTransportRegressionTests {
    private const int ByteLimit = 1024;
    private static readonly CanopyDataSchema Schema = Fleet.Map(Fleet.View()).Schema;

    [Theory]
    [InlineData("search", "a")]
    [InlineData("search", "漢")]
    [InlineData("filters", "a")]
    [InlineData("filters", "漢")]
    public void RecognizedFields_AcceptDecodedByteBoundaryRegardlessOfJsonEscaping(string field, string unit) {
        var text = string.Concat(Enumerable.Repeat(unit, 200));
        AssertField(Parse(field, Value(field, text)), field, text);
        text += new string('a', ByteLimit - Bytes(field, Value(field, text)));
        Assert.Equal(ByteLimit, Bytes(field, Value(field, text)));
        AssertField(Parse(field, Value(field, text)), field, text);
    }

    [Theory]
    [InlineData("search")]
    [InlineData("filters")]
    public void RecognizedFields_StillRejectDecodedUtf8Overflow(string field) {
        var text = new string('漢', 200);
        text += new string('a', ByteLimit + 1 - Bytes(field, Value(field, text)));
        Assert.Equal(ByteLimit + 1, Bytes(field, Value(field, text)));
        var error = Assert.Throws<CanopyRequestException>(() => Parse(field, Value(field, text)));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        Assert.Equal("The query string is too long.", error.Message);
    }

    [Fact]
    public void WholeDocumentParameter_RetainsItsUtf8Budget() {
        const string prefix = "{\"search\":\"", suffix = "\"}";
        var text = new string('漢', 200);
        text += new string('a', ByteLimit - 1 - Encoding.UTF8.GetByteCount(prefix + text + suffix));
        var json = prefix + text + suffix;
        Assert.Equal(ByteLimit, Bytes("q", json));
        Assert.Equal(text, Parse("q", json).Search);
        var error = Assert.Throws<CanopyRequestException>(() => Parse("q", prefix + text + "a" + suffix));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        Assert.Equal("The query string is too long.", error.Message);
    }

    [Theory]
    [InlineData("search", "The search text is too long.")]
    [InlineData("filters", "A text operand is too long.")]
    public void RecognizedFields_RetainTypedLimits(string field, string message) {
        var limits = new CanopyRemoteLimits { MaxRequestBytes = ByteLimit, MaxSearchLength = 10, MaxOperandLength = 10 };
        var error = Assert.Throws<CanopyRequestException>(() => Parse(field, Value(field, new string('漢', 20)), limits));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
        Assert.Equal(message, error.Message);
    }

    [Fact]
    public void FlatJsonFragments_RetainCompleteDocumentNestingLimit() {
        var nested = new string('[', 62) + "0" + new string(']', 62);
        var filters = "[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"Oslo\"],\"future\":" + nested + "}]";
        Assert.True(Bytes("filters", filters) < ByteLimit);
        var error = Assert.Throws<CanopyRequestException>(() => Parse("filters", filters));
        Assert.Equal(CanopyRequestError.InvalidJson, error.Error);
        Assert.Equal("The request is not valid JSON or is nested too deeply.", error.Message);
    }

    private static string Value(string field, string text) => field == "search" ? text :
        "[{\"column\":\"site\",\"operator\":\"eq\",\"values\":[\"" + text + "\"]}]";

    private static int Bytes(string field, string value) => Encoding.UTF8.GetByteCount(field) + Encoding.UTF8.GetByteCount(value);

    private static CanopyDataRequest Parse(string field, string value, CanopyRemoteLimits? limits = null) =>
        CanopyRequestParser.ParseQuery(new[] { new KeyValuePair<string, string?>(field, value) }, Schema,
            limits ?? new CanopyRemoteLimits { MaxRequestBytes = ByteLimit });

    private static void AssertField(CanopyDataRequest request, string field, string text) {
        if (field == "search") Assert.Equal(text, request.Search);
        else {
            var filter = Assert.IsType<CanopyFilterCondition>(request.Filter);
            Assert.Equal("site", filter.Column.Id);
            Assert.Equal(text, Assert.IsType<string>(Assert.Single(filter.Values)));
        }
    }
}
