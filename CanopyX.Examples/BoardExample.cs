using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>A migration and remediation board using the grid's public columns, records, facets and edit proposals.</summary>
internal static class BoardExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            Create().SaveHtmlPage(Path.Combine(output, "board" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Migration and remediation board", Theme = theme, Height = "820px" });
        }
        var html = Create().ToBoardStaticHtml(options: new CanopyStaticHtmlOptions { Caption = "Migration and remediation board" });
        File.WriteAllText(Path.Combine(output, "board-static.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Migration and remediation board</title></head><body>" + html + "</body></html>",
            new UTF8Encoding(false));
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("migration-board", "Migration and remediation board") {
            Noun = "tasks", Selection = CanopySelectionMode.Single, RowIdentity = CanopyGridRowIdentity.StableKey,
            Reporting = new CanopyGridReporting(), Record = new CanopyRecordPanel(),
            Board = new CanopyBoard("status") { TitleColumn = "title", SwimlaneColumn = "team", Editable = true }
        };
        view.Columns.Add(new CanopyColumn("title", "Task") { RowHeader = true, Wrap = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true });
        view.Columns.Add(new CanopyColumn("team", "Team"));
        view.Columns.Add(new CanopyColumn("assignee", "Assigned to"));
        view.Columns.Add(new CanopyColumn("priority", "Priority"));
        view.Columns.Add(new CanopyColumn("due", "Due") { Kind = CanopyColumnKind.DateTime });
        view.Reporting.FacetColumns.Add("status");
        view.Reporting.FacetColumns.Add("team");
        view.Reporting.FacetColumns.Add("priority");
        view.FacetPanel = new CanopyFacetPanel().Add("status").Add("team");
        view.Board.Lanes.Add(new CanopyBoardLane("backlog", "Backlog"));
        view.Board.Lanes.Add(new CanopyBoardLane("ready", "Ready"));
        view.Board.Lanes.Add(new CanopyBoardLane("active", "In progress") { WipLimit = 4 });
        view.Board.Lanes.Add(new CanopyBoardLane("done", "Done"));
        view.Board.Fields.Add("assignee");
        view.Board.Fields.Add("priority");
        view.Board.Fields.Add("due");
        var titles = new[] {
            "Inventory legacy application endpoints", "Map service dependencies before migration", "Review database retention requirements",
            "Document the rollback procedure", "Remove obsolete firewall exceptions", "Prepare the staging environment",
            "Verify backup restoration", "Rotate the migration service credentials", "Review accessibility of the new sign-in page",
            "Migrate the first application group", "Remediate weak TLS configurations", "Move scheduled jobs to the new hosts",
            "Validate data checksums after transfer", "Update application health checks", "Remove retired DNS records",
            "Confirm monitoring coverage", "Publish the support runbook", "Complete the migration acceptance review"
        };
        var statuses = new[] { "backlog", "backlog", "backlog", "backlog", "backlog", "ready", "ready", "ready", "ready", "active", "active", "active", "active", "done", "done", "done", "done", "done" };
        var teams = new[] { "Platform", "Applications", "Security" };
        var assignees = new[] { "Alex Morgan", "Sam Rivera", "Jordan Lee", "Taylor Chen" };
        for (var index = 0; index < titles.Length; index++) {
            view.Rows.Add(new CanopyGridRow("task-" + (index + 1).ToString("D2", System.Globalization.CultureInfo.InvariantCulture)) {
                Cells = {
                    ["title"] = titles[index], ["status"] = statuses[index], ["team"] = teams[index % teams.Length],
                    ["assignee"] = assignees[index % assignees.Length],
                    ["priority"] = new CanopyCell(index % 4 == 0 ? "High" : "Normal") { Tone = index % 4 == 0 ? CanopyTone.Warning : CanopyTone.None },
                    ["due"] = new DateTime(2026, 11, 2 + index, 0, 0, 0, DateTimeKind.Utc)
                }
            });
        }
        return view;
    }
}
