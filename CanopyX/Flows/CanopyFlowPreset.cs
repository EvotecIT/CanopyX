using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Named starting answers (<see cref="CanopyFlow.Presets"/>): the reader picks one under "Start from", answers changed from it
/// carry a quiet "changed" mark, and the review page says how many changed. Never secrets.
/// </summary>
public sealed class CanopyFlowPreset {
    /// <summary>Creates a preset.</summary>
    /// <param name="id">The id, unique among the flow's presets: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="label">The name the reader picks: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowPreset(string id, string label) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A preset id");
        Label = label;
    }

    /// <summary>Gets the preset's id, which the proposal names.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the name the reader picks. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets a line about the preset. Plain text of at most 1,000 characters.</summary>
    public string? Description { get; set; }

    /// <summary>Gets the preset's answers by field id, as <see cref="CanopyFlowField.DefaultValue"/> takes them. Never a secret field.</summary>
    public IDictionary<string, object?> Values { get; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>Sets one answer (<see cref="Values"/>).</summary>
    /// <param name="fieldId">The field id.</param>
    /// <param name="value">A value of the field's kind.</param>
    /// <returns>The preset.</returns>
    public CanopyFlowPreset Value(string fieldId, object? value) { Values[fieldId] = value; return this; }

    internal void Validate(IReadOnlyDictionary<string, CanopyFlowField> fields) {
        var what = "Preset " + Id;
        CanopyFlowValues.CheckShort(Label, what + " (label)", required: true);
        CanopyFlowValues.CheckLong(Description, what + " (description)");
        foreach (var entry in Values) {
            if (entry.Key == null || !fields.TryGetValue(entry.Key, out var field) || field.Kind == CanopyFlowFieldKind.Secret) throw new InvalidOperationException(what + " sets '" + entry.Key + "', which is no field of the flow or is a secret.");
            CanopyFlowValues.Canonical(field, entry.Value, what + "'s value");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer, IReadOnlyDictionary<string, CanopyFlowField> fields) {
        writer.BeginObject().Property("id", Id).Property("label", Label).OptionalProperty("description", Description).Name("values").BeginObject();
        foreach (var entry in Values) {
            writer.Name(entry.Key);
            CanopyFlowValues.Write(writer, CanopyFlowValues.Canonical(fields[entry.Key], entry.Value, "A preset value"));
        }

        writer.EndObject().EndObject();
    }

    internal static CanopyFlowPreset Read(object? node) {
        const string what = "A preset";
        var map = CanopyFlowContract.Object(node, what, "id", "label", "description", "values");
        var id = CanopyFlowContract.RequiredText(map, "id", what);
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException(what + " has an invalid id.");
        var preset = new CanopyFlowPreset(id, CanopyFlowContract.RequiredText(map, "label", what)) { Description = CanopyFlowContract.Text(map, "description", what) };
        if (!map.TryGetValue("values", out var values) || !(values is Dictionary<string, object?> answers)) throw new InvalidOperationException("Preset " + id + " needs an object of values.");
        foreach (var entry in answers) preset.Values[entry.Key] = entry.Value;
        return preset;
    }
}