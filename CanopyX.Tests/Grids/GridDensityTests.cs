using System;
using System.Text.Json;
using Xunit;

namespace CanopyX.Tests;

public sealed class GridDensityTests {
    [Theory]
    [InlineData(CanopyGridDensity.Default, 40)]
    [InlineData(CanopyGridDensity.Compact, 32)]
    [InlineData(CanopyGridDensity.Comfortable, 40)]
    public void DensityWritesTheEffectiveHeightAndPreservesExplicitSizes(CanopyGridDensity density, int height) {
        var view = new CanopyDataGridView("density", "Records") { Density = density, Zebra = true };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        using (var json = JsonDocument.Parse(view.ToJson())) {
            Assert.Equal(height, json.RootElement.GetProperty("rowHeight").GetInt32());
            Assert.True(json.RootElement.GetProperty("zebra").GetBoolean());
        }
        view.RowHeight = 31;
        Assert.Equal(31, view.RowHeight);
        view.Density = (CanopyGridDensity)99;
        Assert.Throws<ArgumentOutOfRangeException>(() => view.ToJson());
    }
}
