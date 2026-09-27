namespace CanopyX.Tests.Protocol;

public sealed class SourceShapeTests {
    [Theory]
    [InlineData("data?v=1")]
    [InlineData("data/#section")]
    [InlineData("data/?v=1")]
    [InlineData("https://example.test/data#part")]
    public void SidecarBasesRejectQueryAndFragmentSuffixes(string value) {
        Assert.Throws<ArgumentException>(() => CanopySource.Sidecar(value));
        var view = View();
        var json = ProtocolSchema.Mutate(view.ToJson(), d => { d.Remove("roots"); d["source"] = new System.Text.Json.Nodes.JsonObject { ["kind"] = "sidecar", ["base"] = value }; });
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Theory]
    [InlineData("data", "data/")]
    [InlineData("https://example.test/data/", "https://example.test/data/")]
    public void SidecarBasesNormalizeFolderPaths(string input, string expected) {
        Assert.Equal(expected, CanopySource.Sidecar(input).BaseUrl);
    }

    [Fact]
    public void InlineChildrenCannotAlsoDeclareALoadReference() {
        var parent = new CanopyNode("parent", "Parent") { Ref = "remaining", HasChildren = true };
        parent.Children.Add(new CanopyNode("child", "Child"));
        var page = new CanopyPage(null); page.Items.Add(parent);
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        var json = "{\"protocol\":\"canopyx/1\",\"type\":\"page\",\"parent\":null,\"offset\":0,\"next\":null,\"items\":[{\"id\":\"parent\",\"label\":\"Parent\",\"ref\":\"remaining\",\"children\":[{\"id\":\"child\",\"label\":\"Child\"}]}]}";
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    private static CanopyView View() { var view = new CanopyView("test", "Test"); view.Columns.Add(new CanopyColumn("name", "Name")); return view; }
}
