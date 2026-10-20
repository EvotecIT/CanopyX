using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

// The checks of a field and its contract JSON: writing and reading.
public sealed partial class CanopyFlowField {
    private static readonly (string Wire, CanopyFlowFieldKind Value)[] KindNames = {
        ("text", CanopyFlowFieldKind.Text), ("number", CanopyFlowFieldKind.Number), ("date", CanopyFlowFieldKind.Date),
        ("datetime", CanopyFlowFieldKind.DateTime), ("time", CanopyFlowFieldKind.Time), ("select", CanopyFlowFieldKind.Select),
        ("toggle", CanopyFlowFieldKind.Toggle), ("lookup", CanopyFlowFieldKind.Lookup), ("choice", CanopyFlowFieldKind.Choice),
        ("multiChoice", CanopyFlowFieldKind.MultiChoice), ("textarea", CanopyFlowFieldKind.TextArea), ("list", CanopyFlowFieldKind.List),
        ("secret", CanopyFlowFieldKind.Secret), ("duration", CanopyFlowFieldKind.Duration), ("custom", CanopyFlowFieldKind.Custom)
    };

    private static readonly (string Wire, CanopyFlowItemRule Value)[] RuleNames = {
        ("email", CanopyFlowItemRule.Email), ("host", CanopyFlowItemRule.Host), ("ip", CanopyFlowItemRule.IpAddress),
        ("cidr", CanopyFlowItemRule.Cidr), ("url", CanopyFlowItemRule.Url)
    };

    private static readonly (string Wire, CanopyFlowDurationUnit Value)[] UnitNames = {
        ("seconds", CanopyFlowDurationUnit.Seconds), ("minutes", CanopyFlowDurationUnit.Minutes),
        ("hours", CanopyFlowDurationUnit.Hours), ("days", CanopyFlowDurationUnit.Days)
    };

    private static readonly string[] Properties = {
        "id", "type", "editor", "label", "help", "placeholder", "required", "readOnly", "sensitive", "default", "width", "parameter",
        "path", "when", "options", "display", "onText", "offText", "rows", "step", "keepWhenBlank", "reveal", "units", "validation"
    };

    private static readonly string[] ValidationProperties = { "min", "max", "minLength", "maxLength", "pattern", "message", "minItems", "maxItems", "item", "itemPattern" };

    internal string WireType => Name(KindNames, Kind);

    private static string Name<T>((string Wire, T Value)[] names, T value) {
        foreach (var name in names) if (EqualityComparer<T>.Default.Equals(name.Value, value)) return name.Wire;
        throw new InvalidOperationException("Unknown flow value '" + value + "'.");
    }

    private bool Is(params CanopyFlowFieldKind[] kinds) => Array.IndexOf(kinds, Kind) >= 0;

    /// <summary>Checks the field on its own: texts, the settings that fit its kind, its options and its starting value.</summary>
    internal void Validate() {
        var what = "Field " + Id;
        if (!Enum.IsDefined(typeof(CanopyFlowFieldKind), Kind)) throw new InvalidOperationException(what + " has an unknown type.");
        if (Width != CanopyFlowFieldWidth.Full && Width != CanopyFlowFieldWidth.Half) throw new InvalidOperationException(what + " has an unknown width.");
        CanopyFlowValues.CheckShort(Label, what + " (label)", required: true);
        CanopyFlowValues.CheckLong(HelpText, what + " (help)");
        if (PlaceholderText != null) {
            if (!Is(CanopyFlowFieldKind.Text, CanopyFlowFieldKind.Number, CanopyFlowFieldKind.Lookup, CanopyFlowFieldKind.TextArea, CanopyFlowFieldKind.List))
                throw new InvalidOperationException(what + ": placeholders apply to text, number, lookup, text area and list fields.");
            if (!CanopyFlowValues.HasVisibleText(PlaceholderText) || PlaceholderText.Length > CanopyFlowValues.MaxPlaceholder)
                throw new InvalidOperationException(what + " needs a placeholder with visible text of at most 256 characters.");
        }

        if (ParameterName != null && !CanopyFlowValues.IsIdentifier(ParameterName)) throw new InvalidOperationException(what + " has a parameter name that is not an id-like name.");
        if (ConfigPath != null && !CanopyFlowValues.IsPath(ConfigPath)) throw new InvalidOperationException(what + " has a path that is not dot-separated names of letters, digits, hyphens and underscores.");
        Validation.Validate(Kind, Id);
        ValidateOptions(what);
        if (Display != CanopyFlowChoiceDisplay.Auto && Kind != CanopyFlowFieldKind.Choice) throw new InvalidOperationException(what + ": Display applies to choice fields.");
        if (!Enum.IsDefined(typeof(CanopyFlowChoiceDisplay), Display)) throw new InvalidOperationException(what + " has an unknown display.");
        if ((OnText != null || OffText != null) && Kind != CanopyFlowFieldKind.Toggle) throw new InvalidOperationException(what + ": state texts apply to toggle fields.");
        CanopyFlowValues.CheckText(OnText, what + " (on text)", 60);
        CanopyFlowValues.CheckText(OffText, what + " (off text)", 60);
        if (RowCount.HasValue && Kind != CanopyFlowFieldKind.TextArea) throw new InvalidOperationException(what + ": rows apply to text area fields.");
        if (NumberStep.HasValue && Kind != CanopyFlowFieldKind.Number) throw new InvalidOperationException(what + ": a step applies to number fields.");
        if ((KeepsWhenBlank.HasValue || ShowsReveal.HasValue) && Kind != CanopyFlowFieldKind.Secret) throw new InvalidOperationException(what + ": keep-when-blank and reveal apply to secret fields.");
        ValidateDuration(what);
        if (Kind == CanopyFlowFieldKind.Custom) {
            if (!CanopyFlowValues.IsIdentifier(EditorName)) throw new InvalidOperationException(what + " needs an editor name: a letter, then up to 63 letters, digits, hyphens or underscores.");
        } else if (EditorName != null) {
            throw new InvalidOperationException(what + ": an editor name applies to custom fields.");
        }

        if ((MinItems.HasValue || MaxItems.HasValue) && !Is(CanopyFlowFieldKind.MultiChoice, CanopyFlowFieldKind.List)) throw new InvalidOperationException(what + ": item counts apply to multiple-choice and list fields.");
        if (MinItems > MaxItems) throw new InvalidOperationException(what + ": the fewest items cannot exceed the most.");
        if ((ItemRule != CanopyFlowItemRule.None || ListItemPattern != null) && Kind != CanopyFlowFieldKind.List) throw new InvalidOperationException(what + ": item checks apply to list fields.");
        if (!Enum.IsDefined(typeof(CanopyFlowItemRule), ItemRule)) throw new InvalidOperationException(what + " has an unknown item rule.");
        if (ListItemPattern != null) CanopyCellValidation.CheckWholePattern(ListItemPattern, what + " has an invalid item pattern.");
        if (DefaultValue != null && Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException(what + ": a secret field has no default; stored secrets are listed in StoredSecrets.");
        CanopyFlowValues.Canonical(this, DefaultValue, "The default");
    }

    private void ValidateOptions(string what) {
        var takesOptions = Is(CanopyFlowFieldKind.Select, CanopyFlowFieldKind.Choice, CanopyFlowFieldKind.MultiChoice, CanopyFlowFieldKind.Lookup);
        if (!takesOptions && Options.Count > 0) throw new InvalidOperationException(what + ": options apply to select, choice, multiple-choice and lookup fields.");
        if (takesOptions && Options.Count == 0) throw new InvalidOperationException(what + " needs at least one option: a flow's lookup suggests from its options.");
        if (Options.Count > CanopyFlowValues.MaxOptions) throw new InvalidOperationException(what + " has more than 1000 options.");
        for (var index = 0; index < Options.Count; index++) {
            var option = Options[index] ?? throw new InvalidOperationException(what + " has a null option.");
            option.Validate(Id);
            for (var earlier = 0; earlier < index; earlier++) {
                if (Options[earlier] != null && CanopyFlowValues.SameScalar(Options[earlier].Value, option.Value)) throw new InvalidOperationException(what + " has two options with the same value.");
            }
        }
    }

    private void ValidateDuration(string what) {
        var duration = Kind == CanopyFlowFieldKind.Duration;
        if (!duration && (DurationUnits.Count > 0 || MinimumDuration.HasValue || MaximumDuration.HasValue)) throw new InvalidOperationException(what + ": units and duration limits apply to duration fields.");
        for (var index = 0; index < DurationUnits.Count; index++) {
            if (!Enum.IsDefined(typeof(CanopyFlowDurationUnit), DurationUnits[index])) throw new InvalidOperationException(what + " has an unknown unit.");
            if (DurationUnits.IndexOf(DurationUnits[index]) != index) throw new InvalidOperationException(what + " lists a unit twice.");
        }

        foreach (var limit in new[] { MinimumDuration, MaximumDuration }) {
            if (limit.HasValue && (limit.Value < TimeSpan.Zero || limit.Value.Ticks % TimeSpan.TicksPerSecond != 0)) throw new InvalidOperationException(what + ": duration limits are non-negative whole seconds.");
        }

        if (MinimumDuration > MaximumDuration) throw new InvalidOperationException(what + ": the shortest duration cannot exceed the longest.");
    }

    private bool HasValidation => Validation.Minimum.HasValue || Validation.Maximum.HasValue || Validation.Earliest.HasValue || Validation.Latest.HasValue ||
        Validation.MinLength.HasValue || Validation.MaxLength.HasValue || Validation.Pattern != null || Validation.Message != null || MinItems.HasValue ||
        MaxItems.HasValue || ItemRule != CanopyFlowItemRule.None || ListItemPattern != null || MinimumDuration.HasValue || MaximumDuration.HasValue;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("type", WireType).OptionalProperty("editor", EditorName).Property("label", Label)
            .OptionalProperty("help", HelpText).OptionalProperty("placeholder", PlaceholderText);
        if (IsRequired) writer.Property("required", true);
        if (IsReadOnly) writer.Property("readOnly", true);
        if (IsSensitive) writer.Property("sensitive", true);
        if (DefaultValue != null) {
            writer.Name("default");
            CanopyFlowValues.Write(writer, CanopyFlowValues.Canonical(this, DefaultValue, "The default"));
        }

        if (Width == CanopyFlowFieldWidth.Half) writer.Property("width", "half");
        writer.OptionalProperty("parameter", ParameterName).OptionalProperty("path", ConfigPath);
        if (Condition != null) {
            writer.Name("when");
            Condition.WriteJson(writer);
        }

        if (Options.Count > 0) {
            writer.Name("options").BeginArray();
            foreach (var option in Options) option.WriteJson(writer);
            writer.EndArray();
        }

        if (Display != CanopyFlowChoiceDisplay.Auto) writer.Property("display", Display == CanopyFlowChoiceDisplay.Cards ? "cards" : "list");
        writer.OptionalProperty("onText", OnText).OptionalProperty("offText", OffText).OptionalProperty("rows", RowCount);
        if (NumberStep.HasValue) writer.Name("step").Number(NumberStep.Value);
        if (KeepsWhenBlank.HasValue) writer.Property("keepWhenBlank", KeepsWhenBlank.Value);
        if (ShowsReveal.HasValue) writer.Property("reveal", ShowsReveal.Value);
        if (DurationUnits.Count > 0) {
            writer.Name("units").BeginArray();
            foreach (var unit in DurationUnits) writer.String(Name(UnitNames, unit));
            writer.EndArray();
        }

        if (HasValidation) WriteValidation(writer);
        writer.EndObject();
    }

    private void WriteValidation(CanopyJsonWriter writer) {
        writer.Name("validation").BeginObject();
        if (Validation.Minimum.HasValue) writer.Name("min").Number(Validation.Minimum.Value);
        else if (Validation.Earliest.HasValue) writer.Property("min", CanopyFlowValues.FormatMoment(Validation.Earliest.Value));
        else if (MinimumDuration.HasValue) writer.Property("min", CanopyFlowValues.FormatDuration(MinimumDuration.Value));
        if (Validation.Maximum.HasValue) writer.Name("max").Number(Validation.Maximum.Value);
        else if (Validation.Latest.HasValue) writer.Property("max", CanopyFlowValues.FormatMoment(Validation.Latest.Value));
        else if (MaximumDuration.HasValue) writer.Property("max", CanopyFlowValues.FormatDuration(MaximumDuration.Value));
        writer.OptionalProperty("minLength", Validation.MinLength).OptionalProperty("maxLength", Validation.MaxLength).OptionalProperty("pattern", Validation.Pattern)
            .OptionalProperty("message", Validation.Message).OptionalProperty("minItems", MinItems).OptionalProperty("maxItems", MaxItems);
        if (ItemRule != CanopyFlowItemRule.None) writer.Property("item", Name(RuleNames, ItemRule));
        writer.OptionalProperty("itemPattern", ListItemPattern);
        writer.EndObject();
    }

    /// <summary>Reads a field from parsed contract JSON. The flow validates it afterwards.</summary>
    internal static CanopyFlowField Read(object? node) {
        var map = CanopyFlowContract.Object(node, "A field", Properties);
        var id = CanopyFlowContract.RequiredText(map, "id", "A field");
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException("A field has an invalid id.");
        var what = "Field " + id;
        var kind = CanopyFlowContract.Choose(CanopyFlowContract.RequiredText(map, "type", what), what, "type", KindNames);
        var field = new CanopyFlowField(id, kind, CanopyFlowContract.RequiredText(map, "label", what)) {
            EditorName = CanopyFlowContract.Text(map, "editor", what),
            HelpText = CanopyFlowContract.Text(map, "help", what),
            PlaceholderText = CanopyFlowContract.Text(map, "placeholder", what),
            IsRequired = CanopyFlowContract.Boolean(map, "required", what) ?? false,
            IsReadOnly = CanopyFlowContract.Boolean(map, "readOnly", what) ?? false,
            IsSensitive = CanopyFlowContract.Boolean(map, "sensitive", what) ?? false,
            ParameterName = CanopyFlowContract.Text(map, "parameter", what),
            ConfigPath = CanopyFlowContract.Text(map, "path", what),
            OnText = CanopyFlowContract.Text(map, "onText", what),
            OffText = CanopyFlowContract.Text(map, "offText", what),
            KeepsWhenBlank = CanopyFlowContract.Boolean(map, "keepWhenBlank", what),
            ShowsReveal = CanopyFlowContract.Boolean(map, "reveal", what)
        };
        if (map.TryGetValue("default", out var value)) field.DefaultValue = value;
        var width = CanopyFlowContract.Text(map, "width", what);
        if (width != null) field.Width = CanopyFlowContract.Choose(width, what, "width", ("full", CanopyFlowFieldWidth.Full), ("half", CanopyFlowFieldWidth.Half));
        if (map.TryGetValue("when", out var when)) field.Condition = CanopyFlowCondition.Read(when, what + " (when)");
        foreach (var item in CanopyFlowContract.Items(map, "options", what, CanopyFlowValues.MaxOptions)) field.Options.Add(ReadOption(item, what));
        var display = CanopyFlowContract.Text(map, "display", what);
        if (display != null) field.Display = CanopyFlowContract.Choose(display, what, "display", ("cards", CanopyFlowChoiceDisplay.Cards), ("list", CanopyFlowChoiceDisplay.List));
        Guard(what, () => {
            field.RowCount = CanopyFlowContract.Integer(map, "rows", what);
            field.NumberStep = CanopyFlowContract.Number(map, "step", what);
        });
        foreach (var unit in CanopyFlowContract.Items(map, "units", what, 4)) field.DurationUnits.Add(CanopyFlowContract.Choose(unit as string, what, "units", UnitNames));
        if (map.TryGetValue("validation", out var validation)) field.ReadValidation(validation, what);
        return field;
    }

    private static CanopyFlowOption ReadOption(object? node, string what) {
        var map = CanopyFlowContract.Object(node, what + " (option)", "value", "label", "description", "badge", "disabledReason", "group");
        if (!map.TryGetValue("value", out var value) || !CanopyFlowValues.TryScalar(value, out var scalar)) throw new InvalidOperationException(what + " has an option without a text, number or boolean value.");
        return new CanopyFlowOption(scalar, CanopyFlowContract.Text(map, "label", what)) {
            Description = CanopyFlowContract.Text(map, "description", what),
            Badge = CanopyFlowContract.Text(map, "badge", what),
            DisabledReason = CanopyFlowContract.Text(map, "disabledReason", what),
            Group = CanopyFlowContract.Text(map, "group", what)
        };
    }

    private void ReadValidation(object? node, string what) {
        var map = CanopyFlowContract.Object(node, what + " (validation)", ValidationProperties);
        foreach (var bound in new[] { "min", "max" }) {
            if (!map.TryGetValue(bound, out var limit)) continue;
            var max = bound == "max";
            if (Kind == CanopyFlowFieldKind.Number) {
                var number = CanopyFlowContract.Number(map, bound, what);
                if (max) Validation.Maximum = number; else Validation.Minimum = number;
            } else if (Kind == CanopyFlowFieldKind.DateTime && CanopyFlowValues.TryParseMoment(limit as string, out var moment)) {
                if (max) Validation.Latest = moment; else Validation.Earliest = moment;
            } else if (Kind == CanopyFlowFieldKind.Duration && CanopyFlowValues.TryParseDuration(limit as string, out var span)) {
                if (max) MaximumDuration = span; else MinimumDuration = span;
            } else {
                throw new InvalidOperationException(what + " has a '" + bound + "' that does not fit its type.");
            }
        }

        Guard(what, () => {
            Validation.MinLength = CanopyFlowContract.Integer(map, "minLength", what);
            Validation.MaxLength = CanopyFlowContract.Integer(map, "maxLength", what);
            MinItems = CanopyFlowContract.Integer(map, "minItems", what);
            MaxItems = CanopyFlowContract.Integer(map, "maxItems", what);
        });
        Validation.Pattern = CanopyFlowContract.Text(map, "pattern", what);
        Validation.Message = CanopyFlowContract.Text(map, "message", what);
        var rule = CanopyFlowContract.Text(map, "item", what);
        if (rule != null) ItemRule = CanopyFlowContract.Choose(rule, what, "item", RuleNames);
        ListItemPattern = CanopyFlowContract.Text(map, "itemPattern", what);
    }

    /// <summary>Runs setters that check their ranges, turning their argument errors into contract errors.</summary>
    private static void Guard(string what, Action set) {
        try {
            set();
        } catch (ArgumentException error) {
            throw new InvalidOperationException(what + ": " + error.Message, error);
        }
    }
}
