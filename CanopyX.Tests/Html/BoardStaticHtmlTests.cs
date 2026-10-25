using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Tests.Html;

public sealed class BoardStaticHtmlTests {
    [Fact]
    public void BoardStatic_GroupsCardsByLaneAndTeamAndEncodesContent() {
        var view = Grid();
        view.Board!.SwimlaneColumn = "team";
        view.Board.Fields.Add("priority");
        view.Board.Fields.Add("link");
        view.Board.Lanes.Add(new CanopyBoardLane("active", "In <progress>") { WipLimit = 1 });
        view.Board.Lanes.Add(new CanopyBoardLane("done", "Done"));
        view.Rows.Add(Row("a", "<script>alert(1)</script>", "active", "Platform"));
        view.Rows.Add(Row("b", "Security task", "active", "Security"));
        view.Rows[0].Cells["link"] = "https://example.com/tasks/1";
        view.Rows[1].Cells["link"] = "javascript:alert(1)";
        var html = view.ToBoardStaticHtml();
        Assert.Contains("In &lt;progress&gt; (1)", html);
        Assert.Contains("Done (0)", html);
        Assert.Contains("Platform</h3>", html);
        Assert.Contains("Security</h3>", html);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html);
        Assert.DoesNotContain("<script", html);
        Assert.DoesNotContain("onclick=", html);
        Assert.DoesNotContain("class=", html);
        Assert.Contains("2 / 1", html); // The lane limit applies across team swimlanes.
        Assert.Contains("has reached its work limit", html);
        Assert.Contains("No records in this lane", html);
        Assert.Contains("&lt;High&gt;", html);
        Assert.Contains("href=\"https://example.com/tasks/1\"", html);
        Assert.DoesNotContain("href=\"javascript:", html);
        Assert.True(html.IndexOf("In &lt;progress&gt;", StringComparison.Ordinal) < html.IndexOf("Done (0)", StringComparison.Ordinal));
        Assert.Equal(2, view.Rows.Count);
        Assert.Equal("<script>alert(1)</script>", view.Rows[0].Cells["title"].Value);
    }

    [Fact]
    public void BoardStatic_TitleLinksUseHiddenDependenciesAndRejectUnsafeDestinations() {
        var view = Grid();
        view.Board!.TitleColumn = "title";
        view.Columns[0].Presenter = CanopyGridPresenter.Link("link", newWindow: true);
        view.Columns[4].Hidden = true;
        var row = Row("a", "Open <task>", "active", "Platform");
        row.Cells["link"] = "https://example.com/?a=1&b=2";
        view.Rows.Add(row);
        var html = view.ToBoardStaticHtml();
        Assert.Contains("href=\"https://example.com/?a=1&amp;b=2\"", html);
        Assert.Contains("target=\"_blank\" rel=\"noopener noreferrer\"", html);
        Assert.Contains("Open &lt;task&gt;</a>", html);
        foreach (var unsafeUrl in new[] { "javascript:alert(1)", "data:text/html,<script>x</script>", "https:\\example.com", "java\nscript:alert(1)" }) {
            row.Cells["link"] = unsafeUrl;
            html = view.ToBoardStaticHtml();
            Assert.DoesNotContain("<a ", html);
            Assert.Contains("Open &lt;task&gt;", html);
        }
    }

    [Fact]
    public void BoardStatic_PreservesAcceptedSnapshotsAndGlobalCardBudget() {
        var view = Grid();
        view.Source = CanopyGridSource.HostedOffset();
        Assert.Throws<InvalidOperationException>(() => view.ToBoardStaticHtml());
        var page = new CanopyGridPage(view.Id, "revision", 2, 10, 8);
        page.Rows.Add(Row("b", "First accepted", "other", "Security"));
        page.Rows.Add(Row("a", "Second accepted", "active", "Platform"));
        var html = view.ToBoardStaticHtml(page, new CanopyStaticHtmlOptions { MaxRows = 1, Caption = "Accepted <window>" });
        Assert.Contains("First accepted", html);
        Assert.DoesNotContain("Second accepted", html);
        Assert.Contains("other (1)", html);
        Assert.Contains("active (1)", html); // Counts describe the snapshot before the rendering budget.
        Assert.Contains("Showing 1 of 8", html);
        Assert.Contains("Accepted &lt;window&gt;", html);
        Assert.Throws<InvalidOperationException>(() => view.ToBoardStaticHtml(new CanopyGridPage("different-grid", "r", 0, 0, 0)));
    }

    [Fact]
    public void BoardStatic_UsesRowHeaderTitleAndExplicitHiddenFieldsWithoutMutatingColumns() {
        var view = Grid();
        view.Columns[0].Hidden = true;
        view.Columns[2].RowHeader = true;
        view.Board!.Fields.Add("title");
        view.Rows.Add(Row("a", "Explicit hidden card field", "active", "Platform"));
        var html = view.ToBoardStaticHtml(options: new CanopyStaticHtmlOptions { Theme = CanopyStaticTheme.Dark() });
        Assert.Contains("Explicit hidden card field", html);
        Assert.Contains(">Platform</h4>", html);
        Assert.Contains("#16181c", html);
        Assert.True(view.Columns[0].Hidden);
        Assert.True(view.Columns[2].RowHeader);
        Assert.Null(view.Board.TitleColumn);
    }

    [Fact]
    public void BoardStatic_EmptyAndUnassignedRecordsRemainReadable() {
        var view = Grid();
        Assert.Contains(view.Labels.BoardEmpty, view.ToBoardStaticHtml());
        view.Rows.Add(new CanopyGridRow("missing") { Cells = { ["title"] = "Needs triage" } });
        var html = view.ToBoardStaticHtml();
        Assert.Contains("Unassigned (1)", html);
        Assert.Contains("Needs triage", html);
        view.Board = null;
        Assert.Throws<InvalidOperationException>(() => view.ToBoardStaticHtml());
    }

    [Fact]
    public void BoardStatic_DefaultGridRendererCapturesRecordsInLaneOrder() {
        var view = Grid(); view.Board!.Lanes.Add(new CanopyBoardLane("ready", "Ready")); view.Board.Lanes.Add(new CanopyBoardLane("active", "Active"));
        view.Rows.Add(Row("first", "Active task", "active", "Platform")); view.Rows.Add(Row("second", "Ready task", "ready", "Applications"));
        var result = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Contains("Ready (1)", result.Html);
        Assert.Equal(new[] { "Ready task", "Active task" }, result.Rows.Select(row => row[0]));
        Assert.Equal(2, result.TotalRows); Assert.True(result.IsComplete);
        Assert.DoesNotContain("<script", result.Html, StringComparison.OrdinalIgnoreCase);
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("tasks", "Tasks") { Board = new CanopyBoard("status") };
        view.Columns.Add(new CanopyColumn("title", "Task"));
        view.Columns.Add(new CanopyColumn("status", "Status"));
        view.Columns.Add(new CanopyColumn("team", "Team"));
        view.Columns.Add(new CanopyColumn("priority", "Priority"));
        view.Columns.Add(new CanopyColumn("link", "Link") { Presenter = CanopyGridPresenter.Link() });
        return view;
    }

    private static CanopyGridRow Row(string id, string title, string status, string team) => new(id) {
        Cells = { ["title"] = title, ["status"] = status, ["team"] = team, ["priority"] = new CanopyCell("high") { Text = "<High>" } }
    };
}
