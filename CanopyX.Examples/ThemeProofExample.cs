using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>The shared controls, a grid, a tree, a calendar, a matrix and a change list on one page, so a host palette can be checked against all of them at once.</summary>
internal static class ThemeProofExample {
    internal static void Write(string output) {
        var grid = Records("proof-grid", 40);
        var embedded = Records("proof-embedded", 12);

        var tree = ExampleViews.FileShares("proof-tree", new SyntheticFileTree().Build(shares: 2, departments: 3, projects: 2, minFiles: 2, maxFiles: 4, longListFiles: 5));
        tree.DeepLink = false;
        tree.StateKey = null;

        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.theme-proof.html")!;
        using var reader = new StreamReader(stream);
        using var valuesStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.token-fallbacks.json")!;
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(valuesStream)!;
        // The page's own layout uses the same fallbacks as the runtime, so it reads correctly without a host stylesheet.
        var page = Regex.Replace(reader.ReadToEnd(), @"var\((--hfx-[a-z0-9-]+)\)", match => values.TryGetValue(match.Groups[1].Value, out var value)
            ? "var(" + match.Groups[1].Value + "," + value + ")" : match.Value);
        var document = new CanopyHtmlDocument();
        CanopyHtmlOptions Options(string height) => new CanopyHtmlOptions { Height = height, Document = document };
        var matrix = MatrixExamples.Services(12);
        page = page.Replace("{{grid}}", grid.ToHtmlFragment(Options("420px"))).Replace("{{tree}}", tree.ToHtmlFragment(Options("420px")))
            .Replace("{{embedded}}", embedded.ToHtmlFragment(new CanopyHtmlOptions { Height = "360px", Document = document, Chrome = CanopyChrome.Embedded }))
            .Replace("{{calendar}}", CalendarBasicExample.Basic().ToHtmlFragment(Options("560px")))
            .Replace("{{matrix}}", matrix.ToHtmlFragment(Options("420px")))
            .Replace("{{changes}}", ChangeViewsExample.List().ToHtmlFragment(Options("480px")))
            .Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid))
            .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid));
        File.WriteAllText(Path.Combine(output, "theme-proof.html"), page);
    }

    private static CanopyDataGridView Records(string id, int count) {
        var grid = new CanopyDataGridView(id, "Workspace records") {
            Selection = CanopySelectionMode.Multiple,
            Reporting = new CanopyGridReporting { HeaderFilters = true }
        };
        grid.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(220), Sortable = true });
        grid.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("state", "Status") { Presenter = CanopyGridPresenter.Enum() });
        grid.Columns.Add(new CanopyColumn("count", "Items") { Kind = CanopyColumnKind.Number, Sortable = true });
        var states = new[] { ("Ready", CanopyTone.Success), ("Needs review", CanopyTone.Warning), ("Failed", CanopyTone.Danger), ("In progress", CanopyTone.Info) };
        for (var index = 0; index < count; index++) {
            var state = states[index % states.Length];
            var row = new CanopyGridRow("record-" + index);
            row.Cells["name"] = new[] { "Service capacity", "Monthly summary", "Shared documents", "Regional activity" }[index % 4] + " " + (index + 1);
            row.Cells["team"] = new[] { "Operations", "Platform", "Support" }[index % 3];
            row.Cells["state"] = new CanopyCell(state.Item1) { Tone = state.Item2 };
            row.Cells["count"] = (index + 1) * 7;
            grid.Rows.Add(row);
        }
        return grid;
    }
}
