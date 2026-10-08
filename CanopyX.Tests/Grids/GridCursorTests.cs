using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridCursorTests {
    [Fact]
    public void NativeCursorFallback_PreservesUnknownCountsAndRejectsAnOffsetOwner() {
        var view = View();
        var page = new CanopyGridCursorPage(view.Id, "r1", 25) { PreviousCursor = "previous", NextCursor = "next" };
        var row = new CanopyGridRow("r25"); row.Cells["name"] = "<Record 25>"; page.Rows.Add(row);
        var html = CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view, page);
        Assert.Contains("&lt;Record 25&gt;", html);
        Assert.Contains("Showing 1 of unknown rows.", html);
        Assert.DoesNotContain("<script", html);
        view.Navigation = CanopyGridNavigation.Offset;
        Assert.Throws<InvalidOperationException>(() => CanopyX.Rendering.CanopyStaticHtml.RenderGrid(view, page));
    }

    private static CanopyGridView View() {
        var view = new CanopyGridView("inventory", "Inventory") {
            Source = CanopyGridSourceKind.Host, Navigation = CanopyGridNavigation.Cursor,
            Presentation = CanopyGridPresentation.Paged, PageLength = 25
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        return view;
    }

    [Fact]
    public void CursorDocuments_PreserveUnknownCountsAndOpaquePositions() {
        var view = View();
        view.Query = new CanopyGridQuery(view.Id) { Search = "inventory", Cursor = "opaque:/a?b=1&c=<x>", Revision = "r1", Limit = 25 };
        view.Query.Sort.Add(new CanopyGridSort("name"));
        ProtocolSchema.AssertValid(view.ToJson(), "cursor source and initial query");
        var queryJson = view.Query.ToJson(view);
        ProtocolSchema.AssertValid(queryJson, "cursor query without random offset");
        using var query = JsonDocument.Parse(queryJson);
        Assert.Equal("gridCursorQuery", query.RootElement.GetProperty("type").GetString());
        Assert.False(query.RootElement.TryGetProperty("offset", out _));
        Assert.Equal(view.Query.Cursor, query.RootElement.GetProperty("cursor").GetString());
        Assert.DoesNotContain("<x>", queryJson);

        var page = new CanopyGridCursorPage(view.Id, "r1", 25) { PreviousCursor = "previous", NextCursor = "next" };
        var row = new CanopyGridRow("row-25"); row.Cells["name"] = "Record 25"; page.Rows.Add(row);
        var pageJson = page.ToJson(view);
        ProtocolSchema.AssertValid(pageJson, "cursor page with unknown counts");
        using var result = JsonDocument.Parse(pageJson);
        Assert.Equal(JsonValueKind.Null, result.RootElement.GetProperty("total").ValueKind);
        Assert.Equal(JsonValueKind.Null, result.RootElement.GetProperty("matched").ValueKind);
        Assert.Equal(25, result.RootElement.GetProperty("offset").GetInt32());
        Assert.Equal("next", result.RootElement.GetProperty("nextCursor").GetString());
    }

    [Fact]
    public void CursorSources_RejectRandomAccessAndIncompatiblePresentation() {
        var view = View();
        Assert.Throws<InvalidOperationException>(() => new CanopyGridPage(view.Id, "r1", 0, 0, 0).ToJson(view));
        Assert.Throws<InvalidOperationException>(() => new CanopyGridQuery(view.Id) { Offset = 25 }.ToJson(view));
        Assert.Throws<InvalidOperationException>(() => new CanopyGridQuery(view.Id) { Cursor = "unbound" }.ToJson(view));
        view.Presentation = CanopyGridPresentation.Continuous;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Presentation = CanopyGridPresentation.Paged; view.Source = CanopyGridSourceKind.Inline;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Source = CanopyGridSourceKind.Host; view.Navigation = CanopyGridNavigation.Offset;
        Assert.Throws<InvalidOperationException>(() => new CanopyGridQuery(view.Id) { Cursor = "opaque" }.ToJson(view));
    }

    [Fact]
    public void CursorPages_RejectContradictoryCountsPositionsAndNavigation() {
        var view = View();
        var page = new CanopyGridCursorPage(view.Id, "r1", 0) { NextCursor = "next", Total = 1, Matched = 1 };
        var row = new CanopyGridRow("row-0"); row.Cells["name"] = "Record 0"; page.Rows.Add(row);
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.NextCursor = null;
        ProtocolSchema.AssertValid(page.ToJson(view), "last cursor page with known counts");
        page.Matched = 2;
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.Total = 2; page.PreviousCursor = "previous";
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        page.PreviousCursor = null; page.NextCursor = new string('x', 4097);
        Assert.Throws<ArgumentException>(() => page.ToJson(view));
        page.NextCursor = "next"; page.Rows.Clear();
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
    }
}
