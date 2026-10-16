using System;
using Xunit;

namespace CanopyX.Tests.Records;

/// <summary>Timeline changes share the ordinary structured-value nesting limit.</summary>
public sealed class TimelineDepthTests {
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void EventChanges_EnforceTheSameDepthLimitAsDirectChanges(bool after) {
        CanopyCell value = "leaf";
        for (var depth = 0; depth < CanopyCell.MaxStructureDepth; depth++) value = Wrap(value, after);
        Assert.Contains("leaf", View(value).ToJson());
        var tooDeep = Wrap(value, after);
        Assert.Throws<InvalidOperationException>(() => View(tooDeep).ToJson());
    }

    [Fact]
    public void EventChanges_RejectCyclesDuringValidationBeforeWriting() {
        var value = new CanopyCell();
        var item = new CanopyRecordEvent(DateTime.UtcNow, "Change");
        value.Events.Add(item);
        item.Changes.Add(new CanopyFieldChange("Value", value, null));
        Assert.Throws<InvalidOperationException>(() => View(value).Validate());
    }

    private static CanopyCell Wrap(CanopyCell value, bool after) => CanopyCell.Timeline(new[] {
        new CanopyRecordEvent(DateTime.UtcNow, "Change") {
            Changes = { new CanopyFieldChange("Value", after ? null : value, after ? value : null) }
        }
    });
    private static CanopyDataGridView View(CanopyCell value) {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("value", "Value"));
        view.Rows.Add(new CanopyGridRow("one") { Cells = { ["value"] = value } });
        return view;
    }
}
