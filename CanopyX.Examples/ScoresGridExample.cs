using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Team scores with number columns next to text columns, in English and Polish, light and dark: the header of a number
/// column keeps its title over the numbers and, where its menu always shows (phones, touch), the menu after the title.
/// </summary>
internal static class ScoresGridExample {
    private static readonly string[] Teams = { "Platform", "Payments", "Search", "Mobile", "Data", "Identity", "Support", "Billing" };

    internal static void Write(string output) {
        foreach (var (language, title, columns) in new[] {
            ("en", "Team scores", new[] { "Team", "Owner", "Overall", "Coverage" }),
            ("pl", "Wyniki zespołów", new[] { "Zespół", "Właściciel", "Ogółem", "Pokrycie" }) }) {
            var view = new CanopyDataGridView("scores-" + language, title) {
                Labels = language == "pl" ? CanopyLabels.Polish() : new CanopyLabels(),
                Reporting = new CanopyGridReporting { HeaderFilters = true }
            };
            view.Columns.Add(new CanopyColumn("team", columns[0]) { Sortable = true });
            view.Columns.Add(new CanopyColumn("owner", columns[1]) { Sortable = true });
            // The overall score stays on phones, next to the team.
            view.Columns.Add(new CanopyColumn("overall", columns[2]) { Kind = CanopyColumnKind.Number, Sortable = true, ResponsivePriority = 0 });
            view.Columns.Add(new CanopyColumn("coverage", columns[3]) { Kind = CanopyColumnKind.Number, Sortable = true });
            for (var i = 0; i < Teams.Length; i++) {
                var row = new CanopyGridRow("team-" + i);
                row.Cells["team"] = Teams[i];
                row.Cells["owner"] = "Owner " + (char)('A' + i);
                row.Cells["overall"] = 52 + i * 37 % 47;
                row.Cells["coverage"] = 61 + i * 23 % 38;
                view.Rows.Add(row);
            }
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                view.SaveHtmlPage(Path.Combine(output, "scores-grid-" + language + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                    new CanopyHtmlOptions { Title = title, Language = language, Theme = theme });
            }
        }
    }
}
