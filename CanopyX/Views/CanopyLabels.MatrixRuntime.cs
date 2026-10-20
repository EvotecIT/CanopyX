using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

// The labels a matrix document carries: the matrix labels that differ from English.
public sealed partial class CanopyLabels {
    /// <summary>Whether a label belongs in a matrix document (named <c>Matrix…</c>).</summary>
    private static bool IsMatrixLabel(string name) => name.StartsWith("Matrix", StringComparison.Ordinal) && name.Length > 6 && char.IsUpper(name[6]);

    /// <summary>Whether any matrix label differs from English.</summary>
    internal bool HasMatrixLabels {
        get {
            foreach (var name in _values.Keys) if (IsMatrixLabel(name)) return true;
            return false;
        }
    }

    /// <summary>Writes a matrix document's <c>labels</c>: the matrix labels that differ from English, in ordinal order.</summary>
    /// <param name="writer">The matrix document's writer.</param>
    internal void WriteMatrixJson(CanopyJsonWriter writer) {
        var names = new List<string>();
        foreach (var name in _values.Keys) if (IsMatrixLabel(name)) names.Add(name);
        names.Sort(StringComparer.Ordinal);
        writer.BeginObject();
        foreach (var name in names) writer.Property(WireName(name), _values[name]);
        writer.EndObject();
    }

    /// <summary>Reads a matrix document's <c>labels</c>.</summary>
    /// <param name="node">The parsed <c>labels</c> object.</param>
    /// <returns>The labels, or null when the object is empty.</returns>
    /// <exception cref="InvalidOperationException">The object is not text by matrix label name.</exception>
    internal static CanopyLabels? ReadMatrixLabels(object? node) {
        if (!(node is Dictionary<string, object?> map)) throw new InvalidOperationException("The matrix document needs an object in 'labels'.");
        if (map.Count == 0) return null;
        var labels = new CanopyLabels();
        foreach (var entry in map) {
            if (!(entry.Value is string text)) throw new InvalidOperationException("The matrix label '" + entry.Key + "' needs text.");
            var key = entry.Key;
            var name = key.Length > 0 && char.IsLower(key[0]) ? char.ToUpperInvariant(key[0]) + key.Substring(1) : string.Empty;
            if (!IsMatrixLabel(name) || !Defaults.ContainsKey(name)) throw new InvalidOperationException("The matrix document has the unknown label '" + key + "'.");
            try {
                labels.Set(text, name);
            } catch (ArgumentException error) {
                throw new InvalidOperationException(error.Message, error);
            }
        }

        return labels;
    }
}
