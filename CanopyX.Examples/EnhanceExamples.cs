using System.Globalization;
using System.Net;
using System.Reflection;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Progressive enhancement and simple init: a plain HTML table enhanced with one call, grids built from records and from a
/// URL, and server processing against a stand-in server. The pages load the grid runtime as plain files, the way a page
/// loads it from a CDN, with the parts beside it. A C#-authored paged grid shows the same pager settings from .NET.
/// </summary>
internal static class EnhanceExamples {
    private static readonly string[] Sites = { "Warsaw", "Berlin", "Madrid", "Lisbon", "Oslo" };
    private static readonly string[] Codes = { "WAW", "BER", "MAD", "LIS", "OSL" };
    private static readonly string[] Roles = { "app", "db", "web", "cache" };

    internal static void Write(string output) {
        CanopyHtmlAssets.WriteTo(Path.Combine(output, "enhance-assets"), CanopyAssetNaming.Plain, CanopyRuntime.DataGrid);
        var style = Template("examples.css");
        File.WriteAllText(Path.Combine(output, "enhance-table.html"), Template("enhance-table.html").Replace("{{example-style}}", style)
            .Replace("{{rows}}", TableRows(out var footer)).Replace("{{footer}}", footer), new UTF8Encoding(false));
        foreach (var page in new[] { "enhance-data.html", "enhance-server.html" })
            File.WriteAllText(Path.Combine(output, page), Template(page).Replace("{{example-style}}", style), new UTF8Encoding(false));
        WritePagedGrid(output);
    }

    // Sixty servers with sort values on usage and last contact, search codes on sites, status tones and a console link.
    private static string TableRows(out string footer) {
        var rows = new StringBuilder();
        var start = new DateTime(2026, 10, 15, 9, 0, 0, DateTimeKind.Utc);
        double cpuTotal = 0, memoryTotal = 0;
        const int count = 60;
        for (var i = 0; i < count; i++) {
            var site = i % Sites.Length;
            var name = Roles[i % Roles.Length] + "-" + Sites[site].ToLowerInvariant() + "-" + (i / Sites.Length + 1).ToString("D2", CultureInfo.InvariantCulture);
            var cpu = (i * 37 + 11) % 97;
            var memory = 4 + (i * 13) % 60;
            var seen = start.AddMinutes(-(i * 47 % 2880));
            // Only the states that need attention carry a tone; healthy rows stay quiet.
            var status = i % 17 == 5 ? ("danger", "Offline") : i % 9 == 4 ? ("warning", "Degraded") : ("", "Healthy");
            cpuTotal += cpu; memoryTotal += memory;
            rows.Append("<tr id=\"srv-").Append((i + 1).ToString("D3", CultureInfo.InvariantCulture)).Append("\"><th scope=\"row\">").Append(WebUtility.HtmlEncode(name))
                .Append("</th><td data-search=\"").Append(Sites[site]).Append(' ').Append(Codes[site]).Append("\">").Append(Sites[site])
                .Append(status.Item1.Length > 0 ? "</td><td data-tone=\"" + status.Item1 + "\">" : "</td><td>").Append(status.Item2)
                .Append("</td><td data-order=\"").Append(cpu.ToString(CultureInfo.InvariantCulture)).Append("\">").Append(cpu.ToString(CultureInfo.InvariantCulture)).Append(" %")
                .Append("</td><td data-order=\"").Append((memory * 1073741824L).ToString(CultureInfo.InvariantCulture)).Append("\">").Append(memory.ToString(CultureInfo.InvariantCulture)).Append(" GB")
                .Append("</td><td data-order=\"").Append(seen.ToString("yyyy-MM-dd'T'HH:mm'Z'", CultureInfo.InvariantCulture)).Append("\">")
                .Append(seen.ToString("d MMM, HH:mm", CultureInfo.InvariantCulture))
                .Append("</td><td><a href=\"#srv-").Append((i + 1).ToString("D3", CultureInfo.InvariantCulture)).Append("\">Open console</a></td></tr>\n");
        }
        footer = "<tr><th scope=\"row\">Average</th><td></td><td></td><td>" + (cpuTotal / count).ToString("0", CultureInfo.InvariantCulture) + " %</td><td>" +
            (memoryTotal / count).ToString("0", CultureInfo.InvariantCulture) + " GB</td><td></td><td></td></tr>";
        return rows.ToString().TrimEnd('\n');
    }

    // The pager settings authored in C#: page-size choices with All, numbered pages and the result sentence.
    private static void WritePagedGrid(string output) {
        var grid = new CanopyDataGridView("paged-servers", "Servers") { Presentation = CanopyGridPresentation.Paged, PageLength = 10, Selection = CanopySelectionMode.Multiple };
        grid.Pager.PageLengths.Add(10);
        grid.Pager.PageLengths.Add(25);
        grid.Pager.PageLengths.Add(50);
        grid.Pager.PageLengths.Add(CanopyGridPageLength.All());
        grid.Pager.PageNumbers = 7;
        grid.Pager.Info = CanopyGridPagerInfo.Sentence;
        grid.Columns.Add(new CanopyColumn("name", "Server") { Sortable = true, RowHeader = true });
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("cpu", "CPU") { Kind = CanopyColumnKind.Number, Sortable = true });
        for (var i = 0; i < 180; i++) {
            var row = new CanopyGridRow("server-" + (i + 1).ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = Roles[i % Roles.Length] + "-" + Sites[i % Sites.Length].ToLowerInvariant() + "-" + (i / Sites.Length + 1).ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["site"] = Sites[i % Sites.Length];
            var cpu = (i * 37 + 11) % 97;
            row.Cells["cpu"] = new CanopyCell(cpu) { Text = cpu.ToString(CultureInfo.InvariantCulture) + " %" };
            grid.Rows.Add(row);
        }
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : "";
            File.WriteAllText(Path.Combine(output, "paged-grid" + suffix + ".html"), grid.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX pager settings", Theme = theme }));
        }
    }

    private static string Template(string name) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)
            ?? throw new InvalidOperationException("Missing template " + name);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
