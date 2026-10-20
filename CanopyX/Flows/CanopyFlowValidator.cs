using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The whole-flow checks of <see cref="CanopyFlow.Validate"/>, and the visibility the conditions give each field.</summary>
internal static class CanopyFlowValidator {
    internal static void Validate(CanopyFlow flow) {
        CanopyFlowValues.CheckShort(flow.Title, "The flow title", required: true);
        CanopyFlowValues.CheckLong(flow.Description, "The flow description");
        if (!Enum.IsDefined(typeof(CanopyFlowMode), flow.Mode)) throw new InvalidOperationException("The flow has an unknown mode.");
        if (!Enum.IsDefined(typeof(CanopyFlowOrientation), flow.Orientation)) throw new InvalidOperationException("The flow has an unknown orientation.");
        if (flow.Density.HasValue && !Enum.IsDefined(typeof(CanopyGridDensity), flow.Density.Value)) throw new InvalidOperationException("The flow has an unknown density.");
        if (!Enum.IsDefined(typeof(CanopyTimeZone), flow.TimeZone)) throw new InvalidOperationException("The flow has an unknown time zone.");
        if (flow.Steps.Count < 1 || flow.Steps.Count > CanopyFlow.MaxSteps) throw new InvalidOperationException("A flow has 1 to 64 steps.");

        var stepIds = new HashSet<string>(StringComparer.Ordinal);
        var sectionIds = new HashSet<string>(StringComparer.Ordinal);
        var fields = new Dictionary<string, CanopyFlowField>(StringComparer.Ordinal);
        var paths = new List<string>();
        for (var index = 0; index < flow.Steps.Count; index++) {
            var step = flow.Steps[index] ?? throw new InvalidOperationException("A flow cannot hold a null step.");
            if (!stepIds.Add(step.Id)) throw new InvalidOperationException("The flow has two steps with the id " + step.Id + ".");
            ValidateStep(step, index == flow.Steps.Count - 1);
            if (step.Sections.Count > CanopyFlow.MaxSteps) throw new InvalidOperationException("Step " + step.Id + " has more than 64 sections.");
            foreach (var section in step.Sections) {
                if (section == null) throw new InvalidOperationException("Step " + step.Id + " holds a null section.");
                if (!sectionIds.Add(section.Id)) throw new InvalidOperationException("The flow has two sections with the id " + section.Id + ".");
                CanopyFlowValues.CheckShort(section.Label, "Section " + section.Id + " (label)", required: true);
                CanopyFlowValues.CheckLong(section.Description, "Section " + section.Id + " (description)");
            }

            foreach (var (field, _) in step.AllFields()) {
                if (field == null) throw new InvalidOperationException("Step " + step.Id + " holds a null field.");
                if (fields.ContainsKey(field.Id)) throw new InvalidOperationException("The flow has two fields with the id " + field.Id + ".");
                fields.Add(field.Id, field);
                if (fields.Count > CanopyFlow.MaxFields) throw new InvalidOperationException("A flow holds at most 1000 fields.");
                field.Validate();
                if (field.ConfigPath != null) paths.Add(field.ConfigPath);
            }
        }

        ValidatePaths(paths);
        ValidateConditions(flow, fields);
        foreach (var entry in flow.Initial) {
            if (entry.Key == null || !fields.TryGetValue(entry.Key, out var field)) throw new InvalidOperationException("The initial value '" + entry.Key + "' names no field of the flow.");
            if (field.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException("Secret field " + field.Id + " has no initial value; list it in StoredSecrets when a value is stored.");
            CanopyFlowValues.Canonical(field, entry.Value, "The initial value");
        }

        foreach (var secret in flow.StoredSecrets) {
            if (secret == null || !fields.TryGetValue(secret, out var field) || field.Kind != CanopyFlowFieldKind.Secret) throw new InvalidOperationException("The stored secret '" + secret + "' is not a secret field of the flow.");
        }

        if (flow.Baseline != null && (flow.Baseline.Length == 0 || flow.Baseline.Length > 256)) throw new InvalidOperationException("A baseline has 1 to 256 characters.");
        CanopyFlowValues.CheckText(flow.Submit?.Label, "The submit label", 80);
    }

    private static void ValidateStep(CanopyFlowStep step, bool last) {
        var what = "Step " + step.Id;
        if (!Enum.IsDefined(typeof(CanopyFlowStepKind), step.Kind)) throw new InvalidOperationException(what + " has an unknown type.");
        var review = step.Kind == CanopyFlowStepKind.Review;
        CanopyFlowValues.CheckShort(step.Title, what + " (title)", required: !review);
        CanopyFlowValues.CheckLong(step.Description, what + " (description)");
        if (step.Kind != CanopyFlowStepKind.Form && (step.Fields.Count > 0 || step.Sections.Count > 0)) throw new InvalidOperationException(what + ": only form steps hold fields and sections.");
        if (review) {
            if (!last) throw new InvalidOperationException("A review step is the last step of a flow, and a flow has at most one.");
            if (step.Condition != null || step.IsOptional) throw new InvalidOperationException(what + ": the review step always shows and is never optional.");
        } else if (step.DeclarationText != null || step.ShowChangesOnly.HasValue) {
            throw new InvalidOperationException(what + ": a declaration and the changes-only default apply to the review step.");
        }

        CanopyFlowValues.CheckLong(step.DeclarationText, what + " (declaration)");
    }

    /// <summary>Paths are unique, and none is the parent of another, so the proposal's JSON patch never writes a setting twice.</summary>
    private static void ValidatePaths(List<string> paths) {
        var allPaths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in paths) {
            if (!allPaths.Add(path)) throw new InvalidOperationException("Two fields write the path " + path + ".");
        }

        foreach (var path in paths) {
            for (var separator = path.IndexOf('.'); separator >= 0; separator = path.IndexOf('.', separator + 1)) {
                var ancestor = path.Substring(0, separator);
                if (allPaths.Contains(ancestor)) throw new InvalidOperationException("The path " + ancestor + " holds the path " + path + " of another field.");
            }
        }
    }

    private static void ValidateConditions(CanopyFlow flow, Dictionary<string, CanopyFlowField> fields) {
        void Check(CanopyFlowCondition? condition, string what) {
            if (condition == null) return;
            condition.Validate();
            foreach (var name in condition.Fields()) {
                if (!fields.ContainsKey(name)) throw new InvalidOperationException(what + " tests the field " + name + ", which the flow does not have.");
                if (fields[name].Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException(what + " tests the secret field " + name + "; conditions never read secrets.");
            }
        }

        foreach (var step in flow.Steps) {
            Check(step.Condition, "The condition of step " + step.Id);
            foreach (var section in step.Sections) Check(section.Condition, "The condition of section " + section.Id);
            foreach (var (field, _) in step.AllFields()) Check(field.Condition, "The condition of field " + field.Id);
        }

        // Each field depends on the fields its own, its section's and its step's conditions read; a cycle (a field whose
        // visibility reads itself) has no answer, so it is rejected.
        var dependencies = Dependencies(flow);
        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var id in dependencies.Keys) Visit(id, dependencies, state);
    }

    private static void Visit(string id, Dictionary<string, List<string>> dependencies, Dictionary<string, int> state) {
        if (state.TryGetValue(id, out var mark)) {
            if (mark == 1) throw new InvalidOperationException("The conditions of field " + id + " depend on its own visibility.");
            return;
        }

        state[id] = 1;
        foreach (var next in dependencies[id]) Visit(next, dependencies, state);
        state[id] = 2;
    }

    private static Dictionary<string, List<string>> Dependencies(CanopyFlow flow) {
        var dependencies = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var step in flow.Steps) {
            foreach (var (field, section) in step.AllFields()) {
                var list = new List<string>();
                if (field.Condition != null) list.AddRange(field.Condition.Fields());
                if (section?.Condition != null) list.AddRange(section.Condition.Fields());
                if (step.Condition != null) list.AddRange(step.Condition.Fields());
                dependencies[field.Id] = list;
            }
        }

        return dependencies;
    }

    /// <summary>Every field of the flow, in document order.</summary>
    internal static IEnumerable<CanopyFlowField> Fields(CanopyFlow flow) {
        foreach (var step in flow.Steps) {
            foreach (var (field, _) in step.AllFields()) yield return field;
        }
    }

    /// <summary>The answers of visible, non-secret fields, reading hidden fields as empty in every condition. The flow is valid.</summary>
    internal static IReadOnlyDictionary<string, object?> VisibleValues(CanopyFlow flow, IReadOnlyDictionary<string, object?> answers) {
        var owners = new Dictionary<string, (CanopyFlowField Field, CanopyFlowSection? Section, CanopyFlowStep Step)>(StringComparer.Ordinal);
        foreach (var step in flow.Steps) {
            foreach (var (field, section) in step.AllFields()) owners[field.Id] = (field, section, step);
        }

        var visible = new Dictionary<string, bool>(StringComparer.Ordinal);
        object? Read(string id) => IsVisible(id) && answers.TryGetValue(id, out var value) ? Generic(owners[id].Field, value) : null;
        bool IsVisible(string id) {
            if (visible.TryGetValue(id, out var known)) return known;
            var owner = owners[id];
            var shown = (owner.Step.Condition == null || owner.Step.Condition.EvaluateWith(Read)) &&
                (owner.Section?.Condition == null || owner.Section.Condition.EvaluateWith(Read)) &&
                (owner.Field.Condition == null || owner.Field.Condition.EvaluateWith(Read));
            visible[id] = shown;
            return shown;
        }

        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var field in Fields(flow)) {
            if (field.Kind == CanopyFlowFieldKind.Secret || !answers.TryGetValue(field.Id, out var value) || !IsVisible(field.Id)) continue;
            result[field.Id] = value;
        }

        return result;
    }

    /// <summary>An answer as conditions read it: the field kind's canonical value when it fits, otherwise its generic reading.</summary>
    private static object? Generic(CanopyFlowField field, object? value) {
        if (value == null) return null;
        var canonical = CanopyFlowValues.TryCanonical(field, value, out var error);
        return error == null ? canonical : CanopyFlowValues.Generic(value);
    }
}
