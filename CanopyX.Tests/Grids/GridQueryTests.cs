using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridQueryTests {
    [Fact]
    public void Query_SerializesTypedPredicatesOrderedSortAndExpectedSnapshot() {
        var view = View();
        var query = new CanopyGridQuery(view.Id) { Offset = 50, Limit = 25, Search = "needle", Revision = "snapshot-2" };
        query.Sort.Add(new CanopyGridSort("amount", true));
        query.Sort.Add(new CanopyGridSort("name"));
        query.Filters.Add(new CanopyGridFilter("amount", CanopyGridFilterOperator.GreaterThanOrEqual, new CanopyCell(10) { Text = "ten" }));
        query.Filters.Add(new CanopyGridFilter("name", CanopyGridFilterOperator.In, "north", "south"));
        query.Filters.Add(new CanopyGridFilter("date", CanopyGridFilterOperator.LessThan, new DateTimeOffset(2026, 10, 3, 13, 0, 0, TimeSpan.FromHours(2))));
        query.Filters.Add(new CanopyGridFilter("name", CanopyGridFilterOperator.IsNotNull));
        view.Query = query;
        ProtocolSchema.AssertValid(view.ToJson(), "grid with initial query");
        var json = query.ToJson(view);
        ProtocolSchema.AssertValid(json, "typed grid query");
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal(50, root.GetProperty("offset").GetInt32());
        Assert.Equal(25, root.GetProperty("limit").GetInt32());
        Assert.Equal("snapshot-2", root.GetProperty("revision").GetString());
        Assert.Equal("desc", root.GetProperty("sort")[0].GetProperty("direction").GetString());
        Assert.Equal("name", root.GetProperty("sort")[1].GetProperty("column").GetString());
        Assert.Equal(10, root.GetProperty("filters")[0].GetProperty("values")[0].GetInt32());
        Assert.Equal("2026-10-03T11:00:00Z", root.GetProperty("filters")[2].GetProperty("values")[0].GetString());
        Assert.Equal(0, root.GetProperty("filters")[3].GetProperty("values").GetArrayLength());
    }

    [Fact]
    public void Query_RejectsUnknownRepeatedAndDisabledSortKeys() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        query.Sort.Add(new CanopyGridSort("unknown"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.Sort.Clear();
        query.Sort.Add(new CanopyGridSort("amount"));
        query.Sort.Add(new CanopyGridSort("amount", true));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        query.Sort.RemoveAt(1);
        view.Columns[1].Sortable = false;
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(new CanopyGridView("other", "Other") { Columns = { new CanopyColumn("a", "A") } }));
    }

    [Theory]
    [InlineData("amount", CanopyGridFilterOperator.Contains)]
    [InlineData("amount", CanopyGridFilterOperator.Equal)]
    [InlineData("date", CanopyGridFilterOperator.Equal)]
    [InlineData("name", CanopyGridFilterOperator.GreaterThan)]
    [InlineData("unknown", CanopyGridFilterOperator.Equal)]
    public void Query_RejectsOperandsThatDoNotMatchTheirDeclaredColumn(string column, CanopyGridFilterOperator op) {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter(column, op, "localized 1,234"));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
    }

    [Fact]
    public void Query_RejectsNonfiniteNumbersAndContradictoryNullOperands() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, double.NaN));
        Assert.Throws<InvalidOperationException>(() => query.ToJson(view));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, new CanopyCell()));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("name", CanopyGridFilterOperator.IsNull, ""));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("name", CanopyGridFilterOperator.In));
        Assert.Throws<ArgumentException>(() => new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, "a", "b"));
        var valid = new CanopyGridQuery(view.Id);
        valid.Filters.Add(new CanopyGridFilter("name", CanopyGridFilterOperator.Equal, ""));
        ProtocolSchema.AssertValid(valid.ToJson(view), "empty string is a typed value");
    }

    [Fact]
    public void QueryAndPage_CheckTheirOwningGridAndSchemaRejectsWrongOperandArity() {
        var view = View();
        var query = new CanopyGridQuery(view.Id);
        query.Filters.Add(new CanopyGridFilter("name", CanopyGridFilterOperator.IsNull));
        var json = query.ToJson(view);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, doc => doc["filters"]![0]!["values"] = System.Text.Json.Nodes.JsonNode.Parse("[1]"))).IsValid);
        var page = new CanopyGridPage(view.Id, "r", 0, 1, 1);
        var row = new CanopyGridRow("a");
        row.Cells["unknown"] = 1;
        page.Rows.Add(row);
        Assert.Throws<InvalidOperationException>(() => page.ToJson(view));
        row.Cells.Remove("unknown");
        ProtocolSchema.AssertValid(page.ToJson(view), "page bound to declared columns");
        Assert.Throws<InvalidOperationException>(() => page.ToJson(new CanopyGridView("other", "Other")));
    }

    private static CanopyGridView View() {
        var view = new CanopyGridView("inventory", "Inventory");
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("date", "Date") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        return view;
    }
}
