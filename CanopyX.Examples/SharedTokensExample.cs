using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A standalone view using the same semantic roles as a host page.</summary>
internal static class SharedTokensExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("shared-tokens", "Workspace records") {
            Selection = CanopySelectionMode.Multiple,
            Reporting = new CanopyGridReporting { HeaderFilters = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(320), Sortable = true });
        view.Columns.Add(new CanopyColumn("team", "Team") { Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "Status") { Presenter = CanopyGridPresenter.Enum() });
        view.Columns.Add(new CanopyColumn("count", "Items") { Kind = CanopyColumnKind.Number, Sortable = true });
        var states = new[] { ("Ready", CanopyTone.Success), ("Needs attention", CanopyTone.Warning), ("Unavailable", CanopyTone.Danger), ("In progress", CanopyTone.Info) };
        var names = new[] { "Workspace overview", "Service capacity", "Monthly resource summary", "Shared documentation", "Regional activity", "Long record names remain available in the details view" };
        for (var index = 0; index < 24; index++) {
            var state = states[index % states.Length];
            var row = new CanopyGridRow("record-" + index);
            row.Cells["name"] = names[index % names.Length] + " " + (index + 1);
            row.Cells["team"] = new[] { "Operations", "Platform", "Support" }[index % 3];
            row.Cells["state"] = new CanopyCell(state.Item1) { Tone = state.Item2 };
            row.Cells["count"] = (index + 1) * 12;
            view.Rows.Add(row);
        }
        var page = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX shared design tokens" });
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.shared-tokens.html")!;
        using var reader = new StreamReader(stream);
        using var valuesStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.token-fallbacks.json")!;
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(valuesStream)!;
        var template = Regex.Replace(reader.ReadToEnd(), @"var\((--hfx-[a-z0-9-]+)\)", match => "var(" + match.Groups[1].Value + "," + values[match.Groups[1].Value] + ")");
        page = page.Replace("</head>", template.Substring(0, template.IndexOf("<!-- content -->", StringComparison.Ordinal)) + "</head>");
        page = page.Replace("<body class=\"cx-page\">", "<body class=\"cx-page cx-token-example\">" + template.Substring(template.IndexOf("<!-- content -->", StringComparison.Ordinal) + "<!-- content -->".Length));
        File.WriteAllText(Path.Combine(output, "shared-tokens.html"), page);
    }
}
