using System;
using System.Linq;
using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.Html;

/// <summary>Single-file pages carry the tree runtime part wherever a supported record value can open a nested tree.</summary>
public sealed class RecordTreeCollectionAssetsTests {
    [Theory]
    [InlineData("change-before")]
    [InlineData("change-after")]
    [InlineData("event-before")]
    [InlineData("event-after")]
    [InlineData("collection-row-field")]
    [InlineData("collection-properties")]
    [InlineData("collection-table")]
    [InlineData("detail-grid-cell")]
    [InlineData("detail-grid-field")]
    [InlineData("detail-tree")]
    [InlineData("nested-tree-definition")]
    public void SingleFileRecords_EmbedTreeToolsForEveryNestedTreeLocation(string location) {
        var view = View(location);
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "tree-tools");
        var html = view.ToHtmlFragment();
        Assert.Contains("type=\"application/x-canopyx-tree-tools\"", html);
        Assert.Contains("type=\"application/x-canopyx-tree-tools-style\"", html);
    }

    [Theory]
    [InlineData("list")]
    [InlineData("change")]
    [InlineData("event")]
    public void FlatRecordValues_DoNotRequireTreeTools(string kind) {
        var view = Grid();
        CanopyCell value = CanopyCell.List("Alpha", "Beta");
        if (kind == "change") value = CanopyCell.Diff(new[] { new CanopyFieldChange("Members", "Alpha", "Beta") });
        if (kind == "event") value = Event("Alpha", "Beta");
        view.Rows[0].Fields["payload"] = value;
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "tree-tools");
        Assert.DoesNotContain("type=\"application/x-canopyx-tree-tools\"", view.ToHtmlFragment());
    }

    [Theory]
    [InlineData("grid", 2)]
    [InlineData("grid", 8)]
    [InlineData("tree", 2)]
    [InlineData("tree", 8)]
    public void NestedDefinitions_EmbedAllCompanionsInManifestOrder(string kind, int depth) {
        var view = NestedDefinition(kind, depth);
        var names = CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();
        var companions = kind == "tree" ? new[] { "highlight", "layouts", "links" } : new[] { "highlight", "layouts" };
        foreach (var name in companions) Assert.Contains(name, names);
        Assert.Equal(names.Distinct(), names);
        Assert.Equal(CanopyHtmlAssets.Parts.Where(part => names.Contains(part.Name)).Select(part => part.Name), names);

        var html = view.ToHtmlFragment();
        foreach (var name in companions) {
            Assert.Contains("type=\"application/x-canopyx-" + name + "\"", html);
            if (CanopyHtmlAssets.GetPart(name).Style != null) Assert.Contains("type=\"application/x-canopyx-" + name + "-style\"", html);
        }
    }

    private static CanopyDataGridView NestedDefinition(string kind, int depth) {
        var view = Grid();
        // A structured tree sibling must not stop discovery of a deeper grid's companions.
        if (kind == "grid" && depth == 8) view.Rows[0].Fields["payload"] = Tree();
        var definition = view;
        var payload = view.Rows[0];
        for (var level = 1; level <= depth; level++) {
            if (kind == "tree" && level == depth) {
                var tree = new CanopyTreeView("tree-" + level, "Nested tree") {
                    SearchHighlight = new CanopySearchHighlight(), Layout = new CanopyLayoutOptions(), DeepLink = true
                };
                tree.Columns.Add(new CanopyColumn("name", "Name"));
                definition.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = tree } };
                payload.Detail = new CanopyTreeDetail { Roots = { new CanopyNode("needle", "Needle") } };
            } else {
                var grid = new CanopyDataGridView("grid-" + level, "Nested grid");
                grid.Columns.Add(new CanopyColumn("name", "Name"));
                if (level == depth) { grid.SearchHighlight = new CanopySearchHighlight(); grid.Layout = new CanopyLayoutOptions(); }
                definition.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = grid } };
                var row = new CanopyGridRow("row-" + level) { Cells = { ["name"] = "Needle" } };
                payload.Detail = new CanopyGridRowsDetail { Rows = { row } };
                definition = grid;
                payload = row;
            }
        }
        return view;
    }

    [Fact]
    public void NestedCalendarResources_EmbedTheResourceTreesOwnCompanions() {
        var view = Grid();
        var nested = new CanopyDataGridView("schedule", "Schedule");
        nested.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime });
        nested.Columns.Add(new CanopyColumn("resource", "Resource"));
        var resources = new CanopyTreeView("resources", "Resources") {
            SearchHighlight = new CanopySearchHighlight(), Layout = new CanopyLayoutOptions(), DeepLink = true
        };
        resources.Columns.Add(new CanopyColumn("name", "Name"));
        resources.Roots.Add(new CanopyNode("host", "Host"));
        nested.Calendar = new CanopyCalendar("starts") { Resource = "resource", Resources = new CanopyCalendarResources(resources) };
        view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };

        var names = CanopyHtmlAssets.GetRequiredParts(view).Select(part => part.Name).ToArray();
        foreach (var name in new[] { "calendar", "tree-tools", "highlight", "layouts", "links" }) Assert.Contains(name, names);
        Assert.Equal(names.Distinct(), names);
        Assert.Equal(CanopyHtmlAssets.Parts.Where(part => names.Contains(part.Name)).Select(part => part.Name), names);
        var html = view.ToHtmlFragment();
        foreach (var name in new[] { "calendar", "tree-tools", "highlight", "layouts", "links" })
            Assert.Contains("type=\"application/x-canopyx-" + name + "\"", html);
    }

    private static CanopyDataGridView View(string location) {
        var view = Grid();
        if (location == "nested-tree-definition") {
            var tree = new CanopyTreeView("nested-tree", "Nested tree");
            tree.Columns.Add(new CanopyColumn("name", "Name"));
            var nested = new CanopyDataGridView("nested-grid", "Nested grid") {
                Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { TreeView = tree } }
            };
            nested.Columns.Add(new CanopyColumn("name", "Name"));
            view.Reporting = new CanopyGridReporting { Detail = new CanopyGridDetail { View = nested } };
            view.Rows[0].Detail = new CanopyGridRowsDetail {
                Rows = { new CanopyGridRow("nested-row") { Detail = new CanopyTreeDetail { Roots = { new CanopyNode("branch", "Branch") } } } }
            };
            return view;
        }

        var treeValue = Tree();
        CanopyCell value;
        switch (location) {
            case "change-before": value = CanopyCell.Diff(new[] { new CanopyFieldChange("Members", treeValue, null) }); break;
            case "change-after": value = CanopyCell.Diff(new[] { new CanopyFieldChange("Members", null, treeValue) }); break;
            case "event-before": value = Event(treeValue, null); break;
            case "event-after": value = Event(null, treeValue); break;
            default:
                var rows = new CanopyRecordList();
                rows.Columns.Add(new CanopyColumn("name", "Name"));
                var row = new CanopyGridRow("collection-row") { Cells = { ["name"] = "Collection row" } };
                if (location == "collection-row-field") row.Fields["members"] = treeValue;
                if (location == "collection-properties") row.Detail = new CanopyPropertiesDetail().Add("Members", treeValue);
                if (location == "collection-table") row.Detail = new CanopyTableDetail().AddColumns("Members").AddRow(treeValue);
                if (location.StartsWith("detail-grid-", StringComparison.Ordinal)) {
                    var inner = new CanopyGridRow("inner");
                    if (location == "detail-grid-cell") inner.Cells["members"] = treeValue;
                    else inner.Fields["members"] = treeValue;
                    row.Detail = new CanopyGridRowsDetail { Rows = { inner } };
                }
                if (location == "detail-tree") row.Detail = new CanopyTreeDetail { Roots = { new CanopyNode("detail-branch", "Detail branch") } };
                rows.Rows.Add(row);
                value = CanopyCell.Collection(rows);
                break;
        }
        view.Rows[0].Fields["payload"] = value;
        return view;
    }

    private static CanopyCell Event(CanopyCell? before, CanopyCell? after) => CanopyCell.Timeline(new[] {
        new CanopyRecordEvent(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), "Members changed") {
            Changes = { new CanopyFieldChange("Members", before, after) }
        }
    });

    private static CanopyCell Tree() {
        var tree = new CanopyRecordList();
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Roots.Add(new CanopyNode("branch", "Branch") { Children = { new CanopyNode("leaf", "Leaf") } });
        return CanopyCell.Collection(tree);
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("records", "Records") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Record.Fields.Add(new CanopyColumn("payload", "Payload"));
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["name"] = "One" } });
        return view;
    }
}
