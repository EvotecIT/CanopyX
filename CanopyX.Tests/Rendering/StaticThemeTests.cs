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
    [InlineData(false)]
    [InlineData(true)]
    public void Render_HeadersKeepLiteralCaptionStylesAndOptionalHostRoles(bool variables) {
        var options = new CanopyStaticHtmlOptions { UseThemeVariables = variables };
        options.Theme.Surface = "#000";
        options.Theme.Text = "#fff";
        var html = CanopyStaticHtml.Render(View(), options);
        var headers = Regex.Matches(html, "<th\\b[^>]*style=\"([^\"]*)\"").Cast<Match>().ToArray();

        Assert.NotEmpty(headers);
        Assert.All(headers, header => {
            var style = header.Groups[1].Value;
            Assert.Contains("font-size:12px;font-weight:600;line-height:1.35;vertical-align:middle;", style);
            Assert.Contains("color:#fff;", style);
            Assert.Contains("background:#090909;", style);
            if (variables) {
                Assert.Contains("font-size:var(--hfx-table-header-size,var(--hfx-type-caption-size,12px));", style);
                Assert.Contains("font-weight:var(--hfx-table-header-weight,var(--hfx-weight-semibold,600));", style);
                Assert.Contains("line-height:var(--hfx-table-header-line-height,var(--hfx-type-caption-line-height,1.35));", style);
                Assert.Contains("color:#fff;color:var(--hfx-table-header-color,var(--hfx-color-text-secondary,var(--hfx-color-text,#fff)));", style);
                Assert.Contains("background:#090909;background:var(--hfx-table-header-background,var(--hfx-color-surface-sunken,", style);
            } else {
                Assert.DoesNotContain("var(", style);
            }
        });
        Assert.DoesNotContain("<script", html);
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
        view.Roots[0].Badges.Add(new CanopyBadge("Not evaluated", CanopyTone.Muted));
        view.Roots[0].Cells["state"] = new CanopyCell("late") { Tone = high, Badges = { new CanopyBadge("High", high), new CanopyBadge("Planned", CanopyTone.Named("maintenance")) } };
        view.Roots[1].Cells["state"] = new CanopyCell("soon") { Tone = CanopyTone.Named("maintenance") };
        var html = CanopyStaticHtml.Render(view, options);

        // The literal comes first: a client that does not know var() drops the second declaration and keeps it.
        Assert.Contains("color:#16181c;color:var(--hfx-color-text,light-dark(#16181c,#f2f3f5));background:#ffffff;background:var(--hfx-color-surface,light-dark(#ffffff,#16181c));", html);
        Assert.Contains("border-bottom:1px solid #e2e4e7;border-bottom-color:var(--hfx-color-border,light-dark(#e2e4e7,#272a30));", html);
        Assert.Contains("color:#b8292a;color:var(--hfx-color-status-bad-fg,light-dark(#b8292a,#f47171));", html);
        Assert.Contains("var(--hfx-color-text-muted,", html);
        Assert.Contains("var(--hfx-color-surface-sunken,", html);
        Assert.Contains("var(--hfx-color-status-bad-bg,", html);
        Assert.Contains("border-radius:4px;border-radius:var(--hfx-radius-badge,4px);", html);
        Assert.Contains("font-family:var(--hfx-font-sans,", html);
        // A host tone reads the property the runtime reads; without a colour in the options it is the page's or none.
        Assert.Contains("color:#9a3412;color:var(--hfx-color-status-severity-high-fg,#9a3412);", html);
        Assert.Contains("vertical-align:top;color:var(--hfx-color-status-maintenance-fg,inherit);\">soon", html);
        Assert.Contains("background:var(--hfx-color-status-severity-high-bg,color-mix(in srgb,var(--hfx-color-status-severity-high-fg,#9a3412) 12%,var(--hfx-color-surface,light-dark(#ffffff,#16181c))));", html);
        Assert.Contains("color:#16181c;color:var(--hfx-color-status-maintenance-fg,var(--hfx-color-text,light-dark(#16181c,#f2f3f5)));\">Planned</span>", html);
        // Still nothing but inline styles, and every declaration that uses a property has a literal before it.
        Assert.DoesNotContain("<style", html);
        Assert.DoesNotContain(" class=", html);
        foreach (Match style in Regex.Matches(html, "style=\"([^\"]*)\"")) {
            var seen = new HashSet<string>();
            foreach (var declaration in style.Groups[1].Value.Split(';', StringSplitOptions.RemoveEmptyEntries)) {
                var property = declaration.Substring(0, declaration.IndexOf(':'));
                var value = declaration.Substring(property.Length + 1);
                // Host roles are inputs. An outline must never shadow an ancestor's design tokens.
                Assert.False(property.StartsWith("--hfx-", StringComparison.Ordinal), "Emitted host role " + property);
                if (value.Contains("var(") && !value.Contains("inherit")) {
                    Assert.True(seen.Contains(property) || seen.Contains(property.Replace("-color", string.Empty)), "No literal before " + declaration);
                }

                seen.Add(property);
            }
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Render_ThemeVariables_PresetFallbacksSupportBothStandaloneSchemes(bool darkLiteral) {
        var light = CanopyStaticTheme.Light();
        var dark = CanopyStaticTheme.Dark();
        var view = View();
        foreach (var tone in new[] { CanopyTone.Info, CanopyTone.Success, CanopyTone.Warning, CanopyTone.Muted }) {
            view.Roots[0].Badges.Add(new CanopyBadge(tone.Name!, tone));
        }
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions {
            Theme = darkLiteral ? dark : light, UseThemeVariables = true, MaxRows = 2, FullReportUrl = "full.html"
        });

        // Each public base role has its own pair: status colours cannot inherit ordinary text's fallback.
        foreach (var (role, lightColor, darkColor) in new[] {
            ("surface", light.Surface, dark.Surface), ("text", light.Text, dark.Text),
            ("border", light.Line, dark.Line), ("accent", light.Accent, dark.Accent),
            ("status-info-fg", light.Info, dark.Info), ("status-good-fg", light.Success, dark.Success),
            ("status-warn-fg", light.Warning, dark.Warning), ("status-bad-fg", light.Danger, dark.Danger)
        }) {
            Assert.Contains("var(--hfx-color-" + role + ",light-dark(" + lightColor + "," + darkColor + "))", html);
        }

        // Derived roles still mix the host's resolved bases. Without host roles those bases follow color-scheme.
        const string text = "var(--hfx-color-text,light-dark(#16181c,#f2f3f5))";
        const string surface = "var(--hfx-color-surface,light-dark(#ffffff,#16181c))";
        Assert.Contains("var(--hfx-color-text-muted,color-mix(in srgb," + text + " 66%," + surface + "))", html);
        Assert.Contains("var(--hfx-color-row-alt,color-mix(in srgb," + text + " 2.5%," + surface + "))", html);
        Assert.Contains("var(--hfx-color-border-strong,color-mix(in srgb," + text + " 22%," + surface + "))", html);
        Assert.Contains("var(--hfx-color-surface-sunken,light-dark(color-mix(in srgb," + text + " 3.5%," + surface
            + "),color-mix(in srgb," + text + " 4.5%," + surface + ")))", html);
        Assert.Contains("var(--hfx-color-status-bad-bg,color-mix(in srgb,var(--hfx-color-status-bad-fg,light-dark(#b8292a,#f47171)) 12%," + surface + "))", html);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Render_ThemeVariables_CustomPaletteKeepsAllFallbackColoursFixed(bool darkLiteral) {
        var theme = darkLiteral ? CanopyStaticTheme.Dark() : CanopyStaticTheme.Light();
        // Changing only one role still makes this a custom palette: its unchanged colours must remain coherent.
        theme.Accent = "#123456";
        var options = new CanopyStaticHtmlOptions { Theme = theme, UseThemeVariables = true, MaxRows = 2, FullReportUrl = "full.html" };
        var high = CanopyTone.Named("severity-high");
        options.ToneColors[high] = "#a20";
        var view = View();
        view.Roots[0].Badges.Add(new CanopyBadge("High", high));
        var html = CanopyStaticHtml.Render(view, options);

        Assert.DoesNotContain("light-dark(", html);
        Assert.Contains("color:" + theme.Text + ";color:var(--hfx-color-text," + theme.Text + ");", html);
        Assert.Contains("background:" + theme.Surface + ";background:var(--hfx-color-surface," + theme.Surface + ");", html);
        Assert.Contains("var(--hfx-color-border," + theme.Line + ")", html);
        Assert.Contains("color:#123456;color:var(--hfx-color-accent,#123456);", html);
        Assert.Contains("color:#a20;color:var(--hfx-color-status-severity-high-fg,#a20);", html);
        Assert.Contains("var(--hfx-color-status-bad-fg," + theme.Danger + ")", html);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Render_ThemeVariables_LegacyClientsKeepTheCompleteLiteralOnlyOutput(bool darkLiteral, bool custom) {
        var options = new CanopyStaticHtmlOptions {
            Theme = darkLiteral ? CanopyStaticTheme.Dark() : CanopyStaticTheme.Light(),
            UseThemeVariables = true, MaxRows = 2, FullReportUrl = "full.html"
        };
        if (custom) {
            options.Theme.Surface = "#000";
            options.Theme.Text = "#fff";
            options.Theme.Danger = "#f00";
        }
        var high = CanopyTone.Named("severity-high");
        options.ToneColors[high] = "#a20";
        var view = View();
        view.Roots[0].Badges.Add(new CanopyBadge("High", high));
        view.Roots[0].Badges.Add(new CanopyBadge("Unknown", CanopyTone.Named("maintenance")));
        var html = CanopyStaticHtml.Render(view, options);
        // Simulate email/Word discarding declarations that contain unsupported CSS functions.
        var legacyHtml = Regex.Replace(html, "style=\"([^\"]*)\"", match => "style=\"" + string.Concat(
            match.Groups[1].Value.Split(';', StringSplitOptions.RemoveEmptyEntries)
                .Where(declaration => !declaration.Contains("var("))
                .Select(declaration => declaration + ";")) + "\"");
        options.UseThemeVariables = false;

        Assert.Equal(CanopyStaticHtml.Render(view, options), legacyHtml);
    }

    private static CanopyTreeView View() {
        var view = new CanopyTreeView("themed", "Themed");
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
