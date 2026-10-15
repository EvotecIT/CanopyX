using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A small page plugin: a cell renderer columns choose by name, a toolbar button, a more-menu entry, an event subscription
/// and the init and destroy hooks. The same plugin serves a flat grid and a tree (docs/plugins.md).
/// </summary>
internal static class PluginsExample {
    // The plugin is registered before the page mounts its views; plugins apply to the grids and trees created afterwards.
    private const string Plugin = """
<style>
.load-meter{display:inline-flex;align-items:center;gap:8px;width:100%;font-variant-numeric:tabular-nums}
.load-meter-track{flex:1;height:6px;border-radius:3px;background:color-mix(in srgb,var(--cx-text) 12%,transparent);overflow:hidden}
.load-meter-fill{display:block;height:100%;background:var(--cx-accent)}
.load-meter-text{min-width:3.5ch;text-align:right}
.plugin-log{box-sizing:border-box;height:36px;margin:0;padding:10px 16px 0;font-size:13px}
body.cx-page > .cx-main > .cx-host{height:calc(100vh - 36px)}
</style>
<script>
(() => {
  const log = text => { document.getElementById("plugin-log").textContent = text; };
  // A cell renderer gets what a host renderer gets: the record (a grid row or a tree node), the element and a context.
  function meter(record, element, context) {
    const id = typeof context.column === "string" ? context.column : context.column.id;
    const cell = record.cells ? record.cells[id] : undefined;
    const value = Math.max(0, Math.min(100, Number(cell !== null && typeof cell === "object" ? cell.value : cell) || 0));
    const wrap = document.createElement("span"), track = document.createElement("span"), fill = document.createElement("span"), text = document.createElement("span");
    wrap.className = "load-meter"; track.className = "load-meter-track"; fill.className = "load-meter-fill"; text.className = "load-meter-text";
    fill.style.width = value + "%"; text.textContent = value + "%"; track.setAttribute("aria-hidden", "true");
    track.appendChild(fill); wrap.append(track, text); element.appendChild(wrap);
    return true;
  }
  CanopyX.use({
    name: "load-meter",
    cellRenderers: { "load-meter": meter },
    // A flat grid sorts by a list of column sorts, a tree by one column.
    toolbarItems: [{ label: "Busiest first", run: ({ api }) => api.getSelection ? api.sort([{ column: "load", direction: "desc" }]) : api.sort("load", "desc") }],
    menuItems: [{ label: "Clear selection", run: ({ api }) => api.clearSelection() }],
    events: {
      select(event, { api }) {
        const count = api.getSelection ? api.getSelection().length : api.getSelected().length;
        log(count ? count + " selected" : "Nothing selected");
      }
    },
    init({ view, kind }) { log("The load-meter plugin started on the " + kind + " “" + view.label + "”."); },
    destroy() { log(""); }
  });
})();
</script>
""";

    internal static void Write(string output) {
        var grid = new CanopyDataGridView("plugin-servers", "Servers") { Selection = CanopySelectionMode.Multiple, PageSize = 100 };
        grid.Columns.Add(new CanopyColumn("name", "Server") { Sizing = CanopyColumnSizing.Preferred(200), Sortable = true });
        grid.Columns.Add(new CanopyColumn("site", "Site") { Sizing = CanopyColumnSizing.Preferred(140), Sortable = true });
        grid.Columns.Add(new CanopyColumn("load", "Load") { Sizing = CanopyColumnSizing.Preferred(220), Kind = CanopyColumnKind.Number, Sortable = true, Renderer = "load-meter" });
        var sites = new[] { "Warsaw", "Berlin", "Madrid" };
        for (var i = 0; i < 60; i++) {
            var row = new CanopyGridRow("server-" + i.ToString("D2", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Server " + i.ToString("D2", CultureInfo.InvariantCulture);
            row.Cells["site"] = sites[i % sites.Length];
            row.Cells["load"] = new CanopyCell(i * 37 % 101) { Text = (i * 37 % 101).ToString(CultureInfo.InvariantCulture) + " %" };
            grid.Rows.Add(row);
        }

        var tree = new CanopyTreeView("plugin-sites", "Sites") { Selection = CanopySelectionMode.Multiple };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number, Sortable = true, Renderer = "load-meter", Sizing = CanopyColumnSizing.Preferred(220) });
        for (var s = 0; s < sites.Length; s++) {
            var site = new CanopyNode("site-" + s.ToString(CultureInfo.InvariantCulture), sites[s]) { Expanded = true };
            site.Cells["load"] = new CanopyCell(30 + s * 20);
            for (var i = 0; i < 4; i++) {
                var server = new CanopyNode(site.Id + "-server-" + i.ToString(CultureInfo.InvariantCulture), sites[s] + " " + (i + 1).ToString(CultureInfo.InvariantCulture));
                server.Cells["load"] = new CanopyCell((s * 29 + i * 23) % 101);
                site.Children.Add(server);
            }
            tree.Roots.Add(site);
        }

        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : "";
            var gridPage = grid.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX plugins", Theme = theme });
            File.WriteAllText(Path.Combine(output, "plugins" + suffix + ".html"), Inject(gridPage));
            var treePage = tree.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX plugins on a tree", Theme = theme });
            File.WriteAllText(Path.Combine(output, "plugins-tree" + suffix + ".html"), Inject(treePage));
        }
    }

    // The registration runs before DOMContentLoaded, when the runtime mounts the page's views.
    // The status line the plugin writes sits above the view.
    private static string Inject(string page) => page.Replace("<main class=\"cx-main\">", "<main class=\"cx-main\">\n<p class=\"plugin-log\" id=\"plugin-log\" role=\"status\"></p>")
        .Replace("</body>", Plugin + "</body>");
}
