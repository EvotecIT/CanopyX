namespace CanopyX.Tests.Grids;

public sealed class GridRecordDrawerTests {
    [Fact]
    public void RecordDrawerIsAModalSheetByDefaultAndTheSidePanelIsAnExplicitChoice() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.True(view.RecordDrawerModal);
        Assert.DoesNotContain("\"recordDrawerModal\"", view.ToJson());
        view.RecordDrawerModal = false;
        Assert.Contains("\"recordDrawerModal\":false", view.ToJson());
    }
}
