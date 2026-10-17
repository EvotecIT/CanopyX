using CanopyX.Html;
using System.Globalization;

namespace CanopyX.Examples;

/// <summary>The Graphite cell presentation gallery, with raw values and long histories.</summary>
internal static class GraphiteGridExample {
    internal static void Write(string output) {
        var view = View();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) view.SaveHtmlPage(Path.Combine(output, theme == CanopyTheme.Dark ? "graphite-grid-dark.html" : "graphite-grid.html"),
            new CanopyHtmlOptions { Title = "CanopyX Graphite presenters", Theme = theme });
    }

    /// <summary>The Graphite inventory: every presenter, history strips and sparklines among them.</summary>
    internal static CanopyDataGridView View() {
        var view = new CanopyDataGridView("graphite", "Graphite inventory") {
            Noun = "records", StatusBar = true, AutoRowHeight = true,
            Selection = CanopySelectionMode.Multiple, Presentation = CanopyGridPresentation.Paged, PageLength = 10
        };
        view.Reporting = new CanopyGridReporting { Responsive = true };
        view.Columns.Add(new CanopyColumn("name", "Record") { Sizing = CanopyColumnSizing.Preferred(180), Sortable = true, Presenter = CanopyGridPresenter.Identifier(mono: true), Section = "Identity" });
        view.Columns.Add(new CanopyColumn("state", "State") { Sizing = CanopyColumnSizing.Preferred(120), Sortable = true, Presenter = CanopyGridPresenter.Enum(), Section = "Status" });
        view.Columns.Add(new CanopyColumn("flag", "Enabled") { Sizing = CanopyColumnSizing.Preferred(80), Presenter = CanopyGridPresenter.Boolean(), Section = "Status" });
        view.Columns.Add(new CanopyColumn("latency", "Latency (ms)") { Sizing = CanopyColumnSizing.Preferred(130), Kind = CanopyColumnKind.Number, Sortable = true, Presenter = CanopyGridPresenter.Change("delta"), Aggregatable = true, Section = "Status" });
        view.Columns.Add(new CanopyColumn("delta", "Change") { Kind = CanopyColumnKind.Number, Hidden = true });
        view.Columns.Add(new CanopyColumn("progress", "Completion") { Sizing = CanopyColumnSizing.Preferred(140), Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.Progress(100, new[] { new CanopyGridThreshold(10, CanopyTone.Danger), new CanopyGridThreshold(25, CanopyTone.Warning) }) });
        view.Columns.Add(new CanopyColumn("history", "Last 90 days") { Sizing = CanopyColumnSizing.Preferred(150), Presenter = CanopyGridPresenter.StatusStrip(), Section = "Status" });
        view.Columns.Add(new CanopyColumn("bars", "History bars") { Sizing = CanopyColumnSizing.Preferred(100), Presenter = CanopyGridPresenter.SparklineBars() });
        view.Columns.Add(new CanopyColumn("line", "Trend") { Sizing = CanopyColumnSizing.Preferred(120), Presenter = CanopyGridPresenter.SparklineLine() });
        view.Columns.Add(new CanopyColumn("tags", "Tags") { Sizing = CanopyColumnSizing.Preferred(160), Presenter = CanopyGridPresenter.Tags() });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Sizing = CanopyColumnSizing.Preferred(240), Wrap = true });
        view.GetColumn("name").Sizing = CanopyColumnSizing.Preferred(180, 40, int.MaxValue);
        view.GetColumn("name").ResponsivePriority = 0;
        view.GetColumn("name").AlwaysVisible = true;
        view.GetColumn("state").Sizing = CanopyColumnSizing.Preferred(120, 40, int.MaxValue);
        view.GetColumn("state").ResponsivePriority = 1;
        view.GetColumn("state").AlwaysVisible = true;
        view.GetColumn("latency").Sizing = CanopyColumnSizing.Preferred(130, 80, int.MaxValue);
        view.GetColumn("latency").ResponsivePriority = 2;
        for (var i = 0; i < 23; i++) {
            var row = new CanopyGridRow("r" + i); var problem = i % 7 == 0;
            row.Cells["name"] = new CanopyCell("record-" + i.ToString("D3", CultureInfo.InvariantCulture)) { Secondary = "example.test" };
            row.Cells["state"] = new CanopyCell(problem ? "Failing" : "Healthy") { Tone = problem ? CanopyTone.Danger : CanopyTone.Success };
            row.Cells["flag"] = i % 4 != 0; row.Cells["latency"] = problem ? 318 : 142; row.Cells["delta"] = problem ? 84 : -6;
            row.Cells["progress"] = new CanopyCell(problem ? 8 : 46) { Text = problem ? "8 %" : "46 %" };
            var history = new CanopyCell(problem ? "Failing" : "Healthy"); var samples = new CanopyCell("Recent samples");
            for (var day = 0; day < 90; day++) history.Series.Add(new CanopyCellPeriod("Day " + (day + 1), state: day == 31 && problem ? "Failing" : "Healthy", tone: day == 31 && problem ? CanopyTone.Danger : CanopyTone.Success));
            for (var day = 0; day < 12; day++) samples.Series.Add(new CanopyCellPeriod("Day " + (day + 1), 10 + day % 5 * 4, tone: day == 7 ? CanopyTone.Warning : CanopyTone.Success));
            row.Cells["history"] = history; row.Cells["bars"] = samples; row.Cells["line"] = samples;
            row.Cells["tags"] = "Primary,Secondary,Review,Archive,Owner";
            row.Cells["notes"] = problem ? "A longer diagnostic explanation. " + string.Join(" ", Enumerable.Repeat("The host supplies each fact and its plain-text export value.", 10)) : "The record is healthy.";
            view.Rows.Add(row);
        }
        return view;
    }
}
