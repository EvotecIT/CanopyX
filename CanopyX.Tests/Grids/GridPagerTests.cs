using System.Text.Json;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>A paged grid's pager settings: written only when they change the built-in pager, valid against the schema, and checked.</summary>
public sealed class GridPagerTests {
    [Fact]
    public void Pager_DefaultSettings_WriteNothingAndNeedNoPart() {
        var view = View();
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "default pager");
        Assert.DoesNotContain("\"pager\"", json);
        Assert.True(view.Pager.IsDefault);
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "pager");
    }

    [Fact]
    public void Pager_Settings_WriteTheirFieldsAndLoadThePagerPart() {
        var view = View();
        view.Pager.PageLengths.Add(10);
        view.Pager.PageLengths.Add(CanopyGridPageLength.Rows(50, "Fifty"));
        view.Pager.PageLengths.Add(CanopyGridPageLength.All());
        view.Pager.PageLengthMenu = false;
        view.Pager.PageNumbers = 7;
        view.Pager.PageInput = true;
        view.Pager.FirstLast = false;
        view.Pager.Info = CanopyGridPagerInfo.Sentence;
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "every pager setting");
        Assert.Contains("\"pager\":{\"lengths\":[10,{\"value\":50,\"label\":\"Fifty\"},\"all\"],\"lengthMenu\":false,\"numbers\":7,\"pageInput\":true,\"firstLast\":false,\"info\":\"sentence\"}", json);
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "pager");
        var fragment = view.ToHtmlFragment();
        Assert.Contains(CanopyHtmlAssets.GetPart("pager").Markup, fragment);
        Assert.DoesNotContain("application/x-canopyx-enhance", fragment);
    }

    [Fact]
    public void Pager_OnAContinuousGrid_IsIgnored() {
        var view = View();
        view.Presentation = CanopyGridPresentation.Continuous;
        view.Pager.Info = CanopyGridPagerInfo.None;
        var json = view.ToJson();
        Assert.DoesNotContain("\"pager\"", json);
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(view), part => part.Name == "pager");
    }

    [Fact]
    public void Pager_InfoNone_WritesOnlyThatSetting() {
        var view = View();
        view.Pager.Info = CanopyGridPagerInfo.None;
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "no result text");
        using var document = JsonDocument.Parse(json);
        Assert.Equal("{\"info\":\"none\"}", document.RootElement.GetProperty("pager").GetRawText());
    }

    [Fact]
    public void Pager_RejectsInvalidSettings() {
        var view = View();
        Assert.Throws<ArgumentOutOfRangeException>(() => view.Pager.PageNumbers = 3);
        Assert.Throws<ArgumentOutOfRangeException>(() => view.Pager.PageNumbers = 16);
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPageLength.Rows(0));
        Assert.Throws<ArgumentException>(() => CanopyGridPageLength.Rows(10, " "));
        view.Pager.PageLengths.Add(25);
        view.Pager.PageLengths.Add(25);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Pager.PageLengths.Clear();
        for (var length = 1; length <= 17; length++) view.Pager.PageLengths.Add(length);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());

        var hosted = View();
        hosted.Rows.Clear();
        hosted.Source = CanopyGridSource.HostedOffset();
        hosted.Pager.PageLengths.Add(CanopyGridPageLength.All());
        Assert.Throws<InvalidOperationException>(() => hosted.ToJson());
    }

    [Fact]
    public void PagerLabels_HaveTranslations() {
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish() }) {
            Assert.Contains("{first}", labels.GridPageInfo);
            Assert.Contains("{total}", labels.GridPageInfoFiltered);
            Assert.Contains("{page}", labels.GridPageButton);
            Assert.NotEqual(new CanopyLabels().GridPageInfo, labels.GridPageInfo);
        }
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("servers", "Servers") { Presentation = CanopyGridPresentation.Paged, PageLength = 25 };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        var row = new CanopyGridRow("one");
        row.Cells["name"] = "One";
        view.Rows.Add(row);
        return view;
    }
}
