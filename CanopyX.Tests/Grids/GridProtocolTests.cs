using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridProtocolTests {
    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void GridRows_PreserveNonfiniteCellsAsEmptyWhileQueryOperandsRemainInvalid(double value) {
        var view = View();
        var row = new CanopyGridRow("undefined-metric");
        row.Cells["amount"] = new CanopyCell(value) { Text = "N/A" };
        row.Cells["name"] = value;
        row.Cells["date"] = value;
        view.Rows.Add(row);
        var inline = view.ToJson();
        ProtocolSchema.AssertValid(inline, "nonfinite inline cells");
        using var document = JsonDocument.Parse(inline);
        var cells = document.RootElement.GetProperty("rows")[0].GetProperty("cells");
        Assert.Equal(JsonValueKind.Null, cells.GetProperty("amount").GetProperty("value").ValueKind);
        Assert.Equal("N/A", cells.GetProperty("amount").GetProperty("text").GetString());
        Assert.Equal(JsonValueKind.Null, cells.GetProperty("name").ValueKind);
        Assert.Equal(JsonValueKind.Null, cells.GetProperty("date").ValueKind);
        var page = new CanopyGridPage(view.Id, "revision", 0, 1, 1);
        page.Rows.Add(row);
        ProtocolSchema.AssertValid(page.ToJson(view), "nonfinite definition-bound page cells");
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, new CanopyCell(value)));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
    }

    [Theory]
    [InlineData("amount")]
    [InlineData("date")]
    [InlineData("name")]
    public void GridRows_RejectRawValuesThatDoNotMatchTheirDeclaredColumn(string column) {
        var view = View();
        var row = Row("bad", 1, "one");
        row.Cells[column] = column == "amount" ? (CanopyCell)"not a number" : (CanopyCell)123L;
        view.Rows.Add(row);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Rows.Clear();
        var page = new CanopyGridPage(view.Id, "revision", 0, 1, 1);
        page.Rows.Add(row);
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        row.Cells[column] = null!;
        ProtocolSchema.AssertValid(page.ToJson(view), "nullable typed cell");
    }

    [Fact]
    public void InlineGrid_PreservesIdentityAndRawValuesIndependentlyOfDisplayAndPaging() {
        var view = View();
        view.PageSize = 1;
        view.Columns[0].Hidden = true;
        view.Rows.Add(Row("item/α", 10, "ten"));
        view.Rows.Add(Row("item/β", 2, "two"));
        view.Rows[0].Cells["date"] = new DateTimeOffset(2026, 10, 3, 13, 30, 0, TimeSpan.FromHours(2));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "complete inline flat grid");
        using var doc = JsonDocument.Parse(json);
        var rows = doc.RootElement.GetProperty("rows");
        Assert.Equal(2, rows.GetArrayLength());
        Assert.Equal("item/α", rows[0].GetProperty("id").GetString());
        Assert.Equal(10, rows[0].GetProperty("cells").GetProperty("amount").GetProperty("value").GetInt32());
        Assert.Equal("ten", rows[0].GetProperty("cells").GetProperty("amount").GetProperty("text").GetString());
        Assert.Equal("2026-10-03T11:30:00Z", rows[0].GetProperty("cells").GetProperty("date").GetString());
    }

    [Fact]
    public void HostGrid_UsesHostSourceAndCannotSilentlyDiscardInlineRows() {
        var view = View();
        view.Source = CanopyGridSourceKind.Host;
        ProtocolSchema.AssertValid(view.ToJson(), "host flat grid");
        using var doc = JsonDocument.Parse(view.ToJson());
        Assert.Equal("host", doc.RootElement.GetProperty("source").GetProperty("kind").GetString());
        Assert.False(doc.RootElement.TryGetProperty("rows", out _));
        view.Rows.Add(Row("a", 1, "one"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void FlatGrid_RejectsAmbiguousIdentityUnknownColumnsAndInvisibleDefinitions() {
        var view = View();
        view.Rows.Add(Row("same", 1, "one"));
        view.Rows.Add(Row("same", 2, "two"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Rows.RemoveAt(1);
        view.Rows[0].Cells["unknown"] = "missing column";
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Rows[0].Cells.Remove("unknown");
        foreach (var column in view.Columns) column.Hidden = true;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void GridPage_DescribesFullDatasetAndMatchingWindowWithoutTreeReferences() {
        var page = new CanopyGridPage("inventory", "snapshot-7", 100, 1000000, 1234);
        page.Rows.Add(Row("host-owned/key", 2, "two"));
        var json = page.ToJson();
        ProtocolSchema.AssertValid(json, "revisioned grid result page");
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("snapshot-7", doc.RootElement.GetProperty("revision").GetString());
        Assert.Equal(1000000, doc.RootElement.GetProperty("total").GetInt32());
        Assert.Equal(1234, doc.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(100, doc.RootElement.GetProperty("offset").GetInt32());
        Assert.Equal("host-owned/key", doc.RootElement.GetProperty("items")[0].GetProperty("id").GetString());
    }

    [Theory]
    [InlineData(-1, 0, 0)]
    [InlineData(0, -1, 0)]
    [InlineData(0, 2, 3)]
    [InlineData(3, 3, 2)]
    public void GridPage_RejectsContradictoryCounts(int offset, int total, int matched) {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridPage("v", "r", offset, total, matched));
    }

    [Fact]
    public void GridPage_RejectsTruncatedEmptyWindowsDuplicateIdentitiesAndCountOverflow() {
        var page = new CanopyGridPage("v", "r", int.MaxValue - 1, int.MaxValue, int.MaxValue);
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        page.Rows.Add(Row("a", 1, "one"));
        ProtocolSchema.AssertValid(page.ToJson(), "final integer-boundary page");
        page.Rows.Add(Row("b", 2, "two"));
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        var duplicate = new CanopyGridPage("v", "r", 0, 2, 2);
        duplicate.Rows.Add(Row("a", 1, "one"));
        duplicate.Rows.Add(Row("a", 2, "two"));
        Assert.Throws<InvalidOperationException>(() => duplicate.ToJson());
        ProtocolSchema.AssertValid(new CanopyGridPage("v", "r", 0, 7, 0).ToJson(), "zero matching rows");
    }

    [Fact]
    public void GridDocuments_StayHtmlSafeAndSchemaRejectsTreeAndMalformedPageShapes() {
        var view = View();
        view.Rows.Add(Row("</script>", 2, "</script>"));
        var json = view.ToJson();
        Assert.DoesNotContain("</script>", json, StringComparison.OrdinalIgnoreCase);
        ProtocolSchema.AssertValid(json, "HTML-safe flat grid");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, doc => doc["rows"]![0]!["parent"] = "tree")).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, doc => doc.Remove("rows"))).IsValid);
        var page = new CanopyGridPage("v", "r", 0, 0, 0).ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(page, doc => doc.Remove("revision"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(page, doc => doc["offset"] = 0.5)).IsValid);
    }

    private static CanopyGridView View() {
        var view = new CanopyGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime });
        return view;
    }

    private static CanopyGridRow Row(string id, int amount, string display) {
        var row = new CanopyGridRow(id);
        row.Cells["name"] = id;
        row.Cells["amount"] = new CanopyCell(amount) { Text = display };
        return row;
    }
}
