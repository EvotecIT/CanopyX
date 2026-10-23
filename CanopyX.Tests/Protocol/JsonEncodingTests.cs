using System.Globalization;
using System.Text;
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
        var view = new CanopyTreeView("v", "View");
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
        var view = new CanopyTreeView("v", "Files") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(90) });
        var folder = new CanopyNode("a", "Folder") { Expanded = true };
        folder.Cells["size"] = 1536;
        var file = new CanopyNode("a/b", "File");
        file.Cells["size"] = new CanopyCell(512) { Text = "512 B", Tone = CanopyTone.Muted };
        folder.Children.Add(file);
        view.Roots.Add(folder);

        const string expected = "{\"protocol\":\"canopyx/2\",\"type\":\"view\",\"id\":\"v\",\"label\":\"Files\",\"rowHeight\":40,\"pageSize\":100,"
            + "\"selection\":\"single\",\"columns\":[{\"id\":\"name\",\"title\":\"Name\",\"width\":160,\"autoWidth\":true,\"kind\":\"text\",\"sortable\":true},"
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

    [Fact]
    public void ToJson_EveryCodeUnit_IsEscapedAsTheProtocolSpecifies() {
        // Every UTF-16 code unit alone, before "{" (which changes how "$" is written) and around a surrogate pair. The
        // writer copies runs of characters that need no escape; the reference escapes one code unit at a time.
        var view = new CanopyTreeView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var labels = new List<string>();
        for (var unit = 0; unit <= 0xFFFF; unit++) {
            var ch = (char)unit;
            labels.Add(ch.ToString());
            labels.Add(ch + "{");
            labels.Add("a" + ch + "\uD83D\uDE00" + ch);
        }

        labels.Add("\uD83D\uDE00\uD83D");
        labels.Add("\uDE00\uD83D\uDE00");
        labels.Add("$");
        labels.Add("$${");
        for (var index = 0; index < labels.Count; index++) {
            view.Roots.Add(new CanopyNode("n" + index, labels[index]));
        }

        var expected = new StringBuilder();
        foreach (var label in labels) {
            expected.Append(ReferenceString(label));
        }

        var json = view.ToJson();
        var written = new StringBuilder();
        var at = 0;
        for (var index = 0; index < labels.Count; index++) {
            var marker = "\"id\":\"n" + index + "\",\"label\":";
            at = json.IndexOf(marker, at, StringComparison.Ordinal) + marker.Length;
            var end = index + 1 < labels.Count ? json.IndexOf("},{\"id\":\"n" + (index + 1) + "\",", at, StringComparison.Ordinal) : json.LastIndexOf("}]}", StringComparison.Ordinal);
            written.Append(json, at, end - at);
        }

        Assert.Equal(expected.ToString(), written.ToString());
    }

    /// <summary>The escaping the protocol specifies, one code unit at a time.</summary>
    private static string ReferenceString(string value) {
        var builder = new StringBuilder("\"");
        for (var index = 0; index < value.Length; index++) {
            var ch = value[index];
            if (char.IsSurrogate(ch)) {
                if (char.IsHighSurrogate(ch) && index + 1 < value.Length && char.IsLowSurrogate(value[index + 1])) {
                    builder.Append(ch).Append(value[index + 1]);
                    index++;
                } else {
                    builder.Append("\\u").Append(((int)ch).ToString("x4"));
                }

                continue;
            }

            switch (ch) {
                case '"': builder.Append("\\\""); break;
                case '\\': builder.Append("\\\\"); break;
                case '\b': builder.Append("\\b"); break;
                case '\f': builder.Append("\\f"); break;
                case '\n': builder.Append("\\n"); break;
                case '\r': builder.Append("\\r"); break;
                case '\t': builder.Append("\\t"); break;
                case '<' or '>' or '&' or (char)0x2028 or (char)0x2029 or '`':
                    builder.Append("\\u").Append(((int)ch).ToString("x4"));
                    break;
                case '$':
                    builder.Append(index + 1 < value.Length && value[index + 1] == '{' ? "\\u0024" : "$");
                    break;
                default:
                    if (ch < ' ') builder.Append("\\u").Append(((int)ch).ToString("x4"));
                    else builder.Append(ch);
                    break;
            }
        }

        return builder.Append('"').ToString();
    }
}
