using System.Globalization;
using System.Net;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Large reports (docs/large-data.md): a single-file grid of 100,000 rows as compact row data and as row objects, a grid
/// bundle whose rows load from sidecar files, and a report page with 24 grids, most of them in hidden tabs or below the
/// fold, that mount when they come into view. The data is a synthetic, deterministic asset inventory.
/// </summary>
internal static class LargeDataExample {
    private static readonly string[] Words = { "alpha", "bravo", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kestrel", "lumen",
        "meadow", "nectar", "onyx", "prairie", "quartz", "raven", "summit", "tundra", "umber", "violet", "willow", "xenon", "yarrow", "zephyr" };
    private static readonly string[] Categories = { "Hardware", "Software", "Service", "License", "Facility", "Vehicle", "Network", "Storage", "Printer", "Phone", "Furniture", "Other" };
    private static readonly (string Text, CanopyTone Tone)[] Statuses = { ("Active", CanopyTone.Success), ("Pending", CanopyTone.Warning), ("Retired", CanopyTone.Muted), ("Faulty", CanopyTone.Danger) };
    private static readonly string[] Regions = { "North", "South", "East", "West", "Central", "Coastal", "Highlands", "Islands" };

    /// <summary>The section grids of the report: 24 grids, 30,750 rows in all.</summary>
    internal static readonly int[] ReportGrids = { 4000, 250, 750, 1500, 3000, 400, 1250, 600, 2000, 350, 1000, 450, 2500, 300, 900, 1750, 500, 1100, 3500, 200, 800, 1400, 650, 1600 };

    internal static void Write(string output) {
        var folder = Path.Combine(output, "large");
        Directory.CreateDirectory(folder);
        var grid = Inventory("inventory", "Asset inventory", 100_000, 20261015);
        // The default format chooses compressed row data for 100,000 rows; the objects page asks for row objects, for comparison.
        grid.SaveHtmlPage(Path.Combine(folder, "grid-100k.html"), new CanopyHtmlOptions { Title = "100,000 assets, row data chosen automatically" });
        grid.SaveHtmlPage(Path.Combine(folder, "grid-100k-objects.html"), new CanopyHtmlOptions { Title = "100,000 assets, row objects",
            RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.Objects } });
        var bundle = grid.SaveHtmlBundle(Path.Combine(folder, "bundle"), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "100,000 assets, bundle",
            RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.CompactGzip } });
        WriteReport(Path.Combine(folder, "report.html"));
        Console.WriteLine($"large/: 100,000-row grid pages ({new FileInfo(Path.Combine(folder, "grid-100k.html")).Length / 1048576.0:N1} MB automatic, " +
            $"{new FileInfo(Path.Combine(folder, "grid-100k-objects.html")).Length / 1048576.0:N1} MB objects), bundle data {bundle.TotalBytes / 1048576.0:N1} MB in {bundle.FileCount} files, " +
            $"report of {ReportGrids.Length} grids ({new FileInfo(Path.Combine(folder, "report.html")).Length / 1048576.0:N1} MB)");
    }

    /// <summary>A grid of synthetic assets with twelve columns: text, toned status, dates and numbers.</summary>
    internal static CanopyDataGridView Inventory(string id, string label, int rows, uint seed) {
        var view = new CanopyDataGridView(id, label) { PageSize = 200, Selection = CanopySelectionMode.Multiple, Search = true, Noun = "assets" };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true, RowHeader = true });
        view.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });
        view.Columns.Add(new CanopyColumn("region", "Region") { Sortable = true });
        view.Columns.Add(new CanopyColumn("created", "Created") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("count", "Items") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("score", "Score") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("version", "Version") { Sortable = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Sortable = true });
        var state = seed;
        double Next() { state = unchecked(state * 1664525u + 1013904223u); return state / 4294967296.0; }
        int Pick(int count) => (int)(Next() * count);
        DateTimeOffset Date(int year) => new DateTimeOffset(year, 1 + Pick(12), 1 + Pick(28), Pick(24), Pick(60), 0, TimeSpan.Zero);
        for (var i = 0; i < rows; i++) {
            var row = new CanopyGridRow("a" + i.ToString("D7", CultureInfo.InvariantCulture));
            var status = Statuses[Pick(Statuses.Length)];
            row.Cells["name"] = "Asset " + i.ToString("D7", CultureInfo.InvariantCulture) + " " + Words[i % Words.Length];
            row.Cells["category"] = Categories[Pick(Categories.Length)];
            row.Cells["status"] = new CanopyCell(status.Text) { Tone = status.Tone };
            row.Cells["owner"] = "user" + Pick(500).ToString(CultureInfo.InvariantCulture);
            row.Cells["region"] = Regions[Pick(Regions.Length)];
            row.Cells["created"] = Date(2020 + Pick(4));
            row.Cells["modified"] = Date(2024 + Pick(3));
            row.Cells["size"] = Pick(1_000_000);
            row.Cells["count"] = Pick(5000);
            row.Cells["score"] = Math.Round(Next() * 100, 2);
            row.Cells["version"] = Pick(5) + "." + Pick(20) + "." + Pick(100);
            var words = 3 + Pick(6);
            var notes = new StringBuilder();
            for (var w = 0; w < words; w++) notes.Append(w == 0 ? "" : " ").Append(Words[Pick(Words.Length)]);
            if (Next() >= 0.3) row.Cells["notes"] = notes.ToString();
            view.Rows.Add(row);
        }

        return view;
    }

    /// <summary>
    /// The report: a tab strip whose first tab shows two grids, five hidden tabs of three or four grids each, and four grids
    /// below the fold. Every fragment mounts when it comes into view; the grids share one document, so the parts travel once,
    /// and the larger ones carry compact row data.
    /// </summary>
    private static void WriteReport(string path) {
        var document = new CanopyHtmlDocument();
        var html = new StringBuilder();
        html.Append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
            .Append("<meta name=\"color-scheme\" content=\"light dark\">\n<title>Report with 24 grids</title>\n<style>\n").Append(CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
            .Append("</style>\n<style>body{color-scheme:light dark;background:Canvas;color:CanvasText}.report-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:12px 0}.report-tabs button{font:inherit;padding:6px 12px;border:1px solid var(--hfx-color-border,#ccd);border-radius:6px;background:transparent;color:inherit;cursor:pointer}")
            .Append(".report-tabs button[aria-selected=true]{background:var(--hfx-color-accent,#2563eb);color:#fff;border-color:transparent}.report-section .cx-host{margin:0 0 16px}.report-spacer{min-height:110vh}main.cx-main{padding:16px 24px;box-sizing:border-box}@media (max-width:640px){main.cx-main{padding:12px 16px}}</style>\n<script>\n")
            .Append(CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid)).Append("</script>\n</head>\n<body class=\"cx-page\">\n<main class=\"cx-main\">\n")
            .Append("<h1>Asset report</h1>\n<p>24 sections of assets: two in the first tab, the others in tabs and below the fold, each mounted when it comes into view.</p>\n")
            .Append("<div class=\"report-tabs\" role=\"tablist\" aria-label=\"Report sections\">");
        var perTab = new[] { 2, 4, 4, 3, 4, 3 };
        for (var tab = 0; tab < perTab.Length; tab++) {
            html.Append("<button type=\"button\" role=\"tab\" id=\"tab-").Append(tab).Append("\" aria-controls=\"panel-").Append(tab).Append("\" aria-selected=\"")
                .Append(tab == 0 ? "true" : "false").Append("\" tabindex=\"").Append(tab == 0 ? "0" : "-1").Append("\">Section ").Append(tab + 1).Append("</button>");
        }

        html.Append("</div>\n");
        var grid = 0;
        string Fragment(int index) {
            var rows = ReportGrids[index];
            var view = Inventory("section-" + index.ToString(CultureInfo.InvariantCulture), "Section " + (index + 1).ToString(CultureInfo.InvariantCulture) + " assets", rows, 1000u + (uint)index);
            return view.ToHtmlFragment(new CanopyHtmlOptions { Theme = CanopyTheme.Auto, Height = "420px", MountWhenVisible = true, Document = document,
                RowData = new CanopyRowDataOptions { ChunkSize = 1000, Format = rows >= 1000 ? CanopyRowFormat.Compact : CanopyRowFormat.Objects } });
        }

        for (var tab = 0; tab < perTab.Length; tab++) {
            html.Append("<section class=\"report-section\" role=\"tabpanel\" id=\"panel-").Append(tab).Append("\" aria-labelledby=\"tab-").Append(tab).Append('"').Append(tab == 0 ? "" : " hidden").Append(">\n");
            for (var g = 0; g < perTab[tab]; g++) html.Append("<h2>").Append(WebUtility.HtmlEncode("Section " + (grid + 1))).Append("</h2>\n").Append(Fragment(grid++)).Append('\n');
            html.Append("</section>\n");
        }

        html.Append("<div class=\"report-spacer\"><p>Notes on the sections above. The remaining sections follow below the fold.</p></div>\n<section class=\"report-section\" aria-label=\"More sections\">\n");
        while (grid < ReportGrids.Length) html.Append("<h2>").Append(WebUtility.HtmlEncode("Section " + (grid + 1))).Append("</h2>\n").Append(Fragment(grid++)).Append('\n');
        html.Append("</section>\n<script>\ndocument.querySelector('.report-tabs').addEventListener('click', function (event) {\n")
            .Append("  var tab = event.target.closest('[role=tab]'); if (!tab) return;\n")
            .Append("  document.querySelectorAll('.report-tabs [role=tab]').forEach(function (other) { var on = other === tab; other.setAttribute('aria-selected', String(on)); other.tabIndex = on ? 0 : -1;\n")
            .Append("    document.getElementById(other.getAttribute('aria-controls')).hidden = !on; });\n});\n</script>\n</main>\n</body>\n</html>\n");
        File.WriteAllText(path, html.ToString(), new UTF8Encoding(false));
    }
}
