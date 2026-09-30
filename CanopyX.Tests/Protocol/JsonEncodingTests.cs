using System.Globalization;
using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

/// <summary>
/// Protocol documents are embedded in HTML script elements and sidecar scripts, and hosts rely on a stable wire format.
/// </summary>
public sealed class JsonEncodingTests {
    [Fact]
    public void ToJson_HostileText_IsHtmlSafeAndRoundTrips() {
        var separator = ((char)0x2028).ToString() + (char)0x2029;
        var loneSurrogate = ((char)0xD800).ToString();
        var label = "</script><!-- & \"quoted\" \\ " + separator + " tab\t";
        var view = new CanopyView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("id-1", label));
        view.Roots.Add(new CanopyNode("id-2", "broken " + loneSurrogate));

        var json = view.ToJson();

        Assert.DoesNotContain("<", json);
        Assert.DoesNotContain(">", json);
        Assert.DoesNotContain("&", json);
        Assert.DoesNotContain(separator[0], json);
        Assert.DoesNotContain(separator[1], json);
        // A lone surrogate is escaped rather than written raw, where UTF-8 encoding would replace it.
        Assert.DoesNotContain(loneSurrogate[0], json);
        Assert.Contains("broken " + "\\" + "u" + "d800", json);
        Assert.Equal(label, JsonNode.Parse(json)!["roots"]![0]!["label"]!.GetValue<string>());
    }

    [Fact]
    public void ToJson_SmallView_MatchesTheDocumentedWireFormat() {
        var view = new CanopyView("v", "Files") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Width = 90 });
        var folder = new CanopyNode("a", "Folder") { Expanded = true };
        folder.Cells["size"] = 1536;
        var file = new CanopyNode("a/b", "File");
        file.Cells["size"] = new CanopyCell(512) { Text = "512 B", Tone = CanopyTone.Muted };
        folder.Children.Add(file);
        view.Roots.Add(folder);

        const string expected = "{\"protocol\":\"canopyx/1\",\"type\":\"view\",\"id\":\"v\",\"label\":\"Files\",\"rowHeight\":28,\"pageSize\":100,"
            + "\"selection\":\"single\",\"columns\":[{\"id\":\"name\",\"title\":\"Name\",\"width\":160,\"kind\":\"text\",\"sortable\":true},"
            + "{\"id\":\"size\",\"title\":\"Size\",\"width\":90,\"kind\":\"number\"}],"
            + "\"search\":{\"minLength\":2,\"maxResults\":20},\"source\":{\"kind\":\"inline\"},"
            + "\"roots\":[{\"id\":\"a\",\"label\":\"Folder\",\"cells\":{\"size\":1536},\"hasChildren\":true,\"childCount\":1,\"expanded\":true,"
            + "\"children\":[{\"id\":\"a/b\",\"label\":\"File\",\"cells\":{\"size\":{\"value\":512,\"text\":\"512 B\",\"tone\":\"muted\"}}}]}]}";
        Assert.Equal(expected, view.ToJson());
    }

    [Fact]
    public void ToJson_Cells_WriteBareValuesUnlessTheyCarryPresentation() {
        var node = new CanopyNode("n", "Node");
        node.Cells["count"] = 42;
        node.Cells["ratio"] = double.NaN;
        node.Cells["when"] = new DateTime(2026, 9, 27, 12, 30, 5, DateTimeKind.Unspecified);
        node.Cells["precise"] = new DateTime(2026, 9, 27, 12, 30, 5, 250, DateTimeKind.Utc);
        node.Cells["offset"] = new DateTimeOffset(2026, 9, 27, 14, 30, 5, TimeSpan.FromHours(2));
        node.Cells["state"] = new CanopyCell("ok") { Tone = CanopyTone.Success, Text = "Healthy" };
        var page = new CanopyPage(null);
        page.Items.Add(node);

        var json = page.ToJson();
        var cells = JsonNode.Parse(json)!["items"]![0]!["cells"]!;

        Assert.Equal(42, cells["count"]!.GetValue<long>());
        Assert.Contains("\"ratio\":null", json);
        Assert.Equal("2026-09-27T12:30:05Z", cells["when"]!.GetValue<string>());
        Assert.Equal("2026-09-27T12:30:05.250Z", cells["precise"]!.GetValue<string>());
        Assert.Equal("2026-09-27T12:30:05Z", cells["offset"]!.GetValue<string>());
        Assert.Equal("ok", cells["state"]!["value"]!.GetValue<string>());
        Assert.Equal("Healthy", cells["state"]!["text"]!.GetValue<string>());
        Assert.Equal("success", cells["state"]!["tone"]!.GetValue<string>());
    }

    [Theory]
    [InlineData("de-DE")]
    [InlineData("sv-SE")]
    public void ToJson_UnderAnyCulture_WritesInvariantNumbers(string culture) {
        var previous = CultureInfo.CurrentCulture;
        try {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(culture);
            var node = new CanopyNode("n", "Node");
            node.Cells["real"] = -1234.5;
            node.Cells["exact"] = -0.25m;
            node.Cells["whole"] = -7L;
            var page = new CanopyPage(null);
            page.Items.Add(node);

            Assert.Contains("\"cells\":{\"real\":-1234.5,\"exact\":-0.25,\"whole\":-7}", page.ToJson());
        } finally {
            CultureInfo.CurrentCulture = previous;
        }
    }
}
