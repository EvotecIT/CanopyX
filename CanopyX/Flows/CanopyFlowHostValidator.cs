using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The checks of what host-connected flows add (see docs/flow.md): checks, dependencies, host sections, pickers, task
/// groups, the review page's confirmation, the command, presets, drafts and the endpoint. The browser refuses the same.</summary>
internal static class CanopyFlowHostValidator {
    internal static void Validate(CanopyFlow flow, Dictionary<string, CanopyFlowField> fields) {
        if (!Enum.IsDefined(typeof(CanopyFlowContainer), flow.Container)) throw new InvalidOperationException("The flow has an unknown container.");
        if (flow.LaunchLabel != null && flow.Container == CanopyFlowContainer.Inline) throw new InvalidOperationException("Only a dialog or drawer flow has a launch label.");
        CanopyFlowValues.CheckText(flow.LaunchLabel, "The launch label", 80);
        if (!Enum.IsDefined(typeof(CanopyFlowDraftStore), flow.Draft)) throw new InvalidOperationException("The flow has an unknown draft store.");
        var checks = new HashSet<string>(StringComparer.Ordinal);
        foreach (var step in flow.Steps) ValidateStep(step, fields, checks);
        foreach (var field in fields.Values) {
            foreach (var id in field.DependsOnIds) {
                if (!fields.TryGetValue(id, out var source)) throw new InvalidOperationException("Field " + field.Id + " depends on " + id + ", which the flow does not have.");
                if (source.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException("Field " + field.Id + " depends on the secret field " + id + ".");
            }
        }

        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var field in fields.Values) Visit(field, fields, state);
        flow.Command?.Validate();
        if (flow.Presets.Count > 32) throw new InvalidOperationException("A flow has at most 32 presets.");
        var presets = new HashSet<string>(StringComparer.Ordinal);
        foreach (var preset in flow.Presets) {
            if (preset == null || !presets.Add(preset.Id)) throw new InvalidOperationException("The flow has a null preset or two presets with the same id.");
            preset.Validate(fields);
        }

        flow.Endpoint?.Validate();
    }

    private static void ValidateStep(CanopyFlowStep step, Dictionary<string, CanopyFlowField> fields, HashSet<string> checks) {
        var what = "Step " + step.Id;
        if ((step.Kind == CanopyFlowStepKind.Pick) != (step.Picker != null)) throw new InvalidOperationException(what + ": a pick step has a picker, and only a pick step has one.");
        step.Picker?.Validate(step.Id);
        CanopyFlowValues.CheckShort(step.GroupLabel, what + " (group)");
        var review = step.Kind == CanopyFlowStepKind.Review;
        if (review && step.GroupLabel != null) throw new InvalidOperationException(what + ": the review step belongs to no group.");
        if (!review && (step.Confirmation != null || step.Acknowledgement != null)) throw new InvalidOperationException(what + ": a confirmation and an acknowledgement apply to the review step.");
        if (step.Confirmation != null) {
            step.Confirmation.Validate();
            if (step.Confirmation.FieldId != null && !(fields.TryGetValue(step.Confirmation.FieldId, out var source) &&
                (source.Kind == CanopyFlowFieldKind.Text || source.Kind == CanopyFlowFieldKind.Select || source.Kind == CanopyFlowFieldKind.Choice || source.Kind == CanopyFlowFieldKind.Lookup)))
                throw new InvalidOperationException("The confirmation reads a text, select, choice or lookup field of the flow.");
        }

        if (step.Acknowledgement != null) {
            step.Acknowledgement.Validate();
            var condition = step.Acknowledgement.Condition;
            if (condition != null) {
                condition.Validate();
                foreach (var name in condition.Fields()) {
                    if (!fields.TryGetValue(name, out var tested) || tested.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException("The acknowledgement's condition tests " + name + ", which is no field of the flow or is a secret.");
                }
            }
        }

        if (step.Checks.Count > 0 && step.Kind != CanopyFlowStepKind.Form) throw new InvalidOperationException(what + ": only form steps have checks.");
        if (step.Checks.Count > 8) throw new InvalidOperationException(what + " has more than 8 checks.");
        foreach (var check in step.Checks) {
            if (check == null || !checks.Add(check.Id)) throw new InvalidOperationException(what + " has a null check, or two checks of the flow share an id.");
            check.Validate(step.Id);
            foreach (var id in check.FieldIds) if (!fields.ContainsKey(id)) throw new InvalidOperationException("Check " + check.Id + " tests " + id + ", which the flow does not have.");
        }

        foreach (var section in step.Sections) {
            section.ValidateHost();
            foreach (var id in section.DependsOnIds) {
                if (!fields.TryGetValue(id, out var source) || source.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException("Section " + section.Id + " depends on " + id + ", which is no field of the flow or is a secret.");
            }
        }
    }

    /// <summary>dependsOn never runs in a circle: a field cannot depend on itself through other fields.</summary>
    private static void Visit(CanopyFlowField field, Dictionary<string, CanopyFlowField> fields, Dictionary<string, int> state) {
        if (state.TryGetValue(field.Id, out var mark)) {
            if (mark == 1) throw new InvalidOperationException("Field " + field.Id + " depends on itself through dependsOn.");
            return;
        }

        state[field.Id] = 1;
        foreach (var id in field.DependsOnIds) Visit(fields[id], fields, state);
        state[field.Id] = 2;
    }
}