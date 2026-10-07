using System.Text.RegularExpressions;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

/// <summary>
/// The outline is themed without script: as literal colours where stylesheets and custom properties are dropped, and
/// with the runtime's custom properties on top where a page defines them.
/// </summary>
public sealed class StaticThemeTests {
    private static readonly Regex Hex = new Regex("#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b");

    [Fact]
    public void Render_DarkTheme_WritesOnlyDarkLiteralsAndCarriesItsOwnSurface() {
        var html = CanopyStaticHtml.Render(View(), new CanopyStaticHtmlOptions { Theme = CanopyStaticTheme.Dark(), MaxRows = 2, FullReportUrl = "full.html" });

        Assert.StartsWith("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"", html);
        Assert.Contains("color:#f2f3f5;background:#16181c;\">", html);
        // The caption and the note are part of the table, so neither lands on the page's own background.
        Assert.Matches("<caption style=\"[^\"]*background:#16181c;\">", html);
        Assert.Matches("</tbody><tbody><tr><td colspan=\"2\" style=\"[^\"]*\">Showing 2 of 4 rows\\. <a href=\"full.html\" style=\"color:#37c9b8;\">", html);
        Assert.EndsWith("</td></tr></tbody></table>", html);
        Assert.Contains("color:#f47171;", html); // danger in the dark palette
        // Nothing of the light palette is left: every colour comes from the theme or is mixed from it.
        var light = new CanopyStaticTheme();
        var colors = Hex.Matches(html).Select(match => match.Value).Distinct().ToList();
        Assert.DoesNotContain(colors, color => color == light.Surface || color == light.Line || color == light.Accent || color == light.Danger);
        Assert.DoesNotContain("var(", html);
    }

    [Fact]
    public void Render_HostColours_AreUsedAndMixedLikeTheRuntimeMixesThem() {
        var options = new CanopyStaticHtmlOptions();
        options.Theme.Surface = "#000";
        options.Theme.Text = "#fff";
        options.Theme.Line = "#123456";
        options.Theme.Danger = "#ff0000";
        var html = CanopyStaticHtml.Render(View(), options);

        Assert.Contains("color:#fff;background:#000;", html);
        Assert.Contains("border-bottom:1px solid #123456;", html);
        // color-mix(in srgb, text 5%, surface) for the header, and tone 12% for a badge.
        Assert.Contains("background:#090909;", html);
        Assert.Contains("background:#1f0000;color:#ff0000;", html);
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#12345")]
    [InlineData("#ggg")]
    [InlineData("#fff;background:url(x)")]
    [InlineData("var(--x)")]
    public void Theme_ColourThatIsNotHex_IsRejectedWhenItIsSet(string color) {
        var theme = new CanopyStaticTheme();
        Assert.Throws<ArgumentException>(() => theme.Surface = color);
        Assert.Throws<ArgumentException>(() => theme.Info = color);
        Assert.Equal("#ffffff", theme.Surface);
    }

    [Fact]
    public void Theme_Presets_AreNewInstancesEachTime() {
        var dark = CanopyStaticTheme.Dark();
        dark.Surface = "#111111";
        Assert.Equal("#16181c", CanopyStaticTheme.Dark().Surface);
        Assert.Equal("#ffffff", CanopyStaticTheme.Light().Surface);
        Assert.Throws<ArgumentNullException>(() => new CanopyStaticHtmlOptions { Theme = null! });
    }

    [Fact]
    public void Theme_PresetsAndMixes_AreTheOnesOfTheRuntimeStylesheet() {
        // An outline and a grid with the same base colours look alike only while both sides hold the same numbers.
        var css = CanopyX.Html.CanopyHtmlAssets.Style;
        // Formatting does not change the palette shared by the interactive grid and static outline.
        var compactCss = Regex.Replace(css, @"([:;,])\s+", "$1");
        string[] Values(string property) => Regex.Matches(css, Regex.Escape(property) + ":\\s*(#[0-9a-f]{6});").Select(match => match.Groups[1].Value).ToArray();
        foreach (var (property, light, dark) in new[] {
            ("--cx-surface", CanopyStaticTheme.Light().Surface, CanopyStaticTheme.Dark().Surface),
            ("--cx-text", CanopyStaticTheme.Light().Text, CanopyStaticTheme.Dark().Text),
            ("--cx-accent", CanopyStaticTheme.Light().Accent, CanopyStaticTheme.Dark().Accent),
            ("--cx-line", CanopyStaticTheme.Light().Line, CanopyStaticTheme.Dark().Line),
            ("--cx-tone-info", CanopyStaticTheme.Light().Info, CanopyStaticTheme.Dark().Info),
            ("--cx-tone-success", CanopyStaticTheme.Light().Success, CanopyStaticTheme.Dark().Success),
            ("--cx-tone-warning", CanopyStaticTheme.Light().Warning, CanopyStaticTheme.Dark().Warning),
            ("--cx-tone-danger", CanopyStaticTheme.Light().Danger, CanopyStaticTheme.Dark().Danger) }) {
            // The stylesheet states each colour for light, for dark, for dark by system preference, and for print.
            Assert.Equal(new[] { light, dark, dark, light }, Values(property));
        }

        var view = View();
        view.Roots[0].Badges.Add(new CanopyBadge("3"));
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { UseThemeVariables = true, MaxRows = 1 });
        foreach (var (property, percent) in new[] { ("--cx-muted", "66"), ("--cx-head-bg", "3.5"), ("--cx-group-bg", "2.5"), ("--cx-line-strong", "22") }) {
            Assert.Contains(property + ":color-mix(in srgb,var(--cx-text) " + percent + "%,var(--cx-surface));", compactCss);
            Assert.Contains("color-mix(in srgb,var(--cx-text,#16181c) " + percent + "%,var(--cx-surface,#ffffff))", html);
        }

        Assert.Contains("color-mix(in srgb,var(--cx-tone-danger) 12%,var(--cx-surface))", compactCss);
        Assert.Contains("color-mix(in srgb,var(--cx-tone-danger,#b8292a) 12%,var(--cx-surface,#ffffff))", html);
    }

    [Fact]
    public void Render_MutedTone_IsTheMixedMutedColourOnTheQuietBackground() {
        var view = View();
        view.Roots[0].Cells["state"] = new CanopyCell("none") { Tone = CanopyTone.Muted, Badges = { new CanopyBadge("n/a", CanopyTone.Muted), new CanopyBadge("3") } };
        var html = CanopyStaticHtml.Render(view);

        Assert.Contains("vertical-align:top;color:#656769;\">none", html);
        Assert.Contains("background:#f9f9f9;color:#656769;\">n/a</span>", html);
        Assert.Contains("background:#f9f9f9;color:#16181c;\">3</span>", html);
    }

    [Fact]
    public void Render_ThemeVariables_FollowEveryLiteralWithTheRuntimeProperty() {
        var high = CanopyTone.Named("severity-high");
        var options = new CanopyStaticHtmlOptions { UseThemeVariables = true };
        options.ToneColors[high] = "#9a3412";
        var view = View();
        view.Roots[0].Cells["state"] = new CanopyCell("late") { Tone = high, Badges = { new CanopyBadge("High", high), new CanopyBadge("Planned", CanopyTone.Named("maintenance")) } };
        view.Roots[1].Cells["state"] = new CanopyCell("soon") { Tone = CanopyTone.Named("maintenance") };
        var html = CanopyStaticHtml.Render(view, options);

        // The literal comes first: a client that does not know var() drops the second declaration and keeps it.
        Assert.Contains("color:#16181c;color:var(--cx-text,#16181c);background:#ffffff;background:var(--cx-surface,#ffffff);", html);
        Assert.Contains("border-bottom:1px solid #e2e4e7;border-bottom-color:var(--cx-line,#e2e4e7);", html);
        Assert.Contains("color:#b8292a;color:var(--cx-tone-danger,#b8292a);", html);
        // A host tone reads the property the runtime reads; without a colour in the options it is the page's or none.
        Assert.Contains("color:#9a3412;color:var(--cx-tone-severity-high,#9a3412);", html);
        Assert.Contains("vertical-align:top;color:var(--cx-tone-maintenance,inherit);\">soon", html);
        Assert.Contains("background:var(--cx-tone-severity-high-bg,color-mix(in srgb,var(--cx-tone-severity-high,#9a3412) 12%,var(--cx-surface,#ffffff)));", html);
        Assert.Contains("color:#16181c;color:var(--cx-tone-maintenance,var(--cx-text,#16181c));\">Planned</span>", html);
        // Still nothing but inline styles, and every declaration that uses a property has a literal before it.
        Assert.DoesNotContain("<style", html);
        Assert.DoesNotContain(" class=", html);
        foreach (Match style in Regex.Matches(html, "style=\"([^\"]*)\"")) {
            var seen = new HashSet<string>();
            foreach (var declaration in style.Groups[1].Value.Split(';', StringSplitOptions.RemoveEmptyEntries)) {
                var property = declaration.Substring(0, declaration.IndexOf(':'));
                var value = declaration.Substring(property.Length + 1);
                if (value.Contains("var(") && !value.Contains("inherit")) {
                    Assert.True(seen.Contains(property) || seen.Contains(property.Replace("-color", string.Empty)), "No literal before " + declaration);
                }

                seen.Add(property);
            }
        }
    }

    private static CanopyView View() {
        var view = new CanopyView("themed", "Themed");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("state", "State"));
        var first = new CanopyNode("a", "First") { Expanded = true };
        first.Badges.Add(new CanopyBadge("failed", CanopyTone.Danger));
        first.Children.Add(new CanopyNode("a/1", "Child") { Cells = { ["state"] = new CanopyCell("bad") { Tone = CanopyTone.Danger } } });
        first.Children.Add(new CanopyNode("a/2", "Other"));
        view.Roots.Add(first);
        view.Roots.Add(new CanopyNode("b", "Second"));
        return view;
    }
}
