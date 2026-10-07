using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using CanopyX.Rendering;

namespace CanopyX.Tests.Views;

public sealed class LabelPackTests {
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void ShippedPack_CoversEveryLabelAndPlaceholder_AndCarriesTranslationsToBothRenderers(int language) {
        CanopyLabels Pack() => language switch { 0 => CanopyLabels.Polish(), 1 => CanopyLabels.German(), _ => CanopyLabels.Spanish() };
        var labels = Pack();
        var source = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "labels.json")))!.AsObject();
        var properties = typeof(CanopyLabels).GetProperties().Where(property => property.PropertyType == typeof(string)).ToArray();
        Assert.Equal(properties.Select(property => property.Name).OrderBy(name => name), source.Select(entry => entry.Key).OrderBy(name => name));
        var english = new CanopyLabels();
        foreach (var property in properties) {
            var text = (string)property.GetValue(labels)!;
            Assert.Equal(source[property.Name]![language]!.GetValue<string>(), text);
            Assert.False(string.IsNullOrWhiteSpace(text));
            string[] Placeholders(string value) => Regex.Matches(value, @"\{\w+\}").Select(match => match.Value).Distinct().OrderBy(value => value).ToArray();
            Assert.Equal(Placeholders((string)property.GetValue(english)!), Placeholders(text));
        }
        var view = new CanopyView("translated", "Host data") { Labels = labels, Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("done", "Host column"));
        var node = new CanopyNode("record", "Host record"); node.Cells["done"] = true; view.Roots.Add(node);
        view.Roots.Add(new CanopyNode("omitted", "Another host record"));
        var json = view.ToJson();
        Protocol.ProtocolSchema.AssertValid(json, "translated view");
        Assert.Equal(labels.Columns, JsonNode.Parse(json)!["labels"]!["columns"]!.GetValue<string>());
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { FullReportUrl = "report.html", MaxRows = 1 });
        Assert.Contains(labels.Yes, System.Net.WebUtility.HtmlDecode(html));
        Assert.Contains(labels.FullReport, System.Net.WebUtility.HtmlDecode(html));
        var clone = labels.Clone(); labels.Columns = "Host override";
        Assert.Equal(source["Columns"]![language]!.GetValue<string>(), Pack().Columns);
        Assert.Equal(Pack().Columns, clone.Columns);
    }
}
