using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>One changed row of a commit: its identity, the new values of its changed columns and the values the reader started from.</summary>
/// <remarks>
/// Values are raw protocol values: text (<see cref="string"/>), <see cref="bool"/>, numbers (<see cref="double"/>), UTC
/// <see cref="DateTime"/> instants at millisecond precision, or null. In a batch a writer receives, every value has passed
/// the column's kind and the view's validation, and every column is an editable column of the schema.
/// </remarks>
public sealed class CanopyCommitRow {
    /// <summary>Creates a row.</summary>
    /// <param name="id">The row identity, as the grid received it.</param>
    /// <param name="values">The new raw values by column identity; at least one.</param>
    /// <param name="original">The raw values the reader started from, for the same columns.</param>
    public CanopyCommitRow(string id, IReadOnlyDictionary<string, object?> values, IReadOnlyDictionary<string, object?> original) {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        if (values == null) throw new ArgumentNullException(nameof(values));
        if (values.Count == 0) throw new ArgumentException("A changed row changes at least one column.", nameof(values));
        Values = new ReadOnlyDictionary<string, object?>(new Dictionary<string, object?>(Copy(values), StringComparer.Ordinal));
        Original = new ReadOnlyDictionary<string, object?>(new Dictionary<string, object?>(Copy(original ?? throw new ArgumentNullException(nameof(original))), StringComparer.Ordinal));
    }

    /// <summary>Gets the row identity.</summary>
    public string Id { get; }

    /// <summary>Gets the new raw values by column identity.</summary>
    public IReadOnlyDictionary<string, object?> Values { get; }

    /// <summary>Gets the raw values the reader started from, by column identity (null for a missing value).</summary>
    /// <remarks>A writer compares them with the stored values when the batch revision is not its current one.</remarks>
    public IReadOnlyDictionary<string, object?> Original { get; }

    private static IDictionary<string, object?> Copy(IReadOnlyDictionary<string, object?> source) {
        var copy = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var pair in source) copy[pair.Key] = pair.Value;
        return copy;
    }
}
