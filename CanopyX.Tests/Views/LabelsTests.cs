using System.Text.Json.Nodes;
using CanopyX.Rendering;

namespace CanopyX.Tests.Views;

/// <summary>
/// A host translates the texts CanopyX writes itself once, on the view: the view document carries the ones the
/// browser needs, and the static outline reads the rest from the same place.
/// </summary>
public sealed class LabelsTests {
    [Fact]
    public void ToJson_EnglishLabels_AreNotWritten() {
        var view = View();
        view.Labels.Columns = "Columns";

        var json = JsonNode.Parse(view.ToJson())!;

        Assert.Null(json["labels"]);
        // Without a placeholder of its own the search box takes the label, in the browser.
        Assert.Null(json["search"]!["placeholder"]);
    }

    [Fact]
    public void ToJson_TranslatedLabels_CarryWhatTheBrowserReads() {
        var view = View();
        view.Labels.SearchPlaceholder = "Szukaj";
        view.Labels.SearchResultCount = "Wyniki: {count}";
        view.Labels.Yes = "Tak";
        view.Labels.UtcTime = "{time} UTC (czas uniwersalny)";
        view.Labels.OverflowNote = "Pokazano {shown} z {total} wierszy.";

        var json = JsonNode.Parse(view.ToJson())!;

        var labels = json["labels"]!.AsObject();
        Assert.Equal(new[] { "searchPlaceholder", "searchResultCount", "yes", "utcTime" }, labels.Select(item => item.Key));
        Assert.Equal("Wyniki: {count}", labels["searchResultCount"]!.GetValue<string>());
        // The outline's texts stay in C#.
        Assert.Null(json["search"]!["placeholder"]);
        CanopyX.Tests.Protocol.ProtocolSchema.AssertValid(view.ToJson(), "view with labels");

        view.Search!.Placeholder = "Szukaj plików";
        Assert.Equal("Szukaj plików", JsonNode.Parse(view.ToJson())!["search"]!["placeholder"]!.GetValue<string>());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("﻿")]
    public void Label_WithoutVisibleText_IsRejected(string? value) {
        var labels = new CanopyLabels();
        Assert.Throws<ArgumentException>(() => labels.Loading = value!);
        Assert.Equal("Loading…", labels.Loading);
        Assert.Throws<ArgumentNullException>(() => View().Labels = null!);
    }

    [Fact]
    public void DateLabels_MustSayWhereTheDateGoes_AndItGoesWhereTheFirstPlaceholderIs() {
        var labels = new CanopyLabels();
        Assert.Throws<ArgumentException>(() => labels.UtcTime = "UTC");
        Assert.Throws<ArgumentException>(() => labels.LocalTime = "czas lokalny");
        labels.UtcTime = "{time} UTC ({time})";

        var view = View();
        view.Labels = labels;
        Assert.Contains(">2026-09-27 10:15 UTC ({time})</td>", CanopyStaticHtml.Render(view));
    }

    [Fact]
    public void Names_AreTheSameInCSharpTheRuntimeAndTheSchema() {
        // Every label the browser reads, with a translation, comes out under the runtime's name.
        var labels = new CanopyLabels();
        var properties = typeof(CanopyLabels).GetProperties().Where(property => property.PropertyType == typeof(string)).ToList();
        foreach (var property in properties) {
            property.SetValue(labels, "x {time}");
        }

        // A flat grid writes them all.
        var grid = new CanopyDataGridView("labelled", "Labelled") { Labels = labels };
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        var written = JsonNode.Parse(grid.ToJson())!["labels"]!.AsObject().Select(item => item.Key).OrderBy(name => name, StringComparer.Ordinal).ToList();
        var outlineOnly = new[] { nameof(CanopyLabels.OverflowNote), nameof(CanopyLabels.UnknownTotal), nameof(CanopyLabels.HiddenRows), nameof(CanopyLabels.FullReport) };
        string Wire(string name) => char.ToLowerInvariant(name[0]) + name.Substring(1);
        var browser = properties.Where(property => !outlineOnly.Contains(property.Name)).ToList();
        Assert.Equal(browser.Select(property => Wire(property.Name)).OrderBy(name => name, StringComparer.Ordinal), written);

        // A tree writes the labels the tree runtimes read: the core and interaction texts and its toolbar menus' grid labels,
        // the names the tree and interactive runtimes define.
        var view = View();
        view.Labels = labels;
        var tree = JsonNode.Parse(view.ToJson())!["labels"]!.AsObject().Select(item => item.Key).OrderBy(name => name, StringComparer.Ordinal).ToList();
        Assert.Equal(RuntimeLabelNames(CanopyX.Html.CanopyRuntime.InteractiveTreeGrid), tree);
        Assert.All(RuntimeLabelNames(CanopyX.Html.CanopyRuntime.TreeGrid), name => Assert.Contains(name, tree));
        Assert.Contains("gridViews", RuntimeLabelNames(CanopyX.Html.CanopyRuntime.TreeGrid));
        Assert.DoesNotContain("gridSortAscending", tree);

        // The runtime's English texts are the C# defaults, name for name.
        var runtime = RuntimeLabels(CanopyX.Html.CanopyRuntime.ReportingGrid);
        Assert.Equal(written, runtime.Keys.OrderBy(name => name, StringComparer.Ordinal));
        var english = new CanopyLabels();
        foreach (var property in browser) {
            Assert.Equal(property.GetValue(english), runtime[Wire(property.Name)]);
        }
        // The tree runtimes define their toolbar menus' labels with the same English texts.
        foreach (var (name, text) in RuntimeLabels(CanopyX.Html.CanopyRuntime.InteractiveTreeGrid)) Assert.Equal(runtime[name], text);

        // And the schema knows exactly those names.
        var schema = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-2.schema.json")))!;
        var declared = schema["$defs"]!["view"]!["properties"]!["labels"]!["properties"]!.AsObject().Select(item => item.Key);
        Assert.Equal(written, declared.OrderBy(name => name, StringComparer.Ordinal));
    }

    [Fact]
    public void Clone_SharesTranslationsBetweenViews() {
        var polish = new CanopyLabels { Columns = "Kolumny", No = "Nie" };
        var first = View();
        var second = View();
        first.Labels = polish;
        second.Labels = polish.Clone();
        polish.Columns = "Widoczne";

        Assert.Equal("Widoczne", first.Labels.Columns);
        Assert.Equal("Kolumny", second.Labels.Columns);
        Assert.Equal("Nie", second.Labels.No);
    }

    [Fact]
    public void StaticOutline_ReadsTheViewsLabels_AndOptionsOverrideThemForOneOutline() {
        var view = View();
        view.Search = null;
        view.Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}");
        view.Roots.Add(new CanopyNode("lazy", "Lazy") { HasChildren = true });
        view.Labels.OverflowNote = "Pokazano {shown} z {total} wierszy.";
        view.Labels.UnknownTotal = "nieznanej liczby";
        view.Labels.HiddenRows = "{count} wierszy niżej";
        view.Labels.FullReport = "Pełny raport";
        view.Labels.Yes = "Tak";
        view.Labels.UtcTime = "{time} (UTC)";

        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { FullReportUrl = "full.html" });

        Assert.Contains("Pokazano 3 z nieznanej liczby wierszy.", html);
        Assert.Contains(">Pełny raport</a>", html);
        Assert.Contains("title=\"? wierszy niżej\"", html);
        Assert.Contains(">Tak</td>", html);
        Assert.Contains(">2026-09-27 10:15 (UTC)</td>", html);
        Assert.DoesNotContain("unknown", html);

        var once = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { OverflowNote = "{shown}/{total}", FullReportUrl = "full.html", FullReportText = "Więcej" });
        Assert.Contains("3/nieznanej liczby", once);
        Assert.Contains(">Więcej</a>", once);
    }

    /// <summary>The English labels a runtime defines, by name.</summary>
    private static Dictionary<string, string?> RuntimeLabels(CanopyX.Html.CanopyRuntime runtime) {
        var blocks = System.Text.RegularExpressions.Regex.Matches(CanopyX.Html.CanopyHtmlAssets.GetScript(runtime),
            @"DEFAULT_LABELS\s*=\s*Object\.freeze\((?:Object\.assign\(\{\},\s*DEFAULT_LABELS,\s*)?\{(?<body>[\s\S]*?)\}\)?\);");
        return blocks.SelectMany(block => System.Text.RegularExpressions.Regex.Matches(block.Groups["body"].Value,
                "(\\w+):\\s*(\"(?:[^\"\\\\]|\\\\.)*\")"))
            .ToDictionary(match => match.Groups[1].Value, match => System.Text.Json.JsonSerializer.Deserialize<string>(match.Groups[2].Value));
    }

    private static List<string> RuntimeLabelNames(CanopyX.Html.CanopyRuntime runtime) => RuntimeLabels(runtime).Keys.OrderBy(name => name, StringComparer.Ordinal).ToList();

    private static CanopyTreeView View() {
        var view = new CanopyTreeView("labelled", "Labelled") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("done", "Done"));
        view.Columns.Add(new CanopyColumn("when", "When") { Kind = CanopyColumnKind.DateTime });
        var node = new CanopyNode("a", "A");
        node.Cells["done"] = true;
        node.Cells["when"] = new DateTime(2026, 9, 27, 10, 15, 0, DateTimeKind.Utc);
        view.Roots.Add(node);
        view.Roots.Add(new CanopyNode("b", "B"));
        return view;
    }
}
