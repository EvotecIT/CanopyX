using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>A standalone gallery of typed UI builders and host-owned interaction callbacks.</summary>
internal static class UiPrimitivesExample {
    /// <summary>Writes a standalone gallery with inert UI payloads into the example output folder.</summary>
    internal static async Task RunAsync(string output) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.ui-primitives.html")
            ?? throw new InvalidOperationException("The UI primitives template must be embedded in the examples assembly.");
        using var reader = new StreamReader(stream);
        var template = await reader.ReadToEndAsync();
        var fragments = new Dictionary<string, string>(StringComparer.Ordinal);
        template = Regex.Replace(template, "<template data-gallery-fragment=\"([^\"]+)\">([\\s\\S]*?)</template>", match => {
            fragments.Add(match.Groups[1].Value, match.Groups[2].Value.Trim());
            return string.Empty;
        });
        var slots = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["tabs-underline"] = Tabs("sections", CanopyTabsStyle.Underline, fragments),
            ["tabs-pills"] = Tabs("filters", CanopyTabsStyle.Pills, fragments),
            ["tabs-segmented"] = Tabs("period", CanopyTabsStyle.Segmented, fragments),
            ["tabs-vertical"] = Tabs("settings", CanopyTabsStyle.Vertical, fragments),
            ["tabs-overflow"] = OverflowTabs(fragments),
            ["tabs-deferred"] = DeferredTabs(fragments),
            ["tabs-auto"] = AutoTabs(fragments),
            ["accordion-single"] = SingleAccordion(fragments),
            ["accordion-multiple"] = MultipleAccordion(fragments),
            ["stepper"] = Wizard(fragments),
            ["stepper-vertical"] = VerticalStepper(fragments),
            ["stepper-report"] = ReportStepper(fragments),
            ["stepper-static"] = StaticStepper(),
        };
        AddOverlays(slots, fragments);
        foreach (var slot in slots) template = template.Replace("{{" + slot.Key + "}}", slot.Value);
        template = ApplyTokenFallbacks(template);
        var parts = string.Concat(CanopyHtmlAssets.GetParts(CanopyRuntime.TreeGrid)
            .Where(part => part.Name.StartsWith("ui-", StringComparison.Ordinal)).Select(part => part.Markup));
        template = template.Replace("{{style}}", CanopyHtmlAssets.Style).Replace("{{ui-parts}}", parts)
            .Replace("{{script}}", CanopyHtmlAssets.Script);
        Directory.CreateDirectory(output);
        await File.WriteAllTextAsync(Path.Combine(output, "ui-primitives.html"), template);
    }

    // Use the shared token export, like SharedTokensExample, rather than defining
    // a separate example palette. Host theme tokens override these fallbacks.
    private static string ApplyTokenFallbacks(string template) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates.token-fallbacks.json")
            ?? throw new InvalidOperationException("The shared token fallback export must be embedded in the examples assembly.");
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(stream)!;
        return Regex.Replace(template, @"var\((--hfx-[a-z0-9-]+)\)", match => values.TryGetValue(match.Groups[1].Value, out var value)
            ? "var(" + match.Groups[1].Value + "," + value + ")" : match.Value);
    }

    private static string Tabs(string id, CanopyTabsStyle style, IReadOnlyDictionary<string, string> fragments) {
        var tabs = new CanopyTabs(id, style == CanopyTabsStyle.Vertical ? "Workspace settings" : "Workspace views", new CanopyTabsOptions {
            Style = style,
            Overflow = style == CanopyTabsStyle.Pills ? CanopyTabsOverflow.Wrap : CanopyTabsOverflow.Scroll
        });
        if (style == CanopyTabsStyle.Segmented) {
            tabs.Tabs.Add(new CanopyTab("day", "Day") { ContentHtml = fragments["day"] });
            tabs.Tabs.Add(new CanopyTab("week", "Week") { ContentHtml = fragments["week"] });
            tabs.Tabs.Add(new CanopyTab("month", "Month") { ContentHtml = fragments["month"] });
        } else {
            tabs.Tabs.Add(new CanopyTab("overview", "Overview") { ContentHtml = fragments["overview"] });
            tabs.Tabs.Add(new CanopyTab("activity", "Activity") { Badge = "12", ContentHtml = fragments["activity"] });
            tabs.Tabs.Add(new CanopyTab("files", "Files") { Badge = "3", ContentHtml = fragments["files"] });
            tabs.Tabs.Add(new CanopyTab("archived", "Archived") { Disabled = true, ContentHtml = fragments["archived"] });
        }
        return tabs.ToHtmlFragment();
    }

    private static string OverflowTabs(IReadOnlyDictionary<string, string> fragments) {
        var tabs = new CanopyTabs("more-sections", "More workspace sections", new CanopyTabsOptions { Overflow = CanopyTabsOverflow.Menu });
        foreach (var name in new[] { "Overview", "Activity", "Files", "People", "Permissions", "Notifications", "History", "Scheduled reports" }) {
            var id = name.ToLowerInvariant().Replace(' ', '-');
            tabs.Tabs.Add(new CanopyTab(id, name) { ContentHtml = fragments["overflow"], Badge = name == "Scheduled reports" ? "8" : null });
        }
        return tabs.ToHtmlFragment();
    }

    private static string DeferredTabs(IReadOnlyDictionary<string, string> fragments) {
        var tabs = new CanopyTabs("deferred", "On-demand views");
        tabs.Tabs.Add(new CanopyTab("ready", "Ready now") { ContentHtml = fragments["ready"] });
        tabs.Tabs.Add(new CanopyTab("loaded", "Load details") { ContentHtml = fragments["deferred-fallback"] });
        tabs.Tabs.Add(new CanopyTab("retry", "Try recovery") { ContentHtml = fragments["retry-fallback"] });
        return tabs.ToHtmlFragment();
    }

    private static string AutoTabs(IReadOnlyDictionary<string, string> fragments) {
        var tabs = new CanopyTabs("tour", "Workspace tour", new CanopyTabsOptions { Style = CanopyTabsStyle.Pills });
        tabs.Tabs.Add(new CanopyTab("organize", "Organize") { ContentHtml = fragments["tour-organize"] });
        tabs.Tabs.Add(new CanopyTab("review", "Review") { ContentHtml = fragments["tour-review"] });
        tabs.Tabs.Add(new CanopyTab("share", "Share") { ContentHtml = fragments["tour-share"] });
        return tabs.ToHtmlFragment();
    }

    private static string SingleAccordion(IReadOnlyDictionary<string, string> fragments) {
        var accordion = new CanopyAccordion("help", new CanopyAccordionOptions { Animate = true, Search = true, SearchPlaceholder = "Filter questions", CopyTitle = true });
        accordion.Items.Add(new CanopyAccordionItem("start", "How do I start a workspace?") { Open = true, ContentHtml = fragments["accordion-start"] });
        accordion.Items.Add(new CanopyAccordionItem("share", "Who can see shared files?") { Badge = "New", ContentHtml = fragments["accordion-share"] });
        accordion.Items.Add(new CanopyAccordionItem("export", "Can I export a report?") { ContentHtml = fragments["accordion-export"] });
        accordion.Items.Add(new CanopyAccordionItem("billing", "How does billing work?") { Disabled = true, ContentHtml = fragments["accordion-billing"] });
        return accordion.ToHtmlFragment();
    }

    private static string MultipleAccordion(IReadOnlyDictionary<string, string> fragments) {
        var accordion = new CanopyAccordion("workspace-settings", new CanopyAccordionOptions {
            Multiple = true, Style = CanopyAccordionStyle.Separated, Indicator = CanopyAccordionIndicator.Plus,
            IndicatorPosition = CanopyAccordionIndicatorPosition.Start, RememberKey = "gallery-settings"
        });
        accordion.Items.Add(new CanopyAccordionItem("general", "General") {
            Open = true, ContentHtml = fragments["accordion-general"],
            ActionsHtml = "<a href=\"#activity-log-section\">See activity</a>"
        });
        accordion.Items.Add(new CanopyAccordionItem("loaded", "Load on demand") { ContentHtml = fragments["accordion-deferred"] });
        accordion.Items.Add(new CanopyAccordionItem("nested", "Nested sections") { ContentHtml = NestedAccordion(fragments) });
        return accordion.ToHtmlFragment();
    }

    private static string NestedAccordion(IReadOnlyDictionary<string, string> fragments) {
        var accordion = new CanopyAccordion("nested-settings", new CanopyAccordionOptions { Style = CanopyAccordionStyle.Flush, HeadingLevel = 4 });
        accordion.Items.Add(new CanopyAccordionItem("alerts", "Alerts") { ContentHtml = fragments["accordion-alerts"] });
        accordion.Items.Add(new CanopyAccordionItem("retention", "Retention") { ContentHtml = fragments["accordion-retention"] });
        return accordion.ToHtmlFragment();
    }

    private static string Wizard(IReadOnlyDictionary<string, string> fragments) {
        var stepper = new CanopyStepper("setup", "Create a workspace", new CanopyStepperOptions {
            ShowFooter = true, SaveDraftLabel = "Save draft", SkipLabel = "Skip", FinishLabel = "Create workspace"
        });
        stepper.Steps.Add(new CanopyStep("details", "Details") { Description = "Give it a name", ContentHtml = fragments["wizard-details"] });
        stepper.Steps.Add(new CanopyStep("preferences", "Preferences") { Description = "Optional", Optional = true, ContentHtml = fragments["wizard-preferences"] });
        stepper.Steps.Add(new CanopyStep("review", "Review") { Description = "Ready to create", ContentHtml = fragments["wizard-review"] });
        return stepper.ToHtmlFragment();
    }

    private static string VerticalStepper(IReadOnlyDictionary<string, string> fragments) {
        var stepper = new CanopyStepper("review-flow", "Review progress", new CanopyStepperOptions {
            Layout = CanopyStepperLayout.Vertical, SelectedIndex = 1, ShowFooter = true
        });
        stepper.Steps.Add(new CanopyStep("collected", "Collect records") { State = CanopyStepState.Done, ContentHtml = fragments["collected"] });
        stepper.Steps.Add(new CanopyStep("checks", "Check details") { State = CanopyStepState.Error, Description = "One issue to fix", ContentHtml = fragments["checks"] });
        stepper.Steps.Add(new CanopyStep("notes", "Review summary") { ContentHtml = fragments["review-summary"] });
        stepper.Steps.Add(new CanopyStep("delivery", "Delivery") { State = CanopyStepState.Disabled, Description = "Available after approval", ContentHtml = fragments["delivery"] });
        return stepper.ToHtmlFragment();
    }

    private static string ReportStepper(IReadOnlyDictionary<string, string> fragments) {
        var stepper = new CanopyStepper("report", "Workspace report", new CanopyStepperOptions { Mode = CanopyUiMode.Report });
        stepper.Steps.Add(new CanopyStep("collected", "Records collected") { State = CanopyStepState.Done, ContentHtml = fragments["collected"] });
        stepper.Steps.Add(new CanopyStep("notes", "Additional notes") { State = CanopyStepState.Skipped, Optional = true, ContentHtml = fragments["notes"] });
        return stepper.ToHtmlFragment();
    }

    private static string StaticStepper() {
        var stepper = new CanopyStepper("progress", "Publication progress", new CanopyStepperOptions { Mode = CanopyUiMode.Static, SelectedIndex = 1 });
        stepper.Steps.Add(new CanopyStep("draft", "Draft") { State = CanopyStepState.Done });
        stepper.Steps.Add(new CanopyStep("review", "In review"));
        stepper.Steps.Add(new CanopyStep("published", "Published"));
        return stepper.ToHtmlFragment();
    }

    private static void AddOverlays(IDictionary<string, string> slots, IReadOnlyDictionary<string, string> fragments) {
        var dialog = new CanopyDialog("edit-workspace", "Edit workspace", new CanopyDialogOptions { Size = CanopyOverlaySize.Small }) {
            Description = "Update the display name for this example workspace.", ContentHtml = fragments["dialog-body"], FooterHtml = fragments["dialog-footer"]
        };
        slots["dialog-trigger"] = dialog.ToTriggerHtmlFragment("Edit workspace");
        slots["dialog"] = dialog.ToHtmlFragment();
        var alert = new CanopyDialog("archive-workspace", "Archive this workspace?", new CanopyDialogOptions { Alert = true, Size = CanopyOverlaySize.Small }) {
            Description = "The workspace can be restored later. This example only updates the activity log.", FooterHtml = fragments["alert-footer"]
        };
        slots["alert-trigger"] = alert.ToTriggerHtmlFragment("Archive workspace");
        slots["alert"] = alert.ToHtmlFragment();
        var drawer = new CanopyDrawer("record-details", "Record details") {
            Description = "Browse three sample records without leaving the page.", ContentHtml = fragments["drawer-body"], FooterHtml = fragments["drawer-footer"]
        };
        slots["drawer-trigger"] = drawer.ToTriggerHtmlFragment("Browse records");
        slots["drawer"] = drawer.ToHtmlFragment();
        var popover = new CanopyPopover("view-options", "View options") {
            ContentHtml = fragments["popover-body"], FooterHtml = fragments["popover-footer"]
        };
        slots["popover-trigger"] = popover.ToTriggerHtmlFragment("Filter records");
        slots["popover"] = popover.ToHtmlFragment();
        var tooltip = new CanopyTooltip("shortcut-help", "Press the arrow keys to move between tabs. Press Enter to select a tab with deferred content.");
        slots["tooltip-trigger"] = tooltip.ToTriggerHtmlFragment("Keyboard help");
        slots["tooltip"] = tooltip.ToHtmlFragment();
        var menu = new CanopyMenu("record-actions");
        menu.Items.Add(new CanopyMenuItem("display", "Display", CanopyMenuItemKind.GroupLabel));
        menu.Items.Add(new CanopyMenuItem("show-details", "Show details", CanopyMenuItemKind.Checkbox) { Checked = true, Badge = "3" });
        menu.Items.Add(new CanopyMenuItem("comfortable", "Comfortable", CanopyMenuItemKind.Radio) { Checked = true, RadioGroup = "density" });
        menu.Items.Add(new CanopyMenuItem("compact", "Compact", CanopyMenuItemKind.Radio) { Checked = false, RadioGroup = "density" });
        menu.Items.Add(new CanopyMenuItem("separator", string.Empty, CanopyMenuItemKind.Separator));
        var share = new CanopyMenuItem("share", "Share");
        share.Children.Add(new CanopyMenuItem("show-link", "Show example link"));
        share.Children.Add(new CanopyMenuItem("send-copy", "Send a copy") { Disabled = true });
        menu.Items.Add(share);
        menu.Items.Add(new CanopyMenuItem("archive", "Archive example") { Danger = true });
        slots["menu-trigger"] = menu.ToTriggerHtmlFragment("Record actions");
        slots["menu"] = menu.ToHtmlFragment();
        slots["overlay-fallback"] = string.Join("", new[] { "dialog-body", "drawer-body", "popover-body" }
            .Select(key => "<section class=\"gallery-fallback\">" + Regex.Replace(fragments[key], " id=\"[^\"]*\"| for=\"[^\"]*\"", string.Empty) + "</section>"));
    }
}
