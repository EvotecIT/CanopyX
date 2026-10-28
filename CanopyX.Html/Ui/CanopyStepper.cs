using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds the ordered-list stepper contract, readable reports, and static progress headers.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page for interactive mode. Fragments never load assets or execute callbacks.</remarks>
public sealed class CanopyStepper {
    /// <summary>Creates a stepper with a page-unique root identity and an accessible label.</summary>
    public CanopyStepper(string id, string label, CanopyStepperOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopyStepperOptions();
    }

    /// <summary>Gets the page-unique root identity.</summary>
    public string Id { get; }
    /// <summary>Gets the progress header's accessible label.</summary>
    public string Label { get; }
    /// <summary>Gets the steps in display order.</summary>
    public IList<CanopyStep> Steps { get; } = new List<CanopyStep>();
    /// <summary>Gets the presentation and action metadata.</summary>
    public CanopyStepperOptions Options { get; }

    /// <summary>Renders trusted content and encoded text. Report mode includes all sections without navigation; static mode includes only the progress header.</summary>
    public string ToHtmlFragment() {
        Validate();
        var html = new StringBuilder("<div");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-stepper-host\" data-cx-stepper data-hfx-part=\"stepper\"");
        UiHtml.Attribute(html, "data-linear", UiHtml.Bool(Options.Linear));
        UiHtml.Attribute(html, "data-mode", UiHtml.Token(Options.Mode));
        UiHtml.Attribute(html, "data-hfx-variant", Options.Variant);
        html.Append('>');
        if (Options.Mode != CanopyUiMode.Report) Header(html);
        if (Options.Mode != CanopyUiMode.Static) {
            for (var i = 0; i < Steps.Count; i++) Panel(html, Steps[i], i);
        }
        if (Options.Mode == CanopyUiMode.Interactive) {
            if (Options.ShowFooter) Footer(html);
            html.Append("<div class=\"cx-visually-hidden\" aria-live=\"polite\" aria-atomic=\"true\">")
                .Append(UiHtml.Encode(Position() + ": " + Steps[Options.SelectedIndex].Label)).Append("</div>");
        }
        return html.Append("</div>").ToString();
    }

    private void Validate() {
        UiHtml.Index(Options.SelectedIndex, Steps.Count);
        UiHtml.EnumValue(Options.Mode);
        UiHtml.EnumValue(Options.Layout);
        var ids = new HashSet<string>(StringComparer.Ordinal) { Id };
        var localIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < Steps.Count; i++) {
            var step = Steps[i];
            if (step == null) throw new ArgumentException("Steps cannot contain null entries.");
            UiHtml.Unique(localIds, step.Id);
            UiHtml.Unique(ids, StepId(step));
            UiHtml.Unique(ids, PanelId(step));
            UiHtml.Unique(ids, HeadingId(step));
            UiHtml.EnumValue(step.State);
            if (step.State == CanopyStepState.Current && i != Options.SelectedIndex)
                throw new ArgumentException("Only the selected step may have the current state.");
            if (step.State == CanopyStepState.Skipped && !step.Optional)
                throw new ArgumentException("Only optional steps may be skipped.");
        }
        if (Steps[Options.SelectedIndex].State == CanopyStepState.Disabled)
            throw new ArgumentException("The selected step cannot be disabled.");
        if (Options.Mode == CanopyUiMode.Interactive && Options.ShowFooter) {
            UiHtml.Text(Options.BackLabel, nameof(Options.BackLabel));
            UiHtml.Text(Options.NextLabel, nameof(Options.NextLabel));
            UiHtml.Text(Options.FinishLabel, nameof(Options.FinishLabel));
            if (Options.SkipLabel != null) UiHtml.Text(Options.SkipLabel, nameof(Options.SkipLabel));
            if (Options.SaveDraftLabel != null) UiHtml.Text(Options.SaveDraftLabel, nameof(Options.SaveDraftLabel));
        }
    }

    private void Header(StringBuilder html) {
        html.Append("<ol class=\"cx-stepper cx-stepper--").Append(UiHtml.Token(Options.Layout)).Append('"');
        UiHtml.Attribute(html, "aria-label", Label);
        html.Append('>');
        for (var i = 0; i < Steps.Count; i++) {
            var step = Steps[i];
            var state = State(step, i);
            var clickable = Options.Mode == CanopyUiMode.Interactive && i != Options.SelectedIndex
                && state != CanopyStepState.Disabled && (!Options.Linear || step.Visited
                    || state == CanopyStepState.Done || state == CanopyStepState.Error || state == CanopyStepState.Skipped);
            html.Append("<li class=\"cx-step\" data-hfx-part=\"step\"");
            UiHtml.Attribute(html, "id", StepId(step));
            UiHtml.Attribute(html, "data-step-id", step.Id);
            UiHtml.Attribute(html, "data-state", UiHtml.Token(state));
            UiHtml.Attribute(html, "data-optional", UiHtml.Bool(step.Optional));
            UiHtml.Attribute(html, "data-visited", UiHtml.Bool(step.Visited));
            if (i == Options.SelectedIndex) UiHtml.Attribute(html, "aria-current", "step");
            if (state == CanopyStepState.Disabled) UiHtml.Attribute(html, "aria-disabled", "true");
            html.Append('>');
            if (clickable) {
                html.Append("<button type=\"button\" class=\"cx-step-btn\"");
                UiHtml.Attribute(html, "data-cx-step", UiHtml.Number(i));
                UiHtml.Attribute(html, "aria-controls", PanelId(step));
                html.Append('>');
            }
            Marker(html, state, i);
            UiHtml.Span(html, "cx-step-label", step.Label);
            if (step.Description != null) UiHtml.Span(html, "cx-step-desc", step.Description);
            UiHtml.Span(html, "cx-visually-hidden", ", Step " + UiHtml.Number(i + 1) + ", " + StateLabel(step, state));
            if (clickable) html.Append("</button>");
            html.Append("</li>");
        }
        html.Append("</ol>");
    }

    private void Panel(StringBuilder html, CanopyStep step, int index) {
        html.Append("<section class=\"cx-step-panel\" data-hfx-part=\"step-panel\"");
        UiHtml.Attribute(html, "id", PanelId(step));
        UiHtml.Attribute(html, "aria-labelledby", HeadingId(step));
        UiHtml.Attribute(html, "data-state", UiHtml.Token(State(step, index)));
        html.Append("><h3 data-hfx-part=\"title\"");
        UiHtml.Attribute(html, "id", HeadingId(step));
        if (Options.Mode == CanopyUiMode.Interactive) UiHtml.Attribute(html, "tabindex", "-1");
        html.Append('>');
        if (Options.Mode == CanopyUiMode.Report) Marker(html, State(step, index), index);
        html.Append(UiHtml.Encode(step.Label)).Append("</h3>");
        if (Options.Mode == CanopyUiMode.Report) {
            html.Append("<p class=\"cx-step-state\">").Append(UiHtml.Encode(StateLabel(step, State(step, index)))).Append("</p>");
            if (step.Description != null) html.Append("<p class=\"cx-step-desc\">").Append(UiHtml.Encode(step.Description)).Append("</p>");
        }
        html.Append(step.ContentHtml).Append("</section>");
    }

    private void Footer(StringBuilder html) {
        var step = Steps[Options.SelectedIndex];
        html.Append("<div class=\"cx-stepper-footer\" data-hfx-part=\"footer\"");
        UiHtml.Attribute(html, "data-back-label", Options.BackLabel);
        UiHtml.Attribute(html, "data-next-label", Options.NextLabel);
        UiHtml.Attribute(html, "data-finish-label", Options.FinishLabel);
        UiHtml.Attribute(html, "data-skip-enabled", UiHtml.Bool(Options.SkipLabel != null));
        UiHtml.Attribute(html, "data-skip-label", Options.SkipLabel);
        UiHtml.Attribute(html, "data-save-draft-enabled", UiHtml.Bool(Options.SaveDraftLabel != null));
        UiHtml.Attribute(html, "data-save-draft-label", Options.SaveDraftLabel);
        html.Append("><span class=\"cx-step-position\">")
            .Append(UiHtml.Encode(Position())).Append("</span>");
        if (Options.SaveDraftLabel != null) Button(html, "save-draft", Options.SaveDraftLabel);
        if (step.Optional && Options.SkipLabel != null) Button(html, "skip", Options.SkipLabel);
        if (Options.SelectedIndex > 0) Button(html, "back", Options.BackLabel);
        var last = Options.SelectedIndex == Steps.Count - 1;
        Button(html, last ? "finish" : "next", last ? Options.FinishLabel : Options.NextLabel);
        html.Append("</div>");
    }

    private static void Button(StringBuilder html, string action, string label) {
        html.Append("<button type=\"button\"");
        UiHtml.Attribute(html, "data-cx-stepper-action", action);
        html.Append('>').Append(UiHtml.Encode(label)).Append("</button>");
    }

    private static void Marker(StringBuilder html, CanopyStepState state, int index) {
        var text = state == CanopyStepState.Done ? "✓" : state == CanopyStepState.Error ? "!"
            : state == CanopyStepState.Skipped ? "–" : UiHtml.Number(index + 1);
        html.Append("<span class=\"cx-step-marker\" data-hfx-part=\"step-marker\" aria-hidden=\"true\">")
            .Append(UiHtml.Encode(text)).Append("</span>");
    }

    private CanopyStepState State(CanopyStep step, int index) => index == Options.SelectedIndex && step.State != CanopyStepState.Error
        && (Options.Mode == CanopyUiMode.Interactive || step.State == CanopyStepState.Upcoming || step.State == CanopyStepState.Current)
        ? CanopyStepState.Current : step.State;
    private static string StateLabel(CanopyStep step, CanopyStepState state) => step.StateLabel
        ?? (state == CanopyStepState.Done ? "Completed" : state == CanopyStepState.Error ? "Needs attention" : state.ToString());
    private string Position() => "Step " + UiHtml.Number(Options.SelectedIndex + 1) + " of " + UiHtml.Number(Steps.Count);
    private string StepId(CanopyStep step) => Id + "-step-" + step.Id;
    private string PanelId(CanopyStep step) => Id + "-panel-" + step.Id;
    private string HeadingId(CanopyStep step) => Id + "-heading-" + step.Id;
}
