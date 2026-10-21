using System.Globalization;
using System.Text.RegularExpressions;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Matrix;

/// <summary>The static matrix for email, print and Office: tone cells that never rely on colour alone, group rows and bands, and group counts.</summary>
public sealed class MatrixStaticTests {
    private static CanopyMatrix Grouped(string? groupCount = null) {
        var matrix = new CanopyMatrix("grouped", "Grouped matrix");
        matrix.State("bad", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
            .State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check)
            .State("off", "Paused", CanopyTone.Muted, CanopyMatrixSymbol.Pause);
        matrix.Rows.Title = "Server";
        matrix.Rows.Attribute("site", "Site");
        matrix.Rows.GroupBy = "site";
        matrix.Rows.GroupCount = groupCount;
        // Declared out of group order: the groups follow their labels (Site 2 before Site 10), the members their declared order.
        foreach (var (id, site) in new[] { ("a", "Site 10"), ("b", "Site 2"), ("c", "Site 10"), ("d", "Site 2"), ("e", "Site 2") })
            matrix.Rows.Item(id, "Row " + id.ToUpperInvariant(), item => item.Value("site", site));
        matrix.Columns.Title = "Service";
        matrix.Columns.Attribute("tier", "Tier");
        matrix.Columns.GroupBy = "tier";
        foreach (var (id, tier) in new[] { ("x", "Edge"), ("y", "Core"), ("z", "Edge") }) matrix.Columns.Item(id, "Col " + id.ToUpperInvariant(), item => item.Value("tier", tier));
        matrix.Set("a", "x", "bad").Text = "3";
        matrix.Set("a", "y", "ok");
        matrix.Set("b", "y", "off");
        matrix.Set("c", "z", "bad");
        matrix.Set("d", "x", "ok");
        return matrix;
    }

    [Fact]
    public void RenderMatrix_TintsCellsThatNeedAttentionAndColoursTheRestWithTheirSymbols() {
        var html = CanopyStaticHtml.RenderMatrix(Grouped());
        Assert.Contains("print-color-adjust:exact;", html);
        var failing = Regex.Match(html, "<td style=\"([^\"]*)\" title=\"Failing\">✕ 3</td>");
        Assert.True(failing.Success, html);
        Assert.Contains("background:#", failing.Groups[1].Value);
        Assert.Contains("font-weight:700;", failing.Groups[1].Value);
        var healthy = Regex.Match(html, "<td style=\"([^\"]*)\" title=\"Healthy\">✓</td>");
        Assert.True(healthy.Success);
        Assert.DoesNotContain("background", healthy.Groups[1].Value);
        Assert.Contains("color:#", healthy.Groups[1].Value);
        // A pair without data is a quiet dot with its meaning as the tooltip, not an empty hole.
        Assert.Contains("title=\"No data\">·</td>", html);
        Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public void RenderMatrix_KeepsRowGroupsAsHeadingsAndColumnGroupsAsBands() {
        var html = CanopyStaticHtml.RenderMatrix(Grouped());
        var headings = Regex.Matches(html, "<th scope=\"rowgroup\" colspan=\"4\"[^>]*>([^<]*) <span[^>]*>· ([^<]*)</span></th>").Select(match => match.Groups[1].Value + "|" + match.Groups[2].Value);
        Assert.Equal(new[] { "Site 2|3", "Site 10|2" }, headings);
        var rows = Regex.Matches(html, "<th scope=\"row\"[^>]*>([^<]*)</th>").Select(match => match.Groups[1].Value);
        Assert.Equal(new[] { "Row B", "Row D", "Row E", "Row A", "Row C" }, rows);
        // The bands: Core then Edge, and the column labels below them in the same order.
        Assert.Equal(new[] { "1|Core", "2|Edge" }, Regex.Matches(html, "<th scope=\"colgroup\" colspan=\"(\\d)\"[^>]*>([^<]*)</th>").Select(match => match.Groups[1].Value + "|" + match.Groups[2].Value));
        Assert.Equal(new[] { "Col Y", "Col X", "Col Z" }, Regex.Matches(html, "<th scope=\"col\" style=\"[^\"]*text-align:center;\">([^<]*)</th>").Select(match => match.Groups[1].Value));
        // A group's total counts its members' cells that need attention: Site 10 holds both failing cells.
        Assert.Matches("Site 10 <span[^>]*>· 2</span></th><td[^>]*>2</td>", html);
        Assert.Matches("Failing 2 ", html.Replace("&#160;", " "));
    }

    [Theory]
    [InlineData("[one]{count} server[other]{count} servers", "en-US", "3 servers", "2 servers")]
    [InlineData("[one]{count} serwer[few]{count} serwery[many]{count} serwerów[other]{count} serwera", "pl-PL", "3 serwery", "2 serwery")]
    [InlineData("Servers: {count}", "de-DE", "Servers: 3", "Servers: 2")]
    public void RenderMatrix_CountsGroupsInTheAxisWordsAndTheCulturePluralForm(string groupCount, string culture, string first, string second) {
        var html = CanopyStaticHtml.RenderMatrix(Grouped(groupCount), new CanopyStaticHtmlOptions { Culture = CultureInfo.GetCultureInfo(culture) });
        Assert.Equal(new[] { first, second }, Regex.Matches(html, "<span[^>]*>· ([^<]*)</span></th>").Select(match => match.Groups[1].Value));
    }

    [Fact]
    public void RenderMatrix_PicksPolishManyFormAndEnglishSingular() {
        var matrix = Grouped("[one]{count} serwer[few]{count} serwery[many]{count} serwerów[other]{count} serwera");
        for (var i = 0; i < 3; i++) matrix.Rows.Item("n" + i, "Extra " + i, item => item.Value("site", "Site 10"));
        var polish = CanopyStaticHtml.RenderMatrix(matrix, new CanopyStaticHtmlOptions { Culture = CultureInfo.GetCultureInfo("pl-PL") });
        // Text is HTML-encoded, so letters beyond ASCII are character references.
        Assert.Contains("· 5 serwer&#243;w</span>", polish);
        var english = Grouped("[one]{count} server[other]{count} servers");
        english.Rows.Items.RemoveAt(4);
        english.Rows.Items.RemoveAt(3);
        english.Cells.Remove(english.Cells.Single(cell => cell.Row == "d"));
        Assert.Contains("· 1 server</span>", CanopyStaticHtml.RenderMatrix(english));
    }

    [Fact]
    public void GroupCount_RoundTripsAndRejectsTextWithoutTheCount() {
        var matrix = Grouped("[one]{count} server[other]{count} servers");
        var json = matrix.ToJson();
        ProtocolSchema.AssertValid(json, "Grouped matrix");
        Assert.Contains("\"groupCount\":\"[one]{count} server[other]{count} servers\"", json);
        Assert.Equal(matrix.Rows.GroupCount, CanopyMatrix.FromJson(json).Rows.GroupCount);
        foreach (var invalid in new[] { "Servers", "[one]{count} server", "[one]{count} server[other]servers", "[bad]{count}[other]{count}" }) {
            var bad = Grouped(invalid);
            Assert.Throws<InvalidOperationException>(() => bad.Validate());
        }

        var square = new CanopyMatrix("sq", "Square") { Square = true };
        square.State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        square.Rows.Item("a", "A");
        square.Columns.GroupCount = "{count}";
        Assert.Throws<InvalidOperationException>(() => square.Validate());
    }

    [Fact]
    public void DefaultLabels_CountAGroupWithTheNumberAloneAndRolledCellsAsCells() {
        Assert.Equal("{count}", new CanopyLabels().MatrixGroupCount);
        Assert.Equal("Cells: {count}", new CanopyLabels().MatrixCellCount);
        Assert.Equal("{count}", CanopyLabels.Polish().MatrixGroupCount);
    }
}
