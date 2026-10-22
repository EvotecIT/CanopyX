using CanopyX.Html;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Matrix;

/// <summary>The matrix model, its document (shared fixture with the browser), the static fallback and the HTML writers.</summary>
public sealed class MatrixTests {
    private static string Fixture() => File.ReadAllText(Path.Combine(RepositoryPaths.Root, "tests", "fixtures", "matrix-small.json"));

    private static CanopyMatrix Small() {
        var matrix = new CanopyMatrix("small", "Small matrix");
        matrix.State("bad", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
            .State("slow", "Slow", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true)
            .State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        matrix.Rows.Title = "Server";
        matrix.Rows.Attribute("site", "Site", facet: true);
        foreach (var id in new[] { "a", "b", "c", "d", "e", "f" }) matrix.Rows.Item(id, "Row " + id.ToUpperInvariant(), item => item.Value("site", string.CompareOrdinal(id, "d") < 0 ? "North" : "South"));
        matrix.Columns.Title = "Service";
        matrix.Columns.Attribute("tier", "Tier", facet: true);
        foreach (var id in new[] { "x", "y", "z", "w" }) matrix.Columns.Item(id, "Col " + id.ToUpperInvariant(), item => item.Value("tier", id == "x" || id == "y" ? "Core" : "Edge"));
        var grid = new[] { "2202", "2222", "0..2", "1220", "2222", "...." };
        var states = new[] { "bad", "slow", "ok" };
        for (var r = 0; r < grid.Length; r++) for (var c = 0; c < 4; c++) if (grid[r][c] != '.') matrix.Set(matrix.Rows.Items[r].Id, matrix.Columns.Items[c].Id, states[grid[r][c] - '0']);
        matrix.Cells.Single(cell => cell.Row == "c" && cell.Column == "x").Detail("Last success", "06:00").Title = "Three probes failed.";
        matrix.Cells.Single(cell => cell.Row == "c" && cell.Column == "x").Value = 3;
        matrix.Cells.Single(cell => cell.Row == "d" && cell.Column == "x").Value = 42;
        return matrix;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ToJson_WritesTheSharedFixture(bool windowsLineEndings) {
        var json = Small().ToJson();
        ProtocolSchema.AssertValid(json, "Matrix writer");
        ProtocolSchema.AssertValid(Fixture(), "Shared matrix fixture");
        using var expected = System.Text.Json.JsonDocument.Parse(Fixture().ReplaceLineEndings(windowsLineEndings ? "\r\n" : "\n"));
        using var actual = System.Text.Json.JsonDocument.Parse(json);
        Assert.True(System.Text.Json.JsonElement.DeepEquals(expected.RootElement, actual.RootElement));
        Assert.Contains("\"cells\":[\"2202\",\"2222\",\"0..2\",\"1220\",\"2222\",\"....\"]", json);
    }

    [Fact]
    public void HeadingCountIsIndependentFromDetailCountAndRoundTrips() {
        var matrix = Small(); matrix.Labels = new CanopyLabels();
        Assert.Equal("{count}", matrix.Labels!.MatrixGroupHeadingCount);
        Assert.Equal("Items: {count}", matrix.Labels!.MatrixGroupCount);
        matrix.Labels!.MatrixGroupHeadingCount = "({count})";
        matrix.Labels!.MatrixGroupCount = "Members: {count}";
        var json = matrix.ToJson();
        var back = CanopyMatrix.FromJson(json);
        Assert.Equal("({count})", back.Labels!.MatrixGroupHeadingCount);
        Assert.Equal("Members: {count}", back.Labels.MatrixGroupCount);
        Assert.Equal("Members: {count}", matrix.Labels!.MatrixGroupCount);
        Assert.Equal("{count}", CanopyLabels.Polish().MatrixGroupHeadingCount);
    }

    [Fact]
    public void FromJson_ReadsTheFixtureAndWritesItBack() {
        var matrix = CanopyMatrix.FromJson(Fixture());
        Assert.Equal(6, matrix.Rows.Items.Count);
        Assert.Equal(18, matrix.Cells.Count);
        Assert.Equal(42d, matrix.Cells.Single(cell => cell.Row == "d" && cell.Column == "x").Value);
        Assert.Equal("Last success", matrix.Cells.Single(cell => cell.Row == "c" && cell.Column == "x").Details[0].Key);
        Assert.Equal(Small().ToJson(), matrix.ToJson());
    }

    [Fact]
    public void Square_WritesOneAxisAColumnTitleAndNoSelfCells() {
        var matrix = new CanopyMatrix("square", "Replication") { Square = true };
        matrix.State("bad", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true);
        matrix.Rows.Title = "Destination";
        matrix.Columns.Title = "Source";
        matrix.Rows.Item("a", "A").Item("b", "B");
        matrix.Set("a", "a", "bad"); matrix.Set("a", "b", "bad");
        var json = matrix.ToJson();
        ProtocolSchema.AssertValid(json, "Square matrix writer");
        Assert.Contains("\"square\":true,\"columnTitle\":\"Source\"", json);
        Assert.Contains("\"cells\":[\".0\",\"..\"]", json);
        Assert.DoesNotContain("\"columns\"", json);
        matrix.Diagonal = CanopyMatrixDiagonal.Data;
        ProtocolSchema.AssertValid(matrix.ToJson(), "Square matrix with diagonal data");
        Assert.Contains("\"cells\":[\"00\",\"..\"]", matrix.ToJson());
        Assert.Equal(matrix.ToJson(), CanopyMatrix.FromJson(matrix.ToJson()).ToJson());
        matrix.Diagonal = CanopyMatrixDiagonal.Self;
        // As in the browser, a self cell drops its state when read, but a character that names no state is still an error.
        Assert.Equal("[\".0\",\"..\"]", Cells(CanopyMatrix.FromJson(matrix.ToJson().Replace("\".0\"", "\"00\""))));
        Assert.Contains("undeclared state", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(matrix.ToJson().Replace("\".0\"", "\"!0\""))).Message);
    }

    private static string Cells(CanopyMatrix matrix) {
        var json = matrix.ToJson();
        var start = json.IndexOf("\"cells\":", StringComparison.Ordinal) + 8;
        return json.Substring(start, json.IndexOf(']', start) - start + 1);
    }

    [Fact]
    public void Options_AreWrittenOnlyWhenTheyDifferFromTheDefaults() {
        var matrix = Small();
        matrix.TotalStates.Add("bad"); matrix.RowTotals = false; matrix.AttentionOnly = true; matrix.CellWidth = 44; matrix.Density = CanopyGridDensity.Compact;
        matrix.Details = CanopyMatrixDetails.Host; matrix.Phone = CanopyMatrixPhoneLayout.Cards; matrix.Legend = false;
        matrix.HideEmpty = true; matrix.AutoHeight = false;
        matrix.Rows.GroupBy = "site"; matrix.Rows.SortBy = CanopyMatrix.SortByTotal; matrix.Rows.SortDescending = true;
        matrix.Labels = CanopyLabels.Polish();
        var json = matrix.ToJson();
        ProtocolSchema.AssertValid(json, "Matrix with all options");
        foreach (var part in new[] { "\"totals\":{\"states\":[\"bad\"],\"rows\":false}", "\"attentionOnly\":true", "\"cellWidth\":44", "\"density\":\"compact\"", "\"details\":\"host\"",
            "\"phone\":\"cards\"", "\"legend\":false", "\"hideEmpty\":true", "\"autoHeight\":false", "\"groupBy\":\"site\"", "\"sort\":{\"by\":\"#total\",\"direction\":\"desc\"}", "\"matrixSearch\":\"Szukaj wierszy i kolumn\"" })
            Assert.Contains(part, json);
        Assert.DoesNotContain("\"flowNext\"", json);
        var back = CanopyMatrix.FromJson(json);
        Assert.Equal(json, back.ToJson());
        Assert.Equal("Szukaj wierszy i kolumn", back.Labels!.MatrixSearch);
        Assert.True(back.HideEmpty); Assert.False(back.AutoHeight);
        Assert.Equal("Ukryj puste wiersze i kolumny", back.Labels.MatrixHideEmpty);
        var defaults = Small().ToJson();
        Assert.DoesNotContain("\"hideEmpty\"", defaults); Assert.DoesNotContain("\"autoHeight\"", defaults);
    }

    [Fact]
    public void Validate_RejectsWhatTheBrowserRejects() {
        void Fails(Action<CanopyMatrix> change, string message) {
            var matrix = Small();
            change(matrix);
            Assert.Contains(message, Assert.Throws<InvalidOperationException>(() => matrix.ToJson()).Message, StringComparison.Ordinal);
        }

        Fails(m => m.Set("a", "x", "ok"), "set twice");
        Fails(m => m.Set("zz", "x", "ok"), "unknown row");
        Fails(m => m.Set("a", "zz", "ok"), "unknown column");
        Fails(m => m.Cells[0].State = "nope", "undeclared state");
        Fails(m => m.Rows.Item("a", "Again"), "unique id");
        Fails(m => m.Rows.Attribute("#hash", "Hash"), "does not start with #");
        Fails(m => m.Rows.GroupBy = "missing", "groups by the undeclared attribute");
        Fails(m => m.Rows.SortBy = "missing", "neither #label, #total nor an attribute");
        Fails(m => m.Rows.Items[0].Values["site"] = 5, "does not fit its kind");
        Fails(m => m.Rows.Items[0].Values["site"] = new CanopyCell("North") { Tone = CanopyTone.Danger }, "more than a value and its text");
        Fails(m => m.Rows.Items[0].Values["site"] = CanopyCell.StatusHistory(new[] { new CanopyCellPeriod("p", state: "Up") }), "more than a value and its text");
        Fails(m => m.Rows.Items[0].Label = "\ufeff", "visible text");
        Fails(m => m.Rows.Items[0].Href = "javascript:alert(1)", "not an http, https, mailto or relative address");
        Fails(m => m.Rows.Items[0].Href = "//evil.example", "not an http, https, mailto or relative address");
        Fails(m => m.CellWidth = 12, "24 to 120 pixels");
        Fails(m => m.Diagonal = CanopyMatrixDiagonal.Data, "Only a square matrix has a diagonal");
        Fails(m => m.Cells[0].Text = new string('x', 65), "at most 64 characters");
        Fails(m => m.TotalStates.Add("nope"), "undeclared state");
        Fails(m => { for (var i = 0; i < 34; i++) m.State("s" + i, "S" + i, CanopyTone.Info, CanopyMatrixSymbol.Dot); }, "1 to 36 states");
        Fails(m => { m.Square = true; }, "set only Columns.Title");
        Assert.Equal("#label", CanopyMatrix.SortByLabel);
    }

    [Fact]
    public void FromJson_RejectsDocumentsThatAreNotMatrices() {
        Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"type\": \"matrix\"", "\"type\": \"grid\"")));
        Assert.Contains("unknown property 'extra'", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"id\": \"small\"", "\"id\": \"small\", \"extra\": 1"))).Message);
        Assert.Contains("one character per column", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"2202\"", "\"22\""))).Message);
        Assert.Contains("undeclared state", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"2202\"", "\"9202\""))).Message);
        Assert.Contains("names no cell", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("[3, 0, 42]", "[2, 1, 42]"))).Message);
        Assert.Contains("known symbol", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"symbol\": \"clock\"", "\"symbol\": \"Clock\""))).Message);
        Assert.Contains("known symbol", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace(", \"symbol\": \"clock\"", ""))).Message);
        Assert.Contains("a cell twice", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("[3, 0, 42]", "[3, 0, 42], [3, 0, 7]"))).Message);
        Assert.Contains("Only a square matrix", Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(Fixture().Replace("\"id\": \"small\"", "\"id\": \"small\", \"diagonal\": \"self\""))).Message);
    }

    [Fact]
    public void AddCells_WritesACellPerRecord() {
        var matrix = new CanopyMatrix("m", "M");
        matrix.State("up", "Up", CanopyTone.Success, CanopyMatrixSymbol.Check).State("down", "Down", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true);
        matrix.Rows.Item("s1", "S1"); matrix.Columns.Item("dns", "DNS").Item("ntp", "NTP");
        matrix.AddCells(new[] { ("s1", "dns", true, 2), ("s1", "ntp", false, 0) }, x => x.Item1, x => x.Item2, x => x.Item3 ? "down" : "up", (x, cell) => cell.Value = x.Item4);
        Assert.Contains("\"cells\":[\"10\"]", matrix.ToJson());
        Assert.Contains("\"notes\":[[0,0,2],[0,1,0]]", matrix.ToJson());
    }

    [Fact]
    public void StaticFallback_DrawsATableOrTheCellsThatNeedAttention() {
        var html = CanopyStaticHtml.RenderMatrix(Small());
        Assert.Contains("<caption", html);
        Assert.Contains(">Col X</th>", html);
        Assert.Contains("title=\"Failing\">✕ 3</td>", html);
        Assert.Contains(">Total</th>", html);
        Assert.DoesNotContain("<script", html);
        var large = new CanopyMatrix("large", "Large");
        large.State("bad", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true).State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        for (var i = 0; i < 60; i++) { large.Rows.Item("r" + i, "Row " + i); large.Columns.Item("c" + i, "Col " + i); }
        for (var i = 0; i < 60; i++) large.Set("r" + i, "c" + i, i == 7 ? "bad" : "ok");
        var list = CanopyStaticHtml.RenderMatrix(large);
        Assert.Contains(">Row 7</td>", list);
        Assert.Contains("✕ Failing", list);
        Assert.DoesNotContain(">Row 8</td>", list);
    }

    [Fact]
    public void Html_WritesAFragmentWithTheMatrixPartAndAGridPage() {
        var fragment = Small().ToHtmlFragment(new CanopyHtmlOptions { Height = "500px" });
        Assert.Contains("class=\"cx-host cx-matrix-host\" data-canopyx-host", fragment);
        Assert.Contains("application/x-canopyx-matrix", fragment);
        Assert.Contains("height:500px", fragment);
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(Small()));
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(Small()), part => part.Name == "matrix");
        var page = Small().ToHtmlPage(new CanopyHtmlOptions { Nonce = "abc123" });
        Assert.Contains("<title>Small matrix</title>", page);
        Assert.Contains("nonce=\"abc123\"", page);
    }

    [Theory]
    [InlineData(false, 5)]
    [InlineData(true, 6)]
    public void StaticFallback_OverflowSpansOnlyTheRenderedColumns(bool rowTotals, int columns) {
        var matrix = Small();
        matrix.RowTotals = rowTotals;
        matrix.Legend = false;
        var html = CanopyStaticHtml.RenderMatrix(matrix, new CanopyStaticHtmlOptions { MaxRows = 1 });
        var header = html.Substring(0, html.IndexOf("</thead>", StringComparison.Ordinal));
        Assert.Equal(columns, System.Text.RegularExpressions.Regex.Matches(header, "<th\\s").Count);
        Assert.Contains("colspan=\"" + columns + "\"", html);
    }
}
