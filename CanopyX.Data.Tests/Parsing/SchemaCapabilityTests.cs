using System.Text;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;
#if NET10_0_OR_GREATER
using System.Net;
using CanopyX.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging;
#endif

namespace CanopyX.Data.Tests;

public sealed class SchemaCapabilityTests {
    private readonly ITestOutputHelper _output;

    public SchemaCapabilityTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public async Task UnmappedColumns_KeepDisplayValuesWithoutAdvertisingRejectedOperations() {
        var map = Map();
        var schema = map.Schema;
        var handler = new CanopyRemoteHandler(schema, new CanopyQueryableProvider<Item>(Rows.AsQueryable(), map));
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"sort\":[{\"column\":\"name\"}]}"));
        _output.WriteLine("Accepted page: " + page.RootElement.GetRawText());
        Assert.Equal("Display alpha", page.RootElement.GetProperty("items")[0].GetProperty("cells").GetProperty("display").GetString());
        var sortError = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.QueryAsync("{\"sort\":[{\"column\":\"display\"}]}"));
        var exportError = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"live\",\"query\":{},\"columns\":[\"display\"]}", "csv"));
        Assert.Equal(CanopyRequestError.UnknownColumn, sortError.Error);
        Assert.Equal(CanopyRequestError.UnknownColumn, exportError.Error);
        _output.WriteLine("Captured /view: " + schema.ToJson());
        _output.WriteLine("Explicit display-only sort: " + sortError.Error + "; explicit export: " + exportError.Error);
        using var definition = JsonDocument.Parse(schema.ToJson());
        var columns = definition.RootElement.GetProperty("columns").EnumerateArray().ToDictionary(column => column.GetProperty("id").GetString()!);
        var display = columns["display"];
        Assert.False(display.TryGetProperty("sortable", out var sortable) && sortable.GetBoolean());
        Assert.False(display.TryGetProperty("editable", out var editable) && editable.GetBoolean());
        Assert.False(display.GetProperty("filterable").GetBoolean());
        Assert.False(display.GetProperty("exportable").GetBoolean());
        Assert.False(display.TryGetProperty("editor", out _));
        Assert.False(display.TryGetProperty("validation", out _));
        Assert.Equal("Name with display-only </script> detail", display.GetProperty("title").GetString());
        Assert.Equal("detailValue", display.GetProperty("renderer").GetString());
        Assert.True(display.GetProperty("wrap").GetBoolean());
        Assert.DoesNotContain("</script>", schema.ToJson());
        Assert.False(columns["locked"].GetProperty("filterable").GetBoolean());
        Assert.True(columns["locked"].GetProperty("sortable").GetBoolean());
        Assert.False(columns["locked"].TryGetProperty("exportable", out var exportable) && !exportable.GetBoolean());
        Assert.Equal(new[] { "name" }, definition.RootElement.GetProperty("searchColumns").EnumerateArray().Select(id => id.GetString()));
        Assert.Equal(new[] { "name", "locked" }, definition.RootElement.GetProperty("reporting").GetProperty("facetColumns").EnumerateArray().Select(id => id.GetString()));
        Assert.False(definition.RootElement.GetProperty("reporting").GetProperty("ordering").TryGetProperty("display", out _));
        Assert.True(map.View.GetColumn("display").Sortable);
        Assert.True(map.View.GetColumn("display").Editable);
        var captured = schema.ToJson();
        map.View.SearchColumns.Clear();
        map.View.Reporting!.FacetColumns.Clear();
        map.View.Columns.Clear();
        Assert.Equal(captured, schema.ToJson());
    }

    [Fact]
    public async Task MappedOperationsAndHiddenExportOptIn_KeepTheirExistingContracts() {
        var map = Map();
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Item>(Rows.AsQueryable(), map));
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"sort\":[{\"column\":\"locked\",\"direction\":\"desc\"}],\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"alpha\"]}]}"));
        Assert.Equal(1, page.RootElement.GetProperty("matched").GetInt32());
        var filterError = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.QueryAsync("{\"filters\":[{\"column\":\"locked\",\"operator\":\"eq\",\"values\":[\"visible\"]}]}"));
        Assert.Equal(CanopyRequestError.ColumnNotFilterable, filterError.Error);
        var defaultExport = await Csv(handler, "{\"scope\":\"all\",\"revision\":\"live\",\"query\":{}}");
        Assert.Equal("\uFEFFName,Locked\r\nbeta,visible\r\nalpha,visible\r\n", defaultExport);
        Assert.Equal("\uFEFFHidden\r\nsecond\r\nfirst\r\n", await Csv(handler, "{\"scope\":\"all\",\"revision\":\"live\",\"query\":{},\"columns\":[\"hidden\"]}"));
        Assert.Equal(new[] { "name", "locked", "hidden" }, map.Schema.Columns.Select(column => column.Id));
        Assert.False(map.Schema.GetColumn("locked").Filterable);
        Assert.True(map.Schema.GetColumn("locked").Facetable);
    }

    [Fact]
    public void UnrestrictedSchema_PreservesTheDeclaredDocumentExactly() {
        var view = Map().View;
        Assert.Equal(view.ToJson(), new CanopyDataSchema(view).ToJson());
    }

    [Fact]
    public void RestrictedDefinition_PreservesSafeEmbeddingAndPresentationMetadata() {
        var map = Map();
        map.View.Noun = "`${records}<script>&\u2028";
        map.View.Presentation = CanopyGridPresentation.Paged;
        map.View.PageLength = 23;
        map.View.TimeZone = CanopyTimeZone.Local;
        var json = map.Schema.ToJson();
        Assert.DoesNotContain("`", json);
        Assert.DoesNotContain("${", json);
        Assert.DoesNotContain("<script>", json);
        Assert.DoesNotContain("&", json);
        Assert.DoesNotContain("\u2028", json);
        using var definition = JsonDocument.Parse(json);
        Assert.Equal("`${records}<script>&\u2028", definition.RootElement.GetProperty("noun").GetString());
        Assert.Equal("paged", definition.RootElement.GetProperty("presentation").GetString());
        Assert.Equal(23, definition.RootElement.GetProperty("pageLength").GetInt32());
        Assert.Equal("local", definition.RootElement.GetProperty("timeZone").GetString());
    }

    [Fact]
    public void SearchWithOnlyUnmappedColumns_IsAdvertisedAsUnavailable() {
        var map = Map();
        map.View.SearchColumns.Clear();
        map.View.SearchColumns.Add("display");
        var schema = map.Schema;
        Assert.Empty(schema.SearchColumns);
        using var definition = JsonDocument.Parse(schema.ToJson());
        Assert.False(definition.RootElement.GetProperty("search").GetBoolean());
        Assert.False(definition.RootElement.TryGetProperty("searchColumns", out _));
    }

    [Fact]
    public async Task DeclaredFalseCapabilities_AreEnforcedForMappedColumnsAndEmptyExports() {
        var map = Map();
        map.View.GetColumn("name").Filterable = false;
        map.View.GetColumn("locked").Exportable = false;
        var schema = map.Schema;
        var handler = new CanopyRemoteHandler(schema, new CanopyQueryableProvider<Item>(Rows.AsQueryable(), map));
        Assert.False(schema.GetColumn("name").Filterable);
        Assert.False(schema.GetColumn("name").Definition.Filterable);
        Assert.False(schema.GetColumn("locked").Exportable);
        var rejectedFilter = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.QueryAsync("{\"filters\":[{\"column\":\"name\",\"operator\":\"eq\",\"values\":[\"alpha\"]}]}"));
        Assert.Equal(CanopyRequestError.ColumnNotFilterable, rejectedFilter.Error);
        var rejectedExport = await Assert.ThrowsAsync<CanopyRequestException>(() => handler.PrepareExportAsync("{\"revision\":\"live\",\"query\":{},\"columns\":[\"locked\"]}", "csv"));
        Assert.Equal(CanopyRequestError.InvalidExport, rejectedExport.Error);
        Assert.Equal("\uFEFFName\r\nbeta\r\nalpha\r\n", await Csv(handler, "{\"scope\":\"all\",\"revision\":\"live\",\"query\":{}}"));
        using var page = JsonDocument.Parse(await handler.QueryAsync("{\"sort\":[{\"column\":\"locked\"}]}"));
        Assert.Equal(2, page.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(new[] { "1", "2" }, page.RootElement.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("id").GetString()));
        var noExports = Map();
        foreach (var column in noExports.View.Columns) column.Exportable = false;
        var noExportHandler = new CanopyRemoteHandler(noExports.Schema, new CanopyQueryableProvider<Item>(Rows.AsQueryable(), noExports));
        var emptyExport = await Assert.ThrowsAsync<CanopyRequestException>(() => noExportHandler.PrepareExportAsync("{\"revision\":\"live\",\"query\":{}}", "csv"));
        Assert.Equal(CanopyRequestError.InvalidExport, emptyExport.Error);
    }

    [Theory]
    [InlineData("sort")]
    [InlineData("filter")]
    [InlineData("group")]
    public void InitialQuery_RejectsUnsupportedColumnOperationsAtSchemaConstruction(string operation) {
        var map = Map();
        var query = map.View.Query = new CanopyGridQuery(map.View.Id);
        if (operation == "sort") query.Sort.Add(new CanopyGridSort("display"));
        if (operation == "filter") query.FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All,
            new CanopyGridFilter("locked", CanopyGridFilterOperator.Equal, new CanopyCell("visible")));
        if (operation == "group") query.GroupBy = new[] { new CanopyGridGroupLevel("display") };
        var error = Assert.Throws<ArgumentException>(() => map.Schema);
        Assert.Equal("view", error.ParamName);
        Assert.IsType<CanopyRequestException>(error.InnerException);
    }

    [Fact]
    public void InitialQuery_UsesProtocolBoundsBeforeEndpointLimitsAreConfigured() {
        var map = Map();
        map.View.Query = new CanopyGridQuery(map.View.Id) { Limit = 10000, Search = new string('a', 2048) };
        using var definition = JsonDocument.Parse(map.Schema.ToJson());
        var query = definition.RootElement.GetProperty("query");
        Assert.Equal(10000, query.GetProperty("limit").GetInt32());
        Assert.Equal(new string('a', 2048), query.GetProperty("search").GetString());
    }

#if NET10_0_OR_GREATER
    [Fact]
    public async Task EndpointView_AdvertisesTheSameCapabilitiesItsSortAndExportEndpointsServe() {
        var map = Map();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        await using var app = builder.Build();
        app.MapCanopyRemote("/items", _ => Rows.AsQueryable(), map, options => options.AllowAnonymous = true);
        await app.StartAsync();
        using var client = app.GetTestClient();
        var viewText = await client.GetStringAsync("/items/view");
        var sort = await client.PostAsync("/items/query", new StringContent("{\"sort\":[{\"column\":\"display\"}]}", Encoding.UTF8, "application/json"));
        var export = await client.PostAsync("/items/export/csv", new StringContent("{\"scope\":\"all\",\"revision\":\"live\",\"query\":{},\"columns\":[\"display\"]}", Encoding.UTF8, "application/json"));
        var sortText = await sort.Content.ReadAsStringAsync();
        var exportText = await export.Content.ReadAsStringAsync();
        _output.WriteLine("GET /items/view: " + viewText);
        _output.WriteLine("POST /items/query: " + (int)sort.StatusCode + " " + sortText);
        _output.WriteLine("POST /items/export/csv: " + (int)export.StatusCode + " " + exportText);
        Assert.Equal(HttpStatusCode.BadRequest, sort.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, export.StatusCode);
        using var sortJson = JsonDocument.Parse(sortText);
        using var exportJson = JsonDocument.Parse(exportText);
        Assert.Equal("unknownColumn", sortJson.RootElement.GetProperty("error").GetString());
        Assert.Equal("unknownColumn", exportJson.RootElement.GetProperty("error").GetString());
        using var view = JsonDocument.Parse(viewText);
        var display = view.RootElement.GetProperty("columns").EnumerateArray().Single(column => column.GetProperty("id").GetString() == "display");
        Assert.False(display.TryGetProperty("sortable", out var sortable) && sortable.GetBoolean());
        Assert.False(display.GetProperty("exportable").GetBoolean());
        var defaultExport = await client.PostAsync("/items/export/csv", new StringContent("{\"scope\":\"all\",\"revision\":\"live\",\"query\":{}}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, defaultExport.StatusCode);
        Assert.StartsWith("Name,Locked\r\n", (await defaultExport.Content.ReadAsStringAsync()).TrimStart('\uFEFF'));
    }
#endif

    private static CanopyColumnMap<Item> Map() {
        var view = new CanopyDataGridView("capabilities", "Capabilities") {
            Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("display", "Name with display-only </script> detail") {
            Sortable = true, Editable = true, Editor = CanopyCellEditor.Text(), Validation = new CanopyCellValidation { Required = true },
            Ordering = new CanopyGridOrdering(CanopyGridTextOrder.Natural), Wrap = true, Renderer = "detailValue"
        });
        view.Columns.Add(new CanopyColumn("locked", "Locked") { Sortable = true });
        view.Columns.Add(new CanopyColumn("hidden", "Hidden") { Hidden = true });
        view.SearchColumns.Add("display"); view.SearchColumns.Add("name");
        foreach (var id in new[] { "display", "name", "locked" }) view.Reporting.FacetColumns.Add(id);
        return new CanopyColumnMap<Item>(view).Key(row => row.Id).Column("name", row => row.Name)
            .Column("locked", row => row.Locked, options => options.Filterable(false)).Column("hidden", row => row.Hidden)
            .DecorateRows(row => row.Cells["display"] = new CanopyCell("Display " + row.Cells["name"].Value));
    }

    private static async Task<string> Csv(CanopyRemoteHandler handler, string request) {
        var job = await handler.PrepareExportAsync(request, "csv");
        using var stream = new MemoryStream();
        await job.WriteAsync(stream);
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static readonly Item[] Rows = {
        new Item { Id = 1, Name = "beta", Locked = "visible", Hidden = "second" },
        new Item { Id = 2, Name = "alpha", Locked = "visible", Hidden = "first" }
    };

    private sealed class Item {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Locked { get; set; } = "";
        public string Hidden { get; set; } = "";
    }
}
