using System.Text.Json;

namespace CanopyX.Tests.Compare;

public sealed class DatasetComparisonTests {
    [Fact]
    public void Compare_JoinsByOrdinalIdAndPreservesBeforeThenAddedOrderWithExactCounts() {
        var before = new[] { Row("b", "same"), Row("gone", "old"), Row("a", "old"), Row("A", "upper") };
        var after = new[] { Row("new2", "two"), Row("a", "new"), Row("A", "upper"), Row("b", "same"), Row("new1", "one") };
        var result = CanopyDatasetComparer.Compare(before, after);
        Assert.Equal(new[] { "b", "gone", "a", "A", "new2", "new1" }, result.Rows.Select(row => row.Id));
        Assert.Equal(new[] { CanopyDatasetRowStatus.Unchanged, CanopyDatasetRowStatus.Removed, CanopyDatasetRowStatus.Changed,
            CanopyDatasetRowStatus.Unchanged, CanopyDatasetRowStatus.Added, CanopyDatasetRowStatus.Added }, result.Rows.Select(row => row.Status));
        Assert.Equal((2, 1, 1, 2, 6L), (result.Counts.Added, result.Counts.Removed, result.Counts.Changed, result.Counts.Unchanged, result.Counts.Total));
        Assert.Equal(1, result.ColumnChanges["value"]);
        Assert.Equal(new[] { "value" }, result.Rows[2].ChangedColumns);
        Assert.Null(result.Rows[1].After);
        Assert.Null(result.Rows[4].Before);
        Assert.Same(before[2], result.Rows[2].Before);
        Assert.Same(after[1], result.Rows[2].After);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Compare_RejectsDuplicateKeysInEitherVersion(bool earlier) {
        var duplicates = new[] { Row("duplicate", "one"), Row("duplicate", "two") };
        var error = Assert.Throws<ArgumentException>(() => CanopyDatasetComparer.Compare(
            earlier ? duplicates : Array.Empty<CanopyGridRow>(), earlier ? Array.Empty<CanopyGridRow>() : duplicates));
        Assert.Equal(earlier ? "before" : "after", error.ParamName);
        Assert.Contains("duplicate", error.Message);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    public void Compare_DistinguishesRawTypesAndCellPresenceEvenWhenDisplayMatches(int scenario) {
        var date = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
        var pairs = new (CanopyCell? Before, CanopyCell? After, bool Missing)[] {
            (new CanopyCell("1"), new CanopyCell(1L), false),
            (new CanopyCell(1L), new CanopyCell(1d), false),
            (new CanopyCell(1d), new CanopyCell(1m), false),
            (new CanopyCell("true"), new CanopyCell(true), false),
            (new CanopyCell(date), new CanopyCell("2026-10-25T00:00:00Z"), false),
            (null, new CanopyCell(), true),
            (null, new CanopyCell(), false)
        };
        var pair = pairs[scenario];
        var before = new CanopyGridRow("row"); var after = new CanopyGridRow("row");
        if (!pair.Missing) before.Cells["value"] = pair.Before!;
        after.Cells["value"] = pair.After!;
        var result = CanopyDatasetComparer.Compare(new[] { before }, new[] { after });
        Assert.Equal(CanopyDatasetRowStatus.Changed, Assert.Single(result.Rows).Status);
        Assert.Equal(1, result.ColumnChanges["value"]);
    }

    [Fact]
    public void Compare_EqualNullsAndEqualTypedValuesRemainUnchangedWhileDisplayMetadataIsIgnored() {
        var before = Row("row", new CanopyCell(12m) { Text = "Earlier label" });
        before.Cells["null"] = new CanopyCell();
        var after = Row("row", new CanopyCell(12m) { Text = "Later label", Title = "new tooltip" });
        after.Cells["null"] = new CanopyCell();
        var result = CanopyDatasetComparer.Compare(new[] { before }, new[] { after });
        Assert.Equal(CanopyDatasetRowStatus.Unchanged, result.Rows[0].Status);
        Assert.All(result.ColumnChanges.Values, count => Assert.Equal(0, count));
    }

    [Fact]
    public void Compare_PerColumnCountsCountMatchedRowsIndependentlyOfRowStatusTotals() {
        var oldA = Row("a", "old"); oldA.Cells["weight"] = 1;
        var oldB = Row("b", "same"); oldB.Cells["weight"] = 1;
        var newA = Row("a", "new"); newA.Cells["weight"] = 2;
        var newB = Row("b", "same"); newB.Cells["weight"] = 2;
        var result = CanopyDatasetComparer.Compare(new[] { oldA, oldB, Row("removed", "old") }, new[] { newB, newA, Row("added", "new") });
        Assert.Equal(2, result.Counts.Changed);
        Assert.Equal(1, result.ColumnChanges["value"]);
        Assert.Equal(2, result.ColumnChanges["weight"]);
        Assert.Equal(new[] { "value", "weight" }, result.Rows[0].ChangedColumns);
        Assert.Equal(new[] { "weight" }, result.Rows[1].ChangedColumns);
    }

    [Fact]
    public void Compare_StructuredValuesDetectNestedTypeChangesWithIdenticalWireScalars() {
        var before = Row("row", CanopyCell.Object(new CanopyCellField("nested", new CanopyCell(1L))));
        var after = Row("row", CanopyCell.Object(new CanopyCellField("nested", new CanopyCell(1m))));
        Assert.Equal(CanopyDatasetRowStatus.Changed, CanopyDatasetComparer.Compare(new[] { before }, new[] { after }).Rows[0].Status);
        Assert.Equal(CanopyDatasetRowStatus.Unchanged, CanopyDatasetComparer.Compare(new[] { before }, new[] {
            Row("row", CanopyCell.Object(new CanopyCellField("nested", new CanopyCell(1L)))) }).Rows[0].Status);
    }

    [Fact]
    public void Compare_ExplicitColumnsSelectFactsAndDiscoveryUsesFirstSeenOrder() {
        var before = Row("row", "same"); before.Cells["ignored"] = "old";
        var after = Row("row", "same"); after.Cells["ignored"] = "new"; after.Cells["later"] = true;
        var result = CanopyDatasetComparer.Compare(new[] { before }, new[] { after }, new[] { "value" });
        Assert.Equal(CanopyDatasetRowStatus.Unchanged, result.Rows[0].Status);
        Assert.Equal(new[] { "value" }, result.Columns);
        Assert.Equal(new[] { "value", "ignored", "later" }, CanopyDatasetComparer.Compare(new[] { before }, new[] { after }).Columns);
        Assert.Throws<ArgumentException>(() => CanopyDatasetComparer.Compare(new[] { before }, new[] { after }, new[] { "value", "value" }));
    }

    [Fact]
    public void Compare_EnumeratesEachVersionOnceAndObservesCancellation() {
        var beforeReads = 0; var afterReads = 0;
        IEnumerable<CanopyGridRow> Before() { beforeReads++; yield return Row("row", "same"); }
        IEnumerable<CanopyGridRow> After() { afterReads++; yield return Row("row", "same"); }
        CanopyDatasetComparer.Compare(Before(), After());
        Assert.Equal((1, 1), (beforeReads, afterReads));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => CanopyDatasetComparer.Compare(Before(), After(), cancellationToken: cancellation.Token));
        Assert.Throws<OperationCanceledException>(() => CanopyDatasetComparer.Compare(Array.Empty<CanopyGridRow>(), Array.Empty<CanopyGridRow>(), cancellationToken: cancellation.Token));
    }

    [Fact]
    public void Compare_EmptyVersionsAndSingleSidedVersionsHaveCompleteCounts() {
        var empty = Array.Empty<CanopyGridRow>();
        var none = CanopyDatasetComparer.Compare(empty, empty);
        Assert.Empty(none.Rows); Assert.Equal(0, none.Counts.Total);
        Assert.Equal(1, CanopyDatasetComparer.Compare(empty, new[] { Row("row", "x") }).Counts.Added);
        Assert.Equal(1, CanopyDatasetComparer.Compare(new[] { Row("row", "x") }, empty).Counts.Removed);
    }

    [Fact]
    public void ToView_PreservesAfterTypesAndEarlierValuesAcrossColumnTypeChangesWithoutMutatingDefinitions() {
        var before = new[] { Row("row", "12"), Row("removed", "former text") };
        var after = new[] { Row("row", 12) };
        var definition = new CanopyColumn("value", "Amount") { Kind = CanopyColumnKind.Number, Editable = true };
        var result = CanopyDatasetComparer.Compare(before, after);
        var view = result.ToView("comparison", "Comparison", new[] { definition });
        Assert.Equal(12L, view.Rows[0].Cells["value"].Value);
        var change = Assert.Single(view.Rows[0].Cells["value"].Changes);
        Assert.Equal("12", change.Before!.Value); Assert.Equal(12L, change.After!.Value);
        Assert.Null(view.Rows[1].Cells["value"].Value);
        Assert.Equal("former text", Assert.Single(view.Rows[1].Cells["value"].Changes).Before!.Value);
        Assert.Null(Assert.Single(view.Rows[1].Cells["value"].Changes).After);
        Assert.Equal("removed", view.Rows[1].Cells[result.StatusColumn].Value);
        Assert.Null(definition.Presenter); Assert.True(definition.Editable); Assert.False(view.GetColumn("value").Editable);
        Assert.True(view.GetColumn("value").Presenter!.BeforeAfterValues);
        Assert.Null(view.Reporting);
        view.Validate();
    }

    [Fact]
    public void ToView_UsesCollisionFreeStatusAndWritesMetadataAndMissingNullDistinction() {
        var before = new CanopyGridRow("row"); before.Cells["change"] = "unchanged data";
        var after = new CanopyGridRow("row"); after.Cells["change"] = "unchanged data"; after.Cells["value"] = new CanopyCell();
        var result = CanopyDatasetComparer.Compare(new[] { before }, new[] { after });
        Assert.Equal("change_1", result.StatusColumn);
        var view = result.ToView("comparison", "Comparison", new[] { new CanopyColumn("change", "Existing"), new CanopyColumn("value", "Value") }, true);
        CanopyX.Tests.Protocol.ProtocolSchema.AssertValid(view.ToJson(), "Keyed dataset comparison");
        using var json = JsonDocument.Parse(view.ToJson());
        var info = json.RootElement.GetProperty("compare");
        Assert.Equal(result.StatusColumn, info.GetProperty("statusColumn").GetString());
        Assert.True(info.GetProperty("onlyChanges").GetBoolean());
        Assert.Equal(1, info.GetProperty("counts").GetProperty("changed").GetInt32());
        Assert.Equal(1, info.GetProperty("columns").GetProperty("value").GetInt32());
        var change = json.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("value").GetProperty("changes")[0];
        Assert.Equal(JsonValueKind.Null, change.GetProperty("before").ValueKind);
        Assert.Equal(JsonValueKind.Object, change.GetProperty("after").ValueKind);
        Assert.Equal("", change.GetProperty("after").GetProperty("text").GetString());
    }

    [Fact]
    public void ToView_RejectsMissingDefinitionsAndIncompatibleLaterValues() {
        var result = CanopyDatasetComparer.Compare(Array.Empty<CanopyGridRow>(), new[] { Row("row", "text") });
        Assert.Throws<ArgumentException>(() => result.ToView("comparison", "Comparison", Array.Empty<CanopyColumn>()));
        Assert.Throws<InvalidOperationException>(() => result.ToView("comparison", "Comparison", new[] { new CanopyColumn("value", "Amount") { Kind = CanopyColumnKind.Number } }));
    }

    internal static CanopyGridRow Row(string id, CanopyCell value) {
        var row = new CanopyGridRow(id); row.Cells["value"] = value; return row;
    }
}
