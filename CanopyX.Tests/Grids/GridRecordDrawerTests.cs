namespace CanopyX.Tests.Grids;

public sealed class GridRecordDrawerTests {
    [Fact]
    public void RecordDrawerKeepsTheSidePanelByDefaultAndTheSheetIsAnExplicitChoice() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.False(view.RecordDrawerModal);
        Assert.DoesNotContain("\"recordDrawerModal\"", view.ToJson());
        view.RecordDrawerModal = true;
        Assert.Contains("\"recordDrawerModal\":true", view.ToJson());
    }
}
