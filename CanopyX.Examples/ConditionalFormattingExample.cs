using System.Globalization;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>
/// A server health grid with conditional formatting (docs/conditional-formatting.md): a row highlight for servers that are
/// down, a tone for degraded ones, a data bar on CPU, a colour scale on latency, threshold bands on low disk space, a
/// stale check-in cue, the legend and the rule editor. It also writes the script-free table of the same rules.
/// </summary>
internal static class ConditionalFormattingExample {
    internal static CanopyDataGridView View(int count = 120) {
        var view = new CanopyDataGridView("server-health", "Server health") {
            Selection = CanopySelectionMode.Multiple, PageSize = 500, StateKey = "server-health", Noun = "servers",
            Formatting = new CanopyFormatOptions { Legend = true, Editor = true }
        };
        view.Columns.Add(new CanopyColumn("server", "Server") { Sortable = true, RowHeader = true, Sizing = CanopyColumnSizing.Preferred(170) });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(150) });
        view.Columns.Add(new CanopyColumn("cpu", "CPU %") { Kind = CanopyColumnKind.Number, Sortable = true, Sizing = CanopyColumnSizing.Preferred(170) });
        view.Columns.Add(new CanopyColumn("memory", "Memory %") { Kind = CanopyColumnKind.Number, Sortable = true, Sizing = CanopyColumnSizing.Preferred(110) });
        view.Columns.Add(new CanopyColumn("latency", "Latency (ms)") { Kind = CanopyColumnKind.Number, Sortable = true, Sizing = CanopyColumnSizing.Preferred(120) });
        view.Columns.Add(new CanopyColumn("disk", "Disk free %") { Kind = CanopyColumnKind.Number, Sortable = true, Sizing = CanopyColumnSizing.Preferred(130) });
        view.Columns.Add(new CanopyColumn("checked", "Last check-in") { Kind = CanopyColumnKind.DateTime, Sortable = true, Sizing = CanopyColumnSizing.Preferred(230) });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(110) });

        var statuses = new[] { "Healthy", "Healthy", "Healthy", "Degraded", "Healthy", "Healthy", "Down", "Healthy", "Maintenance", "Healthy", "Healthy", "Healthy" };
        var regions = new[] { "North", "South", "East", "West" };
        var now = new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < count; i++) {
            var row = new CanopyGridRow("srv-" + i.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["server"] = "srv-" + regions[i % 4].ToLowerInvariant() + "-" + i.ToString("D3", CultureInfo.InvariantCulture);
            row.Cells["status"] = statuses[i % statuses.Length];
            row.Cells["cpu"] = (i * 37 + 11) % 101;
            row.Cells["memory"] = (i * 53 + 7) % 89 + 10;
            row.Cells["latency"] = 8 + (i * 29) % 460;
            row.Cells["disk"] = (i * 41 + 3) % 97 + 2;
            row.Cells["checked"] = now.AddHours(-((i * 17) % 520));
            row.Cells["region"] = regions[i % 4];
            view.Rows.Add(row);
        }

        view.FormatRules.Add(new CanopyFormatRule("down", CanopyFormatStyle.Highlight(CanopyTone.Danger)) {
            Label = "Server down", Description = "Server is down", Target = CanopyFormatTarget.Row,
            When = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Down")
        });
        view.FormatRules.Add(CanopyFormatRule.ForCell("degraded", "status", CanopyFormatStyle.Highlight(CanopyTone.Warning),
            CanopyFormatCondition.Where("status", CanopyFormatOperator.In, "Degraded", "Maintenance")));
        view.FormatRules[1].Label = "Degraded or in maintenance";
        view.FormatRules.Add(CanopyFormatRule.ForCell("cpu-load", "cpu", CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100)));
        view.FormatRules[2].Label = "CPU load";
        view.FormatRules.Add(CanopyFormatRule.ForCell("cpu-hot", "cpu", new CanopyFormatStyle { Tone = CanopyTone.Danger, Emphasis = CanopyFormatEmphasis.Text, Icon = CanopyFormatIcons.Up },
            CanopyFormatCondition.Where("cpu", CanopyFormatOperator.GreaterThan, 90)));
        view.FormatRules[3].Label = "CPU above 90%";
        view.FormatRules.Add(CanopyFormatRule.ForCell("latency", "latency", CanopyFormatStyle.ColorScale(CanopyFormatColorScale.ThreeColor(CanopyTone.Success, CanopyTone.Warning, CanopyTone.Danger))));
        view.FormatRules[4].Label = "Latency";
        var disk = CanopyFormatRule.ForCell("disk-low", "disk", CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(10, CanopyTone.Danger, "Critical"), new CanopyFormatBand(null, CanopyTone.Warning, "Low")),
            CanopyFormatCondition.Where("disk", CanopyFormatOperator.LessThanOrEqual, 20));
        disk.Label = "Disk space";
        view.FormatRules.Add(disk);
        view.FormatRules.Add(CanopyFormatRule.ForCell("stale", "checked", new CanopyFormatStyle { Tone = CanopyTone.Muted, Emphasis = CanopyFormatEmphasis.Text, Icon = CanopyFormatIcons.Clock, Cue = "stale" },
            CanopyFormatCondition.Where("checked", CanopyFormatOperator.LessThan, now.AddDays(-14))));
        view.FormatRules[6].Label = "No check-in for 14 days";
        return view;
    }

    internal static void Write(string output) {
        var view = View();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark })
            view.SaveHtmlPage(Path.Combine(output, "conditional-formatting" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"),
                new CanopyHtmlOptions { Title = "CanopyX conditional formatting", Theme = theme });
        // The same rules in the script-free table that email, print and Word receive.
        var fallback = CanopyStaticHtml.RenderGrid(view, (CanopyGridPage?)null, new CanopyStaticHtmlOptions { MaxRows = 24 });
        using var template = typeof(ConditionalFormattingExample).Assembly.GetManifestResourceStream("CanopyX.Examples.Templates.conditional-formatting-static.html")!;
        using var reader = new StreamReader(template);
        File.WriteAllText(Path.Combine(output, "conditional-formatting-static.html"),
            reader.ReadToEnd().Replace("{{content}}", fallback));
    }
}
