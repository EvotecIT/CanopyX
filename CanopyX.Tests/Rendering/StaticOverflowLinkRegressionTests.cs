using System.Xml.Linq;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class StaticOverflowLinkRegressionTests {
    [Theory]
    [InlineData(false, "https://example.test/full?a=1&b=2", true)]
    [InlineData(true, "/reports/full?a=1&b=2", true)]
    [InlineData(false, "javascript:alert(1)", false)]
    [InlineData(true, "https://example.test\\unsafe", false)]
    public void NestedOnlyOverflow_UsesConfiguredSafeReportLinkWithoutCapturingNote(bool recursive, string url, bool safe) {
        var view = new CanopyDataGridView("outer", "Outer");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var nested = new CanopyDataGridView("nested", "Nested");
        nested.Columns.Add(new CanopyColumn("name", "Name"));
        var payload = new CanopyGridRowsDetail();
        payload.Rows.Add(new CanopyGridRow("nested-a") { Cells = { ["name"] = "Nested first" } });
        if (recursive) {
            var child = new CanopyDataGridView("child", "Child"); child.Columns.Add(new CanopyColumn("name", "Name"));
            nested.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = child } };
            payload.Rows[0].Detail = new CanopyGridRowsDetail { Rows = {
                new CanopyGridRow("deep") { Cells = { ["name"] = "Omitted deep row" } }
            } };
        } else {
            payload.Rows.Add(new CanopyGridRow("nested-b") { Cells = { ["name"] = "Omitted nested row" } });
        }
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["name"] = "Outer record" }, Detail = payload });
        var options = new CanopyStaticHtmlOptions {
            MaxRows = 2, FullReportUrl = url, FullReportText = "Full <&> report", OverflowNote = "Limited {shown}/{total}"
        };

        var result = CanopyStaticHtml.RenderGridWithResult(view, options: options);

        var links = XElement.Parse(result.Html).Descendants("a").ToArray();
        if (safe) {
            var link = Assert.Single(links);
            Assert.Equal(url, link.Attribute("href")!.Value);
            Assert.Equal("Full <&> report", link.Value);
            Assert.Contains("Full &lt;&amp;&gt; report", result.Html);
        } else Assert.Empty(links);
        Assert.Contains(recursive ? "Limited 0/1" : "Limited 1/2", result.Html);
        Assert.DoesNotContain("Limited", string.Join(" ", result.Rows.SelectMany(row => row)));
        Assert.DoesNotContain("Full <&> report", string.Join(" ", result.Rows.SelectMany(row => row)));
        Assert.Equal(1L, result.TotalRows);
        Assert.False(result.HasUnknownTotal);
    }
}
