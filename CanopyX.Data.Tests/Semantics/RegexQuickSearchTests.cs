using Xunit;

namespace CanopyX.Data.Tests;

public sealed class RegexQuickSearchTests {
    [Fact]
    public async Task RegexBudget_ExcludesTimeSpentEvaluatingOtherFilters() {
        var view = View(); view.Columns[0].Filterable = true;
        var schema = new CanopyDataSchema(view);
        var value = new string('x', 4096);
        // Warm first-use regex runtime code outside the provider's evaluation budget.
        new CanopyGridRegexSearch("^x").IsMatch(value);
        var rows = new[] { value, new string('x', 4095) + "y" };
        var provider = new CanopyInMemoryProvider<string>(schema, () => rows, item => Array.IndexOf(rows, item).ToString(),
            new Dictionary<string, Func<string, object?>> { ["name"] = item => item });
        var condition = new CanopyFilterCondition(schema.GetColumn("name"), CanopyGridFilterOperator.Equal, new object[] { value });
        var filter = new CanopyFilterGroup(CanopyGridFilterJunction.All, Enumerable.Repeat(condition, 10000));
        var request = new CanopyDataRequest(schema, filter, search: "^x", searchMode: CanopyGridSearchMode.Regex);

        Assert.Equal("0", Assert.Single((await provider.QueryAsync(request, CancellationToken.None)).Rows).Id);
    }

    [Theory]
    [InlineData("regex", "^Acme Corporation$")]
    [InlineData("substring", "Acme Corporation")]
    public async Task SearchTextOverrides_AgreeAcrossQueryCountFacetsAndSummary(string mode, string search) {
        var view = View(); view.Columns[0].Filterable = true;
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Reporting = new CanopyGridReporting();
        view.Reporting.FacetColumns.Add("name");
        view.Reporting.Aggregates.Add(new CanopyGridAggregate("sum", "amount", CanopyGridAggregateOperation.Sum, "Amount"));
        var schema = new CanopyDataSchema(view);
        var records = new[] { new CanopyCell("ACME-0042") { SearchText = "Acme Corporation" },
            new CanopyCell("Acme Corporation") { SearchText = "" }, new CanopyCell("Other") };
        var provider = new CanopyInMemoryProvider<CanopyCell>(schema, () => records, cell => Array.IndexOf(records, cell).ToString(),
            new Dictionary<string, Func<CanopyCell, object?>> { ["name"] = cell => cell, ["amount"] = cell => Array.IndexOf(records, cell) + 1 });
        var queryJson = System.Text.Json.JsonSerializer.Serialize(new { search, searchMode = mode, revision = "memory" });
        var query = CanopyRequestParser.ParseQuery(queryJson, schema);
        Assert.Equal("0", Assert.Single((await provider.QueryAsync(query, CancellationToken.None)).Rows).Id);
        Assert.Equal(1, await provider.CountAsync(query, CancellationToken.None));
        var suppressed = CanopyRequestParser.ParseQuery("""{"search":"^ACME-0042$","searchMode":"regex"}""", schema);
        Assert.Equal(0, await provider.CountAsync(suppressed, CancellationToken.None));
        var handler = new CanopyRemoteHandler(schema, provider);
        using var facet = System.Text.Json.JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"name\",\"limit\":10,\"query\":" + queryJson + "}"));
        Assert.Equal("ACME-0042", Assert.Single(facet.RootElement.GetProperty("items").EnumerateArray()).GetProperty("value").GetString());
        using var summary = System.Text.Json.JsonDocument.Parse(await handler.SummaryAsync(queryJson));
        Assert.Equal(1, summary.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(1, summary.RootElement.GetProperty("aggregates").GetProperty("sum").GetDouble());
        // An over-long searchable cell does not match; the other cells still answer the search.
        records[0].SearchText = new string('X', CanopyGridRegexSearch.MaximumInputLength + 1);
        records[2].SearchText = "X";
        Assert.Equal(1, await provider.CountAsync(CanopyRequestParser.ParseQuery("""{"search":"^X","searchMode":"regex"}""", schema), CancellationToken.None));
    }

    [Fact]
    public async Task RegexBudget_AnswersALimitClientError() {
        var schema = new CanopyDataSchema(View());
        // Every position of each cell is a candidate that fails on its next character: far more matching work than the
        // 100 ms budget allows, which stops the search before it reaches the last row.
        var cell = new string('a', CanopyGridRegexSearch.MaximumInputLength);
        var provider = new CanopyInMemoryProvider<int>(schema, () => Enumerable.Range(0, 100000), item => item.ToString(),
            new Dictionary<string, Func<int, object?>> { ["name"] = _ => cell });
        var request = CanopyRequestParser.ParseQuery("""{"search":"a[b-c]","searchMode":"regex"}""", schema);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(async () => await provider.CountAsync(request, CancellationToken.None));
        Assert.Equal(CanopyRequestError.LimitExceeded, error.Error);
    }

    [Fact]
    public async Task RegexOverQueryable_AnswersUnsupported() {
        var view = View(); var schema = new CanopyDataSchema(view);
        var map = new CanopyColumnMap<string>(view).Key(x => x).Column("name", x => x);
        var provider = new CanopyQueryableProvider<string>(new[] { "a" }.AsQueryable(), map);
        var error = await Assert.ThrowsAsync<CanopyRequestException>(async () =>
            await provider.CountAsync(CanopyRequestParser.ParseQuery("""{"search":"^a","searchMode":"regex"}""", map.Schema), CancellationToken.None));
        Assert.Equal(CanopyRequestError.Unsupported, error.Error);
    }

    private static CanopyDataGridView View(bool enabled = true) {
        var view = new CanopyDataGridView("items", "Work items") { Source = CanopyGridSource.HostedOffset(), AllowRegexSearch = enabled };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        return view;
    }

    [Fact]
    public async Task RegexRequests_UseTheCapturedOptInAndFilterInMemoryBeforePaging() {
        var view = View(); var schema = new CanopyDataSchema(view);
        view.AllowRegexSearch = false;
        var query = CanopyRequestParser.ParseQuery("""{"search":"^item [12]$","searchMode":"regex","offset":1,"limit":1}""", schema);
        var values = new[] { "Item 1", "ITEM 2", "Item 3", "prefix Item 1" };
        var provider = new CanopyInMemoryProvider<string>(schema, () => values, value => Array.IndexOf(values, value).ToString(),
            new Dictionary<string, Func<string, object?>> { ["name"] = value => value });
        var page = await provider.QueryAsync(query, CancellationToken.None);
        Assert.Equal(CanopyGridSearchMode.Regex, query.SearchMode);
        Assert.Equal(4, page.Total); Assert.Equal(2, page.Matched);
        Assert.Equal("1", Assert.Single(page.Rows).Id);
    }

    [Theory]
    [InlineData(false, "x")]
    [InlineData(true, "(a+)+$")]
    [InlineData(true, "a|b")]
    public void RegexRequests_RejectDisabledOrUnsafePatternsAsClientErrors(bool enabled, string pattern) {
        var schema = new CanopyDataSchema(View(enabled));
        Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseQuery(
            System.Text.Json.JsonSerializer.Serialize(new { search = pattern, searchMode = "regex" }), schema));
    }
}
