using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridSearchControlTests {
    [Fact]
    public void SearchDelayAndSummaryLabels_SerializeWithBoundedOptionalTiming() {
        var view = new CanopyDataGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        using (var defaults = JsonDocument.Parse(view.ToJson())) {
            Assert.False(defaults.RootElement.TryGetProperty("searchDelayMs", out _));
        }
        foreach (var delay in new[] { 0, 300, 5000 }) {
            view.SearchDelayMilliseconds = delay;
            view.Labels.GridResultCount = "Wyniki: {count} / {total}";
            view.Labels.GridRemoveCondition = "Usuń: {condition}";
            var json = view.ToJson();
            ProtocolSchema.AssertValid(json, "bounded search debounce and translated accepted-result summary");
            using var document = JsonDocument.Parse(json);
            Assert.Equal(delay, document.RootElement.GetProperty("searchDelayMs").GetInt32());
            Assert.Equal("Wyniki: {count} / {total}", document.RootElement.GetProperty("labels").GetProperty("gridResultCount").GetString());
            Assert.Equal("Usuń: {condition}", document.RootElement.GetProperty("labels").GetProperty("gridRemoveCondition").GetString());
        }
        Assert.Throws<ArgumentOutOfRangeException>(() => view.SearchDelayMilliseconds = -1);
        Assert.Throws<ArgumentOutOfRangeException>(() => view.SearchDelayMilliseconds = 5001);
        view.SearchDelayMilliseconds = null;
        ProtocolSchema.AssertValid(view.ToJson(), "optional default source timing");
    }
}
