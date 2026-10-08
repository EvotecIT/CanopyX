using System.Reflection;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Grids mount while tabs, an accordion and details are closed, without host refresh calls.</summary>
internal static class ContainedGridsExample {
    internal static void Write(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.contained-grids.html")!;
        using var reader = new StreamReader(stream);
        var template = reader.ReadToEnd();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid))
                .Replace("{{theme}}", theme == CanopyTheme.Dark ? "dark" : "light");
            foreach (var id in new[] { "tab-grid", "accordion-grid", "details-grid" }) {
                var view = new CanopyDataGridView(id, id.Replace('-', ' ')) {
                    Reporting = new CanopyGridReporting { Responsive = true }, PageSize = 100
                };
                view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(180), Sortable = true });
                view.Columns.Add(new CanopyColumn("notes", "Notes") { Sizing = CanopyColumnSizing.Preferred(220) });
                view.GetColumn("notes").Sizing = CanopyColumnSizing.Flex(1, 80, 900, preferredWidth: 220);
                for (var i = 0; i < 500; i++) {
                    var row = new CanopyGridRow("record-" + i);
                    row.Cells["name"] = "Record " + i; row.Cells["notes"] = "Container sizing follows the visible space.";
                    view.Rows.Add(row);
                }
                page = page.Replace("{{" + id + "}}", view.ToHtmlFragment(new CanopyHtmlOptions { Theme = theme, Height = "320px" }));
            }
            File.WriteAllText(Path.Combine(output, "contained-grids" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page);
        }
    }
}
