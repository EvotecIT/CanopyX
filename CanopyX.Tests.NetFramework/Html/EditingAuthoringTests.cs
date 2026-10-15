using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.NetFramework.Html;

/// <summary>Editing definitions write the same documents on .NET Framework: number text, UTC moments and pattern checks.</summary>
public sealed class EditingAuthoringTests {
    [Fact]
    public void EditableGrid_WritesEditorsValidationAndTheEditingPartOnNetFramework() {
        var view = new CanopyDataGridView("assets", "Assets");
        view.Columns.Add(new CanopyColumn("cost", "Cost") { Kind = CanopyColumnKind.Number, Editable = true, Editor = CanopyCellEditor.Number(0, 100000, 0.01) });
        view.Columns.Add(new CanopyColumn("when", "When") { Kind = CanopyColumnKind.DateTime, Editable = true, Editor = CanopyCellEditor.Date(),
            Validation = new CanopyCellValidation { Earliest = new DateTimeOffset(2015, 1, 1, 2, 0, 0, TimeSpan.FromHours(2)) } });
        view.Columns.Add(new CanopyColumn("tag", "Tag") { Editable = true, Validation = new CanopyCellValidation { Required = true, Pattern = "[A-Z]{2}-\\d{4}" } });
        view.Editing.Mode = CanopyGridEditMode.Row;
        var json = view.ToJson();
        Assert.Contains("\"editor\":{\"type\":\"number\",\"min\":0,\"max\":100000,\"step\":0.01}", json);
        Assert.Contains("\"validation\":{\"min\":\"2015-01-01T00:00:00Z\"}", json);
        Assert.Contains("\"validation\":{\"required\":true,\"pattern\":\"[A-Z]{2}-\\\\d{4}\"}", json);
        Assert.Contains("\"editing\":{\"mode\":\"row\"}", json);
        Assert.Contains("application/x-canopyx-editing", view.ToHtmlFragment());
        view.Columns[2].Validation!.Pattern = "(";
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        Assert.Equal("Colonnes", CanopyLabels.French().Columns);
        Assert.Equal("Salva", CanopyLabels.Italian().GridEditSave);
    }
}
