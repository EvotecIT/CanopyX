using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Export formats: a page registers its own writers, and the grid's Export menu lists them after CSV with the menu's
/// scope picker, progress and cancellation. A tree grid runs the same writers on its visible rows.
/// </summary>
internal static class ExportFormatsExample {
    // Two dependency-free writers stand in for a host's Excel or PDF writer: the API is the same.
    private const string Writers = """
<script>
(() => {
  const escape = value => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  CanopyX.registerExportFormat({ id: "json", label: "Download JSON", extension: "json", mime: "application/json",
    async write(capture, { signal, progress }) {
      const records = [];
      for await (const row of capture.rows({ signal })) {
        const record = { id: row.id };
        if (row.level) { record.level = row.level; record.path = row.path; }
        for (const column of capture.request.columns) record[column.id] = row.cells[column.id].value;
        if (records.push(record) % 500 === 0) progress(records.length);
      }
      return new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    } });
  CanopyX.registerExportFormat({ id: "markdown", label: "Download Markdown", extension: "md", mime: "text/markdown",
    async write(capture, { signal }) {
      const columns = capture.request.columns;
      const lines = ["| " + columns.map(column => escape(column.title)).join(" | ") + " |",
        "|" + columns.map(column => column.kind === "number" ? " ---: " : " --- ").join("|") + "|"];
      for await (const row of capture.rows({ signal }))
        lines.push("| " + columns.map((column, index) => (index === 0 && row.level ? "  ".repeat(row.level - 1) : "") + escape(row.cells[column.id].text)).join(" | ") + " |");
      return new Blob([lines.join("\n") + "\n"], { type: "text/markdown" });
    } });
})();
</script>
""";

    private const string TreeButton = """
<p style="margin:12px 16px"><button type="button" id="export-tree-download" style="font:inherit;padding:6px 12px;border:1px solid CanvasText;border-radius:6px;background:Canvas;color:CanvasText">Export visible rows as Markdown</button></p>
<script>
document.getElementById("export-tree-download").addEventListener("click", () =>
  document.querySelector("[data-canopyx-host]").canopyx.exportAs("markdown").catch(error => console.error(error)));
</script>
""";

    internal static void Write(string output) {
        var grid = new CanopyDataGridView("export-formats", "Export formats") {
            Reporting = new CanopyGridReporting(), Selection = CanopySelectionMode.Multiple, PageSize = 100
        };
        grid.ExportFormats.Add("json");
        grid.ExportFormats.Add("markdown");
        grid.Columns.Add(new CanopyColumn("name", "Service") { Sizing = CanopyColumnSizing.Preferred(220), Sortable = true });
        grid.Columns.Add(new CanopyColumn("state", "State") { Sizing = CanopyColumnSizing.Preferred(140), Sortable = true });
        grid.Columns.Add(new CanopyColumn("latency", "Latency (ms)") { Sizing = CanopyColumnSizing.Preferred(140), Kind = CanopyColumnKind.Number, Sortable = true });
        var states = new[] { "Healthy", "Healthy", "Warning", "Critical" };
        for (var i = 0; i < 250; i++) {
            var row = new CanopyGridRow("service-" + i.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Service " + i.ToString(CultureInfo.InvariantCulture);
            row.Cells["state"] = new CanopyCell(states[i % states.Length]) { Tone = i % 4 == 3 ? CanopyTone.Danger : i % 4 == 2 ? CanopyTone.Warning : CanopyTone.Success };
            row.Cells["latency"] = new CanopyCell(i * 3 % 97) { Text = (i * 3 % 97).ToString(CultureInfo.InvariantCulture) + " ms" };
            grid.Rows.Add(row);
        }

        var tree = new CanopyTreeView("export-tree", "Export a tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        for (var i = 0; i < 4; i++) {
            var folder = new CanopyNode("folder-" + i.ToString(CultureInfo.InvariantCulture), "Folder " + i.ToString(CultureInfo.InvariantCulture)) { Expanded = i < 2 };
            folder.Cells["size"] = new CanopyCell(i * 100) { Text = (i * 100).ToString(CultureInfo.InvariantCulture) + " KiB" };
            for (var j = 0; j < 3; j++) {
                var file = new CanopyNode(folder.Id + "-file-" + j.ToString(CultureInfo.InvariantCulture), "File " + j.ToString(CultureInfo.InvariantCulture));
                file.Cells["size"] = new CanopyCell(j * 10 + i) { Text = (j * 10 + i).ToString(CultureInfo.InvariantCulture) + " KiB" };
                folder.Children.Add(file);
            }
            tree.Roots.Add(folder);
        }

        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : "";
            var gridPage = grid.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX export formats", Theme = theme });
            File.WriteAllText(Path.Combine(output, "export-formats" + suffix + ".html"), gridPage.Replace("</body>", Writers + "</body>"));
            var treePage = tree.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX tree export", Theme = theme, Runtime = CanopyRuntime.InteractiveTreeGrid });
            File.WriteAllText(Path.Combine(output, "export-formats-tree" + suffix + ".html"), treePage.Replace("</body>", Writers + TreeButton + "</body>"));
        }
    }
}
