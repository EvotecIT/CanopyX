using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Live data: the view's live settings, the gridTransaction document and the live part.</summary>
public sealed class GridLiveTests {
    [Fact]
    public void Live_WritesOnlyTheSettingsThatDifferFromTheDefaults() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["live"]);
        view.Live = new CanopyGridLive();
        Assert.Equal("{}", JsonNode.Parse(view.ToJson())!["live"]!.ToJsonString());
        view.Live = new CanopyGridLive { StableOrder = false, Flash = true, BatchMilliseconds = 250, PollMilliseconds = 5000, Announce = false, PauseWhenHidden = false };
        Assert.Equal("{\"stableOrder\":false,\"flash\":true,\"batchMs\":250,\"pollMs\":5000,\"announce\":false,\"pauseWhenHidden\":false}",
            JsonNode.Parse(view.ToJson())!["live"]!.ToJsonString());
        view.Live = new CanopyGridLive { FlashMilliseconds = 800 };
        Assert.True(view.Live.Flash);
        Assert.Equal("{\"flash\":{\"durationMs\":800}}", JsonNode.Parse(view.ToJson())!["live"]!.ToJsonString());
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with live data");
    }

    [Theory]
    [InlineData(nameof(CanopyGridLive.BatchMilliseconds), -1)]
    [InlineData(nameof(CanopyGridLive.BatchMilliseconds), 60001)]
    [InlineData(nameof(CanopyGridLive.PollMilliseconds), 249)]
    [InlineData(nameof(CanopyGridLive.PollMilliseconds), 86400001)]
    [InlineData(nameof(CanopyGridLive.FlashMilliseconds), 99)]
    [InlineData(nameof(CanopyGridLive.FlashMilliseconds), 10001)]
    public void Live_RefusesValuesOutsideTheirBounds(string property, int value) {
        var live = new CanopyGridLive();
        var setter = typeof(CanopyGridLive).GetProperty(property)!;
        var error = Assert.Throws<System.Reflection.TargetInvocationException>(() => setter.SetValue(live, value));
        Assert.IsType<ArgumentOutOfRangeException>(error.InnerException);
    }

    [Fact]
    public void Transaction_WritesAddUpdateAndRemoveCheckedAgainstTheView() {
        var view = Grid();
        var transaction = new CanopyGridTransaction();
        var added = new CanopyGridRow("b");
        added.Cells["name"] = "Beta"; added.Cells["load"] = 4;
        transaction.Add.Add(added);
        var updated = new CanopyGridRow("a");
        updated.Cells["load"] = null!;
        transaction.Update.Add(updated);
        transaction.Remove.Add("c");
        var json = transaction.ToJson(view);
        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridTransaction\",\"view\":\"services\",\"add\":[{\"id\":\"b\",\"cells\":{\"name\":\"Beta\",\"load\":4}}]," +
            "\"update\":[{\"id\":\"a\",\"cells\":{\"load\":null}}],\"remove\":[\"c\"]}", json);
        ProtocolSchema.AssertValid(json, "a grid transaction");
        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridTransaction\",\"view\":\"services\"}", new CanopyGridTransaction().ToJson(view));
    }

    [Fact]
    public void Transaction_RefusesUndeclaredColumnsWrongValuesAndRepeatedRows() {
        var view = Grid();
        var undeclared = new CanopyGridTransaction();
        var row = new CanopyGridRow("x");
        row.Cells["missing"] = 1;
        undeclared.Add.Add(row);
        Assert.Throws<InvalidOperationException>(() => undeclared.ToJson(view));
        var wrong = new CanopyGridTransaction();
        var text = new CanopyGridRow("y");
        text.Cells["load"] = "fast";
        wrong.Update.Add(text);
        Assert.ThrowsAny<Exception>(() => wrong.ToJson(view));
        var repeated = new CanopyGridTransaction();
        repeated.Update.Add(new CanopyGridRow("z"));
        repeated.Update.Add(new CanopyGridRow("z"));
        Assert.Throws<InvalidOperationException>(() => repeated.ToJson(view));
        var blank = new CanopyGridTransaction();
        blank.Remove.Add("");
        Assert.ThrowsAny<ArgumentException>(() => blank.ToJson(view));
        Assert.Throws<ArgumentNullException>(() => new CanopyGridTransaction().ToJson(null!));
    }

    [Fact]
    public void LivePart_IsVersionedBoundedOutsideTheEntryPointsAndCarriedByLiveViewsOnly() {
        var part = CanopyHtmlAssets.GetPart("live");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal("live data", part.Label);
        Assert.NotNull(part.Style);
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.True(part.IsShippedWith(runtime));
            var script = CanopyHtmlAssets.GetScript(runtime);
            // The entry points carry the method stubs and labels; transactions, the order, the prompt and polling stay in the part.
            Assert.Contains("applyTransaction", script);
            Assert.DoesNotContain("function liveTransaction(", script);
            Assert.DoesNotContain("cx-live-bar", CanopyHtmlAssets.GetStyle(runtime));
        }
        Assert.Contains("function liveTransaction(", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        // The new part's size plus about 15%.
        Assert.True(Gzip(part.Script) <= 12288, "The live part is " + Gzip(part.Script) + " bytes gzip; the guard is 12 KiB.");
        Assert.True(Gzip(part.Style!) <= 1024, "The live stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 1 KiB.");

        var plain = Grid();
        Assert.DoesNotContain("x-canopyx-live\"", plain.ToHtmlFragment());
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), item => item.Name == "live");
        var live = Grid();
        live.Live = new CanopyGridLive();
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(live), item => item.Name == "live");
        Assert.Contains("<script type=\"application/x-canopyx-live\" data-cx-version=\"" + part.Version + "\">", live.ToHtmlFragment());
    }

    [Fact]
    public void LabelPacks_TranslateTheLiveTexts() {
        foreach (var labels in new[] { CanopyLabels.Polish(), CanopyLabels.German(), CanopyLabels.Spanish(), CanopyLabels.French(), CanopyLabels.Italian() }) {
            Assert.NotEqual(new CanopyLabels().GridLiveOrderChanged, labels.GridLiveOrderChanged);
            Assert.NotEqual(new CanopyLabels().GridLiveResort, labels.GridLiveResort);
            foreach (var placeholder in new[] { "{added}", "{updated}", "{removed}" }) Assert.Contains(placeholder, labels.GridLiveChanged);
        }
        var view = Grid();
        view.Labels = CanopyLabels.German();
        Assert.Equal("Neu sortieren", JsonNode.Parse(view.ToJson())!["labels"]!["gridLiveResort"]!.GetValue<string>());
    }

    private static CanopyDataGridView Grid() {
        var grid = new CanopyDataGridView("services", "Services");
        grid.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        grid.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number, Sortable = true });
        return grid;
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
