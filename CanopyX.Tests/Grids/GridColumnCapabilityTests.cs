using System;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnCapabilityTests {
    [Fact]
    public void ColumnCapabilities_DefaultToEnabledAndWriteOnlyDisabledGridCapabilities() {
        var column = new CanopyColumn("name", "Name");
        Assert.True(column.Filterable);
        Assert.True(column.Exportable);
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(column);
        Assert.DoesNotContain("\"filterable\"", grid.ToJson());
        Assert.DoesNotContain("\"exportable\"", grid.ToJson());
        column.Filterable = column.Exportable = false;
        Assert.Contains("\"filterable\":false", grid.ToJson());
        Assert.Contains("\"exportable\":false", grid.ToJson());
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(column);
        Assert.DoesNotContain("\"filterable\"", tree.ToJson());
        Assert.DoesNotContain("\"exportable\"", tree.ToJson());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Query_RejectsDisabledColumnInFlatAndNestedPredicatesWithoutDisablingHighlights(bool nested) {
        var view = new CanopyDataGridView("grid", "Grid");
        var column = new CanopyColumn("display", "Display") { Filterable = false };
        view.Columns.Add(column);
        var condition = new CanopyGridFilter("display", CanopyGridFilterOperator.Equal, "Shown");
        view.HighlightRules.Add(new CanopyGridHighlightRule(condition, CanopyTone.Success));
        Assert.Contains("highlightRules", view.ToJson());
        var query = new CanopyGridQuery(view.Id);
        if (nested) query.FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All) {
            Groups = { new CanopyGridFilterGroup(CanopyGridFilterJunction.Any, condition) }
        };
        else query.Filters.Add(condition);
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        column.Filterable = true;
        Assert.Contains("\"display\"", query.ToJson(view));
    }
}
