using System.Xml.Linq;
using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Markup metadata consumed by the navigation and menu runtime.</summary>
public sealed class UiRuntimeContractTests {
    // Shared browser fixtures are checked against actual typed-builder output below.
    private const string StepperContractMarkup = """
        <div id="wizard" class="cx-stepper-host" data-cx-stepper="" data-hfx-part="stepper" data-linear="true" data-mode="interactive">
        <ol class="cx-stepper cx-stepper--vertical" aria-label="Setup">
        <li class="cx-step" data-hfx-part="step" id="wizard-step-first" data-step-id="first" data-state="current" data-optional="false" data-visited="false" aria-current="step"><span class="cx-step-marker" data-hfx-part="step-marker" aria-hidden="true">1</span><span class="cx-step-label">First</span><span class="cx-visually-hidden">, Step 1, Current</span></li>
        <li class="cx-step" data-hfx-part="step" id="wizard-step-optional" data-step-id="optional" data-state="upcoming" data-optional="true" data-visited="false"><span class="cx-step-marker" data-hfx-part="step-marker" aria-hidden="true">2</span><span class="cx-step-label">Optional</span><span class="cx-visually-hidden">, Step 2, Upcoming</span></li>
        <li class="cx-step" data-hfx-part="step" id="wizard-step-last" data-step-id="last" data-state="upcoming" data-optional="false" data-visited="false"><span class="cx-step-marker" data-hfx-part="step-marker" aria-hidden="true">3</span><span class="cx-step-label">Last</span><span class="cx-visually-hidden">, Step 3, Upcoming</span></li>
        </ol>
        <section class="cx-step-panel" data-hfx-part="step-panel" id="wizard-panel-first" aria-labelledby="wizard-heading-first" data-state="current"><h3 data-hfx-part="title" id="wizard-heading-first" tabindex="-1">First</h3><label>Note<input id="note" value="initial" /></label></section>
        <section class="cx-step-panel" data-hfx-part="step-panel" id="wizard-panel-optional" aria-labelledby="wizard-heading-optional" data-state="upcoming"><h3 data-hfx-part="title" id="wizard-heading-optional" tabindex="-1">Optional</h3><p>Optional content</p></section>
        <section class="cx-step-panel" data-hfx-part="step-panel" id="wizard-panel-last" aria-labelledby="wizard-heading-last" data-state="upcoming"><h3 data-hfx-part="title" id="wizard-heading-last" tabindex="-1">Last</h3><p>Last content</p></section>
        {{footer}}
        <div class="cx-visually-hidden" aria-live="polite" aria-atomic="true">Step 1 of 3: First</div></div>
        """;

    private const string StepperLabelsFooter = """
        <div class="cx-stepper-footer" data-hfx-part="footer" data-back-label="Back &quot;&lt;&amp;" data-next-label="Next &quot;&lt;&amp;" data-finish-label="Finish &quot;&lt;&amp;" data-skip-enabled="true" data-skip-label="Skip &quot;&lt;&amp;" data-save-draft-enabled="true" data-save-draft-label="Draft &quot;&lt;&amp;"><span class="cx-step-position">Step 1 of 3</span><button type="button" data-cx-stepper-action="save-draft">Draft &quot;&lt;&amp;</button><button type="button" data-cx-stepper-action="next">Next &quot;&lt;&amp;</button></div>
        """;

    private const string StepperOmittedFooter = """
        <div class="cx-stepper-footer" data-hfx-part="footer" data-back-label="Back &quot;&lt;&amp;" data-next-label="Next &quot;&lt;&amp;" data-finish-label="Finish &quot;&lt;&amp;" data-skip-enabled="false" data-save-draft-enabled="false"><span class="cx-step-position">Step 1 of 3</span><button type="button" data-cx-stepper-action="next">Next &quot;&lt;&amp;</button></div>
        """;

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Stepper_BrowserFixturesMatchTypedFooterLabelsAndOmissionIntent(bool optionalActions) {
        var stepper = new CanopyStepper("wizard", "Setup", new CanopyStepperOptions {
            Layout = CanopyStepperLayout.Vertical, ShowFooter = true,
            BackLabel = "Back \"<&", NextLabel = "Next \"<&", FinishLabel = "Finish \"<&",
            SkipLabel = optionalActions ? "Skip \"<&" : null,
            SaveDraftLabel = optionalActions ? "Draft \"<&" : null
        });
        stepper.Steps.Add(new CanopyStep("first", "First") { ContentHtml = "<label>Note<input id=\"note\" value=\"initial\" /></label>" });
        stepper.Steps.Add(new CanopyStep("optional", "Optional") { Optional = true, ContentHtml = "<p>Optional content</p>" });
        stepper.Steps.Add(new CanopyStep("last", "Last") { ContentHtml = "<p>Last content</p>" });

        var expected = XElement.Parse(StepperContractMarkup.Replace("{{footer}}", optionalActions ? StepperLabelsFooter : StepperOmittedFooter));
        var actual = XElement.Parse(stepper.ToHtmlFragment().Replace(" data-cx-stepper ", " data-cx-stepper=\"\" "));
        Assert.True(XNode.DeepEquals(expected, actual), actual.ToString());
        var footer = actual.Elements("div").Single(element => (string?)element.Attribute("data-hfx-part") == "footer");
        Assert.Equal("Finish \"<&", (string?)footer.Attribute("data-finish-label"));
        Assert.DoesNotContain(footer.Elements("button"), button => (string?)button.Attribute("data-cx-stepper-action") is "finish" or "back" or "skip");
    }

    [Fact]
    public void Stepper_LastStepRetainsNextLabelWhenOnlyFinishIsInitiallyVisible() {
        var stepper = new CanopyStepper("review", "Review", new CanopyStepperOptions {
            ShowFooter = true, SelectedIndex = 1, NextLabel = "Continue <review>", FinishLabel = "Publish"
        });
        stepper.Steps.Add(new CanopyStep("first", "First"));
        stepper.Steps.Add(new CanopyStep("last", "Last"));

        var root = XElement.Parse(stepper.ToHtmlFragment().Replace(" data-cx-stepper ", " data-cx-stepper=\"\" "));
        var footer = root.Elements("div").Single(element => (string?)element.Attribute("data-hfx-part") == "footer");
        Assert.Equal("Continue <review>", (string?)footer.Attribute("data-next-label"));
        Assert.DoesNotContain(footer.Elements("button"), button => (string?)button.Attribute("data-cx-stepper-action") == "next");
        Assert.Equal("Publish", footer.Elements("button").Single(button => (string?)button.Attribute("data-cx-stepper-action") == "finish").Value);
    }

    [Theory]
    [InlineData(CanopyTabActivation.Auto, "auto")]
    [InlineData(CanopyTabActivation.Automatic, "automatic")]
    [InlineData(CanopyTabActivation.Manual, "manual")]
    public void Tabs_ActivationMetadataPreservesRuntimeChoiceAndExplicitOverrides(CanopyTabActivation activation, string expected) {
        var tabs = new CanopyTabs("sections", "Sections");
        Assert.Equal(CanopyTabActivation.Auto, tabs.Options.Activation);
        tabs.Options.Activation = activation;
        tabs.Tabs.Add(new CanopyTab("summary", "Summary") { ContentHtml = "<p>Summary content</p>" });
        tabs.Tabs.Add(new CanopyTab("details", "Details") { ContentHtml = "<p>Details content</p>" });

        // The runtime treats any value other than an explicit automatic/manual
        // override as its guard/deferred-aware activation policy.
        var root = XElement.Parse(tabs.ToHtmlFragment().Replace(" data-cx-tabs ", " data-cx-tabs=\"\" "));
        Assert.Equal(expected, (string?)root.Attribute("data-activation"));
        Assert.Equal(2, root.Elements("section").Count());
        Assert.Empty(root.DescendantsAndSelf().Attributes("hidden"));
    }

    [Fact]
    public void Menu_BadgesAndIndependentRadioGroupsUseRuntimeMetadataWithEncodedText() {
        var menu = new CanopyMenu("choices");
        menu.Items.Add(new CanopyMenuItem("day", "Day", CanopyMenuItemKind.Radio) {
            RadioGroup = "range\"<&", Badge = "12 <items>", Checked = true
        });
        menu.Items.Add(new CanopyMenuItem("week", "Week", CanopyMenuItemKind.Radio) {
            RadioGroup = "range\"<&", Checked = false
        });
        menu.Items.Add(new CanopyMenuItem("compact", "Compact", CanopyMenuItemKind.Radio) {
            RadioGroup = "density", Checked = true
        });

        var root = ParseMenu(menu);
        var items = root.Descendants("button").ToArray();
        Assert.Equal(3, items.Length);
        Assert.All(items, item => Assert.Equal("menuitemradio", (string?)item.Attribute("role")));
        Assert.Equal(new[] { "range\"<&", "range\"<&", "density" }, items.Select(item => (string?)item.Attribute("data-radio-group")));
        Assert.Equal(new[] { "true", "false", "true" }, items.Select(item => (string?)item.Attribute("aria-checked")));
        var badge = Assert.Single(items[0].Elements("span"), element => (string?)element.Attribute("data-hfx-part") == "badge");
        Assert.Equal("cx-menu-badge", (string?)badge.Attribute("class"));
        Assert.Equal("12 <items>", badge.Value);
        Assert.Empty(badge.Elements());
        Assert.DoesNotContain(items[1].Elements("span"), element => (string?)element.Attribute("data-hfx-part") == "badge");
    }

    [Fact]
    public void Menu_RejectsRadioGroupingOnActionsAndBadgesOnDecorations() {
        var menu = new CanopyMenu("actions");
        menu.Items.Add(new CanopyMenuItem("action", "Action") { RadioGroup = "choices" });
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
        menu.Items.Clear();
        menu.Items.Add(new CanopyMenuItem("label", "Section", CanopyMenuItemKind.GroupLabel) { Badge = "2" });
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
    }

    private static XElement ParseMenu(CanopyMenu menu) => XElement.Parse(menu.ToHtmlFragment()
        .Replace(" data-cx-menu ", " data-cx-menu=\"\" ").Replace(" hidden ", " hidden=\"\" "));
}
