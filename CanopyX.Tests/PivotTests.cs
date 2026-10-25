using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests;

public sealed class PivotTests {
    private sealed record Input(string? Region, string? Team, string? Year, string? Quarter, double? Amount);

    private static readonly Input[] Records = {
        new("East", "A", "2025", "Q1", 10), new("East", "A", "2025", "Q1", 10),
        new("East", "B", "2025", "Q2", 20), new("East", "B", "2026", "Q1", 80),
        new("East", "B", "2026", "Q2", null), new("West", "A", "2025", "Q1", -5),
        new("West", "A", "2026", "Q2", 10), new("West", null, "2027", "Q1", 30),
        new(null, "A", null, "Q2", 0), new(null, "B", "2027", null, 30),
        new("West", "B", "2027", "Q1", 30), new("West", "B", "2027", "Q1", 30)
    };

    [Theory]
    [InlineData(200)]
    [InlineData(3)]
    public void Builtins_TwoAxesAndNullsMatchIndependentRecordsAtEveryPrefixIncludingOther(int cap) {
        var view = View(); var pivot = Definition(cap);
        var result = CanopyPivot.Compute(view, pivot, Rows(Records));
        Assert.Equal(Records.Length, result.Matched);
        foreach (var row in result.Rows) foreach (var column in result.Columns) {
            var accepted = Records.Where(input => Prefix(row.Path, new[] { input.Region, input.Team }) &&
                (column.Other ? !result.RetainedColumns.Any(path => Prefix(path, new[] { input.Year, input.Quarter })) :
                    Prefix(column.Path, new[] { input.Year, input.Quarter }))).ToArray();
            var cell = result.GetCell(row.Key, column.Key);
            Assert.True(accepted.Length == cell.Count, $"Row [{string.Join(",", row.Path.Select(value => value?.Value ?? "null"))}], column [{string.Join(",", column.Path.Select(value => value?.Value ?? "null"))}], Other={column.Other}: expected {accepted.Length}, actual {cell.Count}");
            foreach (var operation in Builtins) Number(Reference(accepted, operation), cell.Aggregates[operation.ToString()]);
        }
        // The parent/Other average must weight the raw records, and distinct count must union overlapping children.
        var east = Node(result.Rows, "East");
        Number(30, result.GetCell(east.Key, Total(result.Columns).Key).Aggregates["Average"]);
        Number(3, result.GetCell(east.Key, Total(result.Columns).Key).Aggregates["DistinctCount"]);
        Assert.Equal(cap < 7, result.ColumnsLimited);
    }

    [Fact]
    public void DefaultCap_CombinesColumnsBeyondTwoHundredAndPreservesExactTotalsAndMessageFlag() {
        var view = View(); var pivot = Definition(); pivot.Rows.Clear(); pivot.Columns.RemoveAt(1);
        pivot.Values.Remove("Sum"); pivot.Values.Insert(0, "Sum");
        var inputs = Enumerable.Range(0, 205).Select(index => new Input("R", "T", "C" + index.ToString("D3"), "Q", index)).ToArray();
        var result = CanopyPivot.Compute(view, pivot, Rows(inputs));
        Assert.True(result.ColumnsLimited); Assert.Equal(205, result.DistinctColumns);
        Assert.Equal(199, result.RetainedColumns.Count);
        Assert.Equal(200, result.Columns.Count(node => node.Parent != null));
        var other = Assert.Single(result.Columns, node => node.Other);
        var cell = result.GetCell(Total(result.Rows).Key, other.Key);
        Assert.Equal(6, cell.Count); Number(15, cell.Aggregates["Sum"]); Number(2.5, cell.Aggregates["Average"]);
        Number(6, cell.Aggregates["DistinctCount"]);
        using var json = JsonDocument.Parse(result.ToJson());
        Assert.True(json.RootElement.GetProperty("columnsLimited").GetBoolean());
        Assert.Equal(205, json.RootElement.GetProperty("matched").GetInt32());
    }

    [Fact]
    public void Builtins_ParentAndOtherUseRawDistinctUnionAndWeightedNonmissingAverage() {
        var inputs = new[] { new Input("R", "a", "A", "Q", 100), new("R", "a", "B", "Q", 1),
            new("R", "a", "B", "Q", 1), new("R", "b", "B", "Q", null), new("R", "b", "C", "Q", 1), new("R", "b", "C", "Q", 9) };
        var pivot = Definition(2); pivot.Values.Remove("Sum"); pivot.Values.Insert(0, "Sum");
        var result = CanopyPivot.Compute(View(), pivot, Rows(inputs));
        var other = result.Columns.Single(node => node.Other); var parent = Node(result.Rows, "R");
        foreach (var row in new[] { Total(result.Rows), parent }) {
            foreach (var operation in Builtins) {
                Number(Reference(inputs, operation), result.GetCell(row.Key, Total(result.Columns).Key).Aggregates[operation.ToString()]);
                Number(Reference(inputs.Skip(1), operation), result.GetCell(row.Key, other.Key).Aggregates[operation.ToString()]);
            }
        }
        Number(3, result.GetCell(parent.Key, other.Key).Aggregates["Average"]);
        Number(2, result.GetCell(parent.Key, other.Key).Aggregates["DistinctCount"]);
    }

    [Theory]
    [InlineData(1, 1, 0)]
    [InlineData(3, 2, 2)]
    [InlineData(2, 2, 1)]
    [InlineData(3, 3, 3)]
    public void TopN_ReservesOtherWithinMaxColumns(int cap, int top, int retained) {
        var pivot = Definition(cap); pivot.Columns.RemoveAt(1); pivot.TopNColumns = top;
        pivot.Values.Remove("Sum"); pivot.Values.Insert(0, "Sum");
        var inputs = new[] { new Input("R", "T", "A", null, 100), new("R", "T", "B", null, 40), new("R", "T", "C", null, 10) };
        var result = CanopyPivot.Compute(View(), pivot, Rows(inputs));
        Assert.Equal(retained, result.RetainedColumns.Count);
        Assert.True(result.Columns.Count(node => node.Parent != null) <= cap);
        Assert.Equal(retained < 3, result.ColumnsLimited);
        Assert.Equal(new[] { "A", "B", "C" }.Take(retained), result.RetainedColumns.Select(path => path[0]!.Value));
        if (retained < 3) Number(inputs.Skip(retained).Sum(input => input.Amount), result.GetCell(Total(result.Rows).Key, result.Columns.Single(node => node.Other).Key).Aggregates["Sum"]);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void SortTotals_OrdersSiblingsByAggregateThenNaturalValueAndKeepsDescendantsTogether(bool descending) {
        var inputs = new[] { new Input("B", "z", "X", null, 5), new("A", "z", "X", null, 10), new("A", "a", "X", null, 20), new("C", "x", "X", null, 5) };
        var pivot = Definition(); pivot.SortByTotal = "Sum"; pivot.SortDescending = descending;
        var result = CanopyPivot.Compute(View(), pivot, Rows(inputs));
        Assert.Equal(descending ? new[] { "A", "B", "C" } : new[] { "B", "C", "A" }, result.Rows.Where(node => node.Depth == 1).Select(node => node.Path[0]!.Value));
        var a = Node(result.Rows, "A");
        Assert.Equal(descending ? new[] { "a", "z" } : new[] { "z", "a" }, result.Rows.Where(node => node.Parent == a.Key).Select(node => node.Path[1]!.Value));
        var ordered = result.Rows.ToList(); var at = ordered.IndexOf(a);
        Assert.All(ordered.Skip(at + 1).Take(2), node => Assert.Equal(a.Key, node.Parent));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(200)]
    public void DrillThrough_TuplePredicatesReproduceEveryIntersectionCountIncludingNullAndOther(int cap) {
        var result = CanopyPivot.Compute(View(), Definition(cap), Rows(Records));
        foreach (var row in result.Rows) foreach (var column in result.Columns) {
            var predicates = result.DrillThrough(row.Key, column.Key);
            var count = Rows(Records).Count(record => predicates.All(predicate => Matches(predicate, record)));
            Assert.Equal(result.GetCell(row.Key, column.Key).Count, count);
        }
        if (cap == 3) {
            var other = result.Columns.Single(node => node.Other);
            var exclusion = Assert.Single(result.DrillThrough(Total(result.Rows).Key, other.Key));
            Assert.True(exclusion.Exclude); Assert.Equal(2, exclusion.Columns.Count);
        }
    }

    [Fact]
    public void BucketAxes_FixedWidthAndCalendarBoundariesPreserveMembershipAndDrillThrough() {
        var view = View(); view.Columns.Add(new CanopyColumn("day", "Day") { Kind = CanopyColumnKind.DateTime, Sortable = true, Filterable = true });
        var pivot = new CanopyGridPivot { Rows = { new("amount", bucket: CanopyBucket.FixedWidth(10)) },
            Columns = { new("day", bucket: CanopyBucket.Calendar(CanopyBucketKind.Month)) }, Values = { "Sum", "Count" } };
        var amounts = new double?[] { -1, 0, 9.99, 10, null, 20 };
        var dates = new DateTime?[] { new(2025, 1, 31), new(2025, 2, 1), new(2025, 2, 28), new(2025, 3, 1), null, new(2025, 2, 1) };
        var rows = amounts.Select((amount, index) => {
            var row = Rows(new[] { new Input("R", "T", "Y", "Q", amount) }).Single();
            if (dates[index].HasValue) row.Cells["day"] = new CanopyCell(dates[index]!.Value);
            return row;
        }).ToArray();
        var result = CanopyPivot.Compute(view, pivot, rows);
        Assert.Equal(new double?[] { -1, 0, 1, 2, null }, result.Rows.Where(node => node.Depth == 1).Select(node => node.Path[0]?.Value is double value ? (double?)value : null));
        foreach (var row in result.Rows) foreach (var column in result.Columns) {
            var selected = Enumerable.Range(0, rows.Length).Where(index =>
                (row.Depth == 0 || Equals(row.Path[0]?.Value, amounts[index].HasValue ? (object)Math.Floor(amounts[index]!.Value / 10) : null)) &&
                (column.Depth == 0 || Equals(column.Path[0]?.Value, dates[index].HasValue ? (object)(double)((dates[index]!.Value.Year - 1) * 12 + dates[index]!.Value.Month - 1) : null))).ToArray();
            var cell = result.GetCell(row.Key, column.Key);
            Assert.Equal(selected.Length, cell.Count);
            Number(selected.Any(index => amounts[index].HasValue) ? selected.Sum(index => amounts[index] ?? 0) : null, cell.Aggregates["Sum"]);
            Assert.Equal(selected.Length, rows.Count(record => result.DrillThrough(row.Key, column.Key).All(predicate => Matches(predicate, record))));
        }
    }

    [Fact]
    public void Display_SharesAndSiblingTransformsUseExactTotalsAndAcceptedSiblingOrder() {
        var inputs = new[] { new Input("R", "a", "X", null, 10), new("R", "a", "Y", null, 30),
            new("R", "b", "X", null, 20), new("R", "c", "X", null, 20), new("S", "z", "Y", null, 20) };
        var pivot = Definition(); pivot.Columns.RemoveAt(1);
        var result = CanopyPivot.Compute(View(), pivot, Rows(inputs));
        var a = Node(result.Rows, "R", "a"); var b = Node(result.Rows, "R", "b"); var c = Node(result.Rows, "R", "c"); var x = Node(result.Columns, "X");
        var raw = result.GetCell(b.Key, x.Key).Aggregates["Sum"];
        var expected = new Dictionary<CanopyShowAs, double?> { [CanopyShowAs.Value] = 20, [CanopyShowAs.PercentGrandTotal] = .2,
            [CanopyShowAs.PercentParent] = .4, [CanopyShowAs.PercentColumn] = .4, [CanopyShowAs.PercentRow] = 1,
            [CanopyShowAs.RunningTotal] = 30, [CanopyShowAs.Rank] = 1, [CanopyShowAs.Difference] = 10, [CanopyShowAs.PercentChange] = 1 };
        foreach (var pair in expected) { var shown = result.Display(b.Key, x.Key, "Sum", pair.Key); Number(pair.Value, shown.Value); Assert.Equal(pair.Key, shown.Mode); }
        Number(50, result.Display(c.Key, x.Key, "Sum", CanopyShowAs.RunningTotal).Value);
        Number(1, result.Display(c.Key, x.Key, "Sum", CanopyShowAs.Rank).Value);
        Number(3, result.Display(a.Key, x.Key, "Sum", CanopyShowAs.Rank).Value);
        Assert.Null(result.Display(a.Key, x.Key, "Sum", CanopyShowAs.Difference).Value);
        Number(raw, result.GetCell(b.Key, x.Key).Aggregates["Sum"]);
    }

    [Fact]
    public void EmptyAndSparseIntersections_ReturnZeroCountsAndMissingNumericValues() {
        var view = View(); var pivot = Definition();
        var empty = CanopyPivot.Compute(view, pivot, Array.Empty<CanopyGridRow>());
        Assert.Equal(0, empty.Matched); Assert.False(empty.ColumnsLimited);
        var cell = empty.GetCell(Total(empty.Rows).Key, Total(empty.Columns).Key);
        foreach (var operation in Builtins) Number(operation is CanopyGridAggregateOperation.Count or CanopyGridAggregateOperation.DistinctCount ? 0 : null, cell.Aggregates[operation.ToString()]);
        Assert.Empty(empty.DrillThrough(Total(empty.Rows).Key, Total(empty.Columns).Key));
        Assert.Null(empty.Display(Total(empty.Rows).Key, Total(empty.Columns).Key, "Sum", CanopyShowAs.PercentGrandTotal).Value);
        var sparse = CanopyPivot.Compute(view, pivot, Rows(new[] { new Input("A", "T", "X", "Q", 1), new("B", "T", "Y", "Q", 2) }));
        var gap = sparse.GetCell(Node(sparse.Rows, "A").Key, Node(sparse.Columns, "Y").Key);
        Assert.Equal(0, gap.Count); Number(0, gap.Aggregates["Count"]); Number(0, gap.Aggregates["DistinctCount"]); Assert.Null(gap.Aggregates["Sum"]);
    }

    [Fact]
    public void Display_ZeroAndMissingDenominatorsStayMissingAndSiblingsDoNotCrossParents() {
        var inputs = new[] { new Input("R", "a", "X", null, 0), new("R", "b", "X", null, 5),
            new("R", "c", "X", null, null), new("R", "d", "X", null, -5), new("S", "a", "X", null, 10) };
        var pivot = Definition(); pivot.Columns.RemoveAt(1);
        var result = CanopyPivot.Compute(View(), pivot, Rows(inputs)); var x = Node(result.Columns, "X");
        var b = Node(result.Rows, "R", "b"); var c = Node(result.Rows, "R", "c"); var d = Node(result.Rows, "R", "d");
        Assert.Null(result.Display(b.Key, x.Key, "Sum", CanopyShowAs.PercentParent).Value);
        Assert.Null(result.Display(b.Key, x.Key, "Sum", CanopyShowAs.PercentChange).Value);
        Assert.Null(result.Display(c.Key, x.Key, "Sum", CanopyShowAs.RunningTotal).Value);
        Assert.Null(result.Display(d.Key, x.Key, "Sum", CanopyShowAs.Difference).Value);
        Number(0, result.Display(d.Key, x.Key, "Sum", CanopyShowAs.RunningTotal).Value);
        var s = Node(result.Rows, "S", "a");
        Number(10, result.Display(s.Key, x.Key, "Sum", CanopyShowAs.RunningTotal).Value);
        Assert.Null(result.Display(s.Key, x.Key, "Sum", CanopyShowAs.Difference).Value);
    }

    [Fact]
    public void CustomCallback_ReceivesRawNonmissingValuesForParentsAndOther() {
        var view = View(); view.Reporting!.Aggregates.Add(new CanopyGridAggregate("range", "amount", "spread", "Range"));
        var pivot = Definition(2); pivot.Values.Clear(); pivot.Values.Add("range");
        var calls = new List<double[]>();
        double? Range(CanopyGridAggregate aggregate, IReadOnlyList<CanopyCell?> cells) {
            Assert.Equal("spread", aggregate.CustomOperation); Assert.All(cells, cell => Assert.NotNull(cell?.Value));
            var values = cells.Select(cell => Convert.ToDouble(cell!.Value, CultureInfo.InvariantCulture)).ToArray(); calls.Add(values);
            return values.Length == 0 ? null : values.Max() - values.Min();
        }
        Assert.Throws<InvalidOperationException>(() => CanopyPivot.Compute(view, pivot, Rows(Records)));
        var result = CanopyPivot.Compute(view, pivot, Rows(Records), Range);
        Assert.Contains(calls, values => values.Length == Records.Count(input => input.Amount.HasValue));
        foreach (var row in result.Rows) foreach (var column in result.Columns) {
            var values = Records.Where(input => Prefix(row.Path, new[] { input.Region, input.Team }) &&
                (column.Other ? !result.RetainedColumns.Any(path => Prefix(path, new[] { input.Year, input.Quarter })) : Prefix(column.Path, new[] { input.Year, input.Quarter })))
                .Where(input => input.Amount.HasValue).Select(input => input.Amount!.Value).ToArray();
            Number(values.Length == 0 ? null : values.Max() - values.Min(), result.GetCell(row.Key, column.Key).Aggregates["range"]);
        }
    }

    [Fact]
    public void CustomCallback_EmptyInputsAndUnsafeOutputsFollowNumericContract() {
        var view = View(); view.Reporting!.Aggregates.Add(new CanopyGridAggregate("custom", "amount", "spread", "Range"));
        var pivot = Definition(); pivot.Values.Clear(); pivot.Values.Add("custom");
        var invoked = false;
        var empty = CanopyPivot.Compute(view, pivot, Array.Empty<CanopyGridRow>(), (_, cells) => { invoked = true; Assert.Empty(cells); return null; });
        Assert.True(invoked);
        Assert.Null(empty.GetCell(Total(empty.Rows).Key, Total(empty.Columns).Key).Aggregates["custom"]);
        foreach (var value in new[] { double.NaN, double.PositiveInfinity, 9007199254740992d })
            Assert.Throws<InvalidOperationException>(() => CanopyPivot.Compute(view, pivot, Rows(Records), (_, _) => value));
    }

    [Theory]
    [InlineData("cap-low")]
    [InlineData("cap-high")]
    [InlineData("top-low")]
    [InlineData("top-high")]
    [InlineData("rows")]
    [InlineData("columns")]
    [InlineData("no-values")]
    [InlineData("duplicate-value")]
    [InlineData("unknown-value")]
    [InlineData("sort")]
    [InlineData("unfilterable")]
    [InlineData("too-many-values")]
    public void InvalidBoundsAndBindings_AreRejectedAtCompute(string invalid) {
        var view = View(); var pivot = Definition();
        switch (invalid) {
            case "cap-low": pivot.MaxColumns = 0; break;
            case "cap-high": pivot.MaxColumns = 201; break;
            case "top-low": pivot.TopNColumns = 0; break;
            case "top-high": pivot.TopNColumns = 201; break;
            case "rows": for (var i = 0; i < 3; i++) pivot.Rows.Add(new("amount")); break;
            case "columns": pivot.Columns.Add(new("amount")); break;
            case "no-values": pivot.Values.Clear(); break;
            case "duplicate-value": pivot.Values.Add("Sum"); break;
            case "unknown-value": pivot.Values.Add("absent"); break;
            case "sort": pivot.SortByTotal = "absent"; break;
            case "unfilterable": view.GetColumn("region").Filterable = false; break;
            case "too-many-values": while (pivot.Values.Count < 33) pivot.Values.Add("Sum"); break;
        }
        Assert.Throws<InvalidOperationException>(() => CanopyPivot.Compute(view, pivot, Rows(Records)));
    }

    [Fact]
    public void StaticPivot_UsesLocalizedLabelsEncodedContentOutlineLimitsAndCompleteTotals() {
        var view = View(); view.Labels.GridSummary = "Razem"; view.Labels.GridGroupMissing = "Brak";
        view.Labels.GridPivotOther = "Pozostałe"; view.Labels.GridPivotLimited = "Kolumny {shown}/{total}";
        var pivot = Definition(2);
        var inputs = Records.Concat(new[] { new Input("<script>", "&child", "<img>", "Q1", 7) }).ToArray();
        var result = CanopyPivot.Compute(view, pivot, Rows(inputs));
        var html = CanopyStaticHtml.RenderGridPivot(view, result, new CanopyStaticHtmlOptions { Caption = "<Pivot>", MaxRows = 3, MaxDepth = 1 });
        var table = ParseTable(html);
        Assert.Equal("<Pivot>", table.Element("caption")!.Value);
        Assert.Empty(table.Descendants("script")); Assert.Empty(table.Descendants("style")); Assert.Empty(table.Descendants("button"));
        Assert.DoesNotContain(table.Descendants().Attributes(), attribute => attribute.Name.LocalName.StartsWith("on", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("Pozostałe", table.Element("thead")!.Value); Assert.Contains("Kolumny 1/", table.Value);
        Assert.Contains("&lt;script&gt;", html); Assert.DoesNotContain("&amp;child", html);
        Assert.Equal(3, table.Element("tbody")!.Elements("tr").Count(row => row.Element("th") != null));
        var footer = table.Element("tfoot")!.Element("tr")!;
        Assert.Equal("Razem", footer.Element("th")!.Value);
        Assert.Equal("12", footer.Elements("td").TakeLast(6).First().Value);
        Assert.Equal("252", footer.Elements("td").TakeLast(5).First().Value);
        Assert.Contains("Showing 3 of", table.Value);
        var outline = ParseTable(CanopyStaticHtml.RenderGridPivot(view, result));
        Assert.Contains("&child", outline.Value);
        Assert.Contains("Brak", outline.Value);
        Assert.Contains(outline.Element("tbody")!.Elements("tr").Elements("th"), heading => heading.Attribute("style")!.Value.Contains("padding-left:24px", StringComparison.Ordinal));
        Assert.Contains("year: 2025 / quarter: Q1", outline.Element("thead")!.Value);
    }

    [Fact]
    public void StaticPivot_FormatsDisplaySharesAndBucketCaptionsAndEmptyGrandTotal() {
        var view = View();
        var sum = view.Reporting!.Aggregates.Single(aggregate => aggregate.Id == "Sum");
        view.Reporting.Aggregates.Remove(sum); view.Reporting.Aggregates.Add(sum.ShowValuesAs(CanopyShowAs.PercentRow));
        var pivot = new CanopyGridPivot { Rows = { new("amount", bucket: CanopyBucket.FixedWidth(10)) }, Columns = { new("year") }, Values = { "Sum" } };
        var result = CanopyPivot.Compute(view, pivot, Rows(new[] { new Input("R", "T", "X", "Q", 11), new("R", "T", "Y", "Q", 12) }));
        var table = ParseTable(CanopyStaticHtml.RenderGridPivot(view, result));
        Assert.Contains("[10, 20)", table.Value);
        var values = table.Element("tbody")!.Elements("tr").First().Elements("td").Select(cell => cell.Value).ToArray();
        Assert.Equal(new[] { (11d / 23).ToString("P2", CultureInfo.InvariantCulture), (12d / 23).ToString("P2", CultureInfo.InvariantCulture), 1d.ToString("P2", CultureInfo.InvariantCulture) }, values);
        var empty = CanopyPivot.Compute(View(), Definition(), Array.Empty<CanopyGridRow>());
        Assert.NotNull(ParseTable(CanopyStaticHtml.RenderGridPivot(View(), empty)).Element("tfoot"));
    }

    [Fact]
    public void StaticAxesUseTheColumnsValueLabelsBooleanLabelsAndMinutePrecision() {
        var view = View(); view.Labels.Yes = "Confirmed"; view.Labels.UtcTime = "at {time}";
        view.GetColumn("region").ValueLabels.Add("East", "Displayed East");
        view.Columns.Add(new CanopyColumn("at", "Observed") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        var row = new CanopyGridRow("one"); row.Cells["region"] = "East"; row.Cells["team"] = true;
        row.Cells["at"] = new DateTime(2026, 10, 25, 9, 14, 59, 900, DateTimeKind.Utc); row.Cells["amount"] = 10d;
        var pivot = new CanopyGridPivot { Rows = { new("region"), new("team") }, Columns = { new("at") }, Values = { "Sum" } };
        var text = ParseTable(CanopyStaticHtml.RenderGridPivot(view, CanopyPivot.Compute(view, pivot, new[] { row }))).Value;
        Assert.Contains("Displayed East", text); Assert.Contains("Confirmed", text); Assert.Contains("at 2026-10-25 09:14", text); Assert.DoesNotContain(":59", text);
        Assert.Throws<ArgumentException>(() => CanopyStaticHtml.RenderGridPivot(new CanopyDataGridView("another", "Other"), CanopyPivot.Compute(view, pivot, new[] { row })));
    }

    private static XElement ParseTable(string html) => XDocument.Parse(html.Replace("<br>", "<br />", StringComparison.Ordinal)).Root!;

    private static readonly CanopyGridAggregateOperation[] Builtins = { CanopyGridAggregateOperation.Count, CanopyGridAggregateOperation.Sum,
        CanopyGridAggregateOperation.Average, CanopyGridAggregateOperation.Minimum, CanopyGridAggregateOperation.Maximum, CanopyGridAggregateOperation.DistinctCount };

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("pivot", "Pivot") { Reporting = new CanopyGridReporting() };
        foreach (var name in new[] { "region", "team", "year", "quarter" }) view.Columns.Add(new CanopyColumn(name, name) { Sortable = true, Filterable = true });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true, Filterable = true });
        foreach (var operation in Builtins) view.Reporting.Aggregates.Add(new CanopyGridAggregate(operation.ToString(), "amount", operation, operation.ToString()));
        return view;
    }
    private static CanopyGridPivot Definition(int cap = 200) {
        var pivot = new CanopyGridPivot { MaxColumns = cap, Rows = { new("region"), new("team") }, Columns = { new("year"), new("quarter") } };
        foreach (var operation in Builtins) pivot.Values.Add(operation.ToString());
        return pivot;
    }
    private static CanopyGridRow[] Rows(IEnumerable<Input> inputs) => inputs.Select((input, index) => {
        var row = new CanopyGridRow("r" + index);
        var names = new[] { "region", "team", "year", "quarter" }; var values = new[] { input.Region, input.Team, input.Year, input.Quarter };
        for (var i = 0; i < names.Length; i++) if (values[i] != null) row.Cells[names[i]] = new CanopyCell(values[i]!);
        if (input.Amount.HasValue) row.Cells["amount"] = new CanopyCell(input.Amount.Value);
        return row;
    }).ToArray();
    private static CanopyPivotAxisNode Total(IReadOnlyList<CanopyPivotAxisNode> nodes) => nodes.Single(node => node.Parent == null);
    private static CanopyPivotAxisNode Node(IReadOnlyList<CanopyPivotAxisNode> nodes, params string?[] path) => nodes.Single(node => !node.Other && node.Path.Count == path.Length && Prefix(node.Path, path));
    private static bool Prefix(IReadOnlyList<CanopyCell?> path, IReadOnlyList<string?> values) => path.Select((cell, index) => Equals(cell?.Value, values[index])).All(equal => equal);
    private static double? Reference(IEnumerable<Input> inputs, CanopyGridAggregateOperation operation) {
        var values = inputs.Where(input => input.Amount.HasValue).Select(input => input.Amount!.Value).ToArray();
        if (operation == CanopyGridAggregateOperation.Count) return values.Length;
        if (operation == CanopyGridAggregateOperation.DistinctCount) return values.Distinct().Count();
        if (values.Length == 0) return null;
        return operation switch { CanopyGridAggregateOperation.Sum => values.Sum(), CanopyGridAggregateOperation.Average => values.Average(),
            CanopyGridAggregateOperation.Minimum => values.Min(), CanopyGridAggregateOperation.Maximum => values.Max(), _ => throw new ArgumentOutOfRangeException(nameof(operation)) };
    }
    private static bool Matches(CanopyGridTupleFilter predicate, CanopyGridRow row) {
        var match = predicate.Values.Any(tuple => predicate.Columns.Select((field, index) => {
            var raw = row.Cells.TryGetValue(field.Column, out var cell) ? cell?.Value : null;
            object? key = raw;
            if (raw != null && field.Bucket != null) {
                // Independent formula for the two bucket kinds exercised here, not Bucket.Key or a query engine.
                key = field.Bucket.Kind == CanopyBucketKind.Width ? Math.Floor((Convert.ToDouble(raw, CultureInfo.InvariantCulture) - field.Bucket.Origin) / field.Bucket.Width) :
                    (double)((((DateTime)raw).Year - 1) * 12 + ((DateTime)raw).Month - 1);
            }
            return Equals(key, tuple[index]?.Value);
        }).All(equal => equal));
        return predicate.Exclude ? !match : match;
    }
    private static void Number(double? expected, double? actual) {
        if (!expected.HasValue) Assert.Null(actual);
        else { Assert.True(actual.HasValue); Assert.Equal(expected.Value, actual.Value, 9); }
    }
}
