using System.Collections.Generic;

namespace CanopyX.Tests.Protocol;

public sealed class IdentifierContractTests {
    [Fact]
    public void SearchPathsCannotBeMutatedThroughTheirInputOrPublicCollection() {
        var input = new[] { "parent", "child" };
        var hit = new CanopySearchHit(input, "Child");
        input[0] = "";
        Assert.Equal("parent", hit.Path[0]);
        var list = Assert.IsAssignableFrom<IList<string>>(hit.Path);
        Assert.Throws<NotSupportedException>(() => list[0] = "");
        Assert.Equal(new[] { "parent", "child" }, hit.Path);
    }

    [Theory]
    [InlineData("<svgx></svgx>", false)]
    [InlineData("<svg", false)]
    [InlineData("<svg\u00a0></svg>", false)]
    [InlineData("<svg></svg>", true)]
    [InlineData("<SVG viewBox=\"0 0 16 16\"></SVG>", true)]
    [InlineData("\t<svg/>", true)]
    public void IconMarkupRequiresTheSvgTagName(string icon, bool valid) {
        var view = View(); view.Icons["test"] = icon;
        if (valid) ProtocolSchema.AssertValid(view.ToJson(), "SVG tag");
        else {
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
            Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(View().ToJson(), d => d["icons"] = new System.Text.Json.Nodes.JsonObject { ["test"] = icon })).IsValid);
        }
    }

    [Theory]
    [InlineData("children", "api/children#ref={ref}&cursor={cursor}", false)]
    [InlineData("children", "api/children?ref={ref}#cursor={cursor}", false)]
    [InlineData("children", "api/children?cursor={cursor}&ref={ref}#section", true)]
    [InlineData("search", "api/search?q={query}#limit={limit}", false)]
    [InlineData("search", "api/search?limit={limit}&q={query}#section", true)]
    [InlineData("counts", "api/counts#ids={ids}", false)]
    [InlineData("counts", "api/counts?ids={ids}#section", true)]
    public void RequiredPlaceholdersMustReachTheHttpRequest(string field, string template, bool valid) {
        CanopySource Make() => CanopySource.Remote(field == "children" ? template : "api/c?ref={ref}&cursor={cursor}",
            field == "search" ? template : null, field == "counts" ? template : null);
        var json = ProtocolSchema.Mutate(View().ToJson(), d => { d.Remove("roots"); d["source"] = new System.Text.Json.Nodes.JsonObject {
            ["kind"] = "remote", ["children"] = "api/c?ref={ref}&cursor={cursor}", [field] = template }; });
        if (valid) { Make(); ProtocolSchema.AssertValid(json, "request placeholders"); }
        else { Assert.Throws<ArgumentException>(() => Make()); Assert.False(ProtocolSchema.Evaluate(json).IsValid); }
    }

    [Theory]
    [InlineData(0xd800)]
    [InlineData(0xdc00)]
    public void UrlBoundIdentifiersRejectUnpairedSurrogates(int code) {
        var broken = "x" + (char)code;
        var schema = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!;
        var pattern = schema["$defs"]!["identifier"]!["pattern"]!.GetValue<string>();
        Assert.DoesNotMatch(pattern, broken);
        Assert.Matches(pattern, "node-\U0001f332");
        Assert.Throws<ArgumentException>(() => new CanopyNode(broken, "Node"));
        Assert.Throws<ArgumentException>(() => new CanopyView(broken, "View"));
        Assert.Throws<ArgumentException>(() => new CanopySearchHit(new[] { broken }, "Hit"));
        Assert.Throws<ArgumentException>(() => new CanopyCountEntry(broken));
        Assert.Throws<ArgumentException>(() => new CanopyPage(broken));
        Assert.Throws<ArgumentException>(() => new CanopyPage(null) { Next = broken });
        Assert.Throws<ArgumentException>(() => new CanopyNode("valid", "Node") { Ref = broken });
    }

    [Fact]
    public void SupplementaryUnicodeIdentifiersRemainUsable() {
        var id = "node-\U0001f332"; var view = new CanopyView(id, "View");
        view.Columns.Add(new CanopyColumn("name", "Name")); view.Roots.Add(new CanopyNode(id, "Node"));
        ProtocolSchema.AssertValid(view.ToJson(), "supplementary id");
        var page = new CanopyPage(id) { Next = id }; page.Items.Add(new CanopyNode("child", "Child") { Ref = id, HasChildren = true });
        ProtocolSchema.AssertValid(page.ToJson(), "supplementary references");
    }

    private static CanopyView View() {
        var view = new CanopyView("test", "Test"); view.Columns.Add(new CanopyColumn("name", "Name")); return view;
    }
}
