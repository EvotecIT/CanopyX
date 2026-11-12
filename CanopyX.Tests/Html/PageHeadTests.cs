using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Host markup in a page's head, and typed grids written like their views.</summary>
public sealed class PageHeadTests {
    private sealed class Item {
        public string Name { get; set; } = "";
    }

    [Theory]
    [InlineData(CanopyAssetMode.Inline)]
    [InlineData(CanopyAssetMode.External)]
    public void HeadHtml_IsWrittenAfterTheRuntimeAndBeforeTheHeadCloses(CanopyAssetMode mode) {
        const string host = "<meta name=\"report\" content=\"nightly\"><script>window.hostReady = true;</script>";
        var grid = CanopyDataGridView.From(new[] { new Item { Name = "a" } }, x => x.Name);
        var options = new CanopyHtmlOptions { AssetMode = mode, HeadHtml = host };
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        foreach (var page in new[] { grid.ToHtmlPage(options), tree.ToHtmlPage(options) }) {
            var at = page.IndexOf(host, StringComparison.Ordinal);
            Assert.True(at > 0 && page.LastIndexOf("</script>", at, StringComparison.Ordinal) > 0, "the host markup follows the runtime script");
            Assert.Equal("</head>", page.Substring(at + host.Length).TrimStart().Substring(0, 7));
        }

        Assert.DoesNotContain(host, grid.ToHtmlFragment(options));
        Assert.Equal(grid.View.ToHtmlPage(options), grid.ToHtmlPage(options));
    }
}
