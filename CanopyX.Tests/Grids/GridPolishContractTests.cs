using System.Text.Json;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridPolishContractTests {
    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("items", "Work items");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("count", "Count") { Kind = CanopyColumnKind.Number });
        return view;
    }

    [Fact]
    public void GridPolishOptions_AreOptInAndMatchTheSchema() {
        var view = View();
        using (var defaults = JsonDocument.Parse(view.ToJson())) {
            foreach (var name in new[] { "stickyHeader", "allowRegexSearch", "cardTemplate" }) Assert.False(defaults.RootElement.TryGetProperty(name, out _));
        }
        view.StickyHeader = true;
        view.AllowRegexSearch = true;
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards };
        view.CardTemplate = new CanopyCardTemplate();
        view.CardTemplate.Slots.Add("name", "{name} · {count}");
        view.Query = new CanopyGridQuery(view.Id) { SearchMode = CanopyGridSearchMode.Regex, Search = @"^Item \d+$" };
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "opt-in grid polish and bounded regex query");
        ProtocolSchema.AssertValid(view.Query.ToJson(view), "bounded regex standalone query");
        using var document = JsonDocument.Parse(json);
        Assert.True(document.RootElement.GetProperty("stickyHeader").GetBoolean());
        Assert.Equal("{name} · {count}", document.RootElement.GetProperty("cardTemplate").GetProperty("name").GetString());
        Assert.Equal("regex", document.RootElement.GetProperty("query").GetProperty("searchMode").GetString());
        foreach (var name in new[] { "stickyHeader", "allowRegexSearch" }) {
            var invalid = ProtocolSchema.Mutate(json, value => value[name] = "yes");
            Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
        }
    }

    [Fact]
    public void CardTemplates_RequireDeclaredSlotsAndTokensAndACardLayout() {
        var view = View();
        view.CardTemplate = new CanopyCardTemplate();
        view.CardTemplate.Slots.Add("name", "{name}");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards };
        foreach (var template in new[] { "{unknown}", "{name", new string('x', 2049) }) {
            view.CardTemplate.Slots["name"] = template;
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
        }
        view.CardTemplate.Slots.Clear(); view.CardTemplate.Slots.Add("unknown", "{name}");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void CardTemplates_StaticFallbackEscapesLiteralMarkupAndFormatsCellTokens() {
        var view = View();
        view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards };
        view.CardTemplate = new CanopyCardTemplate();
        view.CardTemplate.Slots.Add("name", "<b>{name}</b> · {count}");
        var row = new CanopyGridRow("one");
        row.Cells["name"] = "<img src=x onerror=alert(1)>"; row.Cells["count"] = new CanopyCell(3) { Text = "three" };
        view.Rows.Add(row);
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Contains("&lt;b&gt;&lt;img", result.Html);
        Assert.DoesNotContain("<img", result.Html);
        Assert.Contains("&lt;/b&gt;", result.Html);
        Assert.Equal("<b><img src=x onerror=alert(1)></b> · three", result.Rows[0][0]);
    }

    [Theory]
    [InlineData(@"^Item \d+$", "ITEM 42", true)]
    [InlineData(@"^Item \d+$", "prefix Item 42", false)]
    [InlineData(@"^\w+$", "é", false)]
    [InlineData(@"^Σ$", "ς", true)]
    public void RegexSearch_UsesTheSharedCaseInsensitiveGrammar(string pattern, string input, bool expected) =>
        Assert.Equal(expected, new CanopyGridRegexSearch(pattern).IsMatch(input));

    [Fact]
    public void RegexSearch_RejectsUnsafePatternsOversizedInputAndQueriesWithoutOptIn() {
        foreach (var pattern in new[] { "(a+)+$", "a|b", "a*", new string('x', 257) })
            Assert.Throws<InvalidOperationException>(() => new CanopyGridRegexSearch(pattern));
        var matcher = new CanopyGridRegexSearch("x");
        Assert.True(matcher.IsMatch(new string('x', 4096)));
        Assert.Throws<ArgumentOutOfRangeException>(() => matcher.IsMatch(new string('x', 4097)));
        var view = View();
        var query = new CanopyGridQuery(view.Id) { SearchMode = CanopyGridSearchMode.Regex, Search = "x" };
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
    }
}
