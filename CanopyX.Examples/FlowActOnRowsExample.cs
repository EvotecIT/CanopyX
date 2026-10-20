using System.Globalization;

namespace CanopyX.Examples;

/// <summary>
/// Acting on selected rows: "Retire servers" opens in a dialog from a button, picks servers from an ordinary grid with facets and a
/// tray of what is chosen, asks when and why, and on the review page asks the reader to type RETIRE, and to confirm that history
/// goes too when they chose to remove it (docs/flow.md). The page uses the data-grid entry point, which holds the grid.
/// </summary>
internal static class FlowActOnRowsExample {
    private static readonly string[] Sites = { "Oslo", "Lyon", "Porto", "Brno", "Turku" };
    private static readonly string[] Roles = { "Web", "Database", "File", "Mail" };

    internal static CanopyDataGridView Servers() {
        var view = new CanopyDataGridView("retire-candidates", "Servers") { Noun = "servers", PageSize = 200 };
        view.Columns.Add(new CanopyColumn("name", "Server") { Sortable = true, RowHeader = true, Presenter = CanopyGridPresenter.Identifier() });
        view.Columns.Add(new CanopyColumn("site", "Site") { Sortable = true });
        view.Columns.Add(new CanopyColumn("role", "Role") { Sortable = true });
        view.Columns.Add(new CanopyColumn("lastSeen", "Last seen") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.FacetPanel = new CanopyFacetPanel().Add("site").Add("role");
        var start = new DateTime(2026, 10, 20, 8, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 48; i++) {
            var row = new CanopyGridRow("srv-" + (i + 1).ToString("00", CultureInfo.InvariantCulture));
            row.Cells["name"] = "SRV-" + Sites[i % Sites.Length].Substring(0, 3).ToUpperInvariant() + "-" + (i + 1).ToString("00", CultureInfo.InvariantCulture);
            row.Cells["site"] = Sites[i % Sites.Length];
            row.Cells["role"] = Roles[i % Roles.Length];
            row.Cells["lastSeen"] = start.AddHours(-(i * 37 % 900));
            view.Rows.Add(row);
        }

        return view;
    }

    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("retire-servers", "Retire servers") {
            Container = CanopyFlowContainer.Dialog,
            LaunchLabel = "Retire servers…",
            Submit = new CanopyFlowSubmit("Retire")
        };
        flow.Pick("servers", "Which servers?", Servers(), picker => {
            picker.Label("name");
            picker.Field.Count(1, 20).Required().Help("Search or filter by site and role, then tick the servers. The Chosen list keeps what you picked while you search.");
        });
        flow.Step("when", "When and why?", step => step
            .Date("date", "Retire on", f => f.Required().Default(new DateTime(2026, 11, 2)).Half())
            .Choice("history", "Monitoring history", f => f.Option("keep", "Keep it", "Reports still show these servers until the history ages out.")
                .Option("remove", "Remove it", "Their history leaves every report.").Required().Default("keep"))
            .TextArea("reason", "Reason", f => f.Required().Rows(2).Placeholder("For example: replaced by new hardware").Length(null, 300)));
        flow.Review(review => review
            .Confirm("Type {text} to confirm", "RETIRE")
            .Acknowledge("I understand that their history is removed from every report and cannot be restored.", CanopyFlowCondition.Equal("history", "remove")));
        return flow;
    }

    internal static void Write(string output) {
        const string script = """
<section class="flow-intro"><h1>Server inventory</h1><p>Retire servers that are gone for good. Their monitoring stops on the chosen day.</p></section>
<script>
document.querySelector(".cx-main").prepend(document.querySelector(".flow-intro"));
window.flowAnswer = detail => ({ status: "saved", message: detail.values.servers.length + " servers will be retired on " + detail.values.date + "." });
</script>
<style>.flow-intro h1{margin:0 0 4px;font-size:20px}.flow-intro p{margin:0 0 16px;opacity:.8}</style>
""";
        FlowExamplePage.Write(output, "flow-act-on-rows", Flow(), "Retire servers", script, width: 720);
    }
}
