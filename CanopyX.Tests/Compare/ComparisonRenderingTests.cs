using System.Text.Json;
using CanopyX.Rendering;

namespace CanopyX.Tests.Compare;

public sealed class ComparisonRenderingTests {
    [Theory]
    [InlineData(CanopyColumnKind.Text)]
    [InlineData(CanopyColumnKind.Number)]
    [InlineData(CanopyColumnKind.DateTime)]
    public void BeforeAfterPresenter_WritesExistingChangeKindForEverySupportedColumnType(CanopyColumnKind kind) {
        var view = new CanopyDataGridView("comparison", "Comparison");
        view.Columns.Add(new CanopyColumn("value", "Value") { Kind = kind, Presenter = CanopyGridPresenter.BeforeAfter() });
        CanopyX.Tests.Protocol.ProtocolSchema.AssertValid(view.ToJson(), "Before/after change presenter");
        using var json = JsonDocument.Parse(view.ToJson());
        var presenter = json.RootElement.GetProperty("columns")[0].GetProperty("presenter");
        Assert.Equal("change", presenter.GetProperty("kind").GetString());
        Assert.True(presenter.GetProperty("beforeAfter").GetBoolean());
        Assert.False(presenter.TryGetProperty("deltaColumn", out _));
    }

    [Fact]
    public void NumericDeltaPresenter_RetainsItsExistingContractAndKindValidation() {
        var view = new CanopyDataGridView("delta", "Delta");
        view.Columns.Add(new CanopyColumn("value", "Value") { Presenter = CanopyGridPresenter.Change("delta") });
        view.Columns.Add(new CanopyColumn("delta", "Delta") { Kind = CanopyColumnKind.Number });
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        view.GetColumn("value").Kind = CanopyColumnKind.Number;
        using var json = JsonDocument.Parse(view.ToJson());
        var presenter = json.RootElement.GetProperty("columns")[0].GetProperty("presenter");
        Assert.Equal("delta", presenter.GetProperty("deltaColumn").GetString());
        Assert.False(presenter.TryGetProperty("beforeAfter", out _));
        var row = new CanopyGridRow("row"); row.Cells["value"] = 12; row.Cells["delta"] = 2; view.Rows.Add(row);
        Assert.Contains("↑ 2 12", CanopyStaticHtml.RenderGrid(view));
    }

    [Fact]
    public void StaticComparison_ReusesGridFormattingEscapesValuesAndShowsLocalizedStatusesAndCompleteSummary() {
        var result = CanopyDatasetComparer.Compare(
            new[] { DatasetComparisonTests.Row("changed", "<script>old</script>"), DatasetComparisonTests.Row("removed", "former"), DatasetComparisonTests.Row("same", "unchanged") },
            new[] { DatasetComparisonTests.Row("changed", "<img src=x onerror=alert(1)>"), DatasetComparisonTests.Row("added", "new"), DatasetComparisonTests.Row("same", "unchanged") });
        var view = result.ToView("comparison", "<Comparison>", new[] { new CanopyColumn("value", "<Value>") });
        view.Labels.CompareAdded = "Added translated"; view.Labels.CompareRemoved = "Removed translated";
        view.Labels.CompareChanged = "Changed translated"; view.Labels.CompareUnchanged = "Unchanged translated";
        var html = CanopyStaticHtml.RenderComparison(view);
        Assert.Contains("&lt;Comparison&gt;", html); Assert.Contains("&lt;Value&gt;", html);
        Assert.Contains("<del>&lt;script&gt;old&lt;/script&gt;</del> → <ins style=\"text-decoration:none;\">&lt;img", html);
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<img", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<style", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("style=\"", html);
        Assert.Contains("1 Added translated", html); Assert.Contains("1 Removed translated", html);
        Assert.Contains("1 Changed translated", html); Assert.Contains("1 Unchanged translated", html);
        Assert.Contains(">former</td>", html);
        Assert.Contains("Changed translated</td>", html);
        Assert.Contains("Unchanged translated</td>", html);
        Assert.Contains("<Value>: 1 changed cell", System.Net.WebUtility.HtmlDecode(html));
        Assert.DoesNotContain("{column}", html);
        Assert.DoesNotContain("{count}", html);
    }

    [Fact]
    public void StaticComparison_DistinguishesMissingNullAndEmptyTextAndReusesColumnNumberFormat() {
        var old = new CanopyGridRow("row"); old.Cells["empty"] = ""; old.Cells["number"] = 10;
        var later = new CanopyGridRow("row"); later.Cells["null"] = new CanopyCell(); later.Cells["empty"] = new CanopyCell(); later.Cells["number"] = 20;
        var result = CanopyDatasetComparer.Compare(new[] { old }, new[] { later });
        var view = result.ToView("comparison", "Comparison", new[] {
            new CanopyColumn("empty", "Empty"), new CanopyColumn("null", "Null"),
            new CanopyColumn("number", "Amount") { Kind = CanopyColumnKind.Number, Format = CanopyGridNumberFormat.Fixed(2, suffix: " units") }
        });
        var html = CanopyStaticHtml.RenderComparison(view);
        Assert.Contains("<del>—</del> → <ins style=\"text-decoration:none;\">null", html);
        Assert.Contains("<del>&quot;&quot;</del> → <ins style=\"text-decoration:none;\">null", html);
        Assert.Contains("<del>10.00 units</del> → <ins style=\"text-decoration:none;\">20.00 units", html);
        var captured = CanopyStaticHtml.RenderGridWithResult(view);
        Assert.Contains("10.00 units → 20.00 units", captured.Rows[0]);
    }

    [Fact]
    public void StaticComparison_ChangesOnlyAndRowLimitRetainCompleteCountsAndDoNotMutateView() {
        var result = CanopyDatasetComparer.Compare(
            new[] { DatasetComparisonTests.Row("same", "hidden unchanged"), DatasetComparisonTests.Row("old", "former") },
            new[] { DatasetComparisonTests.Row("same", "hidden unchanged"), DatasetComparisonTests.Row("new", "added") });
        var view = result.ToView("comparison", "Comparison", new[] { new CanopyColumn("value", "Value") }, onlyChanges: true);
        var html = CanopyStaticHtml.RenderComparison(view, new CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.DoesNotContain("hidden unchanged", html);
        Assert.Contains("1 Unchanged", html); Assert.Contains("1 Added", html); Assert.Contains("1 Removed", html);
        Assert.Contains(">former</td>", html);
        Assert.Equal(3, view.Rows.Count);
        Assert.Contains("Showing 1 of 2 rows.", html);
        Assert.DoesNotContain(">added</td>", html);
    }

    [Fact]
    public void StaticComparison_OmitsZeroCountsAndUsesPluralFormsWithoutChangingTitles() {
        var before = new[] { DatasetComparisonTests.Row("one", "old"), DatasetComparisonTests.Row("two", "same") };
        var after = new[] { DatasetComparisonTests.Row("one", "new"), DatasetComparisonTests.Row("two", "same") };
        var view = CanopyDatasetComparer.Compare(before, after).ToView("comparison", "Inventory", new[] { new CanopyColumn("value", "Value") });
        var html = CanopyStaticHtml.RenderComparison(view);
        Assert.Contains("Value: 1 changed cell</span>", html);
        Assert.DoesNotContain("0 Added", html); Assert.DoesNotContain("0 Removed", html);
        Assert.DoesNotContain("1 changed cells", html);
        Assert.Equal("Value", view.Columns[1].Title);
        Assert.True(html.IndexOf("Inventory", StringComparison.Ordinal) < html.IndexOf("1 Changed", StringComparison.Ordinal));
        var unchanged = CanopyDatasetComparer.Compare(after, after).ToView("unchanged", "Inventory", new[] { new CanopyColumn("value", "Value") });
        Assert.DoesNotContain("changed cell", CanopyStaticHtml.RenderComparison(unchanged));
    }

    [Fact]
    public void ComparisonMetadata_RejectsInvalidCountsAndUndeclaredBindings() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyDatasetCompareCounts(-1, 0, 0, 0));
        var counts = new CanopyDatasetCompareCounts(0, 0, 1, 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyDatasetCompareInfo("change", counts, new Dictionary<string, int> { ["value"] = 2 }));
        var view = new CanopyDataGridView("comparison", "Comparison");
        view.Columns.Add(new CanopyColumn("change", "Change"));
        view.Compare = new CanopyDatasetCompareInfo("change", counts, new Dictionary<string, int> { ["unknown"] = 1 });
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        view.Compare = new CanopyDatasetCompareInfo("change", counts, new Dictionary<string, int>());
        view.GetColumn("change").Kind = CanopyColumnKind.Number;
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        view.GetColumn("change").Kind = CanopyColumnKind.Text;
        view.GetColumn("change").Filterable = false;
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        view.GetColumn("change").Filterable = true;
        view.GetColumn("change").Editable = true;
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        view.GetColumn("change").Editable = false;
        view.RowIdentity = CanopyGridRowIdentity.Ordinal;
        Assert.Throws<InvalidOperationException>(() => view.Validate());
    }
}
