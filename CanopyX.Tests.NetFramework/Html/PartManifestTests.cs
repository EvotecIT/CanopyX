using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.NetFramework.Html;

/// <summary>The part manifest is read by the package's own reader, which must work on .NET Framework too.</summary>
public sealed class PartManifestTests {
    [Fact]
    public void Parts_AreReadFromTheEmbeddedManifestOnNetFramework() {
        var names = CanopyHtmlAssets.Parts.Select(part => part.Name).ToArray();
        Assert.Equal(new[] { "tree-tools", "filter-editor", "export", "history", "pager", "enhance", "data", "editing", "links", "search", "formatting", "format-editor", "link", "detail-rows", "grouping", "highlight", "layouts" }, names);
        foreach (var part in CanopyHtmlAssets.Parts) {
            Assert.Matches("^[a-f0-9]{16}$", part.Version);
            Assert.Contains("version:\"" + part.Version + "\"", part.Script);
        }
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, CanopyHtmlAssets.GetPart("history").Runtimes);
        var tree = new CanopyTreeView("tree", "Tree") { DeepLink = true };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(new[] { "tree-tools", "export", "links" }, CanopyHtmlAssets.GetRequiredParts(tree).Select(part => part.Name).ToArray());
    }
}