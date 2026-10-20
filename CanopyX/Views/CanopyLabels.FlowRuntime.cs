using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

// The labels a flow document carries: every flow label and the shared form messages, when they differ from English.
public sealed partial class CanopyLabels {
    /// <summary>The shared editing messages the flow's field checks use, in document order.</summary>
    private static readonly string[] FlowSharedNames = {
        nameof(GridEditRequired), nameof(GridEditNumber), nameof(GridEditDate), nameof(GridEditMin), nameof(GridEditMax), nameof(GridEditStep),
        nameof(GridEditMinLength), nameof(GridEditMaxLength), nameof(GridEditPattern), nameof(GridEditChoice), nameof(GridEditNoMatches),
        nameof(GridEditSearching), nameof(GridEditNone)
    };

    /// <summary>Whether a label belongs in a flow document: a flow label (named <c>Flow…</c>) or a shared form message.</summary>
    private static bool IsFlowLabel(string name) =>
        name.StartsWith("Flow", StringComparison.Ordinal) && name.Length > 4 && char.IsUpper(name[4]) || Array.IndexOf(FlowSharedNames, name) >= 0;

    /// <summary>Whether any label a flow document carries differs from English.</summary>
    internal bool HasFlowLabels {
        get {
            foreach (var name in _values.Keys) if (IsFlowLabel(name)) return true;
            return false;
        }
    }

    /// <summary>Writes a flow document's <c>labels</c>: the flow labels in ordinal order, then the shared form messages, that differ from English.</summary>
    /// <param name="writer">The flow document's writer.</param>
    internal void WriteFlowJson(CanopyJsonWriter writer) {
        var flowNames = new List<string>();
        foreach (var name in _values.Keys) if (IsFlowLabel(name) && Array.IndexOf(FlowSharedNames, name) < 0) flowNames.Add(name);
        flowNames.Sort(StringComparer.Ordinal);
        writer.BeginObject();
        foreach (var name in flowNames) writer.Property(WireName(name), _values[name]);
        foreach (var name in FlowSharedNames) {
            if (_values.TryGetValue(name, out var value)) writer.Property(WireName(name), value);
        }

        writer.EndObject();
    }

    /// <summary>Sets a label a flow document carries by its wire name (<c>flowNext</c>, <c>gridEditRequired</c>).</summary>
    /// <param name="wireName">The camel-case name.</param>
    /// <param name="value">The text.</param>
    /// <returns>False when no flow label has that name.</returns>
    /// <exception cref="ArgumentException">The text has nothing visible.</exception>
    internal bool SetFlowLabel(string wireName, string value) {
        if (string.IsNullOrEmpty(wireName) || !char.IsLower(wireName[0])) return false;
        var name = char.ToUpperInvariant(wireName[0]) + wireName.Substring(1);
        if (!IsFlowLabel(name) || !Defaults.ContainsKey(name)) return false;
        Set(value, name);
        return true;
    }

    private static string WireName(string name) => char.ToLowerInvariant(name[0]) + name.Substring(1);
}
