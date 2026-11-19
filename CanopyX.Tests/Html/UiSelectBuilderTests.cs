using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Markup, escaping and validation of the select builder.</summary>
public sealed class UiSelectBuilderTests {
    [Fact]
    public void Select_WritesALabelledNativeSelectWithOptionData() {
        var select = new CanopySelect("country", "country", "Country <of origin>", new CanopySelectOptions { Placeholder = "Choose…", Source = "/api/countries", MinLength = 2, Required = true });
        select.Items.Add(new CanopySelectOption("pl", "Poland") { Flag = "PL", Description = "Warsaw", Group = "Europe", Selected = true });
        select.Items.Add(new CanopySelectOption("de", "Germany") { Badge = "EU", BadgeTone = CanopyTone.Info, Group = "Europe" });
        select.Items.Add(new CanopySelectOption("us", "United \"States\"") { Icon = "flag", Disabled = true });
        Assert.Equal("<label for=\"country\">Country &lt;of origin&gt;</label><div id=\"country-select\" class=\"cx-select\" data-cx-select data-source=\"/api/countries\" data-min-length=\"2\" data-placeholder=\"Choose…\">" +
            "<select id=\"country\" name=\"country\" required><option value=\"\">Choose…</option><optgroup label=\"Europe\">" +
            "<option value=\"pl\" data-description=\"Warsaw\" data-flag=\"pl\" selected>Poland</option><option value=\"de\" data-badge=\"EU\" data-tone=\"info\">Germany</option></optgroup>" +
            "<option value=\"us\" data-icon=\"flag\" disabled>United &quot;States&quot;</option></select></div>", select.ToHtmlFragment());
        var tags = new CanopySelect("labels", "labels", "Labels", new CanopySelectOptions { Multiple = true, Tags = true, Search = false, Max = 3 }).ToHtmlFragment();
        Assert.Contains("data-search=\"false\" data-tags=\"true\" data-max=\"3\"><select id=\"labels\" name=\"labels\" multiple></select>", tags);
    }

    [Fact]
    public void Select_RefusesWhatTheRuntimeCouldNotHonor() {
        static void Refused<T>(Action<CanopySelect> configure, CanopySelectOptions? options = null) where T : Exception {
            var select = new CanopySelect("s", "s", "S", options); configure(select);
            Assert.Throws<T>(() => select.ToHtmlFragment());
        }
        Refused<ArgumentException>(select => { select.Items.Add(new CanopySelectOption("a", "A") { Selected = true }); select.Items.Add(new CanopySelectOption("b", "B") { Selected = true }); });
        Refused<ArgumentException>(select => select.Items.Add(new CanopySelectOption("a", "A") { Flag = "POL" }));
        Refused<ArgumentException>(select => select.Items.Add(new CanopySelectOption("a", "A") { Flag = "日本" }));
        Refused<ArgumentException>(select => { select.Items.Add(new CanopySelectOption("a", "A") { Selected = true }); select.Items.Add(new CanopySelectOption("b", "B") { Selected = true }); }, new CanopySelectOptions { Multiple = true, Max = 1 });
        Refused<ArgumentException>(select => select.Items.Add(new CanopySelectOption("a", "A") { Avatar = "java\tscript:alert(1)" }));
        Refused<ArgumentException>(select => { }, new CanopySelectOptions { Source = "javascript:alert(1)" });
        Refused<ArgumentOutOfRangeException>(select => { }, new CanopySelectOptions { Max = 0 });
        Assert.Throws<ArgumentException>(() => new CanopySelectOption("a", " "));
    }
}
