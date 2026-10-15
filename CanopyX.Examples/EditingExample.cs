using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// An editable asset register: every editor type (text, number, date, date and time, time, select, toggle and lookup),
/// validation from the C# definition and from the page, read-only rows, undo and redo, and a batch save through the
/// <c>gridCommit</c> protocol to a mock service that answers per row (docs/editing.md).
/// </summary>
internal static class EditingExample {
    // The page's part: a uniqueness check that answers later, a rule across two columns, read-only retired assets except
    // their status, and a mock service. The service checks each row's original values against what it stores, so a row
    // changed "by someone else" (the status of asset AS-1003 changes behind the reader's back a second after the page loads) is a conflict.
    private const string Script = """
<style>
.register-log{box-sizing:border-box;margin:0;padding:10px 16px 0;font:13px/1.4 system-ui,sans-serif;color:CanvasText}
.register-log b{font-weight:600}
body.cx-page > .cx-main > .cx-host{height:calc(100vh - 40px)}
</style>
<script>
(() => {
  const log = text => { document.getElementById("register-log").textContent = text; };
  // The mock service keeps its own copy of the rows and a revision, as a database would.
  const stored = new Map(), taken = new Set();
  let revision = 1;
  // The service starts from the rows the page carries.
  const start = rows => {
    if (stored.size) return;
    for (const row of rows) { stored.set(row.id, { ...row.cells }); taken.add(String(row.cells.name).toLowerCase()); }
    setTimeout(() => { const row = stored.get("asset-003"); if (row) row.status = "In stock"; }, 1000);
  };
  const service = batch => new Promise(resolve => setTimeout(() => {
    const rows = batch.rows.map(change => {
      const row = stored.get(change.id);
      const value = cell => cell !== null && typeof cell === "object" ? cell.value ?? null : cell ?? null;
      if (!row) return { id: change.id, status: "error", error: "This asset no longer exists." };
      if (Object.entries(change.original).some(([column, original]) => value(row[column]) !== original)) return { id: change.id, status: "conflict" };
      if (typeof change.values.cost === "number" && change.values.cost > 50000) return { id: change.id, status: "error", errors: { cost: "Purchases above 50,000 need approval." } };
      Object.assign(row, change.values);
      return { id: change.id, status: "saved", cells: "name" in change.values ? { name: String(change.values.name).trim() } : undefined };
    });
    revision++;
    resolve({ protocol: "canopyx/2", type: "gridCommitResult", view: batch.view, revision: "r" + revision, rows: rows.map(row => JSON.parse(JSON.stringify(row))) });
  }, 400));
  CanopyX.configure("asset-register", {
    editing: {
      isEditable: (row, column) => row.cells.status !== "Retired" || column === "status",
      validators: {
        name: (value, row) => new Promise(resolve => setTimeout(() => resolve(
          typeof value === "string" && taken.has(value.trim().toLowerCase()) && value.trim().toLowerCase() !== String(stored.get(row.id)?.name).toLowerCase() ? "Another asset already has this name." : null), 150))
      },
      validateRow: row => row.cells.warranty && row.cells.purchased && Date.parse(cellValue(row.cells.warranty)) < Date.parse(cellValue(row.cells.purchased))
        ? { warranty: "The warranty cannot end before the purchase." } : null,
      commit: async batch => {
        log("Sending gridCommit: " + batch.rows.length + " rows at revision " + batch.revision + "…");
        const result = await service(batch);
        const saved = result.rows.filter(row => row.status === "saved").length;
        log("Mock service answered at revision " + result.revision + ": " + saved + " saved, " + (result.rows.length - saved) + " not saved.");
        return result;
      }
    },
    onQuery: () => start(document.querySelector("[data-canopyx-host]").canopyx.view.rows),
    onCellValueChanged: event => log("Changed " + event.column + " of " + event.id + " (" + event.source + ")."),
    onError: event => log(event.error.message)
  });
  function cellValue(cell) { return cell !== null && typeof cell === "object" ? cell.value : cell; }
})();
</script>
""";

    internal static CanopyDataGridView View() {
        var grid = new CanopyDataGridView("asset-register", "Asset register") { Selection = CanopySelectionMode.Multiple, PageSize = 200, Noun = "assets", TimeZone = CanopyTimeZone.Utc };
        grid.Columns.Add(new CanopyColumn("tag", "Asset tag") { Sortable = true, Editable = true, Sizing = CanopyColumnSizing.Preferred(110),
            Validation = new CanopyCellValidation { Required = true, Pattern = "[A-Z]{2}-\\d{4}", Message = "Use two capital letters, a hyphen and four digits, like AS-1042." } });
        grid.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true, Editable = true, Sizing = CanopyColumnSizing.Preferred(200),
            Validation = new CanopyCellValidation { Required = true, MaxLength = 60 } });
        grid.Columns.Add(new CanopyColumn("category", "Category") { Sortable = true, Editable = true,
            Editor = CanopyCellEditor.Select("Laptop", "Monitor", "Phone", "Printer", "Server", "Desk") });
        grid.Columns.Add(new CanopyColumn("cost", "Cost") { Kind = CanopyColumnKind.Number, Sortable = true, Editable = true, Editor = CanopyCellEditor.Number(0, 100000, 0.01) });
        grid.Columns.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime, Sortable = true, Editable = true, Editor = CanopyCellEditor.Date(),
            Validation = new CanopyCellValidation { Earliest = new DateTimeOffset(2015, 1, 1, 0, 0, 0, TimeSpan.Zero) } });
        grid.Columns.Add(new CanopyColumn("warranty", "Warranty ends") { Kind = CanopyColumnKind.DateTime, Editable = true, Editor = CanopyCellEditor.DateTime() });
        grid.Columns.Add(new CanopyColumn("audit", "Audit time") { Editable = true, Editor = CanopyCellEditor.Time() });
        grid.Columns.Add(new CanopyColumn("insured", "Insured") { Editable = true, Editor = CanopyCellEditor.Toggle() });
        grid.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true, Editable = true, Editor = CanopyCellEditor.Lookup() });
        grid.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Editable = true, Editor = CanopyCellEditor.Select("In use", "In stock", "Repair", "Retired") });
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        grid.Query = new CanopyGridQuery(grid.Id);
        grid.Query.Sort.Add(new CanopyGridSort("tag"));
        var categories = new[] { "Laptop", "Monitor", "Phone", "Printer", "Server", "Desk" };
        var owners = new[] { "Ada Park", "Ben Ortiz", "Chen Wu", "Dana Kim", "Eli Novak", "Farah Haddad", "Gus Moreau", "Hana Sato" };
        var statuses = new[] { "In use", "In use", "In stock", "Repair", "In use", "Retired" };
        var sites = new[] { "North campus", "South campus", "Harbor office", "Remote" };
        for (var i = 0; i < 60; i++) {
            var row = new CanopyGridRow("asset-" + i.ToString("D3", CultureInfo.InvariantCulture));
            var category = categories[i % categories.Length];
            row.Cells["tag"] = "AS-" + (1000 + i).ToString(CultureInfo.InvariantCulture);
            row.Cells["name"] = category + " " + (i + 1).ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["category"] = category;
            row.Cells["cost"] = Math.Round(180 + i * 37.25 % 2400, 2);
            var purchased = new DateTime(2019 + i % 6, 1 + i % 12, 1 + i % 27, 0, 0, 0, DateTimeKind.Utc);
            row.Cells["purchased"] = purchased;
            row.Cells["warranty"] = purchased.AddYears(3).AddHours(17);
            row.Cells["audit"] = (8 + i % 9).ToString("D2", CultureInfo.InvariantCulture) + ":" + (i * 15 % 60).ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["insured"] = i % 4 != 0;
            row.Cells["owner"] = owners[i % owners.Length];
            row.Cells["status"] = statuses[i % statuses.Length];
            row.Cells["site"] = sites[i % sites.Length];
            grid.Rows.Add(row);
        }
        return grid;
    }

    internal static void Write(string output) {
        var grid = View();
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = grid.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX editing", Theme = theme });
            File.WriteAllText(Path.Combine(output, "editing" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), Inject(page));
        }
    }

    // The configuration runs before DOMContentLoaded, when the runtime mounts the page's grid; the log line sits above it.
    private static string Inject(string page) => page.Replace("<main class=\"cx-main\">", "<main class=\"cx-main\">\n<p class=\"register-log\" id=\"register-log\" role=\"status\">Edit a cell: F2, Enter or start typing. Save sends the changes to a mock service.</p>")
        .Replace("</body>", Script + "</body>");
}
