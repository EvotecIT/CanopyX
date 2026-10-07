using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Portable report grids using complete shipped labels and host-supplied translated data.</summary>
internal static class LocalizedGridsExample {
    internal static void Write(string output) {
        var languages = new[] { "pl", "de", "es" };
        var packs = new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish() };
        var titles = new[] { "Rejestr raportów", "Berichtsübersicht", "Lista de informes" };
        var columns = new[] { new[] { "Raport", "Stan", "Uwagi" }, new[] { "Bericht", "Status", "Hinweise" }, new[] { "Informe", "Estado", "Notas" } };
        var complete = new[] { "Zakończony", "Abgeschlossen", "Completado" };
        var review = new[] { "Do sprawdzenia", "Zu prüfen", "Pendiente de revisión" };
        for (var language = 0; language < languages.Length; language++) {
            var view = new CanopyGridView("localized-" + languages[language], titles[language]) {
                Labels = packs[language], AutoRowHeight = true, Selection = CanopySelectionMode.Multiple,
                Presentation = CanopyGridPresentation.Paged, PageLength = 10,
                Reporting = new CanopyGridReporting { HeaderFilters = true, SelectionControls = true, FilterGroups = true }
            };
            view.Columns.Add(new CanopyColumn("name", columns[language][0]) { Sortable = true });
            view.Columns.Add(new CanopyColumn("status", columns[language][1]) { Sortable = true });
            view.Columns.Add(new CanopyColumn("notes", columns[language][2]) { Wrap = true });
            view.HighlightRules.Add(new CanopyGridHighlightRule(new CanopyGridFilter("status", CanopyGridFilterOperator.Equal, review[language]), CanopyTone.Warning));
            for (var i = 0; i < 120; i++) {
                var row = new CanopyGridRow("record-" + i);
                row.Cells["name"] = columns[language][0] + " " + (i + 1);
                row.Cells["status"] = i % 5 == 0 ? review[language] : complete[language];
                row.Cells["notes"] = packs[language].GridResizeHelp;
                view.Rows.Add(row);
            }
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
                view.SaveHtmlPage(Path.Combine(output, "localized-grid-" + languages[language] + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                    new CanopyHtmlOptions { Title = titles[language], Language = languages[language], Theme = theme });
        }
    }
}
