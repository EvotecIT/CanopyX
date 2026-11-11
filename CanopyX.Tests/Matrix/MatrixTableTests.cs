using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Matrix;

/// <summary>Cell links in the document, and the enhanceable table the browser reads back into a matrix (docs/matrix.md).</summary>
public sealed class MatrixTableTests {
    private static CanopyMatrix Linked(int rows = 2) {
        var matrix = new CanopyMatrix("checks", "Checks");
        matrix.State("bad", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true).State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        matrix.Rows.Attribute("site", "Site", facet: true);
        matrix.Rows.GroupBy = "site";
        for (var r = 0; r < rows; r++) matrix.Rows.Item("r" + r, "Server " + r, item => { item.Value("site", r % 2 == 0 ? "North" : "South"); item.Href = "/servers/r" + r; });
        matrix.Columns.Item("dns", "DNS").Item("ntp", "Time");
        for (var r = 0; r < rows; r++) {
            matrix.Set("r" + r, "dns", r == 0 ? "bad" : "ok").Href = "/checks/r" + r + "/dns";
            matrix.Set("r" + r, "ntp", "ok");
        }

        var failing = matrix.Cells[0];
        failing.Value = 3;
        failing.Title = "Three probes failed.";
        failing.Detail("Last success", "06:00");
        return matrix;
    }

    [Fact]
    public void CellLinks_TravelAsTheSeventhNoteItemAndRoundTrip() {
        var json = Linked().ToJson();
        ProtocolSchema.AssertValid(json, "Matrix with cell links");
        Assert.Contains("[0,0,3,null,\"Three probes failed.\",[[\"Last success\",\"06:00\"]],\"/checks/r0/dns\"]", json);
        Assert.Contains("[1,0,null,null,null,null,\"/checks/r1/dns\"]", json);
        var back = CanopyMatrix.FromJson(json);
        Assert.Equal("/checks/r1/dns", back.Cells.Single(cell => cell.Row == "r1" && cell.Column == "dns").Href);
        Assert.Equal(json, back.ToJson());

        var unsafeLink = Linked();
        unsafeLink.Cells[0].Href = "javascript:alert(1)";
        Assert.Contains("is not an http, https, mailto or relative address", Assert.Throws<InvalidOperationException>(() => unsafeLink.ToJson()).Message);
        var malformed = ProtocolSchema.Mutate(json, doc => doc["notes"]![1]![6] = "javascript:alert(1)");
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid);
    }

    [Fact]
    public void EnhanceableTable_CarriesEveryRowTheDocumentFieldsAndTheCellsToReadBack() {
        // 1,300 rows by two columns is more than the static table draws (2,500 cells) and more than MaxRows.
        var matrix = Linked(1300);
        var html = CanopyStaticHtml.RenderEnhanceableMatrix(matrix, new CanopyStaticHtmlOptions { MaxRows = 10 });
        Assert.Equal(1300, Regex.Matches(html, "<tr data-id=\"r\\d+\"").Count);

        var fields = Regex.Match(html, "<table [^>]*data-view=\"matrix\" data-matrix=\"([^\"]+)\"").Groups[1].Value;
        using var document = JsonDocument.Parse(System.Net.WebUtility.HtmlDecode(fields));
        var root = document.RootElement;
        Assert.Equal("checks", root.GetProperty("id").GetString());
        Assert.Equal("site", root.GetProperty("rows").GetProperty("groupBy").GetString());
        Assert.Equal(2, root.GetProperty("states").GetArrayLength());
        Assert.False(root.GetProperty("rows").TryGetProperty("items", out _));
        Assert.False(root.TryGetProperty("cells", out _));

        Assert.Contains("<tr data-id=\"r0\" data-values=\"{&quot;site&quot;:&quot;North&quot;}\"><th scope=\"row\"", html);
        Assert.Contains("<a href=\"/servers/r0\" style=\"color:inherit;\">Server 0</a>", html);
        Assert.Contains("<th scope=\"col\" data-total", html);
        Assert.Contains("<td data-state=\"bad\" data-value=\"3\" data-title=\"Three probes failed.\" data-details=\"[[&quot;Last success&quot;,&quot;06:00&quot;]]\"", html);
        Assert.Contains("<a href=\"/checks/r1/dns\" style=\"color:inherit;\">", html);

        // The print and email table links the same cells, but keeps its limits and carries no data attributes.
        var plain = CanopyStaticHtml.RenderMatrix(Linked());
        Assert.Contains("<a href=\"/checks/r1/dns\" style=\"color:inherit;\">", plain);
        Assert.DoesNotContain("data-", plain);
    }
}
