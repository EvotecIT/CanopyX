using System.Net;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Host-facing markup, escaping, accessibility references and validation for the declarative UI builders.</summary>
public sealed class UiBuilderTests {
    [Fact]
    public void Tabs_LinkTabsToReadablePanelsAndExposeSelectionWithoutPrematureHiding() {
        var tabs = new CanopyTabs("sections", "Report sections", new CanopyTabsOptions { SelectedIndex = 1 });
        tabs.Tabs.Add(new CanopyTab("summary", "Summary") { ContentHtml = "<p>All results</p>" });
        tabs.Tabs.Add(new CanopyTab("detail", "Details") { Badge = "3", ContentHtml = "<button>Inspect</button>", HasFocusableContent = true });
        tabs.Tabs.Add(new CanopyTab("later", "Later") { Disabled = true });

        var html = tabs.ToHtmlFragment();
        var root = Parse(html).Element("div")!;
        Assert.NotNull(root.Attribute("data-cx-tabs"));
        Assert.Equal("tabs", Attr(root, "data-hfx-part"));
        var list = Role(root, "tablist").Single();
        Assert.Equal("Report sections", Attr(list, "aria-label"));
        Assert.Equal("horizontal", Attr(list, "aria-orientation"));
        var buttons = Role(root, "tab").ToArray();
        var panels = Role(root, "tabpanel").ToArray();
        Assert.Equal(3, buttons.Length);
        Assert.Equal(3, panels.Length);
        for (var i = 0; i < buttons.Length; i++) {
            Assert.Equal(Attr(panels[i], "id"), Attr(buttons[i], "aria-controls"));
            Assert.Equal(Attr(buttons[i], "id"), Attr(panels[i], "aria-labelledby"));
            Assert.Equal(i == 1 ? "true" : "false", Attr(buttons[i], "aria-selected"));
            Assert.Equal(i == 1 ? "0" : "-1", Attr(buttons[i], "tabindex"));
            Assert.NotNull(panels[i].Element("h3"));
        }
        Assert.Equal("selected", Attr(buttons[1], "data-state"));
        Assert.Equal("disabled", Attr(buttons[2], "data-state"));
        Assert.Equal("true", Attr(buttons[2], "aria-disabled"));
        Assert.Null(buttons[2].Attribute("disabled"));
        Assert.Equal("0", Attr(panels[0], "tabindex"));
        Assert.Null(panels[1].Attribute("tabindex"));
        Assert.Equal("All results", panels[0].Element("p")!.Value);
        Assert.Equal("Inspect", panels[1].Element("button")!.Value);
        Assert.Empty(root.DescendantsAndSelf().Attributes("hidden"));
        Assert.Null(root.Attribute("data-cx-ready"));
        AssertReferences(Parse(html));
        AssertDeclarative(html);
    }

    [Fact]
    public void Tabs_EncodeTextAndAttributeValuesButPreserveExplicitlyTrustedContent() {
        const string hostile = "\"<&'";
        var tabs = new CanopyTabs("set" + hostile, "Sections " + hostile, new CanopyTabsOptions { Variant = "product." + hostile });
        tabs.Tabs.Add(new CanopyTab("one" + hostile, "Label " + hostile) { Badge = hostile, Icon = hostile, ContentHtml = "<strong>Trusted body</strong>" });
        var html = tabs.ToHtmlFragment();
        var root = Parse(html);
        var tab = Role(root, "tab").Single();
        Assert.Equal("set" + hostile + "-tab-one" + hostile, Attr(tab, "id"));
        Assert.Equal(hostile, Attr(tab.Descendants("span").First(e => e.Attribute("data-icon") != null), "data-icon"));
        Assert.Equal("Label " + hostile, tab.Elements("span").Single(e => Attr(e, "class") == "cx-tab-label").Value);
        Assert.Equal("product." + hostile, Attr(root.Element("div")!, "data-hfx-variant"));
        Assert.Contains(WebUtility.HtmlEncode("Label " + hostile), html);
        Assert.Single(root.Descendants("strong"));
        AssertReferences(root);
        AssertDeclarative(html);
    }

    [Fact]
    public void Tabs_ProjectTypedOptionsAndSegmentedOverflowAsPills() {
        var tabs = new CanopyTabs("styles", "Styles", new CanopyTabsOptions {
            Style = CanopyTabsStyle.Segmented, Activation = CanopyTabActivation.Manual, PrintAll = false
        });
        for (var i = 0; i < 5; i++) tabs.Tabs.Add(new CanopyTab("t" + i, "Tab " + i));
        var segmented = Parse(tabs.ToHtmlFragment()).Element("div")!;
        Assert.Equal("cx-tabs cx-tabs--segmented", Attr(segmented, "class"));
        Assert.Equal("none", Attr(segmented, "data-collapse"));
        tabs.Tabs.Add(new CanopyTab("six", "Six"));
        var pills = Parse(tabs.ToHtmlFragment()).Element("div")!;
        Assert.Equal("cx-tabs cx-tabs--pills", Attr(pills, "class"));
        Assert.Equal("picker", Attr(pills, "data-collapse"));
        Assert.Equal("manual", Attr(pills, "data-activation"));
        Assert.Equal("selected", Attr(pills, "data-print"));
        tabs.Options.Style = CanopyTabsStyle.Vertical;
        tabs.Options.Overflow = CanopyTabsOverflow.Menu;
        tabs.Options.CollapseToPicker = false;
        var vertical = Parse(tabs.ToHtmlFragment());
        Assert.Equal("vertical", Attr(Role(vertical, "tablist").Single(), "aria-orientation"));
        Assert.Equal("menu", Attr(vertical.Element("div")!, "data-overflow"));
        Assert.Equal("none", Attr(vertical.Element("div")!, "data-collapse"));
    }

    [Fact]
    public void Tabs_RejectEmptyOutOfRangeDisabledDuplicateAndContradictorySelections() {
        var tabs = new CanopyTabs("tabs", "Tabs");
        Assert.Throws<ArgumentOutOfRangeException>(() => tabs.ToHtmlFragment());
        tabs.Tabs.Add(new CanopyTab("a", "A"));
        tabs.Options.SelectedIndex = -1;
        Assert.Throws<ArgumentOutOfRangeException>(() => tabs.ToHtmlFragment());
        tabs.Options.SelectedIndex = 1;
        Assert.Throws<ArgumentOutOfRangeException>(() => tabs.ToHtmlFragment());
        tabs.Options.SelectedIndex = 0;
        tabs.Tabs[0].Disabled = true;
        Assert.Throws<ArgumentException>(() => tabs.ToHtmlFragment());
        tabs.Tabs[0].Disabled = false;
        tabs.Tabs.Add(new CanopyTab("a", "Duplicate"));
        Assert.Throws<ArgumentException>(() => tabs.ToHtmlFragment());
        tabs.Tabs.RemoveAt(1);
        tabs.Options.Overflow = CanopyTabsOverflow.Wrap;
        Assert.Throws<ArgumentException>(() => tabs.ToHtmlFragment());
        tabs.Options.Overflow = CanopyTabsOverflow.Scroll;
        tabs.Options.Style = CanopyTabsStyle.Segmented;
        Assert.Throws<ArgumentException>(() => tabs.ToHtmlFragment());
        tabs.Options.Style = (CanopyTabsStyle)99;
        Assert.Throws<ArgumentOutOfRangeException>(() => tabs.ToHtmlFragment());
    }

    [Fact]
    public void Stepper_EmitsOrderedStatesActionableStepsAndLinkedHeadings() {
        var stepper = StateStepper();
        var html = stepper.ToHtmlFragment();
        var root = Parse(html).Element("div")!;
        Assert.NotNull(root.Attribute("data-cx-stepper"));
        Assert.Equal("true", Attr(root, "data-linear"));
        var steps = root.Element("ol")!.Elements("li").ToArray();
        Assert.Equal(new[] { "done", "current", "error", "disabled", "skipped", "upcoming" }, steps.Select(e => Attr(e, "data-state")));
        Assert.Equal("step", Attr(steps[1], "aria-current"));
        Assert.Equal("true", Attr(steps[3], "aria-disabled"));
        Assert.NotNull(steps[0].Element("button"));
        Assert.NotNull(steps[2].Element("button"));
        Assert.NotNull(steps[4].Element("button"));
        Assert.Null(steps[1].Element("button"));
        Assert.Null(steps[3].Element("button"));
        Assert.Null(steps[5].Element("button"));
        Assert.Equal("step-marker", Attr(steps[0].Descendants("span").First(), "data-hfx-part"));
        Assert.Contains("Completed", steps[0].Value);
        var panels = root.Elements("section").ToArray();
        Assert.Equal(6, panels.Length);
        Assert.All(panels, p => {
            Assert.Equal(Attr(p.Element("h3")!, "id"), Attr(p, "aria-labelledby"));
            Assert.Equal("-1", Attr(p.Element("h3")!, "tabindex"));
            Assert.Single(p.Elements("p"));
        });
        Assert.Empty(root.DescendantsAndSelf().Attributes("hidden"));
        Assert.Equal("Step 2 of 6: Current", root.Descendants("div").Single(e => e.Attribute("aria-live") != null).Value);
        Assert.Empty(Role(root, "tablist"));
        AssertReferences(Parse(html));
        AssertDeclarative(html);
    }

    [Fact]
    public void Stepper_ReportRendersEveryStateWithHeadingsAndTrustedContentWithoutNavigation() {
        var stepper = StateStepper();
        stepper.Options.Mode = CanopyUiMode.Report;
        stepper.Options.ShowFooter = true;
        stepper.Steps[2].StateLabel = "1 issue <to fix>";
        stepper.Steps[2].Description = "Review & retry";
        var html = stepper.ToHtmlFragment();
        var root = Parse(html).Element("div")!;
        Assert.Equal("report", Attr(root, "data-mode"));
        Assert.Empty(root.Descendants("button"));
        Assert.Null(root.Element("ol"));
        var sections = root.Elements("section").ToArray();
        Assert.Equal(6, sections.Length);
        Assert.All(sections, s => {
            Assert.NotNull(s.Element("h3"));
            Assert.Single(s.Element("h3")!.Elements("span"));
            Assert.Contains(s.Elements("p"), e => e.Value.StartsWith("Content ", StringComparison.Ordinal));
        });
        Assert.Contains(sections[0].Elements("p"), e => e.Value == "Completed");
        Assert.Contains(sections[2].Elements("p"), e => e.Value == "1 issue <to fix>");
        Assert.Contains(sections[2].Elements("p"), e => e.Value == "Review & retry");
        Assert.Contains(sections[4].Elements("p"), e => e.Value == "Skipped");
        Assert.Empty(root.DescendantsAndSelf().Attributes("hidden"));
        AssertReferences(Parse(html));
        AssertDeclarative(html);
    }

    [Fact]
    public void Stepper_StaticRendersOnlyDisplayProgressAndNoDeadTabStops() {
        var stepper = StateStepper();
        stepper.Options.Mode = CanopyUiMode.Static;
        stepper.Options.Layout = CanopyStepperLayout.Vertical;
        stepper.Options.ShowFooter = true;
        var root = Parse(stepper.ToHtmlFragment()).Element("div")!;
        Assert.Equal("static", Attr(root, "data-mode"));
        Assert.Equal("cx-stepper cx-stepper--vertical", Attr(root.Element("ol")!, "class"));
        Assert.Equal(6, root.Element("ol")!.Elements("li").Count());
        Assert.Empty(root.Descendants("button"));
        Assert.Empty(root.Descendants("section"));
        Assert.Empty(root.DescendantsAndSelf().Attributes("tabindex"));
        Assert.DoesNotContain("Content ", root.Value);
    }

    [Fact]
    public void Stepper_FooterDescribesHostActionsAndRespectsFirstLastAndOptionalSteps() {
        var stepper = new CanopyStepper("wizard", "Setup", new CanopyStepperOptions {
            ShowFooter = true, SkipLabel = "Skip", SaveDraftLabel = "Save & wait", FinishLabel = "Finish <now>"
        });
        stepper.Steps.Add(new CanopyStep("first", "First"));
        stepper.Steps.Add(new CanopyStep("last", "Last") { Optional = true });
        var first = Parse(stepper.ToHtmlFragment());
        Assert.Equal(new[] { "save-draft", "next" }, Actions(first));
        stepper.Options.SelectedIndex = 1;
        var last = Parse(stepper.ToHtmlFragment());
        Assert.Equal(new[] { "save-draft", "skip", "back", "finish" }, Actions(last));
        Assert.Equal("Finish <now>", last.Descendants("button").Single(e => Attr(e, "data-cx-stepper-action") == "finish").Value);
        AssertDeclarative(stepper.ToHtmlFragment());
    }

    [Fact]
    public void Stepper_NonlinearAndVisitedStepsBecomeActionsButDisabledStepsStayText() {
        var stepper = StateStepper();
        stepper.Steps[5].Visited = true;
        Assert.NotNull(Parse(stepper.ToHtmlFragment()).Descendants("li").Last().Element("button"));
        stepper.Steps[5].Visited = false;
        stepper.Options.Linear = false;
        var root = Parse(stepper.ToHtmlFragment());
        Assert.NotNull(root.Descendants("li").Last().Element("button"));
        Assert.Null(root.Descendants("li").ElementAt(3).Element("button"));
    }

    [Fact]
    public void Stepper_EncodesLabelsDescriptionsAndIdentityReferencesButKeepsTrustedSections() {
        const string hostile = "\"<&'";
        var stepper = new CanopyStepper("wizard" + hostile, "Setup " + hostile, new CanopyStepperOptions { Variant = hostile });
        stepper.Steps.Add(new CanopyStep("one" + hostile, "Label " + hostile) {
            Description = "Description " + hostile, ContentHtml = "<strong>Trusted step</strong>"
        });
        var html = stepper.ToHtmlFragment();
        var document = Parse(html);
        Assert.Equal("wizard" + hostile, Attr(document.Element("div")!, "id"));
        Assert.Equal("Setup " + hostile, Attr(document.Descendants("ol").Single(), "aria-label"));
        Assert.Equal(hostile, Attr(document.Element("div")!, "data-hfx-variant"));
        Assert.Equal("Label " + hostile, document.Descendants("h3").Single().Value);
        Assert.Contains(document.Descendants("span"), s => s.Value == "Description " + hostile);
        Assert.Equal("Trusted step", document.Descendants("strong").Single().Value);
        Assert.Contains(WebUtility.HtmlEncode("Description " + hostile), html);
        AssertReferences(document);
        AssertDeclarative(html);
    }

    [Fact]
    public void Stepper_PreservesActiveErrorsAndReadOnlyCompletedStates() {
        var stepper = new CanopyStepper("state", "State");
        stepper.Steps.Add(new CanopyStep("one", "One") { State = CanopyStepState.Error });
        var interactive = Parse(stepper.ToHtmlFragment());
        var step = interactive.Descendants("li").Single();
        Assert.Equal("step", Attr(step, "aria-current"));
        Assert.Equal("error", Attr(step, "data-state"));
        Assert.Null(step.Element("button"));
        Assert.Equal("error", Attr(interactive.Descendants("section").Single(), "data-state"));
        stepper.Steps[0].State = CanopyStepState.Done;
        stepper.Options.Mode = CanopyUiMode.Report;
        var report = Parse(stepper.ToHtmlFragment());
        Assert.Equal("done", Attr(report.Descendants("section").Single(), "data-state"));
        Assert.Equal("Completed", report.Descendants("p").Single().Value);
        stepper.Options.Mode = CanopyUiMode.Static;
        Assert.Equal("done", Attr(Parse(stepper.ToHtmlFragment()).Descendants("li").Single(), "data-state"));
    }

    [Fact]
    public void Stepper_RejectsImpossibleCurrentStateAndDuplicateIdentity() {
        var stepper = StateStepper();
        stepper.Options.SelectedIndex = 6;
        Assert.Throws<ArgumentOutOfRangeException>(() => stepper.ToHtmlFragment());
        stepper.Steps[1].State = CanopyStepState.Upcoming;
        stepper.Options.SelectedIndex = 3;
        Assert.Throws<ArgumentException>(() => stepper.ToHtmlFragment());
        stepper.Options.SelectedIndex = 1;
        stepper.Steps[1].State = CanopyStepState.Current;
        stepper.Steps[0].State = CanopyStepState.Current;
        Assert.Throws<ArgumentException>(() => stepper.ToHtmlFragment());
        stepper.Steps[0].State = CanopyStepState.Done;
        stepper.Steps[4].Optional = false;
        Assert.Throws<ArgumentException>(() => stepper.ToHtmlFragment());
        stepper.Steps[4].Optional = true;
        stepper.Steps.Add(new CanopyStep("done", "Duplicate"));
        Assert.Throws<ArgumentException>(() => stepper.ToHtmlFragment());
    }

    [Fact]
    public void Dialog_RendersNativeModalWithEncodedTitleDescriptionAndMatchingTrigger() {
        var dialog = new CanopyDialog("inspect\"&", "Inspect <item>", new CanopyDialogOptions {
            Size = CanopyOverlaySize.Large, Variant = "product.\"&", TriggerId = "launch\"&"
        }) { Description = "Read & review", ContentHtml = "<strong>Trusted details</strong>", FooterHtml = "<button>Cancel</button>" };
        var html = dialog.ToTriggerHtmlFragment("Open <details>") + dialog.ToHtmlFragment();
        var document = Parse(html);
        var overlay = document.Element("dialog")!;
        Assert.Equal("dialog", Attr(overlay, "role"));
        Assert.Equal("dialog", Attr(overlay, "data-hfx-part"));
        Assert.Equal("true", Attr(overlay, "data-modal"));
        Assert.Equal("true", Attr(overlay, "aria-modal"));
        Assert.Equal("lg", Attr(overlay, "data-size"));
        Assert.Equal("true", Attr(overlay, "data-dismissible"));
        Assert.Equal("Inspect <item>", overlay.Descendants("h2").Single().Value);
        Assert.Contains(overlay.Descendants("p"), e => e.Value == "Read & review");
        Assert.Single(overlay.Descendants("strong"));
        Assert.NotNull(overlay.Element("footer"));
        Assert.Null(overlay.Attribute("open"));
        AssertTrigger(document.Element("button")!, dialog.Id, dialog.TriggerId, "dialog");
        AssertReferences(document);
        AssertDeclarative(html);
    }

    [Fact]
    public void AlertDialog_OmitsCloseAndDefaultsToExplicitAnswerDismissal() {
        var dialog = new CanopyDialog("confirm", "Delete item?", new CanopyDialogOptions { Alert = true }) {
            ContentHtml = "<p>This cannot be undone.</p>", FooterHtml = "<button>Cancel</button><button>Delete</button>"
        };
        var overlay = Parse(dialog.ToHtmlFragment()).Element("dialog")!;
        Assert.Equal("alertdialog", Attr(overlay, "role"));
        Assert.Equal("false", Attr(overlay, "data-dismissible"));
        Assert.Empty(overlay.Descendants().Attributes("data-cx-close"));
        Assert.Equal("confirm-body", Attr(overlay, "aria-describedby"));
        Assert.Equal(2, overlay.Descendants("button").Count());
    }

    [Fact]
    public void Drawer_RendersNativeDialogWithResponsiveModalityAndLogicalSide() {
        var drawer = new CanopyDrawer("record", "Record", new CanopyDrawerOptions { Side = CanopyDrawerSide.Start, Size = CanopyOverlaySize.Small });
        var html = drawer.ToTriggerHtmlFragment("Show record") + drawer.ToHtmlFragment();
        var document = Parse(html);
        var overlay = document.Element("dialog")!;
        Assert.NotNull(overlay.Attribute("data-cx-drawer"));
        Assert.Equal("drawer", Attr(overlay, "data-hfx-part"));
        Assert.Equal("false", Attr(overlay, "data-modal"));
        Assert.Equal("true", Attr(overlay, "data-phone-modal"));
        Assert.Equal("start", Attr(overlay, "data-side"));
        Assert.Equal("sm", Attr(overlay, "data-size"));
        AssertTrigger(document.Element("button")!, drawer.Id, drawer.TriggerId, "dialog");
        AssertReferences(document);
        drawer.Options.Modal = true;
        drawer.Options.Side = CanopyDrawerSide.Bottom;
        var modal = Parse(drawer.ToHtmlFragment()).Element("dialog")!;
        Assert.Equal("true", Attr(modal, "data-modal"));
        Assert.Equal("bottom", Attr(modal, "data-side"));
        AssertDeclarative(html);
    }

    [Fact]
    public void Popover_RendersAnchoredDialogWithTitleBodyAndTriggerReferences() {
        var popover = new CanopyPopover("filters", "Filter <items>") { ContentHtml = "<button>Apply</button>" };
        var html = popover.ToTriggerHtmlFragment("Filters") + popover.ToHtmlFragment();
        var document = Parse(html);
        var overlay = document.Element("div")!;
        Assert.Equal("dialog", Attr(overlay, "role"));
        Assert.Equal("popover", Attr(overlay, "data-hfx-part"));
        Assert.Equal("bottom-start", Attr(overlay, "data-placement"));
        Assert.Equal("manual", Attr(overlay, "popover"));
        Assert.NotNull(overlay.Attribute("hidden"));
        Assert.Equal("Filter <items>", overlay.Descendants("h2").Single().Value);
        AssertTrigger(document.Element("button")!, popover.Id, popover.TriggerId, "dialog");
        AssertReferences(document);
        AssertDeclarative(html);
    }

    [Fact]
    public void Tooltip_EncodesPlainTextAndSupplementsAnIndependentlyLabelledTrigger() {
        var tooltip = new CanopyTooltip("help", "Help <script> & details");
        var html = tooltip.ToTriggerHtmlFragment("Help & support") + tooltip.ToHtmlFragment();
        var document = Parse(html);
        var trigger = document.Element("button")!;
        var overlay = Role(document, "tooltip").Single();
        Assert.Equal("Help & support", trigger.Value);
        Assert.Equal("help", Attr(trigger, "aria-describedby"));
        Assert.Equal(tooltip.TriggerId, Attr(trigger, "id"));
        Assert.Equal(tooltip.TriggerId, Attr(overlay, "data-cx-trigger"));
        Assert.Equal("tooltip", Attr(overlay, "data-hfx-part"));
        Assert.Equal("top", Attr(overlay, "data-placement"));
        Assert.Equal("Help <script> & details", overlay.Value);
        Assert.Empty(overlay.Elements());
        AssertReferences(document);
        AssertDeclarative(html);
    }

    [Fact]
    public void Menu_EncodesRichItemMetadataAndLinksSubmenusChecksAndDecorations() {
        var menu = new CanopyMenu("actions\"&");
        menu.Items.Add(new CanopyMenuItem("group", "Actions <group>", CanopyMenuItemKind.GroupLabel));
        menu.Items.Add(new CanopyMenuItem("check", "Checked <item>") { Checked = true, Icon = "check\"<&", Shortcut = "Ctrl+<&" });
        menu.Items.Add(new CanopyMenuItem("radio", "Choice", CanopyMenuItemKind.Radio) { Checked = false });
        menu.Items.Add(new CanopyMenuItem("separator", string.Empty, CanopyMenuItemKind.Separator));
        var parent = new CanopyMenuItem("more", "More");
        parent.Children.Add(new CanopyMenuItem("delete\"&", "Delete <item>") { Disabled = true, Danger = true });
        menu.Items.Add(parent);
        var html = menu.ToTriggerHtmlFragment("Actions & more") + menu.ToHtmlFragment();
        var document = Parse(html);
        var menus = Role(document, "menu").ToArray();
        Assert.Equal(2, menus.Length);
        Assert.Equal("menu", Attr(menus[0], "data-hfx-part"));
        AssertTrigger(document.Element("button")!, menu.Id, menu.TriggerId, "menu");
        Assert.Equal(menu.TriggerId, Attr(menus[0], "aria-labelledby"));
        var check = Role(document, "menuitemcheckbox").Single();
        Assert.Equal("true", Attr(check, "aria-checked"));
        Assert.Equal("selected", Attr(check, "data-state"));
        Assert.Equal("Ctrl+<&", check.Element("kbd")!.Value);
        Assert.Equal("check\"<&", Attr(check.Elements("span").First(), "data-icon"));
        Assert.Equal("false", Attr(Role(document, "menuitemradio").Single(), "aria-checked"));
        Assert.Single(Role(document, "separator"));
        Assert.Equal("Actions <group>", Role(document, "presentation").Single().Value);
        var items = Role(document, "menuitem").ToArray();
        var submenuTrigger = items.Single(e => e.Attribute("aria-haspopup") != null);
        Assert.Equal(Attr(menus[1], "id"), Attr(submenuTrigger, "aria-controls"));
        Assert.Equal(Attr(submenuTrigger, "id"), Attr(menus[1], "aria-labelledby"));
        var danger = items.Single(e => Attr(e, "data-danger") == "true");
        Assert.Equal("true", Attr(danger, "aria-disabled"));
        Assert.Equal("disabled", Attr(danger, "data-state"));
        Assert.Equal("delete\"&", Attr(danger, "data-item-id"));
        Assert.Null(danger.Attribute("disabled"));
        AssertReferences(document);
        AssertDeclarative(html);
    }

    [Fact]
    public void Menu_RejectsDuplicateNestedAndGeneratedIdentitiesCyclesAndContradictoryEntries() {
        var menu = new CanopyMenu("menu");
        var parent = new CanopyMenuItem("a", "A");
        parent.Children.Add(new CanopyMenuItem("b", "B"));
        menu.Items.Add(parent);
        menu.Items.Add(new CanopyMenuItem("b", "Duplicate"));
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
        menu.Items.RemoveAt(1);
        menu.Items.Add(new CanopyMenuItem("a-menu", "Generated collision"));
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
        menu.Items.RemoveAt(1);
        parent.Children.Add(parent);
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
        parent.Children.RemoveAt(1);
        parent.Checked = true;
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
        parent.Checked = null;
        menu.Items.Add(new CanopyMenuItem("sep", "", CanopyMenuItemKind.Separator) { Disabled = true });
        Assert.Throws<ArgumentException>(() => menu.ToHtmlFragment());
    }

    [Fact]
    public void Builders_RejectMalformedIdentitiesAndCollidingOverlayReferences() {
        var malformed = new[] { "", " ", "two words", "line\nbreak", "nul\0", "bad\ud800" };
        foreach (var id in malformed) {
            Assert.Throws<ArgumentException>(() => new CanopyTabs(id, "Tabs"));
            Assert.Throws<ArgumentException>(() => new CanopyTab(id, "Tab"));
            Assert.Throws<ArgumentException>(() => new CanopyStep(id, "Step"));
            Assert.Throws<ArgumentException>(() => new CanopyMenuItem(id, "Action"));
        }
        Assert.Throws<ArgumentException>(() => new CanopyDialog("dialog", "Title", new CanopyDialogOptions { TriggerId = "dialog-title" }).ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyDrawer("drawer", "Title", new CanopyDrawerOptions { TriggerId = "drawer" }).ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyPopover("popover", "Title", new CanopyPopoverOptions { TriggerId = "two words" }).ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyTooltip("tip", "Help", new CanopyTooltipOptions { TriggerId = "tip" }).ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyMenu("menu", new CanopyMenuOptions { TriggerId = "menu-item-a" }) { Items = { new CanopyMenuItem("a", "A") } }.ToHtmlFragment());
    }

    private static CanopyStepper StateStepper() {
        var stepper = new CanopyStepper("steps", "Review", new CanopyStepperOptions { SelectedIndex = 1 });
        foreach (var state in new[] { CanopyStepState.Done, CanopyStepState.Current, CanopyStepState.Error, CanopyStepState.Disabled, CanopyStepState.Skipped, CanopyStepState.Upcoming }) {
            stepper.Steps.Add(new CanopyStep(state.ToString().ToLowerInvariant(), state.ToString()) {
                State = state, Optional = state == CanopyStepState.Skipped, ContentHtml = "<p>Content " + state + "</p>"
            });
        }
        return stepper;
    }

    // Normalize only the builders' known HTML boolean attributes so LINQ to XML can inspect their real structure.
    private static XElement Parse(string html) => XElement.Parse("<root>" + Regex.Replace(html,
        @"\s(data-cx-tabs|data-cx-stepper|data-cx-menu|data-cx-tooltip|hidden)(?=[\s>])", " $1=\"\"") + "</root>");
    private static string? Attr(XElement element, string name) => (string?)element.Attribute(name);
    private static IEnumerable<XElement> Role(XElement root, string role) => root.DescendantsAndSelf().Where(e => Attr(e, "role") == role);
    private static string?[] Actions(XElement root) => root.Descendants("button").Select(e => Attr(e, "data-cx-stepper-action")).Where(a => a != null).ToArray();

    private static void AssertTrigger(XElement trigger, string id, string triggerId, string popup) {
        Assert.Equal(triggerId, Attr(trigger, "id"));
        Assert.Equal(id, Attr(trigger, "data-cx-open"));
        Assert.Equal(id, Attr(trigger, "aria-controls"));
        Assert.Equal(popup, Attr(trigger, "aria-haspopup"));
        Assert.Equal("false", Attr(trigger, "aria-expanded"));
    }

    private static void AssertReferences(XElement root) {
        var identities = root.DescendantsAndSelf().Attributes("id").Select(a => a.Value).ToArray();
        Assert.Equal(identities.Length, identities.Distinct(StringComparer.Ordinal).Count());
        foreach (var reference in root.DescendantsAndSelf().Attributes().Where(a => a.Name.LocalName is "aria-controls" or "aria-labelledby" or "aria-describedby" or "data-cx-trigger")) {
            foreach (var id in reference.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries)) Assert.Contains(id, identities);
        }
    }

    private static void AssertDeclarative(string html) {
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<style", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotMatch(@"\son[a-z]+\s*=", html);
        Assert.DoesNotContain("javascript:", html, StringComparison.OrdinalIgnoreCase);
    }
}
