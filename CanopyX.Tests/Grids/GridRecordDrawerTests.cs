using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridRecordDrawerTests {
    [Fact]
    public void RecordDrawerKeepsTheSidePanelByDefaultAndTheSheetIsAnExplicitChoice() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.False(view.RecordDrawerModal);
        Assert.DoesNotContain("\"recordDrawerModal\"", view.ToJson());
        ProtocolSchema.AssertValid(view.ToJson(), "default side-panel grid");
        view.RecordDrawerModal = true;
        Assert.Contains("\"recordDrawerModal\":true", view.ToJson());
        ProtocolSchema.AssertValid(view.ToJson(), "modal record sheet grid");
        var invalid = ProtocolSchema.Mutate(view.ToJson(), document => document["recordDrawerModal"] = "true");
        Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
    }
}
