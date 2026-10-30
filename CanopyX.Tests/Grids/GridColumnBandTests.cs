using System.Text.Json;
using CanopyX.Html;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Presentation header metadata leaves authored column semantics intact.</summary>
public sealed class GridColumnBandTests {
    internal static CanopyDataGridView View() {
        var view = new CanopyDataGridView("bands", "Resource status") { ColumnGroupMode = CanopyColumnGroupMode.Presentation };
        foreach (var id in new[] { "host", "before", "root", "after" }) view.Columns.Add(new CanopyColumn(id, id));
        view.ColumnGroups.Add(new CanopyColumnGroup("identity", "Identity", "host", "root"));
        view.ColumnGroups.Add(new CanopyColumnGroup("live", "<Live>", "before", "after"));
        return view;
    }

    [Fact]
    public void PresentationMode_SerializesNonadjacentGroupsWithoutChangingOrderPinsOrSections() {
        var view = View(); view.GetColumn("host").Pinned = CanopyGridColumnPin.Left;
        view.GetColumn("after").Pinned = CanopyGridColumnPin.Right; view.GetColumn("before").Section = "Authored section";
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "presentation header bands");
        using var document = JsonDocument.Parse(json);
        Assert.Equal(2, document.RootElement.GetProperty("columnBands").GetArrayLength());
        Assert.False(document.RootElement.TryGetProperty("columnGroups", out _));
        Assert.False(document.RootElement.TryGetProperty("columnGroupMode", out _));
        Assert.Equal(new[] { "host", "before", "root", "after" }, view.Columns.Select(column => column.Id));
        Assert.Equal(CanopyGridColumnPin.Left, view.GetColumn("host").Pinned);
        Assert.Equal(CanopyGridColumnPin.Right, view.GetColumn("after").Pinned);
        Assert.Null(view.GetColumn("root").Pinned); Assert.Null(view.GetColumn("host").Section);
        Assert.Equal("Authored section", view.GetColumn("before").Section);
        Assert.Contains("x-canopyx-column-groups", view.ToHtmlFragment());
    }

    [Fact]
    public void SemanticDefault_StillRejectsNonadjacentMembersAndOmitsMode() {
        var view = View(); view.ColumnGroupMode = CanopyColumnGroupMode.Semantic;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.ColumnGroups.Clear(); view.ColumnGroups.Add(new CanopyColumnGroup("a", "A", "host", "before"));
        Assert.DoesNotContain("columnBands", view.ToJson());
        Assert.Contains("columnGroups", view.ToJson());
    }

    [Fact]
    public void PresentationMode_RejectsGroupPinsAndUnknownModes() {
        var view = View(); view.ColumnGroups[0].Pinned = CanopyGridColumnPin.Left;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.ColumnGroups[0].Pinned = null; view.ColumnGroupMode = (CanopyColumnGroupMode)9;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.ColumnGroupMode = CanopyColumnGroupMode.Presentation;
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(view.ToJson(), document => document["columnBands"]![0]!["pinned"] = "left")).IsValid);
    }

    [Fact]
    public void StaticBands_MergeVisibleMembersAndSplitWhenSeparatorReturns() {
        var view = View();
        var wide = CanopyStaticHtml.RenderGrid(view);
        Assert.Equal(2, wide.Split("&lt;Live&gt;</th>").Length - 1);
        view.GetColumn("root").Hidden = true;
        var narrow = CanopyStaticHtml.RenderGrid(view);
        Assert.Contains("colspan=\"2\"", narrow);
        Assert.Equal(1, narrow.Split("&lt;Live&gt;</th>").Length - 1);
        Assert.DoesNotContain("<script", narrow, StringComparison.OrdinalIgnoreCase);
        view.GetColumn("after").Pinned = CanopyGridColumnPin.Right;
        Assert.Equal(2, CanopyStaticHtml.RenderGrid(view).Split("&lt;Live&gt;</th>").Length - 1);
        view.GetColumn("root").Hidden = false;
        Assert.Equal(2, CanopyStaticHtml.RenderGrid(view).Split("&lt;Live&gt;</th>").Length - 1);
    }

    [Fact]
    public void Schema_RejectsBandsTogetherWithSemanticGroups() {
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(View().ToJson(), document =>
            document["columnGroups"] = System.Text.Json.Nodes.JsonNode.Parse("[]"))).IsValid);
    }
}
