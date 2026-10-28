using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>Explicit approval routes over ordinary records, including a host-marked return and boundary crossing.</summary>
internal static class PathExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            Create().SaveHtmlPage(System.IO.Path.Combine(output, "path" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Approval routes", Theme = theme, Height = "820px" });
        }
        var html = CanopyStaticHtml.RenderGrid(Create(), options: new CanopyStaticHtmlOptions { Caption = "Approval routes" });
        File.WriteAllText(System.IO.Path.Combine(output, "path-static.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Approval routes</title></head><body>" + html + "</body></html>",
            new UTF8Encoding(false));
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("approval-paths", "Approval routes") {
            Search = false, Record = new CanopyRecordPanel(), Path = new CanopyPath()
        };
        view.Columns.Add(new CanopyColumn("title", "Step") { RowHeader = true, Wrap = true });
        view.Columns.Add(new CanopyColumn("team", "Responsible team"));
        view.Columns.Add(new CanopyColumn("note", "Review notes") { Wrap = true });
        view.Rows.Add(Record("request", "Submit the change request", "Operations", "The request includes scope and expected outcome."));
        view.Rows.Add(Record("review", "Review the implementation and the proposed recovery procedure", "Review group", "Record the review before scheduling the change."));
        view.Rows.Add(Record("external", "Confirm the handover with the receiving team", "Receiving team", "The host marks this step as crossing a team boundary."));
        view.Rows.Add(Record("approve", "Approve the scheduled change", "Change group", "The host supplies the route; this view does not execute it."));
        view.Rows.Add(Record("retired", "Review the superseded approval step", "Review group", "This step is retained for reading and marked disabled by the host."));
        var primary = new CanopyPathChain("standard", "Standard approval");
        primary.Hops.Add(new CanopyPathHop("request", "Request prepared"));
        primary.Hops.Add(new CanopyPathHop("review", "Review required") { Badges = { new CanopyBadge("Two reviewers", CanopyTone.Info) } });
        primary.Hops.Add(new CanopyPathHop("external", "Team handover") { Flags = { CanopyPathFlag.Foreign } });
        primary.Hops.Add(new CanopyPathHop("approve", "Approval recorded"));
        view.Path.Chains.Add(primary);
        var returned = new CanopyPathChain("rework", "Return for another review");
        returned.Hops.Add(new CanopyPathHop("request"));
        returned.Hops.Add(new CanopyPathHop("review", "Initial review"));
        returned.Hops.Add(new CanopyPathHop("retired", "Earlier route retained for context") { Flags = { CanopyPathFlag.Disabled } });
        returned.Hops.Add(new CanopyPathHop("request", "Returned to the original request") { Flags = { CanopyPathFlag.Cycle } });
        view.Path.Chains.Add(returned);
        return view;
    }

    private static CanopyGridRow Record(string id, string title, string team, string note) => new CanopyGridRow(id) {
        Cells = { ["title"] = title, ["team"] = team, ["note"] = note }
    };
}
