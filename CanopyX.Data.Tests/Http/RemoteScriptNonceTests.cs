using System.Text.RegularExpressions;
using CanopyX.AspNetCore;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class RemoteScriptNonceTests {
    [Theory]
    [InlineData("empty")]
    [InlineData("space")]
    [InlineData("quote")]
    [InlineData("markup")]
    [InlineData("line-feed")]
    [InlineData("tab")]
    [InlineData("nul")]
    [InlineData("leading-padding")]
    [InlineData("interior-padding")]
    [InlineData("excess-padding")]
    [InlineData("unicode")]
    public void NonceElement_RejectsValuesOutsideTheSharedNonceGrammar(string caseId) {
        var nonce = caseId switch {
            "empty" => "",
            "space" => "two words",
            "quote" => "abc\" onload=\"alert(1)",
            "markup" => "</script><script>",
            "line-feed" => "abc\n",
            "tab" => "abc\t",
            "nul" => "abc\0",
            "leading-padding" => "=abc",
            "interior-padding" => "abc=def",
            "excess-padding" => "abc===",
            "unicode" => "nönce",
            _ => throw new ArgumentOutOfRangeException(nameof(caseId))
        };
        var error = Assert.Throws<ArgumentException>(() => CanopyRemoteScript.ElementWithNonce(Schema(), "/api/items", nonce));
        Assert.Equal("nonce", error.ParamName);
    }

    [Theory]
    [InlineData("alphanumeric", "CANOPYXNONCE")]
    [InlineData("base64", "rAnd0m+N/once==")]
    [InlineData("base64url", "rAnd0m-N_once=")]
    public void NonceElement_WritesAcceptedNonceBytesWithoutChangingTheScriptBody(string caseId, string nonce) {
        _ = caseId;
        var schema = Schema();
        var formats = new[] { ("csv", "CSV </script><b>"), ("xlsx", "Workbook") };
        var script = CanopyRemoteScript.Script(schema, "/api/items/", formats);
        var element = CanopyRemoteScript.ElementWithNonce(schema, "/api/items/", nonce, formats);
        Assert.Equal("<script nonce=\"" + nonce + "\">" + script + "</script>", element);
        Assert.Single(Regex.Matches(element, "</script>").Cast<Match>());
        Assert.Contains("\\u003C/script\\u003E", element);
        Assert.Contains("\"endpoint\":\"/api/items\"", element);
    }

    [Fact]
    public void NullNonce_PreservesDefaultElementAndExistingNullFormatsCalls() {
        var schema = Schema();
        var original = CanopyRemoteScript.Element(schema, "/api/items", null);
        Assert.Equal("<script>" + CanopyRemoteScript.Script(schema, "/api/items", null) + "</script>", original);
        Assert.Equal(original, CanopyRemoteScript.ElementWithNonce(schema, "/api/items", null));
    }

    [Fact]
    public void NonceElement_PreservesExistingSchemaAndEndpointArgumentValidation() {
        Assert.Equal("schema", Assert.Throws<ArgumentNullException>(() => CanopyRemoteScript.ElementWithNonce(null!, "/api/items", "valid")).ParamName);
        Assert.Equal("endpoint", Assert.Throws<ArgumentException>(() => CanopyRemoteScript.ElementWithNonce(Schema(), "", "valid")).ParamName);
        Assert.Equal("nonce", Assert.Throws<ArgumentException>(() => CanopyRemoteScript.ElementWithNonce(null!, "", "invalid nonce")).ParamName);
    }

    private static CanopyDataSchema Schema() {
        var view = new CanopyDataGridView("items", "Items") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        return new CanopyDataSchema(view);
    }
}
