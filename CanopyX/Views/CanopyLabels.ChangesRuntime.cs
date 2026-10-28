using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

// The labels a change view's document carries (a diff, a change list or a propagation view): the change labels that differ from English.
public sealed partial class CanopyLabels {
    /// <summary>Whether a label belongs in a change view's document (named <c>Change…</c>).</summary>
    private static bool IsChangeLabel(string name) => IsTimeLabel(name) || name.StartsWith("Change", StringComparison.Ordinal) && name.Length > 6 && char.IsUpper(name[6]);

    /// <summary>Whether any change label differs from English.</summary>
    internal bool HasChangeLabels {
        get {
            foreach (var name in _values.Keys) if (IsChangeLabel(name)) return true;
            return false;
        }
    }

    /// <summary>Writes a change view document's <c>labels</c>: the change labels that differ from English, in ordinal order.</summary>
    /// <param name="writer">The document's writer.</param>
    internal void WriteChangeJson(CanopyJsonWriter writer) {
        var names = new List<string>();
        foreach (var name in _values.Keys) if (IsChangeLabel(name)) names.Add(name);
        names.Sort(StringComparer.Ordinal);
        writer.BeginObject();
        foreach (var name in names) writer.Property(WireName(name), _values[name]);
        writer.EndObject();
    }

    /// <summary>Reads a change view document's <c>labels</c>.</summary>
    /// <param name="node">The parsed <c>labels</c> object.</param>
    /// <param name="what">The document, for messages.</param>
    /// <returns>The labels, or null when the object is empty.</returns>
    /// <exception cref="InvalidOperationException">The object is not text by change label name.</exception>
    internal static CanopyLabels? ReadChangeLabels(object? node, string what) {
        if (!(node is Dictionary<string, object?> map)) throw new InvalidOperationException(what + " needs an object in 'labels'.");
        if (map.Count == 0) return null;
        var labels = new CanopyLabels();
        foreach (var entry in map) {
            if (!(entry.Value is string text)) throw new InvalidOperationException(what + " needs text for the label '" + entry.Key + "'.");
            var key = entry.Key;
            var name = key.Length > 0 && char.IsLower(key[0]) ? char.ToUpperInvariant(key[0]) + key.Substring(1) : string.Empty;
            if (!IsChangeLabel(name) || !Defaults.ContainsKey(name)) throw new InvalidOperationException(what + " has the unknown label '" + key + "'.");
            try {
                labels.Set(text, name);
            } catch (ArgumentException error) {
                throw new InvalidOperationException(error.Message, error);
            }
        }

        return labels;
    }
}
